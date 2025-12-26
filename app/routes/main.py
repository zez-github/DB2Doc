"""
主页面路由
"""

from flask import Blueprint, render_template

main_bp = Blueprint('main', __name__)


@main_bp.route('/')
def index():
    """主页"""
    return render_template('index.html')


@main_bp.route('/connections')
def connections():
    """连接管理页面"""
    return render_template('connections.html')


@main_bp.route('/diagram')
def diagram():
    """数据库关系图页面"""
    return render_template('diagram.html')