"""
DB2Doc - 数据库文档生成器主应用
"""

from flask import Flask
import os
from .routes import main_bp, api_bp
from .config import config


def create_app():
    """创建Flask应用"""
    app = Flask(__name__, 
                static_folder='../static',
                template_folder='../templates')
    
    # 注册蓝图
    app.register_blueprint(main_bp)
    app.register_blueprint(api_bp)
    
    return app


def run_app():
    """运行应用"""
    app = create_app()
    
    # 从配置文件获取运行参数
    app_config = config.get('app', {})
    host = app_config.get('host', '0.0.0.0')
    port = app_config.get('port', 5500)
    debug = app_config.get('debug', True)
    # 允许通过环境变量强制开启调试模式（开发脚本使用）
    if os.getenv('DB2DOC_DEBUG') in ('1', 'true', 'True'):
        debug = True
    
    print(f"启动DB2Doc应用...")
    print(f"访问地址: http://{host}:{port}")
    
    app.run(debug=debug, host=host, port=port)


if __name__ == '__main__':
    run_app()