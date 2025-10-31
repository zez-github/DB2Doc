import mysql.connector
from sparkai.llm.llm import ChatSparkLLM, ChunkPrintHandler  # 导入星火大模型相关类
from sparkai.core.messages import ChatMessage  # 导入消息类
import json  # 导入 JSON 模块

# 星火大模型的配置
SPARKAI_URL = 'wss://spark-api.xf-yun.com/chat/pro-128k'
SPARKAI_APP_ID = '62f4c0e8'  # 请替换为你的APP_ID
SPARKAI_API_SECRET = 'Yzg4Y2I3Y2ZmMzUwMmE3ZDgxMWQwNjdl'  # 请替换为你的API_SECRET
SPARKAI_API_KEY = '1b1670ace00062da912ab5d00715713e'  # 请替换为你的API_KEY
SPARKAI_DOMAIN = 'pro-128k'

# 初始化模型
spark = ChatSparkLLM(
    spark_api_url=SPARKAI_URL,
    spark_app_id=SPARKAI_APP_ID,
    spark_api_key=SPARKAI_API_KEY,
    spark_api_secret=SPARKAI_API_SECRET,
    spark_llm_domain=SPARKAI_DOMAIN,
    streaming=False,
)

# 接受用户输入的数据库名
DATABASE_NAME = input("请输入数据库名称: ")
# 定义已生成表格名称的记录文件，带上数据库名称作为后缀
GENERATED_TABLES_FILE = f'generated_tables_{DATABASE_NAME}.txt'
# 定义输出的 Markdown 文件，带上数据库名称作为后缀
OUTPUT_MARKDOWN_FILE = f'{DATABASE_NAME}_db.md'

def connect_db():
    """连接到数据库并返回连接对象"""
    try:
        connection = mysql.connector.connect(
            host='192.168.1.20',
            user='root',
            password='123456',
            port=3308,
            database=DATABASE_NAME,
            use_pure=True,  # 使用纯Python实现
            ssl_disabled=True,  # 禁用SSL
        )
        return connection
    except mysql.connector.Error as err:
        print(f"数据库连接错误: {err}")
        return None

def get_tables_and_views(connection):
    """获取数据库中的所有表和视图"""
    cursor = connection.cursor()
    cursor.execute(f"SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = '{DATABASE_NAME}'")
    return cursor.fetchall()

def get_columns_info(connection, table_name, database_name):
    """获取指定表的字段名称和数据类型"""
    cursor = connection.cursor()
    cursor.execute(f"SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '{table_name}' AND TABLE_SCHEMA = '{database_name}'")
    return cursor.fetchall()  # 返回字段名称和数据类型的元组

def infer_chinese_meaning(columns, table_name):
    """使用星火大模型推断字段的中文含义"""
    fields = ', '.join([column[0] for column in columns])  # 只取字段名称
    messages = [ChatMessage(role="user", content=f"请给出表 {table_name} 中字段 {fields} 的中文含义，要求每个含义不超过10个字符。请以严格的json格式返回结果")]
    
    handler = ChunkPrintHandler()
    llm_result = spark.generate([messages], callbacks=[handler])

    # 获取生成的内容
    first_generation = llm_result.generations[0][0]
    content = first_generation.message.content.strip().removeprefix('```json').removesuffix('```').strip()

    # 解析 JSON 输出
    return json.loads(content)

def generate_markdown(columns_meanings, meanings):
    """生成 Markdown 格式的表格"""
    markdown = f"| 字段名称 | 数据类型 | 中文说明 |\n| -------- | -------- | -------- |\n"
    for (column_name, data_type) in columns_meanings:
        chinese_meaning = meanings.get(column_name, column_name)  # 默认中文含义为字段名称
        markdown += f"| {column_name} | {data_type} | {chinese_meaning[:10]} |\n"  # 确保中文含义不超过10个字符
    return markdown

def read_generated_tables():
    """读取已生成表格名称的文件，返回一个集合"""
    try:
        with open(GENERATED_TABLES_FILE, 'r', encoding='utf-8') as file:
            return set(line.strip() for line in file)
    except FileNotFoundError:
        return set()  # 如果文件不存在，返回空集合

def record_generated_table(table_name):
    """记录已生成的表格名称到文件"""
    with open(GENERATED_TABLES_FILE, 'a', encoding='utf-8') as file:
        file.write(f"{table_name}\n")

def main():
    connection = connect_db()
    if connection is None:
        return  # 如果连接失败，退出程序

    tables = get_tables_and_views(connection)
    generated_tables = read_generated_tables()

    # 打开文件以写入 Markdown 内容
    with open(OUTPUT_MARKDOWN_FILE, 'w', encoding='utf-8') as file:
        for (table_name,) in tables:
            if table_name in generated_tables:
                print(f"表 {table_name} 已生成，跳过。")
                continue
            
            columns_info = get_columns_info(connection, table_name, DATABASE_NAME)
            meanings = infer_chinese_meaning(columns_info, table_name)  # 获取所有字段的中文含义
            markdown = generate_markdown(columns_info, meanings)  # 生成 Markdown 表格
            file.write(f"表: {table_name}\n{markdown}\n")  # 写入文件
            file.flush()  # 确保数据立即写入文件
            
            record_generated_table(table_name)
            print(f"表 {table_name} 整理完成。")

    connection.close()

if __name__ == "__main__":
    main()