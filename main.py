"""
DB2Doc - 数据库文档生成器启动文件
"""

import sys
import os

# 添加项目根目录到Python路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.main import run_app

if __name__ == '__main__':
    run_app()