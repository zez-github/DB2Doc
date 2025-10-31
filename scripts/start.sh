#!/bin/bash

# 切换到项目根目录
cd "$(dirname "$0")/.."

echo "正在启动数据库文档生成器..."
echo

# 检查Python是否已安装
if ! command -v python3 &> /dev/null; then
    echo "错误: 未找到Python3，请先安装Python"
    exit 1
fi

# 检查是否已安装依赖
if [ ! -d "venv" ]; then
    echo "创建虚拟环境..."
    python3 -m venv venv
fi

# 激活虚拟环境
source venv/bin/activate

# 安装依赖
echo "正在安装依赖..."
pip install -r requirements.txt

# 启动应用
echo
echo "启动Flask应用..."
echo "应用将在 http://localhost:5500 启动"
echo
echo "按 Ctrl+C 停止应用"
echo

python main.py