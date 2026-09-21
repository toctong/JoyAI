# Notes

## 对象存储去重

- 所有 TOS 上传按文件 **MD5** 内容寻址：`uploads/by-hash/{md5}.{ext}`
- `putObject` 前 `headObject`，已存在则跳过实际上传
- 同用户同 MD5 资产直接复用（`/upload/check` + `/upload`）
- SHA-256 写入 Asset.meta 备用
- Mirror（`putFromUrl`）可跳过下载：① URL 已是本桶 by-hash；② 远端 HEAD 的 Content-MD5/ETag 已对应本地对象；③ 其它 Asset 已镜像同一 `originUrl`
- 未引用清理：`StorageGcSweeper` 定期扫描 `uploads/by-hash/`；默认 dry-run。Admin：`GET /admin/storage/gc` 预览，`POST /admin/storage/gc?confirm=1` 删除。自动删需 `STORAGE_GC_DELETE=true`

## 安全

- 密钥进 Channel / 加密 Settings，勿提交 `.env`
- JWT_SECRET 生产必须更换
- Admin 与创作者共用 API，用 role 区分
- Server 会读 `apps/server/.env` 与仓库根目录 `.env`

## 任务与并发

- 生图/视频禁止 HTTP 同步长阻塞
- poll 退避可配置；失败写 Job.error
- Redis 与 MySQL 本地都由 `docker compose up -d` 提供（库 `joyai`，连接串 `DATABASE_URL`）

## 画板

- 快照控制体积：节点只引用 Asset
- 自动保存防抖约 1s
- Fabric 仅用于图片节点内编辑；应用结果须回传 Asset，禁止把 base64 写入快照
- 正式参考源与 Phase 6 规格见 [CANVAS.md](./CANVAS.md)
- 小地图 / NodeToolbar / 框选等以竞品与 xyflow 能力为对照，用本仓栈重写

## Provider

- 业务层禁止写死平台 URL；走 `@joyai/ai-providers`
- 新平台 = 新 adapter + Admin 渠道行

## 旧项目

- 只对照不搬运（见 VISION.md）；画板不以 `ai-comic-drama` 为交互/代码标杆
- 需要字段时人工打开旧文件对照，再在本仓重写

## OSS

- TOS 未配置时 upload 返回明确错误
- 生图结果优先镜像到 TOS；镜像失败可保留上游 URL（开发期）

## 启动顺序

1. `docker compose up -d`
2. `pnpm install`（自行安装）
3. `pnpm build:packages`
4. 重启 `pnpm dev:server`（TypeORM synchronize 自动建表；清空库用 `pnpm db:reset`）
5. 分别启动 server / web（运维 UI 在 web 的 `/admin`，需 admin 角色；已无独立 `apps/admin`）
