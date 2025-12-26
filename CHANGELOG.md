# Changelog

遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与[语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]
- 增加更多数据库类型支持（PostgreSQL、Oracle 等）
- Web UI 的导出选项与模板自定义
- 更完善的错误处理与日志查看
- 版本对比功能
- Docker 部署方案

## [1.0.0] - 2025-12-26

这是 DB2Doc 的第一个正式版本，标志着项目从 MVP 到生产可用的重要里程碑。

### 新增功能 (Added)
- ✨ **数据库关系图可视化**
  - 基于 Mermaid.js 的交互式 ER 图渲染
  - 支持外键关系和智能推断关系
  - 核心表、孤立表自动识别与高亮
  - 按表名前缀自动分组着色
  - 缩放、平移、搜索等交互功能
  - PNG 图片导出
  
- 🤖 **智能关系推断引擎**
  - 基于命名规则的多层推断体系
  - 支持 LLM 增强推断（可选）
  - 置信度评分与可调阈值过滤
  - 推断理由展示

- 📝 **数据库在线标注功能**
  - Web UI 直接编辑表和字段注释
  - AI 一键生成表和字段描述
  - 批量标注所有表
  - 实时保存到数据库元数据

- 📊 **增量文档更新**
  - 基于已有文档的增量生成
  - 自动识别已存在的表
  - 时间戳分隔标记

- 🔌 **连接管理**
  - 多数据库连接保存与切换
  - 连接测试与数据库列表获取
  - LocalStorage 持久化存储

- 🛠️ **系统监控工具**
  - 应用健康检查
  - 系统资源监控（CPU、内存、磁盘）
  - 自动清理临时文件
  - 监控报告生成

- 🎨 **现代化 Web UI**
  - 三列式工作台布局（浏览/标注/导出模式）
  - 实时进度追踪与日志流
  - 响应式设计
  - 表搜索与批量操作

### 核心功能 (Core)
- 📚 支持 MySQL 5.7+ 和 SQL Server 2016+
- 🤖 OpenAI API 兼容（支持本地模型如 LM Studio、Ollama）
- 📄 Markdown 文档生成
- 🧪 完整的单元测试覆盖

### 技术栈
- 后端：Flask + Python 3.11+
- 前端：Bootstrap 5 + 原生 JavaScript
- 可视化：Mermaid.js
- 监控：psutil

### 已知限制
- 仅支持 MySQL 和 SQL Server（PostgreSQL 等将在后续版本支持）
- 关系推断依赖表和列的命名规范
- Web UI 暂不支持深色模式

### 升级说明
- 本版本为首个正式版本，从 v0.1.0（规划版）升级而来
- 配置文件格式保持兼容
- 建议首次使用时重新配置数据库连接

[Unreleased]: https://github.com/zez-github/DB2Doc/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/zez-github/DB2Doc/releases/tag/v1.0.0