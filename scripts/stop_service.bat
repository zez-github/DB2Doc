@echo off
chcp 65001
echo ===============================
echo 数据库文档生成器 - 停止服务
echo ===============================
echo.

echo 正在停止数据库文档生成器...

REM 方式1：结束指定端口的进程
echo 正在查找端口5500的进程...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5500') do (
    echo 找到进程ID: %%a
    taskkill /f /pid %%a >nul 2>&1
    if %errorLevel% equ 0 (
        echo 成功停止进程: %%a
    )
)

REM 方式2：结束Python进程（备用方案）
echo 正在停止Python进程...
taskkill /f /im python.exe >nul 2>&1
if %errorLevel% equ 0 (
    echo Python进程已停止
) else (
    echo 未找到运行的Python进程
)

echo.
echo 服务已停止
echo 按任意键关闭窗口...
pause >nul