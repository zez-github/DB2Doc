@echo off
chcp 65001
echo ===============================
echo 数据库文档生成器 - 开发模式启动
echo ===============================
echo.

REM 设置项目目录
set PROJECT_DIR=%~dp0..
cd /d "%PROJECT_DIR%"

echo 正在启动数据库文档生成器（开发模式）...
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

REM 创建必要的目录
if not exist logs mkdir logs
if not exist temp mkdir temp
if not exist static\temp mkdir static\temp

echo 正在启动应用（开发模式）...
echo.
echo 启动成功后，请访问以下地址：
echo - 本地访问: http://localhost:5500
echo - 局域网访问: http://你的IP地址:5500
echo.
echo 开发模式特点：
echo - 自动重载代码变更（调试模式已强制开启）
echo - 详细的调试信息
echo - 不适合生产环境使用
echo.
echo 按 Ctrl+C 停止应用
echo ===============================
echo.

REM 启动应用（强制开启调试模式）
set DB2DOC_DEBUG=1
python main.py

echo.
echo 应用已停止
echo 按任意键关闭窗口...
pause >nul