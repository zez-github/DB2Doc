"""
数据库连接和操作工具
"""

import mysql.connector
import pyodbc


def connect_db(host, user, password, port, database, db_type='mysql'):
    """连接数据库"""
    try:
        if db_type == 'mysql':
            connection = mysql.connector.connect(
                host=host,
                user=user,
                password=password,
                port=port,
                database=database,
                charset='utf8mb4',
                ssl_disabled=True,  # 禁用SSL
                auth_plugin='mysql_native_password'  # 使用原生密码认证
            )
        elif db_type == 'sqlserver':
            # 修复ODBC SQL type -150错误的连接字符串
            connection_string = (
                f'DRIVER={{ODBC Driver 17 for SQL Server}};'
                f'SERVER={host},{port};'
                f'DATABASE={database};'
                f'UID={user};'
                f'PWD={password};'
                f'TrustServerCertificate=yes;'  # 信任服务器证书
                f'Encrypt=no;'  # 禁用加密以避免兼容性问题
                f'MARS_Connection=yes;'  # 启用多个活动结果集
                f'ApplicationIntent=ReadOnly;'  # 设置为只读模式
            )
            connection = pyodbc.connect(connection_string, timeout=30)
            
            # 设置连接属性以处理特殊数据类型
            connection.setdecoding(pyodbc.SQL_CHAR, encoding='utf-8')
            connection.setdecoding(pyodbc.SQL_WCHAR, encoding='utf-8')
            connection.setencoding(encoding='utf-8')
        else:
            raise ValueError(f"不支持的数据库类型: {db_type}")
        
        return connection
    except Exception as e:
        raise Exception(f"数据库连接失败: {str(e)}")


def get_tables_and_views(connection, database_name, db_type='mysql'):
    """获取数据库中的表和视图"""
    cursor = connection.cursor()
    
    if db_type == 'mysql':
        query = """
        SELECT table_name, table_type, table_comment 
        FROM information_schema.tables 
        WHERE table_schema = %s 
        ORDER BY table_name
        """
        cursor.execute(query, (database_name,))
    elif db_type == 'sqlserver':
        query = """
        SELECT t.name as table_name, 
               CASE WHEN t.type = 'U' THEN 'BASE TABLE' ELSE 'VIEW' END as table_type,
               ISNULL(CAST(ep.value AS NVARCHAR(MAX)), '') as table_comment
        FROM sys.tables t
        LEFT JOIN sys.extended_properties ep ON ep.major_id = t.object_id AND ep.minor_id = 0 AND ep.name = 'MS_Description'
        WHERE t.is_ms_shipped = 0
        ORDER BY t.name
        """
        cursor.execute(query)
    
    # 将Row对象转换为可序列化的列表
    results = cursor.fetchall()
    if db_type == 'sqlserver':
        # 对于SQL Server，将pyodbc.Row对象转换为元组
        return [tuple(row) for row in results]
    else:
        return results


def get_databases(host, user, password, port, db_type='mysql'):
    """获取服务器上的数据库列表"""
    try:
        if db_type == 'mysql':
            # 连接到MySQL服务器，不指定数据库
            connection = mysql.connector.connect(
                host=host,
                user=user,
                password=password,
                port=port,
                charset='utf8mb4',
                ssl_disabled=True,
                auth_plugin='mysql_native_password'
            )
            cursor = connection.cursor()
            cursor.execute("SHOW DATABASES")
            databases = [row[0] for row in cursor.fetchall()]
            cursor.close()
            connection.close()
            return databases
        elif db_type == 'sqlserver':
            # 连接到SQL Server（不指定数据库，默认连接到master）
            connection_string = (
                f'DRIVER={{ODBC Driver 17 for SQL Server}};'
                f'SERVER={host},{port};'
                f'UID={user};'
                f'PWD={password};'
                f'TrustServerCertificate=yes;'
                f'Encrypt=no;'
                f'MARS_Connection=yes;'
                f'ApplicationIntent=ReadOnly;'
            )
            connection = pyodbc.connect(connection_string, timeout=30)
            connection.setdecoding(pyodbc.SQL_CHAR, encoding='utf-8')
            connection.setdecoding(pyodbc.SQL_WCHAR, encoding='utf-8')
            connection.setencoding(encoding='utf-8')
            cursor = connection.cursor()
            # 排除系统数据库，仅返回用户或常用数据库
            cursor.execute("""
                SELECT name 
                FROM sys.databases 
                WHERE name NOT IN ('master','tempdb','model','msdb')
                ORDER BY name
            """)
            databases = [row[0] for row in cursor.fetchall()]
            cursor.close()
            connection.close()
            return databases
        else:
            raise ValueError(f"不支持的数据库类型: {db_type}")
    except Exception as e:
        raise Exception(f"获取数据库列表失败: {str(e)}")


def get_columns_info(connection, table_name, database_name, db_type='mysql'):
    """获取表的列信息"""
    cursor = connection.cursor()
    
    if db_type == 'mysql':
        query = """
        SELECT column_name, data_type, is_nullable, column_default, 
               column_comment, character_maximum_length, numeric_precision, numeric_scale
        FROM information_schema.columns 
        WHERE table_schema = %s AND table_name = %s 
        ORDER BY ordinal_position
        """
        cursor.execute(query, (database_name, table_name))
    elif db_type == 'sqlserver':
        query = """
        SELECT c.name as column_name,
               t.name as data_type,
               CASE WHEN c.is_nullable = 1 THEN 'YES' ELSE 'NO' END as is_nullable,
               ISNULL(CAST(dc.definition AS NVARCHAR(MAX)), '') as column_default,
               ISNULL(CAST(ep.value AS NVARCHAR(MAX)), '') as column_comment,
               CASE 
                   WHEN t.name IN ('nvarchar', 'varchar', 'nchar', 'char') THEN c.max_length
                   ELSE NULL 
               END as character_maximum_length,
               CASE 
                   WHEN t.name IN ('decimal', 'numeric', 'float', 'real') THEN c.precision
                   ELSE NULL 
               END as numeric_precision,
               CASE 
                   WHEN t.name IN ('decimal', 'numeric') THEN c.scale
                   ELSE NULL 
               END as numeric_scale
        FROM sys.columns c
        INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
        INNER JOIN sys.tables tb ON c.object_id = tb.object_id
        LEFT JOIN sys.default_constraints dc ON c.default_object_id = dc.object_id
        LEFT JOIN sys.extended_properties ep ON ep.major_id = c.object_id AND ep.minor_id = c.column_id AND ep.name = 'MS_Description'
        WHERE tb.name = ? 
        AND t.name NOT IN ('sql_variant', 'xml', 'geometry', 'geography', 'hierarchyid')
        ORDER BY c.column_id
        """
        cursor.execute(query, (table_name,))
    
    # 将Row对象转换为可序列化的列表
    results = cursor.fetchall()
    if db_type == 'sqlserver':
        # 对于SQL Server，将pyodbc.Row对象转换为元组
        return [tuple(row) for row in results]
    else:
        return results