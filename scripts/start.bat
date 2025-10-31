@echo off
cd /d "%~dp0\.."
echo 正在启动数据库文档生成器...
echo.

REM 检查Python是否已安装
python --version > nul 2>&1
if %errorlevel% neq 0 (
    echo 错误: 未找到Python，请先安装Python
    pause
    exit /b 1
)

REM 检查是否已安装依赖
if not exist venv (
    echo 创建虚拟环境...
    python -m venv venv
)

REM 激活虚拟环境
call venv\Scripts\activate.bat

REM 安装依赖
echo 正在安装依赖...
pip install -r requirements.txt

REM 启动应用
echo.
echo 启动Flask应用...
echo 应用将在 http://localhost:5500 启动
echo.
echo 按 Ctrl+C 停止应用
echo.

python main.py

pause