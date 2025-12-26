# DB2Doc v1.0.0 发布说明

🎉 **我们非常高兴地宣布 DB2Doc v1.0.0 正式发布！**

这是 DB2Doc 的第一个正式版本，标志着项目从概念验证到生产可用的重要里程碑。

## 📅 发布日期

2025年12月26日

## 🌟 版本亮点

### 1. 🎨 可视化数据库关系图

全新的交互式 ER 图功能，让数据库结构一目了然：

- **智能关系识别**：自动识别外键和推断隐含关系
- **数据洞察**：核心表金色高亮、孤立表灰色标记
- **前缀分组**：按表名前缀自动着色分组（sys_、data_、log_ 等）
- **交互体验**：缩放、平移、搜索、点击查看详情
- **一键导出**：PNG 格式图片导出

### 2. 🤖 AI 智能推断引擎

三层推断体系，让关系识别更准确：

- **规则推断**：基于命名规则（user_id → user 表）
- **类型匹配**：数据类型兼容性检查
- **LLM 增强**：可选的 AI 复核，提升准确度
- **置信度评分**：每个推断关系都有可信度评分

### 3. 📝 在线数据库标注

直接在 Web UI 中维护数据库元数据：

- **表注释生成**：AI 一键生成表的中文描述
- **字段注释生成**：批量或单个生成字段说明
- **实时保存**：直接写入数据库的 COMMENT 字段
- **批量处理**：一键标注整个数据库

### 4. 📊 增量文档更新

避免重复劳动，智能更新已有文档：

- 自动识别已存在的表
- 仅生成新增表的文档
- 时间戳分隔标记

### 5. 🔌 连接管理

轻松管理多个数据库连接：

- 保存和切换连接配置
- 连接测试与验证
- LocalStorage 本地持久化

## 💻 完整功能清单

### 文档生成
- ✅ 自动读取表结构
- ✅ 生成 Markdown 格式文档
- ✅ AI 推断字段含义
- ✅ 增量更新模式
- ✅ 自定义输出路径

### 数据库支持
- ✅ MySQL 5.7+
- ✅ SQL Server 2016+

### AI 功能
- ✅ OpenAI API 兼容
- ✅ 支持本地模型（LM Studio、Ollama）
- ✅ 可选的 AI 功能（可完全禁用）

### Web UI
- ✅ 现代化三列布局
- ✅ 浏览/标注/导出三种模式
- ✅ 实时进度追踪
- ✅ 响应式设计

### 监控运维
- ✅ 系统资源监控
- ✅ 应用健康检查
- ✅ 自动文件清理
- ✅ 监控报告生成

## 🚀 快速开始

### 安装

```bash
# 克隆项目
git clone https://github.com/zez-github/DB2Doc.git
cd DB2Doc

# 安装依赖
pip install -r requirements.txt

# 配置（可选）
cp .env.example .env
# 编辑 .env 文件配置 AI 服务

# 启动
python main.py
```

### 首次使用

1. 访问 `http://localhost:5500`
2. 在连接管理页面添加数据库连接
3. 选择浏览/标注/导出模式开始使用
4. 点击"关系图"按钮查看 ER 图

## 📖 文档

- [README](README.md) - 完整使用指南
- [CHANGELOG](CHANGELOG.md) - 版本更新记录
- [CONTRIBUTING](CONTRIBUTING.md) - 贡献指南
- [docs/](docs/) - 详细文档

## 🛠️ 技术栈

- **后端**：Flask + Python 3.11+
- **前端**：Bootstrap 5 + JavaScript
- **可视化**：Mermaid.js
- **数据库**：MySQL、SQL Server
- **监控**：psutil

## 📝 已知限制

1. **数据库支持**：目前仅支持 MySQL 和 SQL Server
   - PostgreSQL、Oracle 支持计划在后续版本
   
2. **关系推断**：依赖于标准的表和列命名规范
   - 建议使用 `xxx_id` 格式的外键列名
   
3. **UI 功能**：暂不支持深色模式

4. **导出格式**：目前仅支持 Markdown 格式
   - PDF/HTML 格式计划在后续版本

## 🗺️ 未来计划

### v1.1.0（计划中）
- [ ] PostgreSQL 支持
- [ ] 导出 PDF/HTML 格式
- [ ] 深色模式
- [ ] 更多图表类型

### v1.2.0（规划中）
- [ ] Oracle 数据库支持
- [ ] 版本对比功能
- [ ] Docker 部署方案
- [ ] 多语言支持

详见 [CHANGELOG.md](CHANGELOG.md) 了解完整路线图。

## 🙏 致谢

感谢所有贡献者和用户的支持！特别感谢：

- [Flask](https://flask.palletsprojects.com/) - 优秀的 Web 框架
- [Mermaid](https://mermaid.js.org/) - 强大的图表渲染库
- [Bootstrap](https://getbootstrap.com/) - 现代化的 UI 框架

## 📬 反馈与支持

- **问题反馈**：[GitHub Issues](https://github.com/zez-github/DB2Doc/issues)
- **功能建议**：欢迎提交 Issue 或 Pull Request
- **文档**：访问 [docs/](docs/) 目录查看详细文档

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE)

---

**DB2Doc v1.0.0** - 让数据库文档管理更简单 🚀

感谢您使用 DB2Doc！如果觉得项目有用，欢迎给我们一个 ⭐️

