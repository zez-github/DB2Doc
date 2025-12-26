"""
关系推断模块 - 多层推断体系
第一层：纯结构规则（最快、最稳）
第二层：字段注释/表注释增强
第三层：LLM 复核/重排
"""

import re
import json
from .ai_helper import get_openai_client
from ..config import config


def _normalize_name(name):
    """标准化名称：去除下划线、转小写"""
    return (name or '').lower().replace('_', '').replace('-', '').replace('.', '')


def _is_id_like_type(data_type):
    """判断数据类型是否适合作为外键"""
    if not data_type:
        return False
    dt = data_type.lower()
    # 整数类型、UUID、常见字符串ID类型
    id_types = ['int', 'bigint', 'smallint', 'tinyint', 'uuid', 'char', 'varchar']
    return any(t in dt for t in id_types)


def _extract_entity_name(column_name):
    """
    从列名中提取可能的实体名
    支持模式：xxx_id, xxxId, id_xxx, xxx_code, xxxCode, xxx_no, xxxNo
    """
    col = (column_name or '').strip()
    if not col:
        return None
    
    lower = col.lower()
    
    # 跳过纯 id / code / no
    if lower in ('id', 'code', 'no', 'number', 'num'):
        return None
    
    patterns = [
        # xxx_id -> xxx
        (r'^(.+)_id$', 1),
        # xxxId / xxxID -> xxx
        (r'^(.+?)(Id|ID)$', 1),
        # id_xxx -> xxx
        (r'^id_(.+)$', 1),
        # xxx_code -> xxx
        (r'^(.+)_code$', 1),
        # xxxCode -> xxx
        (r'^(.+?)Code$', 1),
        # xxx_no -> xxx
        (r'^(.+)_no$', 1),
        # xxxNo -> xxx  
        (r'^(.+?)No$', 1),
        # xxx_key -> xxx
        (r'^(.+)_key$', 1),
        # fk_xxx -> xxx
        (r'^fk_(.+)$', 1),
    ]
    
    for pattern, group in patterns:
        match = re.match(pattern, col, re.IGNORECASE)
        if match:
            return match.group(group)
    
    return None


def infer_relationships_by_rules(cols_by_table, table_names, fk_pairs=None, threshold=0.5):
    """
    第一层 + 第二层：基于命名规则和类型兼容性推断关系
    
    Args:
        cols_by_table: {table_name: [(col_name, data_type), ...]}
        table_names: 表名集合
        fk_pairs: 已有的外键对集合 {(from_table, to_table), ...}
        threshold: 置信度阈值
    
    Returns:
        list of {source, target, confidence, reason, from_column, to_column}
    """
    table_set = set(table_names or [])
    fk_pairs = fk_pairs or set()
    
    # 构建表名映射（标准化名称 -> 原始表名列表）
    # 支持多种匹配方式：完整表名、去前缀后的表名
    norm_to_tables = {}
    for t in table_set:
        # 完整标准化名称
        norm = _normalize_name(t)
        norm_to_tables.setdefault(norm, []).append(t)
        
        # 单复数兜底
        if norm.endswith('s') and len(norm) > 1:
            norm_to_tables.setdefault(norm[:-1], []).append(t)
        if norm.endswith('es') and len(norm) > 2:
            norm_to_tables.setdefault(norm[:-2], []).append(t)
        
        # 提取表名的各个部分（按下划线分割），支持 sys_role -> role, data_device -> device
        parts = t.lower().split('_')
        if len(parts) > 1:
            # 最后一个部分（如 sys_role -> role）
            last_part = _normalize_name(parts[-1])
            if last_part and len(last_part) > 2:
                norm_to_tables.setdefault(last_part, []).append(t)
                # 单复数
                if last_part.endswith('s') and len(last_part) > 1:
                    norm_to_tables.setdefault(last_part[:-1], []).append(t)
            
            # 最后两个部分（如 sys_user_role -> userrole, user_role）
            if len(parts) > 2:
                last_two = _normalize_name('_'.join(parts[-2:]))
                if last_two and len(last_two) > 3:
                    norm_to_tables.setdefault(last_two, []).append(t)
    
    # 构建表列集合（用于检查目标表是否有 id 列）
    table_cols_map = {}
    for table_name, cols in cols_by_table.items():
        table_cols_map[table_name] = {(c or '').lower(): dt for c, dt in cols}
    
    inferred = []
    seen_pairs = set()  # 避免重复
    
    for table_name, cols in cols_by_table.items():
        if table_name not in table_set:
            continue
        
        for col_name, data_type in cols:
            # 提取可能的实体名
            entity = _extract_entity_name(col_name)
            if not entity:
                continue
            
            entity_norm = _normalize_name(entity)
            if not entity_norm:
                continue
            
            # 查找候选目标表
            candidates = norm_to_tables.get(entity_norm, [])
            candidates = [c for c in candidates if c != table_name]
            
            # 去重
            seen = set()
            candidates = [c for c in candidates if not (c in seen or seen.add(c))]
            
            if not candidates:
                continue
            
            # 计算置信度
            for target in candidates:
                pair = (table_name, target)
                if pair in fk_pairs or pair in seen_pairs:
                    continue
                
                confidence = 0.5  # 基础置信度
                reasons = [f"字段 {col_name} 匹配表名 {target}"]
                
                # 类型兼容性加分
                if _is_id_like_type(data_type):
                    confidence += 0.1
                    reasons.append("数据类型适合作为外键")
                
                # 目标表有 id 列加分
                target_cols = table_cols_map.get(target, {})
                if 'id' in target_cols:
                    confidence += 0.15
                    reasons.append("目标表存在 id 列")
                
                # 表名精确匹配加分（如 role_id -> sys_role 比 role_id -> sys_user_role 更可能）
                target_lower = target.lower()
                entity_lower = entity.lower()
                if target_lower.endswith('_' + entity_lower) or target_lower == entity_lower:
                    confidence += 0.15
                    reasons.append("表名精确匹配字段实体名")
                elif entity_lower in target_lower.split('_'):
                    confidence += 0.1
                    reasons.append("表名包含字段实体名")
                
                # 唯一候选加分
                if len(candidates) == 1:
                    confidence += 0.1
                    reasons.append("唯一匹配的候选表")
                elif len(candidates) <= 3:
                    # 多候选但不太多，轻微降分
                    confidence -= 0.05
                    reasons.append(f"存在 {len(candidates)} 个候选表")
                else:
                    confidence -= 0.15  # 太多候选，大幅降分
                    reasons.append(f"存在 {len(candidates)} 个候选表（较多）")
                
                # 限制置信度范围
                confidence = max(0.1, min(1.0, confidence))
                
                if confidence >= threshold:
                    seen_pairs.add(pair)
                    inferred.append({
                        "source": table_name,
                        "target": target,
                        "confidence": round(confidence, 2),
                        "reason": "；".join(reasons),
                        "from_column": col_name,
                        "to_column": "id" if 'id' in target_cols else None,
                        "infer_type": "rule"
                    })
    
    # 按置信度降序排序
    inferred.sort(key=lambda x: -x["confidence"])
    return inferred


def infer_relationships_by_llm(candidates, cols_by_table, tables_data, max_candidates=20):
    """
    第三层：LLM 复核候选关系，重新打分并给出理由
    
    Args:
        candidates: 规则推断的候选关系列表
        cols_by_table: {table_name: [(col_name, data_type), ...]}
        tables_data: {table_name: {comment: str, ...}}
        max_candidates: 最多复核的候选数量
    
    Returns:
        list of {source, target, confidence, reason, from_column, to_column}
    """
    if not candidates:
        return []
    
    client = get_openai_client()
    if not client:
        print("LLM 客户端不可用，跳过 LLM 推断")
        return candidates  # 返回原始候选
    
    ai_config = config.get('ai', {}).get('openai', {})
    model = ai_config.get('model', 'google/gemma-3-1b')
    
    # 限制候选数量
    to_review = candidates[:max_candidates]
    
    # 构建 prompt
    prompt_parts = ["请评估以下数据库表之间的潜在关系，并为每个关系打分（0-1）。\n"]
    prompt_parts.append("## 候选关系：\n")
    
    for i, c in enumerate(to_review, 1):
        src = c["source"]
        tgt = c["target"]
        from_col = c.get("from_column", "?")
        
        # 获取表注释
        src_comment = tables_data.get(src, {}).get("comment", "") or ""
        tgt_comment = tables_data.get(tgt, {}).get("comment", "") or ""
        
        # 获取部分列信息
        src_cols = cols_by_table.get(src, [])[:5]
        tgt_cols = cols_by_table.get(tgt, [])[:5]
        src_cols_str = ", ".join([f"{c}({dt})" for c, dt in src_cols])
        tgt_cols_str = ", ".join([f"{c}({dt})" for c, dt in tgt_cols])
        
        prompt_parts.append(f"{i}. {src}.{from_col} -> {tgt}")
        if src_comment:
            prompt_parts.append(f"   {src} 表注释: {src_comment}")
        if tgt_comment:
            prompt_parts.append(f"   {tgt} 表注释: {tgt_comment}")
        prompt_parts.append(f"   {src} 部分列: {src_cols_str}")
        prompt_parts.append(f"   {tgt} 部分列: {tgt_cols_str}")
        prompt_parts.append("")
    
    prompt_parts.append("""
请以 JSON 格式返回评估结果，格式如下：
{
  "results": [
    {"index": 1, "score": 0.85, "reason": "user_id 明显指向 user 表的主键"},
    {"index": 2, "score": 0.3, "reason": "命名相似但业务上无关联"}
  ]
}

评分标准：
- 0.9-1.0: 几乎确定是外键关系
- 0.7-0.9: 很可能是关联关系
- 0.5-0.7: 可能存在关联
- 0.3-0.5: 不太确定
- 0-0.3: 可能是误判

只返回 JSON，不要其他解释。""")
    
    prompt = "\n".join(prompt_parts)
    
    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "你是数据库架构专家，擅长分析表之间的关联关系。请基于表名、列名、注释等信息判断表之间是否存在外键或业务关联。"},
                {"role": "user", "content": prompt}
            ],
            max_tokens=2000,
            temperature=0.3
        )
        
        result_text = response.choices[0].message.content.strip()
        
        # 解析 JSON
        try:
            # 尝试提取 JSON
            json_match = re.search(r'\{[\s\S]*\}', result_text)
            if json_match:
                result_json = json.loads(json_match.group())
                llm_results = result_json.get("results", [])
                
                # 更新候选的置信度和理由
                result_map = {r["index"]: r for r in llm_results}
                
                for i, c in enumerate(to_review, 1):
                    if i in result_map:
                        llm_r = result_map[i]
                        # 融合规则分数和 LLM 分数（加权平均）
                        rule_score = c["confidence"]
                        llm_score = float(llm_r.get("score", 0.5))
                        # LLM 权重更高
                        c["confidence"] = round(rule_score * 0.3 + llm_score * 0.7, 2)
                        c["reason"] = llm_r.get("reason", c["reason"])
                        c["infer_type"] = "rule+llm"
                
                print(f"LLM 复核完成，处理了 {len(result_map)} 个候选关系")
        except json.JSONDecodeError as e:
            print(f"LLM 返回 JSON 解析失败: {e}")
            print(f"原始返回: {result_text}")
    
    except Exception as e:
        print(f"LLM 推断失败: {e}")
    
    # 返回所有候选（包括未被 LLM 处理的）
    result = to_review + candidates[max_candidates:]
    result.sort(key=lambda x: -x["confidence"])
    return result


def infer_relationships(
    cols_by_table, 
    table_names, 
    tables_data=None,
    fk_pairs=None, 
    threshold=0.5,
    use_llm=False,
    llm_max_candidates=20
):
    """
    综合推断关系（规则 + 可选 LLM）
    
    Args:
        cols_by_table: {table_name: [(col_name, data_type), ...]}
        table_names: 表名集合
        tables_data: {table_name: {comment: str, ...}} 用于 LLM 推断
        fk_pairs: 已有的外键对集合
        threshold: 置信度阈值
        use_llm: 是否使用 LLM 复核
        llm_max_candidates: LLM 复核的最大候选数
    
    Returns:
        list of {source, target, confidence, reason, from_column, to_column, infer_type}
    """
    print(f"[关系推断] 开始推断，表数量: {len(table_names or [])}, 阈值: {threshold}, 使用LLM: {use_llm}")
    
    # 第一层 + 第二层：规则推断
    candidates = infer_relationships_by_rules(
        cols_by_table, table_names, fk_pairs, threshold=0.3  # 先用低阈值获取更多候选
    )
    print(f"[关系推断] 规则推断得到 {len(candidates)} 个候选关系")
    
    # 第三层：LLM 复核
    if use_llm and candidates:
        candidates = infer_relationships_by_llm(
            candidates, 
            cols_by_table, 
            tables_data or {},
            max_candidates=llm_max_candidates
        )
        print(f"[关系推断] LLM 复核后 {len(candidates)} 个候选关系")
    
    # 最终过滤
    result = [c for c in candidates if c["confidence"] >= threshold]
    print(f"[关系推断] 过滤后最终 {len(result)} 个关系（阈值 {threshold}）")
    
    # 打印前几个结果用于调试
    for r in result[:5]:
        print(f"  - {r['source']} -> {r['target']} (置信度: {r['confidence']}, 原因: {r['reason'][:50]}...)")
    
    return result

