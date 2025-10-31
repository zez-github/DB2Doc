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

from ..utils import connect_db, get_tables_and_views, get_columns_info, infer_chinese_meaning, generate_markdown, get_databases

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
        tables = get_tables_and_views(connection, database, db_type)
        connection.close()
        
        return jsonify({"success": True, "tables": tables})
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

                for i, table_info in enumerate(selected_tables_final, 1):
                    try:
                        # 提取表名（如果是元组则取第一个元素，如果是字符串则直接使用）
                        if isinstance(table_info, (list, tuple)):
                            table_name = table_info[0]
                        else:
                            table_name = table_info
                            
                        log_message(f"正在处理表: {table_name} ({i}/{total_tables})")
                        print(f"开始处理表: {table_name}")
                        
                        columns_info = get_columns_info(connection, table_name, database, db_type)
                        print(f"获取到表 {table_name} 的 {len(columns_info)} 个列信息")
                        
                        meanings = infer_chinese_meaning(columns_info, table_name, db_description)
                        print(f"AI推断完成，表 {table_name} 获得 {len(meanings)} 个字段含义")
                        
                        markdown = generate_markdown(columns_info, meanings)
                        print(f"Markdown生成完成，表 {table_name}")
                        
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