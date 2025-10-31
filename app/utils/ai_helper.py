"""
AI助手工具
"""

import json
from openai import OpenAI
from ..config import config


def get_openai_client():
    """获取OpenAI客户端"""
    ai_config = config.get('ai', {}).get('openai', {})
    
    try:
        client = OpenAI(
            base_url=ai_config.get('base_url', 'http://192.168.1.20:1234/v1'),
            api_key=ai_config.get('api_key', 'sk-no-key-required'),
            timeout=ai_config.get('timeout', 30)
        )
        print(f"OpenAI客户端初始化成功，使用模型: {ai_config.get('model', 'google/gemma-3-1b')}")
        return client
    except Exception as e:
        print(f"OpenAI客户端初始化失败: {str(e)}")
        return None


def infer_chinese_meaning(columns, table_name, db_description=""):
    """推断列的中文含义"""
    client = get_openai_client()
    if not client:
        return {}
    
    ai_config = config.get('ai', {}).get('openai', {})
    model = ai_config.get('model', 'google/gemma-3-1b')
    
    # 构建列信息字符串
    column_info = []
    for col in columns:
        # 将所有数据转换为字符串，避免类型转换错误
        column_name = str(col[0]) if col[0] is not None else ''
        data_type = str(col[1]) if col[1] is not None else ''
        is_nullable = str(col[2]) if col[2] is not None else ''
        column_comment = str(col[4]) if len(col) > 4 and col[4] is not None else ''
        
        info = f"列名: {column_name}, 类型: {data_type}, 可空: {is_nullable}"
        if column_comment:
            info += f", 注释: {column_comment}"
        column_info.append(info)
    
    columns_text = "\n".join(column_info)
    
    # 确保所有字符串都是可序列化的
    table_name_str = str(table_name) if table_name is not None else "未知表"
    columns_text_str = str(columns_text) if columns_text is not None else ""
    
    # 提取字段名列表
    field_names = [str(col[0]) for col in columns if col[0] is not None]
    fields_str = ', '.join(field_names)
    
    # 构建包含数据库功能介绍的提示词
    db_context = ""
    if db_description and db_description.strip():
        db_context = f"\n\n参考信息：数据库功能介绍：\n{db_description.strip()}\n\n请结合以上数据库功能介绍来推断字段含义，确保推断结果符合该数据库的业务场景。"
    
    prompt = f"""请给出表 {table_name_str} 中字段 {fields_str} 的中文含义，要求每个含义不超过10个字符。请以严格的json格式返回结果。{db_context}

表结构信息：
{columns_text_str}

示例格式：
{{
    "field1": "字段含义1",
    "field2": "字段含义2"
}}

注意：
1. 必须返回标准的JSON格式
2. 每个字段含义不超过10个字符
3. 根据字段名和类型推断业务含义
4. 对于常见字段使用标准含义（如id=标识符，name=名称等）
5. 如果提供了数据库功能介绍，请结合业务场景进行更精准的推断"""
    
    try:
        # 确保prompt是字符串类型
        prompt_str = str(prompt)
        system_content = "你是一个数据库专家，擅长根据字段名称、类型和业务场景推断字段的业务含义。当提供了数据库功能介绍时，你会结合具体的业务场景进行更精准的推理。"
        
        print(f"正在调用AI推断表 {table_name_str} 的列含义...")
        
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_content},
                {"role": "user", "content": prompt_str}
            ],
            max_tokens=1000,
            temperature=0.3
        )
        
        result_text = response.choices[0].message.content.strip()
        
        # 清理JSON格式（移除可能的markdown代码块标记）
        clean_content = result_text.removeprefix('```json').removesuffix('```').strip()
        
        # 解析JSON结果
        try:
            meanings = json.loads(clean_content)
            # 确保所有值都是字符串类型
            meanings = {str(k): str(v) for k, v in meanings.items()}
        except json.JSONDecodeError as json_error:
            print(f"JSON解析失败: {json_error}")
            print(f"原始响应: {result_text}")
            # 如果JSON解析失败，尝试文本解析作为备选
            meanings = {}
            for line in result_text.split('\n'):
                if ':' in line or '：' in line:
                    parts = line.replace('：', ':').split(':', 1)
                    if len(parts) == 2:
                        column_name = parts[0].strip().strip('"').strip("'")
                        meaning = parts[1].strip().strip('"').strip("'")
                        meanings[column_name] = meaning
        
        print(f"AI推断成功，获得 {len(meanings)} 个字段的含义")
        return meanings
        
    except Exception as e:
        import traceback
        error_msg = f"AI推断失败: {str(e)}"
        print(error_msg)
        print(f"错误详情: {traceback.format_exc()}")
        print(f"表名: {table_name_str}")
        print(f"列数量: {len(column_info)}")
        return {}


def generate_markdown(columns, meanings):
    """生成Markdown格式的表文档"""
    print(f"Markdown生成开始，收到 {len(meanings)} 个字段含义")
    print(f"字段含义内容: {meanings}")
    
    markdown = "| 字段名 | 类型 | 是否可空 | 默认值 | 中文含义 | 注释 |\n"
    markdown += "|--------|------|----------|--------|----------|------|\n"
    
    for col in columns:
        # 将所有数据转换为字符串，避免类型转换错误，并处理空值
        column_name = str(col[0]).strip() if col[0] is not None else ''
        data_type = str(col[1]).strip() if col[1] is not None else ''
        is_nullable = str(col[2]).strip() if col[2] is not None else ''
        column_default = str(col[3]).strip() if col[3] is not None and str(col[3]).strip() != 'None' else ''
        column_comment = str(col[4]).strip() if len(col) > 4 and col[4] is not None and str(col[4]).strip() != 'None' else ''
        
        # 获取推断的中文含义
        chinese_meaning = str(meanings.get(column_name, '')).strip()
        
        # 处理数据类型显示
        if len(col) > 5 and col[5] is not None:  # character_maximum_length
            max_length = col[5]
            if max_length and max_length != -1:
                data_type += f"({max_length})"
        elif len(col) > 6 and col[6] is not None and col[6] > 0:  # numeric_precision
            precision = col[6]
            if len(col) > 7 and col[7] is not None and col[7] > 0:  # numeric_scale
                scale = col[7]
                data_type += f"({precision},{scale})"
            else:
                data_type += f"({precision})"
        
        # 清理特殊字符，确保表格格式正确
        def clean_cell_content(content):
            """清理单元格内容，移除可能影响表格格式的字符"""
            if not content:
                return ''
            # 移除换行符和管道符
            content = str(content).replace('\n', ' ').replace('\r', ' ').replace('|', '｜')
            # 移除多余空格
            content = ' '.join(content.split())
            return content
        
        column_name = clean_cell_content(column_name)
        data_type = clean_cell_content(data_type)
        is_nullable = clean_cell_content(is_nullable)
        column_default = clean_cell_content(column_default)
        chinese_meaning = clean_cell_content(chinese_meaning)
        column_comment = clean_cell_content(column_comment)
        
        markdown += f"| {column_name} | {data_type} | {is_nullable} | {column_default} | {chinese_meaning} | {column_comment} |\n"
    
    return markdown