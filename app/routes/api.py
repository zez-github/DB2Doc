"""
API路由模块
"""

from flask import Blueprint, request, jsonify, Response, send_file
import os
import json
import queue
from datetime import datetime
import threading
from datetime import datetime
from pathlib import Path
import tkinter as tk
from tkinter import filedialog
import subprocess
import sys

from ..utils import (
    connect_db,
    get_tables_and_views,
    get_tables_with_missing_stats,
    get_columns_info,
    get_foreign_keys,
    get_all_columns,
    infer_chinese_meaning,
    generate_markdown,
    get_databases,
    update_table_comment,
    update_column_comment,
)
from ..utils.ai_helper import get_openai_client
from ..config import config
from .api_graph_mermaid import graph_mermaid

api_bp = Blueprint('api', __name__, url_prefix='/api')

# 全局日志队列
log_queue = queue.Queue()


def log_message(message):
    """记录日志消息"""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_queue.put(f"[{timestamp}] {message}")


@api_bp.route('/test_connection', methods=['POST'])
def test_connection():
    """测试数据库连接"""
    try:
        data = request.get_json()
        host = data.get('host')
        user = data.get('user')
        password = data.get('password')
        port = int(data.get('port', 3306 if data.get('db_type', 'mysql') == 'mysql' else 1433))
        database = data.get('database')
        db_type = data.get('db_type', 'mysql')

        connection = connect_db(host, user, password, port, database, db_type)
        tables = get_tables_and_views(connection, database, db_type)
        connection.close()
        return jsonify({"success": True, "tables": tables, "db_type": db_type})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})


@api_bp.route('/get_tables', methods=['POST'])
def get_tables():
    """获取数据库表列表"""
    try:
        data = request.get_json()
        host = data.get('host')
        user = data.get('user')
        password = data.get('password')
        port = int(data.get('port', 3306 if data.get('db_type', 'mysql') == 'mysql' else 1433))
        database = data.get('database')
        db_type = data.get('db_type', 'mysql')

        connection = connect_db(host, user, password, port, database, db_type)
        # Phase2：一次性返回表注释与“待补充”统计，避免前端逐表拉取详情
        tables = get_tables_with_missing_stats(connection, database, db_type)
        connection.close()
        
        return jsonify({"success": True, "tables": tables})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})


@api_bp.route('/select_markdown_file', methods=['GET'])
def api_select_markdown_file():
    """选择 Markdown 文件（用于增量更新模式选择已有文档）"""
    try:
        root = tk.Tk()
        root.withdraw()
        root.attributes('-topmost', True)
        file_path = filedialog.askopenfilename(
            title='选择要增量更新的 Markdown 文档',
            filetypes=[('Markdown', '*.md *.markdown'), ('All Files', '*.*')]
        )
        root.destroy()
        if file_path:
            return jsonify({"success": True, "path": file_path})
        return jsonify({"success": False, "message": "用户取消"})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})


@api_bp.route('/list_databases', methods=['POST'])
def list_databases():
    """获取服务器上的数据库列表"""
    try:
        data = request.get_json()
        host = data.get('host')
        user = data.get('user')
        password = data.get('password')
        db_type = data.get('db_type', 'mysql')
        # 根据数据库类型设置默认端口
        port = int(data.get('port', 3306 if db_type == 'mysql' else 1433))

        databases = get_databases(host, user, password, port, db_type)
        return jsonify({"success": True, "databases": databases})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})


@api_bp.route('/get_table_detail', methods=['POST'])
def get_table_detail():
    """获取表的详细信息"""
    try:
        data = request.get_json()
        host = data.get('host')
        user = data.get('user')
        password = data.get('password')
        port = int(data.get('port', 3306 if data.get('db_type', 'mysql') == 'mysql' else 1433))
        database = data.get('database')
        db_type = data.get('db_type', 'mysql')
        table_name = data.get('table_name')

        connection = connect_db(host, user, password, port, database, db_type)
        columns_info = get_columns_info(connection, table_name, database, db_type)
        connection.close()

        # 处理表注释
        table_comment = ''
        if db_type == 'mysql':
            # 单独查询表注释
            connection = connect_db(host, user, password, port, database, db_type)
            cursor = connection.cursor()
            query = """
            SELECT table_comment 
            FROM information_schema.tables 
            WHERE table_schema = %s AND table_name = %s
            """
            cursor.execute(query, (database, table_name))
            table_comment_result = cursor.fetchone()
            if table_comment_result:
                table_comment = table_comment_result[0]
            cursor.close()
            connection.close()
        elif db_type == 'sqlserver':
            # 单独查询表注释
            connection = connect_db(host, user, password, port, database, db_type)
            cursor = connection.cursor()
            query = """
            SELECT ISNULL(CAST(ep.value AS NVARCHAR(MAX)), '') as table_comment
            FROM sys.tables t
            LEFT JOIN sys.extended_properties ep ON ep.major_id = t.object_id AND ep.minor_id = 0 AND ep.name = 'MS_Description'
            WHERE t.name = ?
            """
            cursor.execute(query, (table_name,))
            table_comment_result = cursor.fetchone()
            if table_comment_result:
                table_comment = table_comment_result[0]
            cursor.close()
            connection.close()

        # 格式化列信息
        fields = []
        for column in columns_info:
            if db_type == 'mysql':
                # MySQL格式: (column_name, data_type, is_nullable, column_default, column_comment, character_maximum_length, numeric_precision, numeric_scale)
                field = {
                    'name': column[0],
                    'type': column[1],
                    'nullable': column[2] == 'YES',
                    'default': column[3],
                    'comment': column[4]
                }
            elif db_type == 'sqlserver':
                # SQL Server格式: (column_name, data_type, is_nullable, column_default, column_comment, character_maximum_length, numeric_precision, numeric_scale)
                field = {
                    'name': column[0],
                    'type': column[1],
                    'nullable': column[2] == 'YES',
                    'default': column[3],
                    'comment': column[4]
                }
            fields.append(field)

        return jsonify({"success": True, "table_info": {"comment": table_comment}, "fields": fields})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})


@api_bp.route('/generate_field_description', methods=['POST'])
def generate_field_description():
    """生成单个字段说明"""
    try:
        data = request.get_json()
        host = data.get('host')
        user = data.get('user')
        password = data.get('password')
        port = int(data.get('port', 3306 if data.get('db_type', 'mysql') == 'mysql' else 1433))
        database = data.get('database')
        db_type = data.get('db_type', 'mysql')
        table_name = data.get('table_name')
        field_name = data.get('field_name')
        db_description = data.get('db_description', '')

        # 连接数据库获取表结构信息
        connection = connect_db(host, user, password, port, database, db_type)
        columns_info = get_columns_info(connection, table_name, database, db_type)
        connection.close()

        # 查找指定字段的信息
        field_info = None
        for column in columns_info:
            if column[0] == field_name:
                field_info = column
                break

        if not field_info:
            return jsonify({"success": False, "message": f"字段 {field_name} 不存在"})

        # 只传入需要生成说明的字段
        single_field_info = [field_info]
        meanings = infer_chinese_meaning(single_field_info, table_name, db_description)

        # 获取生成的字段说明
        field_description = meanings.get(field_name, '')

        return jsonify({"success": True, "field_name": field_name, "field_description": field_description})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})


@api_bp.route('/generate_all_fields_description', methods=['POST'])
def generate_all_fields_description():
    """生成所有字段说明"""
    try:
        data = request.get_json()
        host = data.get('host')
        user = data.get('user')
        password = data.get('password')
        port = int(data.get('port', 3306 if data.get('db_type', 'mysql') == 'mysql' else 1433))
        database = data.get('database')
        db_type = data.get('db_type', 'mysql')
        table_name = data.get('table_name')
        db_description = data.get('db_description', '')

        # 连接数据库获取表结构信息
        connection = connect_db(host, user, password, port, database, db_type)
        columns_info = get_columns_info(connection, table_name, database, db_type)
        connection.close()

        # 生成所有字段的说明
        meanings = infer_chinese_meaning(columns_info, table_name, db_description)

        return jsonify({"success": True, "field_meanings": meanings})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})


@api_bp.route('/generate_table_description', methods=['POST'])
def generate_table_description():
    """生成表说明"""
    try:
        data = request.get_json()
        host = data.get('host')
        user = data.get('user')
        password = data.get('password')
        port = int(data.get('port', 3306 if data.get('db_type', 'mysql') == 'mysql' else 1433))
        database = data.get('database')
        db_type = data.get('db_type', 'mysql')
        table_name = data.get('table_name')
        db_description = data.get('db_description', '')

        # 连接数据库获取表结构信息
        connection = connect_db(host, user, password, port, database, db_type)
        columns_info = get_columns_info(connection, table_name, database, db_type)
        connection.close()

        # 生成表说明
        # 这里我们复用 infer_chinese_meaning 函数，通过修改提示词来生成表说明
        client = get_openai_client()
        if not client:
            return jsonify({"success": False, "message": "AI客户端初始化失败"})

        ai_config = config.get('ai', {}).get('openai', {})
        model = ai_config.get('model', 'google/gemma-3-1b')

        # 构建列信息字符串
        column_info = []
        for col in columns_info:
            column_name = str(col[0]) if col[0] is not None else ''
            data_type = str(col[1]) if col[1] is not None else ''
            column_info.append(f"列名: {column_name}, 类型: {data_type}")

        columns_text = "\n".join(column_info)
        table_name_str = str(table_name) if table_name is not None else "未知表"

        # 构建包含数据库功能介绍的提示词
        db_context = ""
        if db_description and db_description.strip():
            db_context = f"\n\n参考信息：数据库功能介绍：\n{db_description.strip()}\n\n请结合以上数据库功能介绍来推断表的功能和用途。"

        prompt = f"""请给出表 {table_name_str} 的中文说明，要求说明表的功能、用途和主要业务场景，不超过100个字符。\n\n表结构信息：\n{columns_text}{db_context}"""

        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "你是一个数据库专家，擅长根据表结构和业务场景推断表的功能和用途。"},
                {"role": "user", "content": prompt}
            ],
            max_tokens=100,
            temperature=0.3
        )

        table_description = response.choices[0].message.content.strip()

        return jsonify({"success": True, "table_description": table_description})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})


@api_bp.route('/save_table_comment', methods=['POST'])
def save_table_comment():
    """保存表注释和字段注释到数据库"""
    try:
        data = request.get_json()
        host = data.get('host')
        user = data.get('user')
        password = data.get('password')
        port = int(data.get('port', 3306 if data.get('db_type', 'mysql') == 'mysql' else 1433))
        database = data.get('database')
        db_type = data.get('db_type', 'mysql')
        table_name = data.get('table_name')
        table_description = data.get('table_description', '')
        field_descriptions = data.get('field_descriptions', {})

        # 连接数据库
        connection = connect_db(host, user, password, port, database, db_type)

        try:
            # 更新表注释
            update_table_comment(connection, table_name, database, table_description, db_type)
            
            # 更新字段注释
            for field_name, field_desc in field_descriptions.items():
                update_column_comment(connection, table_name, database, field_name, field_desc, db_type)
            
            connection.close()
            return jsonify({"success": True, "message": "表注释和字段注释保存成功"})
        except Exception as e:
            connection.close()
            return jsonify({"success": False, "message": f"保存失败: {str(e)}"})
    except Exception as e:
        return jsonify({"success": False, "message": f"数据库连接失败: {str(e)}"})


@api_bp.route('/generate_all_tables_description', methods=['POST'])
def generate_all_tables_description():
    """一键生成所有表和字段的描述并更新到数据库"""
    try:
        data = request.get_json()
        host = data.get('host')
        user = data.get('user')
        password = data.get('password')
        port = int(data.get('port', 3306 if data.get('db_type', 'mysql') == 'mysql' else 1433))
        database = data.get('database')
        db_type = data.get('db_type', 'mysql')
        db_description = data.get('db_description', '')

        # 连接数据库
        connection = connect_db(host, user, password, port, database, db_type)
        
        try:
            # 获取所有表列表
            tables = get_tables_and_views(connection, database, db_type)
            
            # 处理结果
            tables_list = []
            if isinstance(tables[0], (list, tuple)):
                # 格式为 [(table_name, table_type, table_comment), ...]
                tables_list = [table[0] for table in tables]
            else:
                # 格式为 [table_name, table_name, ...]
                tables_list = tables
            
            # 生成结果统计
            result = {
                "success": True,
                "total_tables": len(tables_list),
                "processed_tables": 0,
                "success_tables": 0,
                "failed_tables": 0,
                "failed_table_details": []
            }
            
            # 遍历所有表，生成描述并保存
            total_tables = len(tables_list)
            for index, table_name in enumerate(tables_list, 1):
                try:
                    result["processed_tables"] += 1
                    
                    # 更新当前状态
                    current_status = f"正在处理表: {table_name} ({index}/{total_tables})"
                    log_message(current_status)
                    
                    # 推送进度信息
                    progress_percent = int((index / total_tables) * 100)
                    log_queue.put(f"PROGRESS:{index}:{total_tables}:{table_name}")
                    
                    # 1. 生成表说明
                    table_gen_response = generate_table_description_internal(connection, table_name, database, db_type, db_description)
                    table_description = table_gen_response["table_description"]
                    
                    # 2. 生成所有字段说明
                    columns_info = get_columns_info(connection, table_name, database, db_type)
                    field_meanings = infer_chinese_meaning(columns_info, table_name, db_description)
                    
                    # 3. 保存到数据库
                    update_table_comment(connection, table_name, database, table_description, db_type)
                    
                    for field_name, field_desc in field_meanings.items():
                        update_column_comment(connection, table_name, database, field_name, field_desc, db_type)
                    
                    result["success_tables"] += 1
                    log_message(f"成功生成并保存表 {table_name} 的描述")
                except Exception as e:
                    result["failed_tables"] += 1
                    result["failed_table_details"].append({
                        "table_name": table_name,
                        "error": str(e)
                    })
                    log_message(f"处理表 {table_name} 时出错: {str(e)}")
                    continue
            
            connection.close()
            return jsonify(result)
        except Exception as e:
            connection.close()
            return jsonify({"success": False, "message": f"批量生成失败: {str(e)}"})
    except Exception as e:
        return jsonify({"success": False, "message": f"数据库连接失败: {str(e)}"})


def generate_table_description_internal(connection, table_name, database, db_type, db_description):
    """内部函数：生成表说明"""
    columns_info = get_columns_info(connection, table_name, database, db_type)
    
    client = get_openai_client()
    if not client:
        raise Exception("AI客户端初始化失败")

    ai_config = config.get('ai', {}).get('openai', {})
    model = ai_config.get('model', 'google/gemma-3-1b')

    # 构建列信息字符串
    column_info = []
    for col in columns_info:
        column_name = str(col[0]) if col[0] is not None else ''
        data_type = str(col[1]) if col[1] is not None else ''
        column_info.append(f"列名: {column_name}, 类型: {data_type}")

    columns_text = "\n".join(column_info)
    table_name_str = str(table_name) if table_name is not None else "未知表"

    # 构建包含数据库功能介绍的提示词
    db_context = ""
    if db_description and db_description.strip():
        db_context = f"\n\n参考信息：数据库功能介绍：\n{db_description.strip()}\n\n请结合以上数据库功能介绍来推断表的功能和用途。"

    prompt = f"""请给出表 {table_name_str} 的中文说明，要求说明表的功能、用途和主要业务场景，不超过100个字符。\n\n表结构信息：\n{columns_text}{db_context}"""

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": "你是一个数据库专家，擅长根据表结构和业务场景推断表的功能和用途。"},
            {"role": "user", "content": prompt}
        ],
        max_tokens=100,
        temperature=0.3
    )

    table_description = response.choices[0].message.content.strip()
    
    return {"table_description": table_description}


@api_bp.route('/parse_doc', methods=['POST'])
def parse_doc():
    """解析文档"""
    try:
        data = request.get_json()
        file_path = data.get('doc_path')
        if not file_path or not os.path.exists(file_path):
            return jsonify({"success": False, "message": "文档路径无效或文件不存在"})
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        return jsonify({"success": True, "content": content})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})


@api_bp.route('/default_path', methods=['GET'])
def api_default_path():
    """获取默认路径"""
    def get_downloads_dir():
        # Windows优先使用用户主目录 + Downloads，若不存在则退回主目录
        downloads = Path.home() / 'Downloads'
        return str(downloads if downloads.exists() else Path.home())

    try:
        return jsonify({"success": True, "path": get_downloads_dir()})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})


@api_bp.route('/select_directory', methods=['GET'])
def api_select_directory():
    """选择目录"""
    try:
        root = tk.Tk()
        root.withdraw()
        root.attributes('-topmost', True)
        path = filedialog.askdirectory(title='选择保存文件夹')
        root.destroy()
        if path:
            return jsonify({"success": True, "path": path})
        else:
            return jsonify({"success": False, "message": "用户取消"})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})


@api_bp.route('/generate_docs', methods=['POST'])
def generate_docs():
    """生成文档"""
    try:
        data = request.get_json()
        host = data.get('host')
        user = data.get('user')
        password = data.get('password')
        port = int(data.get('port', 3306 if data.get('db_type', 'mysql') == 'mysql' else 1433))
        database = data.get('database')
        db_type = data.get('db_type', 'mysql')
        selected_tables = data.get('tables', [])
        output_path = data.get('output_path', '')
        file_name = data.get('file_name', f'{database}_文档_{datetime.now().strftime("%Y%m%d_%H%M%S")}.md')

        incremental_mode = data.get('incremental_mode', False)
        existing_doc_path = data.get('existing_doc_path', '')
        existing_doc_content = data.get('existing_doc_content', '')
        existing_tables = data.get('existing_tables', [])
        db_description = data.get('db_description', '')
        
        # 调试日志
        if incremental_mode:
            log_message(f"增量模式调试 - existing_doc_path: {existing_doc_path}")
            log_message(f"增量模式调试 - existing_doc_content长度: {len(existing_doc_content) if existing_doc_content else 0}")
            log_message(f"增量模式调试 - existing_tables: {existing_tables}")

        # 清空日志队列
        while not log_queue.empty():
            log_queue.get()

        def generate_in_background():
            try:
                connection = connect_db(host, user, password, port, database, db_type)

                if incremental_mode and existing_tables:
                    new_tables = [table for table in selected_tables if table not in existing_tables]
                    skipped_count = len(selected_tables) - len(new_tables)
                    if skipped_count > 0:
                        log_message(f"增量更新模式：跳过 {skipped_count} 个已存在的表格")
                    selected_tables_final = new_tables
                else:
                    selected_tables_final = selected_tables

                # 确定输出文件路径
                if incremental_mode and existing_doc_path:
                    # 增量更新模式：生成带有增量标识的新文件名
                    base_name = os.path.splitext(existing_doc_path)[0]  # 去掉扩展名
                    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                    incremental_file_name = f"{base_name}_增量更新_{timestamp}.md"
                    
                    if output_path:
                        user_output_path = output_path
                        if not os.path.isabs(user_output_path):
                            user_output_path = os.path.abspath(user_output_path)
                        if not os.path.exists(user_output_path):
                            os.makedirs(user_output_path, exist_ok=True)
                            log_message(f"创建输出目录: {user_output_path}")
                        output_file_path = os.path.join(user_output_path, incremental_file_name)
                        log_message(f"增量更新模式：将更新文档保存到: {output_file_path}")
                    else:
                        default_output_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'data', 'output')
                        if not os.path.exists(default_output_dir):
                            os.makedirs(default_output_dir, exist_ok=True)
                            log_message(f"创建默认输出目录: {default_output_dir}")
                        output_file_path = os.path.join(default_output_dir, incremental_file_name)
                        log_message(f"增量更新模式：将更新文档保存到默认路径: {output_file_path}")
                    output_file = open(output_file_path, 'w', encoding='utf-8')
                else:
                    # 普通模式：使用生成的文件名
                    if output_path:
                        user_output_path = output_path
                        if not os.path.isabs(user_output_path):
                            user_output_path = os.path.abspath(user_output_path)
                        if not os.path.exists(user_output_path):
                            os.makedirs(user_output_path, exist_ok=True)
                            log_message(f"创建输出目录: {user_output_path}")
                        output_file_path = os.path.join(user_output_path, file_name)
                        output_file = open(output_file_path, 'w', encoding='utf-8')
                        log_message(f"文档将保存到: {output_file_path}")
                    else:
                        default_output_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'data', 'output')
                        if not os.path.exists(default_output_dir):
                            os.makedirs(default_output_dir, exist_ok=True)
                            log_message(f"创建默认输出目录: {default_output_dir}")
                        output_file_path = os.path.join(default_output_dir, file_name)
                        output_file = open(output_file_path, 'w', encoding='utf-8')
                        log_message(f"使用默认路径保存文档: {output_file_path}")

                # 在增量更新模式下，先写入现有文档内容
                if incremental_mode:
                    log_message(f"增量更新模式：检查现有文档内容...")
                    log_message(f"existing_doc_content是否存在: {existing_doc_content is not None}")
                    log_message(f"existing_doc_content长度: {len(existing_doc_content) if existing_doc_content else 0}")
                    
                    if existing_doc_content:
                        log_message(f"增量更新模式：开始写入现有文档内容...")
                        output_file.write(existing_doc_content)
                        # 确保现有内容后有换行符
                        if not existing_doc_content.endswith('\n'):
                            output_file.write('\n')
                        
                        # 添加增量更新分隔标识
                        update_timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                        separator = f"\n\n<!-- ==================== 增量更新分隔线 ==================== -->\n<!-- 📝 增量更新时间: {update_timestamp} -->\n<!-- 以下是本次增量更新新增的表格文档内容 -->\n<!-- ========================================================= -->\n\n"
                        output_file.write(separator)
                        log_message(f"增量更新模式：已写入现有文档内容 ({len(existing_doc_content)} 字符)，并添加增量更新分隔标识")
                    else:
                        log_message(f"增量更新模式：警告 - existing_doc_content为空，跳过写入现有内容")

                if incremental_mode:
                    log_message(f"增量更新模式：开始生成{db_type.upper()}数据库 {database} 的文档...")
                    if existing_tables:
                        log_message(f"增量更新模式：跳过 {len(existing_tables)} 个已存在的表格")
                else:
                    log_message(f"开始生成{db_type.upper()}数据库 {database} 的文档...")
                log_message(f"文档将保存到: {output_file_path}")

                total_tables = len(selected_tables_final)
                completed_tables = 0

                if total_tables == 0:
                    if incremental_mode:
                        log_message("增量更新模式：没有需要生成的新表格")
                    else:
                        log_message("没有需要生成的新表格")
                    output_file.close()
                    connection.close()
                    log_queue.put("GENERATION_COMPLETE:" + output_file_path)
                    return

                for i in range(len(selected_tables_final)):
                    table_info = selected_tables_final[i]
                    table_index = i + 1
                    try:
                        # 提取表名（如果是元组则取第一个元素，如果是字符串则直接使用）
                        if isinstance(table_info, (list, tuple)):
                            table_name = table_info[0]
                        else:
                            table_name = table_info
                            
                        log_message(f"正在处理表: {table_name} ({table_index}/{total_tables})")
                        print(f"开始处理表: {table_name}")
                        
                        # 获取列信息，包含字段注释
                        columns_info = get_columns_info(connection, table_name, database, db_type)
                        print(f"获取到表 {table_name} 的 {len(columns_info)} 个列信息")
                        
                        # 直接从数据库读取表注释
                        table_comment = ''
                        if db_type == 'mysql':
                            query = """
                            SELECT table_comment 
                            FROM information_schema.tables 
                            WHERE table_schema = %s AND table_name = %s
                            """
                            cursor = connection.cursor()
                            cursor.execute(query, (database, table_name))
                            table_comment_result = cursor.fetchone()
                            if table_comment_result:
                                table_comment = table_comment_result[0]
                            cursor.close()
                        elif db_type == 'sqlserver':
                            query = """
                            SELECT ISNULL(CAST(ep.value AS NVARCHAR(MAX)), '') as table_comment
                            FROM sys.tables t
                            LEFT JOIN sys.extended_properties ep ON ep.major_id = t.object_id AND ep.minor_id = 0 AND ep.name = 'MS_Description'
                            WHERE t.name = ?
                            """
                            cursor = connection.cursor()
                            cursor.execute(query, (table_name,))
                            table_comment_result = cursor.fetchone()
                            if table_comment_result:
                                table_comment = table_comment_result[0]
                            cursor.close()
                        
                        # 提取字段注释作为含义
                        meanings = {}
                        for col in columns_info:
                            column_name = str(col[0]) if col[0] is not None else ''
                            column_comment = str(col[4]) if len(col) > 4 and col[4] is not None else ''
                            if column_comment:
                                meanings[column_name] = column_comment
                        print(f"从数据库读取到 {len(meanings)} 个字段注释")
                        
                        # 如果字段注释不足，使用AI推断补充
                        if len(meanings) < len(columns_info):
                            missing_columns = [str(col[0]) for col in columns_info if str(col[0]) not in meanings or not meanings[str(col[0])]]
                            if missing_columns:
                                print(f"表 {table_name} 缺少 {len(missing_columns)} 个字段注释，使用AI推断补充")
                                ai_meanings = infer_chinese_meaning(columns_info, table_name, db_description)
                                # 合并数据库注释和AI推断结果，优先使用数据库注释
                                for col in columns_info:
                                    column_name = str(col[0]) if col[0] is not None else ''
                                    if column_name not in meanings or not meanings[column_name]:
                                        if column_name in ai_meanings:
                                            meanings[column_name] = ai_meanings[column_name]
                        
                        markdown = generate_markdown(columns_info, meanings)
                        print(f"Markdown生成完成，表 {table_name}")
                        
                        # 写入表说明和Markdown
                        if table_comment:
                            output_file.write(f"表: {table_name} - {table_comment}\n{markdown}\n")
                        else:
                            output_file.write(f"表: {table_name}\n{markdown}\n")
                            
                        output_file.flush()
                        completed_tables += 1
                        log_message(f"表 {table_name} 整理完成 ({completed_tables}/{total_tables})")
                        log_queue.put(f"PROGRESS:{completed_tables}:{total_tables}:{table_name}")
                        print(f"表 {table_name} 处理完成")
                        
                    except Exception as table_error:
                        import traceback
                        error_msg = f"处理表 {table_name} 时出错: {str(table_error)}"
                        print(error_msg)
                        print(f"错误详情: {traceback.format_exc()}")
                        log_message(error_msg)
                        # 继续处理下一个表，不中断整个流程
                        continue

                output_file.close()
                connection.close()
                log_message("所有表格整理完成，文档生成成功！")
                log_queue.put("GENERATION_COMPLETE:" + output_file_path)
            except Exception as e:
                log_message(f"生成过程中出错: {str(e)}")
                log_queue.put("GENERATION_ERROR:" + str(e))

        thread = threading.Thread(target=generate_in_background)
        thread.daemon = True
        thread.start()
        return jsonify({"success": True, "message": "开始生成文档，请查看日志进度"})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})


@api_bp.route('/logs')
def logs():
    """获取日志流"""
    def generate_logs():
        while True:
            try:
                message = log_queue.get(timeout=1)
                if message.startswith("GENERATION_COMPLETE:"):
                    file_path = message.split(":", 1)[1]
                    yield f"data: {json.dumps({'type': 'complete', 'file_path': file_path})}\n\n"
                    break
                elif message.startswith("GENERATION_ERROR:"):
                    error_msg = message.split(":", 1)[1]
                    yield f"data: {json.dumps({'type': 'error', 'message': error_msg})}\n\n"
                    break
                elif message.startswith("PROGRESS:"):
                    parts = message.split(":", 3)
                    if len(parts) >= 4:
                        completed = int(parts[1])
                        total = int(parts[2])
                        current_table = parts[3]
                        yield f"data: {json.dumps({'type': 'progress', 'completed': completed, 'total': total, 'current_table': current_table})}\n\n"
                else:
                    yield f"data: {json.dumps({'type': 'log', 'message': message})}\n\n"
            except queue.Empty:
                yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
                continue
    return Response(generate_logs(), mimetype='text/event-stream')


@api_bp.route('/download/<path:file_path>')
def download_file(file_path):
    """下载文件"""
    try:
        if os.path.exists(file_path):
            return send_file(file_path, as_attachment=True, download_name=f"database_docs_{datetime.now().strftime('%Y%m%d_%H%M%S')}.md")
        else:
            return jsonify({"success": False, "message": "文件不存在"})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})


@api_bp.route('/preview/<path:file_path>')
def preview_file(file_path):
    """预览文件"""
    try:
        if os.path.exists(file_path):
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            return jsonify({"success": True, "content": content})
        else:
            return jsonify({"success": False, "message": "文件不存在"})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})


@api_bp.route('/open_path', methods=['POST'])
def open_path():
    """在本机打开文件或文件夹（Windows资源管理器 / macOS Finder / Linux 文件管理器）"""
    try:
        data = request.get_json() or {}
        path = data.get('path', '')
        open_parent = bool(data.get('open_parent', False))
        if not path:
            return jsonify({"success": False, "message": "path 不能为空"})

        # 规范化路径
        target = os.path.abspath(path)
        if open_parent:
            target = os.path.dirname(target)

        if not os.path.exists(target):
            return jsonify({"success": False, "message": "路径不存在"})

        # Windows
        if os.name == 'nt':
            os.startfile(target)  # noqa: S606
            return jsonify({"success": True})

        # macOS / Linux
        if sys.platform == 'darwin':
            subprocess.Popen(['open', target])  # noqa: S603,S607
        else:
            subprocess.Popen(['xdg-open', target])  # noqa: S603,S607
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)})


def _normalize_name(value: str) -> str:
    return ''.join(ch.lower() for ch in (value or '') if ch.isalnum())


def _infer_edges_from_columns(table_names, columns_rows, fk_edges, threshold=0.6):
    """
    基于命名规则推断关系：
    - xxx_id / xxxId / id_xxx 等常见模式
    - 若目标表存在 id 列，置信度更高
    """
    table_set = set(table_names or [])
    norm_to_tables = {}
    for t in table_set:
        norm = _normalize_name(t)
        norm_to_tables.setdefault(norm, []).append(t)
        # 简单单复数兜底：users -> user
        if norm.endswith('s'):
            norm_to_tables.setdefault(norm[:-1], []).append(t)

    # build column lookup per table
    table_cols = {}
    for table_name, column_name, data_type in columns_rows or []:
        table_cols.setdefault(table_name, set()).add((column_name or '').lower())

    # build fk set for quick skip
    fk_pairs = set()
    for e in fk_edges or []:
        fk_pairs.add((e.get("from_table"), e.get("to_table")))

    inferred = []
    for table_name, col_name, data_type in columns_rows or []:
        if table_name not in table_set:
            continue
        col = (col_name or '').strip()
        if not col:
            continue
        lower = col.lower()
        if lower == 'id':
            continue

        base = None
        if lower.endswith('_id') and len(lower) > 3:
            base = lower[:-3]
        elif lower.endswith('id') and len(lower) > 2 and lower[-3].isalpha():
            # 处理 userId / userid
            base = lower[:-2]
        elif lower.startswith('id_') and len(lower) > 3:
            base = lower[3:]

        if not base:
            continue

        base_norm = _normalize_name(base)
        if not base_norm:
            continue

        candidates = norm_to_tables.get(base_norm, [])
        # 排除自身
        candidates = [c for c in candidates if c != table_name]
        # 去重保持顺序
        seen = set()
        candidates = [c for c in candidates if not (c in seen or seen.add(c))]

        if len(candidates) != 1:
            continue

        target = candidates[0]
        if (table_name, target) in fk_pairs:
            continue

        confidence = 0.65
        # 若目标表存在 id 列，提升置信度
        if 'id' in table_cols.get(target, set()):
            confidence = 0.8

        if confidence < float(threshold or 0):
            continue

        inferred.append({
            "from_table": table_name,
            "to_table": target,
            "from_column": col_name,
            "to_column": "id" if 'id' in table_cols.get(target, set()) else None,
            "confidence": confidence,
            "reason": f"字段命名规则推断：{col_name} -> {target}",
        })

    return inferred


from .api_graph_mermaid import graph_mermaid


@api_bp.route('/graph', methods=['POST'])
def graph():
    """关系图 API - 使用 Mermaid ER 图"""
    return graph_mermaid()
