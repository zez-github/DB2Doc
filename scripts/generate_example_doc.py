#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
生成示例表的 Markdown 文档（无需连接数据库）
运行：python scripts/generate_example_doc.py
输出：data/examples/users_table_demo.md
"""

import sys
from pathlib import Path

# 确保可以导入 app 模块
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.append(str(ROOT))

from app.utils.ai_helper import infer_chinese_meaning, generate_markdown


def ensure_examples_dir():
    examples_dir = ROOT / 'data' / 'examples'
    examples_dir.mkdir(parents=True, exist_ok=True)
    return examples_dir


def get_sample_columns():
    """构造与数据库查询结果形状一致的列信息列表"""
    # 字段顺序：
    # column_name, data_type, is_nullable, column_default, column_comment,
    # character_maximum_length, numeric_precision, numeric_scale
    return [
        ('id', 'int', 'NO', None, '主键ID', None, 11, 0),
        ('username', 'varchar', 'NO', None, '用户名', 50, None, None),
        ('email', 'varchar', 'YES', None, '邮箱地址', 100, None, None),
        ('created_at', 'datetime', 'NO', 'CURRENT_TIMESTAMP', '创建时间', None, None, None),
        ('status', 'tinyint', 'NO', '1', '状态:1有效,0无效', None, 1, 0),
    ]


def main():
    examples_dir = ensure_examples_dir()
    table_name = 'users'
    columns = get_sample_columns()
    db_description = "用户管理：包含基本信息与状态字段，用于登录与权限校验。"

    meanings = infer_chinese_meaning(columns, table_name, db_description)

    # 没有配置 OpenAI 时，使用演示占位含义
    if not meanings:
        meanings = {
            'id': '标识符',
            'username': '用户名',
            'email': '邮箱',
            'created_at': '创建时间',
            'status': '状态',
        }

    markdown = generate_markdown(columns, meanings)
    output_file = examples_dir / 'users_table_demo.md'
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(f"表: {table_name}\n{markdown}\n")

    print(f"✅ 示例文档已生成: {output_file}")


if __name__ == '__main__':
    main()