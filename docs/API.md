# API Draft

Base: `http://localhost:3001/api`  
Swagger: `http://localhost:3001/api/docs`

## Auth

| Method | Path | 说明 |
|--------|------|------|
| POST | `/auth/login` | `{ username, password }` → `{ accessToken, user }` |
| POST | `/auth/register` | 注册 creator |
| GET | `/auth/me` | 当前用户 |

## Jobs

| Method | Path | 说明 |
|--------|------|------|
| POST | `/jobs` | 创建生成任务 `{ kind, input }` |
| GET | `/jobs` | 列表 |
| GET | `/jobs/:id` | 详情 |

`kind`: `image` \| `video`

## Assets

| Method | Path | 说明 |
|--------|------|------|
| GET | `/assets` | 素材列表 |
| POST | `/upload` | multipart 上传 |
| POST | `/upload/check` | MD5 去重检查 |

## Canvas

| Method | Path | 说明 |
|--------|------|------|
| GET | `/canvas/projects` | 项目列表 |
| POST | `/canvas/projects` | 创建 |
| GET | `/canvas/projects/:id` | 详情含 snapshot |
| PATCH | `/canvas/projects/:id` | 更新 title / snapshot |

## Admin

| Method | Path | 说明 |
|--------|------|------|
| GET/POST/PATCH | `/admin/channels` | 渠道 |
| GET/POST/PATCH | `/admin/models` | 模型 |
| GET | `/admin/users` | 用户 |
| GET | `/admin/jobs` | 全站任务 |

## Realtime

Socket.IO namespace `/jobs`，事件 `job:progress` / `job:completed` / `job:failed`。
