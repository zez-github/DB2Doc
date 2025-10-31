@echo off
chcp 65001
echo ===============================
echo 数据库文档生成器 - 生产模式启动
echo ===============================
echo.

REM 设置项目目录
set PROJECT_DIR=%~dp0..
cd /d "%PROJECT_DIR%"

echo 正在启动数据库文档生成器（生产模式，Waitress）...
echo 项目目录: %PROJECT_DIR%
echo 启动时间: %date% %time%
echo.

REM 检查Python是否可用
python --version >nul 2>&1
if %errorLevel% neq 0 (
    echo 错误: 未找到Python，请确保Python已正确安装
    echo 按任意键退出...
    pause >nul
    exit /b 1
)

REM 创建虚拟环境（如未存在）
if not exist venv (
    echo 创建虚拟环境...
    python -m venv venv
    if %errorLevel% neq 0 (
        echo 错误: 创建虚拟环境失败，请检查Python安装
        echo 按任意键退出...
        pause >nul
        exit /b 1
    )
)

REM 安装依赖（优先使用清华镜像）
echo 正在安装依赖...
venv\Scripts\pip.exe install --upgrade pip
venv\Scripts\pip.exe install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple/ --trusted-host pypi.tuna.tsinghua.edu.cn
if %errorLevel% neq 0 (
    echo 尝试使用默认源重新安装...
    venv\Scripts\pip.exe install -r requirements.txt --no-cache-dir
    if %errorLevel% neq 0 (
        echo 错误: 依赖安装失败，请手动运行：venv\Scripts\pip.exe install -r requirements.txt
        echo 按任意键退出...
        pause >nul
        exit /b 1
    )
)

REM 创建必要的目录
if not exist logs mkdir logs
if not exist temp mkdir temp
if not exist static\temp mkdir static\temp

echo 正在以 Waitress 启动 WSGI 服务...
echo.
echo 启动成功后，请访问以下地址：
echo - 本地访问: http://localhost:5500
echo - 局域网访问: http://你的IP地址:5500
echo.
echo 按 Ctrl+C 停止应用
echo ===============================
echo.

REM 使用 Waitress 以工厂函数启动应用
venv\Scripts\waitress-serve.exe --host 0.0.0.0 --port 5500 --call app.main:create_app

echo.
echo 应用已停止
echo 按任意键关闭窗口...
pause >nul