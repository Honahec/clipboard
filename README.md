# Clipboard

一个面向短文本分享的剪贴板应用。匿名用户可以创建最长保留 7 天的公开内容；通过 OIDC 登录后，可以创建永久或私有内容，并管理自己的剪贴板。私有内容不会出现在公共列表中，但持有当前分享码的人可以读取；所有者可以刷新分享码，让旧码立即失效。

## 技术栈

- Go HTTP 服务，使用 `pgx` 连接 PostgreSQL
- React、TypeScript、Vite、TanStack Query
- shadcn/ui（Radix）、Tailwind CSS v4、Lucide
- 标准 OIDC Authorization Code + PKCE
- 加密、HttpOnly、SameSite 会话 cookie
- 单容器同时提供 API 和 React 静态资源

## 本地运行

最快的方式是使用 Compose：

```bash
docker compose up --build
```

打开 `http://localhost:8080`。默认未配置 OIDC，匿名流程可直接使用。

分别开发前后端时，先准备 PostgreSQL，然后启动 Go 服务：

```bash
cd backend
DATABASE_URL='postgres://postgres:postgres@localhost:5432/clipboard?sslmode=disable' \
PUBLIC_URL='http://localhost:5173' \
go run ./cmd/clipboard
```

再启动 Vite；开发服务器会将 `/api` 转发到 `localhost:8080`：

```bash
cd frontend
pnpm install
pnpm dev
```

## 配置

| 环境变量 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `DATABASE_URL` | 是 | 无 | PostgreSQL 连接串 |
| `LISTEN_ADDR` | 否 | `0.0.0.0:8080` | HTTP 监听地址 |
| `PUBLIC_URL` | 否 | `http://localhost:5173` | 外部访问地址，用于 OIDC callback |
| `WEB_DIR` | 否 | `../frontend/dist` | React 构建产物目录 |
| `OIDC_ISSUER` | OIDC 启用时 | 无 | OIDC issuer |
| `OIDC_CLIENT_ID` | OIDC 启用时 | 无 | OIDC client ID |
| `OIDC_CLIENT_SECRET` | OIDC 启用时 | 无 | OIDC client secret |
| `AUTH_SESSION_SECRET` | OIDC 启用时 | 无 | 至少 32 字符的随机会话密钥 |

OIDC 客户端需要登记 callback：

```text
<PUBLIC_URL>/api/auth/callback
```

## 验证

```bash
cd backend && go test -race ./... && go vet ./...
cd frontend && pnpm lint && pnpm build
docker build -t clipboard:local .
```

## 镜像发布

推送到 `main` 后，GitHub Actions 会在测试通过后构建 `linux/amd64` 镜像并发布到：

```text
ghcr.io/honahec/clipboard:sha-<12位Git提交>
```

镜像以非 root 用户运行，并提供 `/api/health` 健康检查。
