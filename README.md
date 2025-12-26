# DB2Doc

一个智能数据库文档生成与管理工具，支持 MySQL 和 SQL Server，提供完整的 Web UI 界面，集成 AI 辅助功能和数据库关系可视化，帮助团队快速生成、维护和查看数据库文档。

## 核心特性

### 📚 文档生成与管理
- **智能生成**：自动读取数据库表结构，生成规范的 Markdown 文档
- **AI 辅助推断**：通过 OpenAI 兼容接口智能推断表和字段的中文含义
- **增量更新**：支持在已有文档基础上进行增量更新，避免重复劳动
- **多数据库支持**：完整支持 MySQL 和 SQL Server

### 🎨 可视化关系图
- **ER 图渲染**：基于 Mermaid 的交互式数据库关系图
- **关系推断**：智能推断表之间的隐含关联关系（支持 LLM 增强）
- **数据洞察**：自动识别核心表、孤立表，按业务前缀分组
- **交互操作**：支持缩放、平移、搜索、点击查看表详情
- **PNG 导出**：一键导出关系图为图片

### 🔧 数据库标注
- **在线编辑**：直接在 Web UI 中编辑表和字段的注释
- **批量生成**：一键为所有表和字段生成 AI 描述并保存到数据库
- **实时预览**：编辑后即时更新到数据库元数据

### 💻 便捷的 Web UI
- **连接管理**：支持保存和切换多个数据库连接
- **三列布局**：表列表、字段详情、预览一屏查看
- **进度追踪**：实时显示文档生成进度
- **快捷操作**：一键打开文件所在文件夹

### 🛠️ 监控与运维
- **系统监控**：内置 `monitor.py` 提供系统资源和应用状态监控
- **健康检查**：自动检查应用健康状态、日志大小、临时文件等
- **自动清理**：定期清理过期的临时文件

## 快速开始

### 环境要求
- Python 3.11+ 
- Windows / Linux / macOS
- 支持的数据库：MySQL 5.7+ / SQL Server 2016+

### 安装步骤

1. **克隆项目**
```bash
git clone <repository-url>
cd DB2Doc
```

2. **安装依赖**
```bash
pip install -r requirements.txt
```

3. **配置 AI 服务（可选）**

支持两种配置方式，任选其一：

**方式一：环境变量**
```bash
# 复制示例文件
cp .env.example .env

# 编辑 .env 文件，配置以下参数
OPENAI_API_KEY=your-api-key
OPENAI_BASE_URL=http://localhost:1234/v1  # 或官方地址
OPENAI_MODEL=google/gemma-3-1b
OPENAI_TIMEOUT=30
```

**方式二：配置文件**
```bash
# 复制示例文件
cp config/config.example.json config/config.json

# 编辑 config/config.json
```

4. **启动应用**

**Windows：**
```bash
# 开发模式（带调试）
scripts\start_dev.bat

# 生产模式
scripts\start_production.bat
```

**Linux/macOS：**
```bash
# 开发模式
python main.py

# 或使用脚本
./scripts/start.sh
```

5. **访问应用**

打开浏览器访问：`http://localhost:5500`

### 使用流程

1. **管理连接**：首次使用时在连接管理页面添加数据库连接
2. **浏览模式**：查看表结构、字段详情
3. **标注模式**：使用 AI 生成或手动编辑表和字段注释
4. **导出模式**：选择表并生成 Markdown 文档
5. **关系图**：点击"关系图"按钮查看数据库 ER 图

## 主要功能详解

### 1. 数据库关系图

访问 `http://localhost:5500/diagram` 查看交互式 ER 图：

- **外键关系**：显示数据库定义的外键约束
- **推断关系**：基于命名规则智能推断隐含关联（user_id → user 表）
- **LLM 增强**：可选启用 AI 复核推断关系，提升准确度
- **可视化增强**：
  - 核心表：金色边框高亮显示（关系数最多的表）
  - 孤立表：灰色虚线边框（无任何关联的表）
  - 前缀分组：按表名前缀（sys_、data_、log_ 等）分组着色
  - 图例显示：左下角显示分组和标记说明
- **交互功能**：
  - 鼠标滚轮缩放
  - 鼠标拖拽平移
  - 搜索表名（高亮匹配）
  - 点击表查看详细信息（字段列表、关联关系）
  - 导出为 PNG 图片

**推断阈值调节**：通过滑块调整置信度阈值（0-1），过滤低可信度的推断关系。

### 2. 文档生成

**全新生成**：
1. 在"导出"模式选择需要生成文档的表
2. （可选）输入数据库功能描述，提升 AI 推断准确度
3. 选择输出路径和文件名
4. 点击"生成文档"，实时查看进度
5. 完成后可预览、下载或打开文件所在文件夹

**增量更新**：
1. 切换到"增量更新"模式
2. 选择已有的 Markdown 文档
3. 系统自动识别已存在的表
4. 仅选择新增的表进行生成
5. 生成的新内容会追加到原文档后（带时间戳分隔符）

### 3. 数据库标注

在"标注"模式下直接编辑数据库元数据：

- **表注释生成**：点击"生成表说明"按钮，AI 自动生成表的中文描述
- **字段注释生成**：
  - 单个字段：点击"生成"按钮为单个字段生成描述
  - 批量生成：点击"一键生成全部"为所有字段生成描述
- **手动编辑**：在输入框中直接编辑注释内容
- **保存到数据库**：点击"保存到数据库"将注释写入数据库元数据
- **一键标注所有表**：在标注模式下点击"一键生成所有表说明"，自动为整个数据库的所有表和字段生成注释并保存

### 4. 系统监控

使用内置的监控工具：

```bash
# 查看当前状态
python monitor.py status

# 生成监控报告
python monitor.py report

# 持续监控（每60秒刷新）
python monitor.py monitor 60

# 清理旧文件
python monitor.py cleanup
```

监控内容包括：
- 应用健康状态（HTTP 检查）
- CPU、内存、磁盘使用率
- 日志文件大小
- 临时文件数量
- Python 进程信息

## 配置说明

### AI 服务配置

支持通过环境变量或配置文件注入 OpenAI 相关参数：

| 参数 | 说明 | 示例值 |
|------|------|--------|
| `OPENAI_API_KEY` | API 密钥 | `sk-xxx`（本地服务可为空或占位） |
| `OPENAI_BASE_URL` | 服务地址 | `http://localhost:1234/v1` 或<br>`https://api.openai.com/v1` |
| `OPENAI_MODEL` | 模型名称 | `google/gemma-3-1b` |
| `OPENAI_TIMEOUT` | 请求超时（秒） | `30` |

**配置文件位置**：
- 环境变量示例：`.env.example`
- 配置文件示例：`config/config.example.json`

**注意**：
- AI 功能为可选项，不配置也可正常使用（但无法使用推断功能）
- 支持本地部署的兼容服务（如 LM Studio、Ollama with OpenAI adapter）
- 推荐使用环境变量方式，避免配置文件泄露密钥

### 应用配置

在 `config/config.json` 中可配置：
- 应用端口（默认 5500）
- 日志级别和存储位置
- 文件管理（临时文件保留时长等）

## 目录结构

```
DB2Doc/
├── app/                    # 后端代码
│   ├── config/            # 配置管理模块
│   ├── routes/            # Flask 路由
│   │   ├── api.py        # 主要 API 端点
│   │   ├── api_graph_mermaid.py  # 关系图 API
│   │   └── main.py       # 页面路由
│   └── utils/             # 工具模块
│       ├── ai_helper.py   # AI 辅助功能
│       ├── database.py    # 数据库操作
│       └── relationship_inference.py  # 关系推断引擎
├── templates/             # HTML 模板
│   ├── index.html        # 主工作台
│   ├── connections.html  # 连接管理
│   └── diagram.html      # 关系图页面
├── static/                # 前端资源
│   ├── css/              # 样式文件
│   ├── js/               # JavaScript
│   │   ├── app.js        # 主应用逻辑
│   │   ├── connections.js # 连接管理
│   │   ├── diagram.js    # 关系图交互
│   │   └── mermaid.min.js # Mermaid 库
│   └── lib/              # 第三方库（Bootstrap、FontAwesome）
├── scripts/               # 启动与部署脚本
│   ├── start_dev.bat     # Windows 开发模式
│   ├── start_production.bat # Windows 生产模式
│   └── start.sh          # Linux/macOS 启动
├── tests/                 # 单元与集成测试
├── docs/                  # 项目文档
├── config/                # 配置文件（需自行创建）
│   ├── config.example.json  # 配置示例
│   └── config.json       # 实际配置（不提交）
├── data/                  # 本地数据与生成产物
│   └── examples/         # 示例文档
├── logs/                  # 运行日志
├── monitor.py             # 系统监控工具
├── main.py                # 应用入口
├── requirements.txt       # Python 依赖
└── README.md              # 本文件
```

## 技术栈

- **后端**：Flask、Python 3.11+
- **前端**：Bootstrap 5、原生 JavaScript
- **可视化**：Mermaid.js（ER 图渲染）
- **数据库**：支持 MySQL、SQL Server
- **AI 服务**：OpenAI API（兼容本地部署）
- **其他**：psutil（系统监控）

## 运行测试

运行全部测试：
```bash
python -m unittest -v
```

运行特定测试：
```bash
python -m unittest tests.test_app
python -m unittest tests.test_openai_integration
```

## 常见问题

### 1. 如何使用本地 AI 模型？

推荐使用 LM Studio 或 Ollama：

**LM Studio：**
1. 下载并启动 LM Studio
2. 加载模型（如 Gemma、Llama 等）
3. 启动本地服务器（默认 `http://localhost:1234`）
4. 配置 `OPENAI_BASE_URL=http://localhost:1234/v1`

**Ollama（需要 OpenAI 适配器）：**
```bash
# 安装 Ollama OpenAI Adapter
pip install ollama-openai

# 启动 Ollama
ollama serve

# 启动适配器
ollama-openai --port 11434
```

### 2. 关系图显示不完整怎么办？

- 检查是否启用了"推断关系"开关
- 调低推断阈值（从 0.6 降到 0.4）
- 确认表之间是否有命名规则（如 `user_id` 对应 `user` 表）
- 启用 LLM 增强以提升推断准确度

### 3. 如何备份和迁移数据库连接？

连接信息保存在浏览器的 localStorage 中，可通过以下方式备份：
1. 在连接管理页面导出所有连接（JSON 格式）
2. 在新环境导入 JSON 文件

### 4. 生成文档时部分表失败怎么办？

- 查看日志了解具体错误原因
- 检查数据库用户权限（需要读取 `information_schema`）
- 单独尝试生成失败的表，查看详细错误信息

## 贡献指南

欢迎通过 Issue 与 Pull Request 参与贡献！

### 开发流程

1. Fork 本仓库
2. 创建特性分支：`git checkout -b feature/your-feature`
3. 提交更改：`git commit -am 'Add some feature'`
4. 推送分支：`git push origin feature/your-feature`
5. 提交 Pull Request

### 代码规范

- 遵循 PEP 8 Python 代码规范
- 添加必要的注释和文档字符串
- 编写单元测试覆盖新功能
- 提交前运行测试确保通过

更多详情请阅读 `CONTRIBUTING.md`。

## 路线图

### ✅ v1.0.0（已发布 - 2025-12-26）
- [x] MySQL 和 SQL Server 支持
- [x] Web UI 文档生成
- [x] 数据库关系图可视化
- [x] AI 辅助字段注释生成
- [x] 增量文档更新
- [x] 关系推断（规则 + LLM）
- [x] 数据库标注功能
- [x] 系统监控工具

### 📋 v1.1.0（计划中）
- [ ] PostgreSQL 支持
- [ ] 导出 PDF/HTML 格式
- [ ] 深色模式支持
- [ ] 更多图表类型

### 🚀 v1.2.0（规划中）
- [ ] Oracle 数据库支持
- [ ] 版本对比功能
- [ ] Docker 部署方案
- [ ] 多语言支持

详见 `CHANGELOG.md` 了解版本更新详情。

## 许可证

本项目使用 MIT 许可证，详见 [LICENSE](LICENSE)。

## 致谢

- [Flask](https://flask.palletsprojects.com/) - Web 框架
- [Bootstrap](https://getbootstrap.com/) - UI 框架
- [Mermaid](https://mermaid.js.org/) - 图表渲染
- [FontAwesome](https://fontawesome.com/) - 图标库

## 联系方式

如有问题或建议，欢迎通过以下方式联系：
- 提交 [Issue](https://github.com/zez-github/DB2Doc/issues)
- 查看 [文档](docs/)
- 遵循 [行为准则](CODE_OF_CONDUCT.md)

---

**DB2Doc** - 让数据库文档管理更简单 🚀