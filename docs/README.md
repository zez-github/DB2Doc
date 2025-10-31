# 数据库文档生成器

这是一个基于 Flask 的 Web 应用，用于自动生成数据库表结构文档。应用使用星火大模型来推断数据库字段的中文含义，并生成美观的 Markdown 格式文档。

## 主要功能

- 🔌 **数据库连接测试** - 支持MySQL数据库连接验证
- 📋 **表结构获取** - 自动获取数据库中的所有表和字段信息
- 🤖 **智能翻译** - 使用星火大模型推断字段的中文含义
- 📝 **文档生成** - 自动生成Markdown格式的数据库文档
- 📊 **实时进度** - 显示文档生成的实时进度和日志
- 💾 **一键下载** - 生成完成后自动下载MD文档

## 安装说明

### 方法一：一键部署（推荐）

**Windows 系统：**
1. 右键以管理员身份运行 `deploy_windows.bat`
2. 脚本会自动完成环境检查、依赖安装、防火墙配置等
3. 部署完成后，双击 `start_production.bat` 启动应用

**Linux/macOS 系统：**
```bash
chmod +x start.sh
./start.sh
```

### 方法二：手动安装

**1. 克隆项目**
```bash
git clone <repository-url>
cd DB2Doc
```

**2. 创建虚拟环境**
```bash
python -m venv venv
# Windows
venv\Scripts\activate
# Linux/macOS
source venv/bin/activate
```

**3. 安装依赖**
```bash
pip install -r requirements.txt
```

**4. 配置星火大模型**
在 `config.json` 文件中，修改以下配置为您的星火大模型密钥：
```json
{
  "ai": {
    "sparkai": {
      "app_id": "your_app_id",
      "api_secret": "your_api_secret",
      "api_key": "your_api_key"
    }
  }
}
```

**5. 运行应用**
```bash
# 开发模式
python main.py

# 生产模式（推荐）
venv\Scripts\waitress-serve.exe --host 0.0.0.0 --port 5500 --call app.main:create_app
```

应用将在 `http://localhost:5500` 启动。

## 使用说明

### 1. 配置数据库连接

在 Web 页面中填写数据库连接信息：
- **数据库主机**: 数据库服务器地址
- **端口**: 数据库端口号（默认3306）
- **用户名**: 数据库用户名
- **密码**: 数据库密码
- **数据库名**: 要生成文档的数据库名称

### 2. 测试连接

点击 "测试连接" 按钮验证数据库连接是否正常。

### 3. 获取表列表

点击 "获取表列表" 按钮获取数据库中的所有表。

### 4. 选择表

在表列表中选择您要生成文档的表：
- 可以使用 "全选" 和 "取消全选" 按钮
- 也可以单独选择特定的表

### 5. 生成文档

点击 "生成DB说明文档" 按钮开始生成文档：
- 系统会显示实时进度条
- 执行日志会实时更新
- 可以看到每个表的处理进度

### 6. 下载文档

文档生成完成后，点击 "下载文档" 按钮即可下载生成的 Markdown 文件。

## 文档格式

生成的 Markdown 文档包含：

```markdown
## 表: table_name
| 字段名称 | 数据类型 | 中文说明 |
| -------- | -------- | -------- |
| id       | int      | 主键ID   |
| name     | varchar  | 姓名     |
| ...      | ...      | ...      |
```

## 技术栈

- **后端**: Flask + Python
- **前端**: Bootstrap 5 + Vanilla JavaScript
- **数据库**: MySQL
- **AI模型**: 星火大模型 (ChatSparkLLM)
- **实时通信**: Server-Sent Events (SSE)

## 项目结构

```
DB2Doc/
├── app.py                 # Flask应用主文件
├── requirements.txt       # Python依赖
├── README.md             # 项目说明
├── templates/
│   └── index.html        # 主页面模板
└── static/
    ├── css/
    │   └── style.css     # 样式文件
    └── js/
        └── app.js        # 前端逻辑
```

## API 接口

### POST /api/test_connection
测试数据库连接

### POST /api/get_tables
获取数据库表列表

### POST /api/generate_docs
生成数据库文档

### GET /api/logs
获取实时日志流 (Server-Sent Events)

### GET /api/download/<path:file_path>
下载生成的文档文件

## Windows 10 部署建议

### 🚀 生产环境部署

**1. 系统要求**
- Windows 10 或 Windows Server 2016+
- Python 3.8+ 
- 至少 2GB 可用内存
- 至少 1GB 可用磁盘空间

**2. 自动部署（推荐）**
```cmd
# 右键以管理员身份运行
deploy_windows.bat
```
这个脚本会自动：
- 检查Python环境
- 创建虚拟环境
- 安装所有依赖
- 配置防火墙规则
- 创建启动脚本

**3. 服务管理**
```cmd
# 启动服务（生产模式）
start_production.bat

# 停止服务
stop_service.bat

# 检查状态
python monitor.py status
```

**4. 系统监控**
```cmd
# 查看应用状态
python monitor.py status

# 持续监控
python monitor.py monitor

# 生成监控报告
python monitor.py report
```

**5. 备份管理**
```cmd
# 创建完整备份
python backup.py create full

# 查看备份列表
python backup.py list

# 清理旧备份
python backup.py cleanup
```

### 🔧 性能优化

**1. 资源配置**
在 `config.json` 中调整：
```json
{
  "app": {
    "threads": 4,  // 根据CPU核心数调整
    "port": 5500
  },
  "performance": {
    "max_concurrent_generations": 3  // 并发处理数
  }
}
```

**2. 内存优化**
- 定期清理临时文件
- 监控内存使用情况
- 适当调整并发处理数

**3. 网络优化**
- 配置防火墙允许端口 5500
- 如需外网访问，配置端口转发
- 考虑使用反向代理（如 Nginx）

### 🛡️ 安全建议

**1. 防火墙配置**
```cmd
# 添加防火墙规则（脚本自动执行）
netsh advfirewall firewall add rule name="数据库文档生成器" dir=in action=allow protocol=TCP localport=5500
```

**2. 数据库安全**
- 使用专门的数据库账户
- 限制数据库权限为只读
- 配置数据库连接超时

**3. API密钥保护**
- 定期更换API密钥
- 不要在代码中硬编码密钥
- 使用配置文件管理敏感信息

### 📈 部署架构建议

**单机部署**
```
Windows 10 电脑
├── Python 虚拟环境
├── Flask 应用 (Waitress)
├── 静态文件服务
├── 日志系统
└── 备份系统
```

**多用户环境**
- 配置IIS或Apache作为反向代理
- 使用负载均衡
- 配置SSL证书
- 考虑使用Docker容器

## 注意事项

1. **网络连接**: 确保服务器可以访问星火大模型的API
2. **数据库权限**: 确保数据库用户有足够的权限访问 `INFORMATION_SCHEMA`
3. **生成时间**: 文档生成时间取决于表的数量和字段数量
4. **文件清理**: 生成的临时文件会在下载后自动清理
5. **防火墙**: Windows Defender可能会阻止网络访问，请允许应用通过防火墙
6. **杀毒软件**: 某些杀毒软件可能会误报，请将项目目录添加到白名单
7. **系统权限**: 生产部署建议使用管理员权限运行部署脚本

## 常见问题

### Q: 为什么连接数据库失败？
A: 请检查：
- 数据库服务器是否运行
- 网络连接是否正常
- 用户名和密码是否正确
- 数据库名称是否存在

### Q: 生成文档很慢？
A: 这是正常现象，因为：
- 需要调用AI模型推断字段含义
- 处理大量表时需要时间
- 网络延迟可能影响速度

### Q: 如何自定义字段含义？
A: 目前由AI模型自动推断，后续版本可能会支持手动编辑功能。

## 贡献

欢迎提交 Issue 和 Pull Request 来改进这个项目！

## 许可证

MIT License