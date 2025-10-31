# 测试数据库文档

这是一个测试用的现有文档，用于验证增量更新功能。

## 现有表格内容

表: users

| 字段名 | 类型 | 是否可空 | 默认值 | 中文含义 | 注释 |
|--------|------|----------|--------|----------|------|
| id | int(11) | NO |  | 用户ID | 主键 |
| username | varchar(50) | NO |  | 用户名 | 用户登录名 |
| email | varchar(100) | YES |  | 电子邮箱 | 用户邮箱地址 |
| created_at | timestamp | NO | CURRENT_TIMESTAMP | 创建时间 | 记录创建时间 |

表: posts

| 字段名 | 类型 | 是否可空 | 默认值 | 中文含义 | 注释 |
|--------|------|----------|--------|----------|------|
| id | int(11) | NO |  | 文章ID | 主键 |
| title | varchar(200) | NO |  | 文章标题 | 文章标题 |
| content | text | YES |  | 文章内容 | 文章正文内容 |
| user_id | int(11) | NO |  | 用户ID | 外键，关联users表 |
| created_at | timestamp | NO | CURRENT_TIMESTAMP | 创建时间 | 记录创建时间 |

---

这是现有文档的结尾。