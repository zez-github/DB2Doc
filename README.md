# DB2Doc

一个将数据库表结构转化为可读文档的轻量工具，支持通过 OpenAI 兼容接口辅助生成字段中文含义，并输出 Markdown 表格文档。适合团队在开发与运维中快速补齐数据库文档。

## 特性
- 读取数据库表结构并生成 Markdown 文档
- 可调用 OpenAI 兼容接口推断字段中文含义
- 提供 Web UI（Flask）与脚本化入口
- 自带示例与单元测试，易于扩展与二次开发

## 快速开始
- 环境：Python 3.11+/Windows 或 Linux
- 安装依赖：
  - `pip install -r requirements.txt`
- 配置方式（二选一）：
  - 环境变量：复制 `.env.example` 为 `.env` 并填充后启动；或在系统环境中设置 `OPENAI_*` 变量
  - 本地文件：复制 `config/config.example.json` 为 `config/config.json` 并填充
- 启动（Windows）：
  - 开发脚本：`scripts/start_dev.bat`
  - 生产脚本：`scripts/start_production.bat`
- 启动（通用）：
  - `python main.py`

## 配置说明
支持通过环境变量或配置文件注入 OpenAI 相关参数：
- `OPENAI_API_KEY`：API 密钥（本地兼容服务可为空或占位）
- `OPENAI_BASE_URL`：服务地址（如 `http://localhost:1234/v1` 或官方 `https://api.openai.com/v1`）
- `OPENAI_MODEL`：模型名称（示例为 `google/gemma-3-1b`）
- `OPENAI_TIMEOUT`：请求超时秒数（默认 `30`）

配置文件示例位于 `config/config.example.json`，环境变量示例位于 `.env.example`。

## 目录结构
- `app/`：后端代码（Flask、业务与工具模块）
- `templates/`、`static/`：Web 前端资源
- `tests/`：单元与集成测试
- `scripts/`：启动与部署脚本
- `docs/`：项目文档（Quick Start、操作指南等）
- `config/`：本地配置文件（请勿提交真实密钥）
- `data/`：本地数据与生成产物（默认忽略提交）

## 运行测试
- 运行全部测试：`python -m unittest -v`

## 贡献
欢迎通过 Issue 与 Pull Request 参与贡献。请先阅读 `CONTRIBUTING.md` 并遵循 `CODE_OF_CONDUCT.md`。

## 许可证
本项目使用 MIT 许可证，详见 `LICENSE`。

## 示例与演示
- 生成示例文档：`python scripts/generate_example_doc.py`（输出到 `data/examples/users_table_demo.md`）
- 演示截图：
  - 首页：`docs/images/HomePage.png`
  - 生成进度：`docs/images/HomePage2.png`
  - 查阅文档：`docs/images/Tab2.png`

## 里程碑与发布
- 规划见 `CHANGELOG.md`，首个版本：`v0.1.0`
- GitHub 上创建里程碑（Issues → Milestones → New milestone），标题 `v0.1.0`，描述包含上述范围与目标日期
- 将关键 Issue 关联到里程碑并设置标签（`bug`、`enhancement`、`documentation`、`good first issue`）