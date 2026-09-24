# 飞牛 App 部署

镜像内已含 nginx（`:3000` → Next `:3002` + Nest `:3001`）。Compose 只映射 **`18080:3000`**。

## 飞牛 / 穿透反代（必看）

外层 HTTPS 反代只需转到本机 **`http://127.0.0.1:18080`**（或 NAS IP:18080），**不要**再指 18081。

面板里请确认：

1. **开启 WebSocket / Upgrade**（Socket.IO 用）
2. 转发时带上真实 Host / HTTPS 协议，例如：

```nginx
# 飞牛「自定义 Nginx」或等价面板选项
location / {
  proxy_pass http://127.0.0.1:18080;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_read_timeout 3600s;
}
```

**不要**把 `Host` 写成 `127.0.0.1:18080`，否则手机跳 `/m/` 会错。

## 手机访问

同一域名即可，例如 `https://joyai.iepose.cn`。手机打开后由前端按 UA 跳到 `/m/...`。

若一直停在电脑版：清掉 Cookie `joyai-view`，或账号页再切回移动端。

## 更新

```bash
docker compose pull
docker compose up -d
```
