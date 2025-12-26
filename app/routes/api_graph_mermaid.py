"""
关系图 API - Mermaid 版本
"""
from flask import request, jsonify
from ..utils import connect_db, get_tables_and_views
from ..utils.database import get_foreign_keys, get_all_columns
from ..utils.relationship_inference import infer_relationships


def graph_mermaid():
    """返回用于关系图渲染的 Mermaid ER 图 DSL（第一版：MySQL）"""
    try:
        data = request.get_json() or {}
        host = data.get('host')
        user = data.get('user')
        password = data.get('password')
        port = int(data.get('port', 3306))
        database = data.get('database')
        db_type = data.get('db_type', 'mysql')
        
        options = data.get('options', {}) or {}
        include_fk = bool(options.get('include_fk', True))
        include_inferred = bool(options.get('include_inferred', False))
        use_llm = bool(options.get('use_llm', False))  # 是否使用 LLM 复核推断
        threshold = float(options.get('threshold', 0.6))
        selected_tables = options.get('tables') or None

        if db_type != 'mysql':
            return jsonify({"success": False, "message": "当前版本仅支持 MySQL"})

        connection = connect_db(host, user, password, port, database, db_type)

        try:
            # 获取表列表
            tables_info = get_tables_and_views(connection, database, db_type)
            table_names = []
            tables_data = {}
            
            for row in tables_info:
                table_name = row[0] if isinstance(row, (list, tuple)) else row
                if not table_name:
                    continue
                if selected_tables and table_name not in selected_tables:
                    continue
                table_type = row[1] if isinstance(row, (list, tuple)) and len(row) > 1 else ''
                table_comment = row[2] if isinstance(row, (list, tuple)) and len(row) > 2 else ''
                table_names.append(table_name)
                tables_data[table_name] = {
                    "type": table_type,
                    "comment": table_comment or ''
                }

            # 读取列信息（包含注释）
            columns_rows = get_all_columns(connection, database, db_type, tables=table_names)
            cols_by_table = {}
            cols_by_table_with_comment = {}  # 包含注释的完整信息
            for row in columns_rows or []:
                t = row[0]
                c = row[1] or ''
                dt = row[2] or ''
                comment = row[3] if len(row) > 3 else ''
                cols_by_table.setdefault(t, []).append((c, dt))
                cols_by_table_with_comment.setdefault(t, []).append((c, dt, comment))

            # 更新 tables_data 的列信息（包含注释，供详情面板使用）
            for table_name in table_names:
                cols = cols_by_table_with_comment.get(table_name, [])
                tables_data[table_name]["columns"] = cols
                tables_data[table_name]["columns_count"] = len(cols)

            # 读取外键关系
            fk_edges_raw = []
            fk_pairs = set()
            if include_fk:
                fk_edges_raw = get_foreign_keys(connection, database, db_type, tables=table_names)
                # 记录已有外键对，避免推断重复
                for e in fk_edges_raw:
                    fk_pairs.add((e.get("from_table"), e.get("to_table")))

            # 推断关系（规则 + 可选 LLM）
            inferred_edges_raw = []
            if include_inferred:
                inferred_edges_raw = infer_relationships(
                    cols_by_table=cols_by_table,
                    table_names=set(table_names),
                    tables_data=tables_data,
                    fk_pairs=fk_pairs,
                    threshold=threshold,
                    use_llm=use_llm,
                    llm_max_candidates=20
                )

            connection.close()

            # ========== 先收集所有关系，用于计算关系数 ==========
            relationships = []
            
            if include_fk:
                for e in fk_edges_raw:
                    from_table = e.get("from_table")
                    to_table = e.get("to_table")
                    if from_table not in table_names or to_table not in table_names:
                        continue
                    relationships.append({
                        "source": from_table,
                        "target": to_table,
                        "kind": "fk",
                        "constraint": e.get("constraint_name", "")
                    })

            if include_inferred:
                for e in inferred_edges_raw:
                    src = e.get('source')
                    tgt = e.get('target')
                    conf = e.get('confidence', 0)
                    reason = e.get('reason', '')
                    if src not in table_names or tgt not in table_names:
                        continue
                    if conf < threshold:
                        continue
                    relationships.append({
                        "source": src,
                        "target": tgt,
                        "kind": "infer",
                        "confidence": conf,
                        "reason": reason
                    })

            # ========== 计算关系数，识别核心表和孤立表 ==========
            in_degree = {t: 0 for t in table_names}
            out_degree = {t: 0 for t in table_names}
            for rel in relationships:
                src, tgt = rel.get("source"), rel.get("target")
                if src in out_degree:
                    out_degree[src] += 1
                if tgt in in_degree:
                    in_degree[tgt] += 1
            
            relation_counts = {t: in_degree[t] + out_degree[t] for t in table_names}
            max_relations = max(relation_counts.values()) if relation_counts else 0
            core_threshold = max(3, max_relations * 0.5)
            
            def extract_prefix(name):
                parts = name.split('_')
                if len(parts) >= 2:
                    return parts[0]
                return 'other'
            
            # 分类表
            core_tables = []
            normal_tables = []
            isolated_tables = []
            
            for t in table_names:
                rel_count = relation_counts.get(t, 0)
                if rel_count >= core_threshold:
                    core_tables.append(t)
                elif rel_count == 0:
                    isolated_tables.append(t)
                else:
                    normal_tables.append(t)
            
            # 核心表按关系数降序排列
            core_tables.sort(key=lambda t: -relation_counts.get(t, 0))
            # 普通表按关系数降序排列
            normal_tables.sort(key=lambda t: -relation_counts.get(t, 0))
            # 孤立表按名称排序
            isolated_tables.sort()
            
            # ========== 按优化顺序排列表：核心表 → 普通表 → 孤立表 ==========
            sorted_table_names = core_tables + normal_tables + isolated_tables
            
            print(f"[布局优化] 核心表: {len(core_tables)}, 普通表: {len(normal_tables)}, 孤立表: {len(isolated_tables)}")
            if core_tables:
                print(f"[布局优化] 核心表顺序: {core_tables[:5]}...")

            # ========== 构造 Mermaid ER 图 DSL ==========
            mermaid_lines = ["erDiagram"]
            preview_limit = int(options.get('columns_preview_limit', 8) or 8)
            
            # 按优化后的顺序定义表
            for table_name in sorted_table_names:
                cols = cols_by_table.get(table_name, [])
                safe_table_name = table_name.replace('-', '_').replace('.', '_').replace(' ', '_')
                mermaid_lines.append(f"    {safe_table_name} {{")
                
                preview_cols = cols[:preview_limit]
                for c, dt in preview_cols:
                    c = str(c or '').strip()
                    dt = str(dt or '').strip()
                    if not c:
                        continue
                    safe_col = c.replace('-', '_').replace('.', '_').replace(' ', '_')
                    mermaid_lines.append(f"        {dt} {safe_col}")
                
                if len(cols) > preview_limit:
                    remaining = len(cols) - preview_limit
                    mermaid_lines.append(f"        string more \"...({remaining} more)\"")
                
                mermaid_lines.append("    }")

            # 添加关系（也按核心表优先的顺序）
            # 先添加涉及核心表的关系
            core_set = set(core_tables)
            core_rels = [r for r in relationships if r["source"] in core_set or r["target"] in core_set]
            other_rels = [r for r in relationships if r["source"] not in core_set and r["target"] not in core_set]
            sorted_relationships = core_rels + other_rels
            
            for rel in sorted_relationships:
                src = rel["source"]
                tgt = rel["target"]
                kind = rel["kind"]
                
                safe_src = src.replace('-', '_').replace('.', '_').replace(' ', '_')
                safe_tgt = tgt.replace('-', '_').replace('.', '_').replace(' ', '_')
                
                if kind == "fk":
                    mermaid_lines.append(f"    {safe_src} ||--o{{ {safe_tgt} : \"FK\"")
                else:
                    conf = rel.get("confidence", 0)
                    label = f"inferred({conf:.2f})"
                    mermaid_lines.append(f"    {safe_src} }}o..o{{ {safe_tgt} : \"{label}\"")

            mermaid_dsl = "\n".join(mermaid_lines)

            # ========== 更新 tables_data ==========
            prefix_groups = {}
            for t in table_names:
                prefix = extract_prefix(t)
                prefix_groups.setdefault(prefix, []).append(t)
            
            for t in table_names:
                rel_count = relation_counts.get(t, 0)
                tables_data[t]["in_degree"] = in_degree.get(t, 0)
                tables_data[t]["out_degree"] = out_degree.get(t, 0)
                tables_data[t]["relation_count"] = rel_count
                tables_data[t]["prefix"] = extract_prefix(t)
                tables_data[t]["is_isolated"] = rel_count == 0
                tables_data[t]["is_core"] = rel_count >= core_threshold

            return jsonify({
                "success": True,
                "mermaid": mermaid_dsl,
                "tables": tables_data,
                "relationships": relationships,
                "stats": {
                    "tables_count": len(table_names),
                    "relationships_count": len(relationships),
                    "isolated_count": len(isolated_tables),
                    "core_count": len(core_tables)
                },
                "insights": {
                    "core_tables": core_tables,
                    "isolated_tables": isolated_tables,
                    "prefix_groups": prefix_groups,
                    "max_relations": max_relations
                }
            })

        except Exception as e:
            connection.close()
            return jsonify({"success": False, "message": f"查询失败: {str(e)}"})

    except Exception as e:
        return jsonify({"success": False, "message": str(e)})

