# 发布 v1.0.0 版本的 Git 操作指南

按照以下步骤完成 v1.0.0 版本的正式发布：

## 第一步：提交所有更改

```bash
# 查看当前更改
git status

# 添加所有更改的文件
git add .

# 提交更改
git commit -m "Release v1.0.0

- 更新 CHANGELOG.md 添加 v1.0.0 版本详情
- 创建 VERSION 文件
- 创建 RELEASE_NOTES_v1.0.0.md 发布说明
- 更新 README.md 路线图
- 更新版本号为 1.0.0
"
```

## 第二步：推送到远程仓库

```bash
# 推送到主分支
git push origin main

# 如果您的主分支是 master，使用：
# git push origin master
```

## 第三步：创建 Git Tag

```bash
# 创建带注释的标签（推荐）
git tag -a v1.0.0 -m "Release v1.0.0 - 首个正式版本

这是 DB2Doc 的第一个正式版本，主要特性：
- 数据库关系图可视化
- 智能关系推断引擎
- 在线数据库标注
- 增量文档更新
- 连接管理
- 系统监控工具

详见 RELEASE_NOTES_v1.0.0.md
"

# 推送标签到远程
git push origin v1.0.0

# 或者推送所有标签
git push origin --tags
```

## 第四步：在 GitHub 上创建 Release

### 方法一：通过 GitHub Web 界面（推荐）

1. 访问仓库页面：https://github.com/zez-github/DB2Doc
2. 点击右侧的 "Releases"
3. 点击 "Create a new release" 或 "Draft a new release"
4. 填写以下信息：
   - **Tag version**: `v1.0.0`（如果已推送标签，选择它；否则输入新标签）
   - **Target**: `main`（或您的主分支）
   - **Release title**: `v1.0.0 - 首个正式版本`
   - **Description**: 复制 `RELEASE_NOTES_v1.0.0.md` 的内容
5. 勾选 "Set as the latest release"
6. 点击 "Publish release"

### 方法二：使用 GitHub CLI（如果已安装）

```bash
# 使用 GitHub CLI 创建 Release
gh release create v1.0.0 \
  --title "v1.0.0 - 首个正式版本" \
  --notes-file RELEASE_NOTES_v1.0.0.md \
  --latest

# 如果需要附加文件（可选）
# gh release upload v1.0.0 path/to/file
```

## 第五步：创建 GitHub Milestone（可选但推荐）

1. 访问：https://github.com/zez-github/DB2Doc/milestones
2. 点击 "New milestone"
3. 填写信息：
   - **Title**: `v1.1.0`
   - **Due date**: 设置目标完成日期（如 2025-03-31）
   - **Description**: 
     ```
     下一个版本的目标功能：
     - PostgreSQL 支持
     - 导出 PDF/HTML 格式
     - 深色模式支持
     - 更多图表类型
     ```
4. 点击 "Create milestone"
5. 将相关 Issues 关联到这个里程碑

## 第六步：关闭 v1.0.0 Milestone

如果之前创建了 v1.0.0 的 Milestone：

1. 访问 Milestones 页面
2. 找到 v1.0.0
3. 点击 "Close milestone" 标记为已完成

## 第七步：公告发布（可选）

1. **更新项目描述**
   - 在 GitHub 仓库设置中更新简短描述
   - 添加主题标签（topics）：`database`, `documentation`, `flask`, `mysql`, `sqlserver`, `mermaid`, `ai`

2. **发布推广**
   - 在项目的 Discussions 或 Issues 中发布公告
   - 更新相关文档链接

3. **社交媒体**（如适用）
   - 在技术社区分享发布信息
   - 撰写发布博客文章

## 验证清单

在完成发布后，请验证：

- [ ] Git tag `v1.0.0` 已创建并推送
- [ ] GitHub Release 已发布并标记为 latest
- [ ] CHANGELOG.md 已更新
- [ ] README.md 已更新
- [ ] VERSION 文件存在且内容为 `1.0.0`
- [ ] 所有文档链接正常工作
- [ ] 项目可以正常克隆和运行

## 后续维护

### 热修复（Hotfix）

如果发现重大问题需要紧急修复：

```bash
# 创建热修复分支
git checkout -b hotfix/1.0.1 v1.0.0

# 进行修复并提交
git commit -am "Fix critical bug"

# 创建新标签
git tag -a v1.0.1 -m "Hotfix v1.0.1"

# 合并回主分支
git checkout main
git merge hotfix/1.0.1

# 推送
git push origin main
git push origin v1.0.1
```

### 下一个版本

开始 v1.1.0 开发：

```bash
# 在 CHANGELOG.md 中添加 [Unreleased] 部分
# 在 Milestone 中跟踪进度
# 定期从主分支拉取最新代码
```

---

🎉 恭喜！您已完成 v1.0.0 版本的发布流程！

