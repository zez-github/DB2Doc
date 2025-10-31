# Changelog

遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与[语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]
- 增加更多数据库类型支持（PostgreSQL 等）
- Web UI 的导出选项与模板自定义
- 更完善的错误处理与日志查看

## [0.1.0] - 规划
- 目标：MVP 可用版本，支持 MySQL/SQL Server 两类数据库
- 内容：
  - 文档生成：从数据库读取表结构，生成 Markdown 表格
  - AI 推断：支持通过 OpenAI 兼容接口推断字段中文含义（可选、可降级）
  - 配置：环境变量与本地 `config.json` 双路径，示例配置与 `.gitignore` 安全处理
  - 启动与测试：提供启动脚本、单元测试与 CI（Windows/Ubuntu，Python 3.11/3.12）
  - 示例：提供 `scripts/generate_example_doc.py` 与 `data/examples/` 演示产物
- 发布：创建 `v0.1.0` 标签与 Release 说明（概述、特性、已知限制、下一步）

[Unreleased]: https://github.com/<your_org>/<your_repo>/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/<your_org>/<your_repo>/releases/tag/v0.1.0