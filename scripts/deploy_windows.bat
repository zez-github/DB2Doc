@echo off
chcp 65001
echo ===============================
echo 数据库文档生成器 Windows 部署脚本
echo ===============================
echo.

REM 检查管理员权限
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo 错误: 需要管理员权限运行此脚本
    echo 请右键以管理员身份运行此脚本
    pause
    exit /b 1
)

echo 正在检查系统环境...

REM 检查Python是否已安装
python --version >nul 2>&1
if %errorLevel% neq 0 (
    echo 错误: 未找到Python，请先安装Python 3.8+
    echo 下载地址: https://www.python.org/downloads/
    pause
    exit /b 1
)

REM 获取Python版本
for /f "tokens=2" %%i in ('python --version') do set PYTHON_VERSION=%%i
echo Python版本: %PYTHON_VERSION%

REM 检查pip是否可用
pip --version >nul 2>&1
if %errorLevel% neq 0 (
    echo 错误: pip不可用，请检查Python安装
    pause
    exit /b 1
)

echo.
echo 正在创建项目目录...
set PROJECT_DIR=%~dp0..
cd /d "%PROJECT_DIR%"
echo 项目目录: %PROJECT_DIR%

REM 创建必要的目录
if not exist logs mkdir logs
if not exist temp mkdir temp
if not exist backups mkdir backups

echo.
echo 正在创建Python虚拟环境...
if exist venv (
    echo 虚拟环境已存在，跳过创建
) else (
    python -m venv venv
    if %errorLevel% neq 0 (
        echo 错误: 创建虚拟环境失败
        pause
        exit /b 1
    )
    echo 虚拟环境创建成功
)

echo.
echo 正在安装依赖包...
echo 使用虚拟环境中的 python -m pip...

REM 确保虚拟环境中有pip
venv\Scripts\python.exe -m ensurepip --upgrade >nul 2>&1
if %errorLevel% neq 0 (
    echo 警告: ensurepip 执行失败，可能已安装，继续...
)

REM 升级pip
venv\Scripts\python.exe -m pip install --upgrade pip >nul 2>&1
if %errorLevel% neq 0 (
    echo 警告: pip升级失败，继续安装依赖...
)

REM 安装依赖（优先使用清华镜像）
venv\Scripts\python.exe -m pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple/ --trusted-host pypi.tuna.tsinghua.edu.cn
if %errorLevel% neq 0 (
    echo 尝试使用默认源重新安装...
    venv\Scripts\python.exe -m pip install -r requirements.txt --no-cache-dir
    if %errorLevel% neq 0 (
        echo 错误: 安装依赖包失败
        echo.
        echo 请手动执行以下命令：
        echo cd /d "%PROJECT_DIR%"
        echo venv\Scripts\python.exe -m pip install -r requirements.txt
        pause
        exit /b 1
    )
)

echo.
echo 正在配置Windows防火墙...
netsh advfirewall firewall show rule name="数据库文档生成器" >nul 2>&1
if %errorLevel% neq 0 (
    netsh advfirewall firewall add rule name="数据库文档生成器" dir=in action=allow protocol=TCP localport=5500
    echo 防火墙规则已添加
) else (
    echo 防火墙规则已存在
)

echo.
echo 正在创建Windows服务（NSSM 可选）...
where nssm >nul 2>&1
if %errorLevel% neq 0 (
    echo 未检测到 NSSM，跳过服务安装。您可参考文档使用 NSSM 安装。
) else (
    echo 检测到 NSSM，正在安装服务 DB2DocService...
    nssm install DB2DocService "%PROJECT_DIR%venv\Scripts\waitress-serve.exe"
    nssm set DB2DocService AppParameters "--host 0.0.0.0 --port 5500 --call app.main:create_app"
    nssm set DB2DocService AppDirectory "%PROJECT_DIR%"
    nssm start DB2DocService
)

echo.
echo 正在测试应用启动（Waitress）...
timeout /t 2 /nobreak >nul
start "DB2DocTest" /min venv\Scripts\waitress-serve.exe --host 127.0.0.1 --port 5500 --call app.main:create_app
timeout /t 5 /nobreak >nul

REM 测试应用是否正常启动
powershell -Command "try { $response = Invoke-WebRequest -Uri 'http://localhost:5500' -TimeoutSec 10; if ($response.StatusCode -eq 200) { Write-Host '应用启动成功' } else { Write-Host '应用启动失败' } } catch { Write-Host '应用启动失败' }"

REM 停止测试进程（仅停止本次 Waitress 进程）
taskkill /f /im waitress-serve.exe >nul 2>&1

echo.
echo 正在创建启动脚本...
(
echo @echo off
echo chcp 65001
echo cd /d "%PROJECT_DIR%"
echo echo 正在启动数据库文档生成器（生产模式，Waitress）...
echo call scripts\start_production.bat
) > start_production.bat

echo.
echo 正在创建停止脚本...
(
echo @echo off
echo echo 正在停止数据库文档生成器...
echo taskkill /f /im waitress-serve.exe
echo echo 应用已停止
echo pause
) > stop_service.bat

echo.
echo ===============================
echo 部署完成！
echo ===============================
echo.
echo 启动方式：
echo 1. 开发模式: 双击 start.bat
echo 2. 生产模式: 双击 scripts\start_production.bat 或根目录 start_production.bat
echo 3. 手动启动: venv\Scripts\waitress-serve.exe --host 0.0.0.0 --port 5500 --call app.main:create_app
echo.
echo 访问地址: http://localhost:5500
echo 日志文件: logs\app.log
echo.
echo 注意事项：
echo 1. 请确保数据库服务器可访问
echo 2. 请检查星火大模型API配置
echo 3. 建议定期备份日志文件
echo 4. 生产环境建议使用start_production.bat
echo.
echo 按任意键继续...
pause >nul