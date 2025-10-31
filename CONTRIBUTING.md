# 贡献指南

感谢关注 DB2Doc！欢迎通过 Issue 与 Pull Request 参与贡献。

## 开发环境
- Python 3.11+（建议虚拟环境：`python -m venv .venv`）
- 安装依赖：`pip install -r requirements.txt`
- 配置参数：复制 `.env.example` 为 `.env` 或复制 `config/config.example.json` 为 `config/config.json`

## 运行与测试
- 启动：`python main.py` 或使用 `scripts/start_dev.bat`
- 测试：`python -m unittest -v`

## 提交规范
- 分支：功能使用 `feature/xxx`，修复使用 `fix/xxx`
- 提交信息：简洁描述改动与动机（建议遵循约定式提交）
- PR 说明：包含改动概述、问题背景、测试方式与风险评估

## 代码风格
- 保持模块职责清晰，避免不必要复杂度
- 优先使用环境变量注入敏感信息，不在仓库中提交真实密钥
- 若涉及外部服务调用，确保可降级/可跳过以便 CI 与本地运行

## Issue 与讨论
- Bug 报告：提供复现步骤、期望行为与实际行为、环境信息
- 功能建议：描述使用场景与收益，避免过度耦合的实现方案

感谢你的贡献！