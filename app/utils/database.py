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


def get_tables_with_missing_stats(connection, database_name, db_type='mysql'):
    """
    获取数据库表/视图列表，并聚合返回“注释缺失”统计（用于主界面表列表一次性渲染，避免逐表请求）。

    返回结构（list[dict]）：
    - table_name: str
    - table_type: str
    - table_comment: str
    - missing_table_comment: bool
    - missing_columns_count: int
    - missing_total: int
    """
    cursor = connection.cursor()

    if db_type == 'mysql':
        # 单次聚合：表注释 + 字段注释缺失数
        query = """
        SELECT
            t.table_name,
            t.table_type,
            IFNULL(t.table_comment, '') AS table_comment,
            SUM(CASE WHEN IFNULL(c.column_comment, '') = '' THEN 1 ELSE 0 END) AS missing_columns_count
        FROM information_schema.tables t
        JOIN information_schema.columns c
          ON c.table_schema = t.table_schema AND c.table_name = t.table_name
        WHERE t.table_schema = %s
        GROUP BY t.table_name, t.table_type, t.table_comment
        ORDER BY t.table_name
        """
        cursor.execute(query, (database_name,))
        rows = cursor.fetchall()
        cursor.close()
        result = []
        for row in rows:
            table_name, table_type, table_comment, missing_columns_count = row
            table_comment = table_comment or ''
            missing_columns_count = int(missing_columns_count or 0)
            missing_table_comment = (not table_comment.strip())
            missing_total = (1 if missing_table_comment else 0) + missing_columns_count
            result.append({
                "table_name": table_name,
                "table_type": table_type,
                "table_comment": table_comment,
                "missing_table_comment": missing_table_comment,
                "missing_columns_count": missing_columns_count,
                "missing_total": missing_total,
            })
        return result

    if db_type == 'sqlserver':
        # SQL Server：聚合表注释 + 字段注释缺失数（排除部分复杂类型，跟 get_columns_info 的过滤保持一致）
        query = """
        SELECT
            tb.name AS table_name,
            CASE WHEN tb.type = 'U' THEN 'BASE TABLE' ELSE 'VIEW' END AS table_type,
            ISNULL(CAST(ep_t.value AS NVARCHAR(MAX)), '') AS table_comment,
            SUM(CASE WHEN ISNULL(CAST(ep_c.value AS NVARCHAR(MAX)), '') = '' THEN 1 ELSE 0 END) AS missing_columns_count
        FROM sys.tables tb
        INNER JOIN sys.columns c ON c.object_id = tb.object_id
        INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
        LEFT JOIN sys.extended_properties ep_t
          ON ep_t.major_id = tb.object_id AND ep_t.minor_id = 0 AND ep_t.name = 'MS_Description'
        LEFT JOIN sys.extended_properties ep_c
          ON ep_c.major_id = c.object_id AND ep_c.minor_id = c.column_id AND ep_c.name = 'MS_Description'
        WHERE tb.is_ms_shipped = 0
          AND t.name NOT IN ('sql_variant', 'xml', 'geometry', 'geography', 'hierarchyid')
        GROUP BY tb.name, tb.type, ep_t.value
        ORDER BY tb.name
        """
        cursor.execute(query)
        rows = cursor.fetchall()
        cursor.close()
        result = []
        for row in rows:
            # pyodbc.Row 可直接按下标取值
            table_name = row[0]
            table_type = row[1]
            table_comment = row[2] or ''
            missing_columns_count = int(row[3] or 0)
            missing_table_comment = (not str(table_comment).strip())
            missing_total = (1 if missing_table_comment else 0) + missing_columns_count
            result.append({
                "table_name": table_name,
                "table_type": table_type,
                "table_comment": str(table_comment),
                "missing_table_comment": missing_table_comment,
                "missing_columns_count": missing_columns_count,
                "missing_total": missing_total,
            })
        return result

    raise ValueError(f"不支持的数据库类型: {db_type}")


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


def update_table_comment(connection, table_name, database_name, comment, db_type='mysql'):
    """更新表注释"""
    cursor = connection.cursor()
    
    if db_type == 'mysql':
        query = "ALTER TABLE %s.%s COMMENT = %s"
        cursor.execute(query % (database_name, table_name, '%s'), (comment,))
    elif db_type == 'sqlserver':
        # 检查是否已有表注释
        check_query = """
        SELECT COUNT(*) 
        FROM sys.extended_properties 
        WHERE major_id = OBJECT_ID(?) AND minor_id = 0 AND name = 'MS_Description'
        """
        cursor.execute(check_query, (table_name,))
        count = cursor.fetchone()[0]
        
        if count > 0:
            # 更新现有注释
            update_query = """
            EXEC sp_updateextendedproperty 
                @name = N'MS_Description', 
                @value = ?, 
                @level0type = N'SCHEMA', @level0name = N'dbo',
                @level1type = N'TABLE', @level1name = ?;
            """
        else:
            # 添加新注释
            update_query = """
            EXEC sp_addextendedproperty 
                @name = N'MS_Description', 
                @value = ?, 
                @level0type = N'SCHEMA', @level0name = N'dbo',
                @level1type = N'TABLE', @level1name = ?;
            """
        cursor.execute(update_query, (comment, table_name))
    
    connection.commit()
    cursor.close()


def update_column_comment(connection, table_name, database_name, column_name, comment, db_type='mysql'):
    """更新字段注释"""
    cursor = connection.cursor()
    
    if db_type == 'mysql':
        query = "ALTER TABLE %s.%s MODIFY COLUMN %s %s COMMENT = %s"
        
        # 先获取列的完整定义
        get_column_def_query = """
        SELECT column_type 
        FROM information_schema.columns 
        WHERE table_schema = %s AND table_name = %s AND column_name = %s
        """
        cursor.execute(get_column_def_query, (database_name, table_name, column_name))
        column_type = cursor.fetchone()[0]
        
        # 更新字段注释
        full_query = f"ALTER TABLE `{database_name}`.`{table_name}` MODIFY COLUMN `{column_name}` {column_type} COMMENT %s"
        cursor.execute(full_query, (comment,))
    elif db_type == 'sqlserver':
        # 检查是否已有字段注释
        check_query = """
        SELECT COUNT(*) 
        FROM sys.extended_properties 
        WHERE major_id = OBJECT_ID(?) AND minor_id = COLUMNPROPERTY(OBJECT_ID(?), ?, 'ColumnID') AND name = 'MS_Description'
        """
        cursor.execute(check_query, (table_name, table_name, column_name))
        count = cursor.fetchone()[0]
        
        if count > 0:
            # 更新现有注释
            update_query = """
            EXEC sp_updateextendedproperty 
                @name = N'MS_Description', 
                @value = ?, 
                @level0type = N'SCHEMA', @level0name = N'dbo',
                @level1type = N'TABLE', @level1name = ?, 
                @level2type = N'COLUMN', @level2name = ?;
            """
        else:
            # 添加新注释
            update_query = """
            EXEC sp_addextendedproperty 
                @name = N'MS_Description', 
                @value = ?, 
                @level0type = N'SCHEMA', @level0name = N'dbo',
                @level1type = N'TABLE', @level1name = ?, 
                @level2type = N'COLUMN', @level2name = ?;
            """
        cursor.execute(update_query, (comment, table_name, column_name))
    
    connection.commit()
    cursor.close()


def get_foreign_keys(connection, database_name, db_type='mysql', tables=None):
    """
    获取外键关系（目前第一版仅实现 MySQL）。

    返回 list[dict]:
    - from_table: str
    - to_table: str
    - constraint_name: str
    - columns: list[dict] { from_column, to_column, ordinal_position }
    """
    if db_type != 'mysql':
        raise ValueError(f"暂不支持的数据库类型: {db_type}")

    cursor = connection.cursor()
    # information_schema.KEY_COLUMN_USAGE 仅在存在外键时 REFERENCED_* 不为空
    query = """
    SELECT
        kcu.TABLE_NAME,
        kcu.REFERENCED_TABLE_NAME,
        kcu.CONSTRAINT_NAME,
        kcu.COLUMN_NAME,
        kcu.REFERENCED_COLUMN_NAME,
        kcu.ORDINAL_POSITION
    FROM information_schema.KEY_COLUMN_USAGE kcu
    WHERE kcu.CONSTRAINT_SCHEMA = %s
      AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
    ORDER BY kcu.TABLE_NAME, kcu.CONSTRAINT_NAME, kcu.ORDINAL_POSITION
    """
    cursor.execute(query, (database_name,))
    rows = cursor.fetchall()
    cursor.close()

    table_filter = set([t for t in (tables or []) if t]) if tables else None

    grouped = {}
    for row in rows:
        from_table, to_table, constraint_name, from_col, to_col, ord_pos = row
        if table_filter is not None and (from_table not in table_filter and to_table not in table_filter):
            continue
        key = (from_table, to_table, constraint_name)
        if key not in grouped:
            grouped[key] = {
                "from_table": from_table,
                "to_table": to_table,
                "constraint_name": constraint_name,
                "columns": []
            }
        grouped[key]["columns"].append({
            "from_column": from_col,
            "to_column": to_col,
            "ordinal_position": int(ord_pos or 0),
        })

    return list(grouped.values())


def get_all_columns(connection, database_name, db_type='mysql', tables=None):
    """
    获取 schema 下所有表的列信息（用于关系推断，避免逐表查询）。

    返回 list[tuple]:
    (table_name, column_name, data_type, column_comment)
    """
    if db_type != 'mysql':
        raise ValueError(f"暂不支持的数据库类型: {db_type}")

    cursor = connection.cursor()
    query = """
    SELECT table_name, column_name, data_type, IFNULL(column_comment, '')
    FROM information_schema.columns
    WHERE table_schema = %s
    ORDER BY table_name, ordinal_position
    """
    cursor.execute(query, (database_name,))
    rows = cursor.fetchall()
    cursor.close()

    if not tables:
        return rows

    table_filter = set([t for t in tables if t])
    return [r for r in rows if r[0] in table_filter]