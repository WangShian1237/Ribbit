# Ribbit

网页即时通信：公共大厅、好友验证与私聊、用户自建群。后端 **PostgreSQL** 持久化用户、关系与聊天记录（大厅 / 私聊 / 群各房间最近若干条）。前端 Vite + React，实时通道 Socket.io。

## 前置条件

- Node.js 18+
- Docker（用于本地 PostgreSQL，也可自建实例并改 `DATABASE_URL`）

## 安装

```bash
npm install
npm install --prefix client
npm install --prefix server
```

## 数据库

1. 启动 PostgreSQL（默认映射主机端口 **5433**，避免与本机已有 5432 冲突）：

```bash
docker compose up -d
```

2. 在 `server/` 下配置环境变量（可复制 `server/.env.example` 为 `server/.env`）：

- `DATABASE_URL` 示例：`postgresql://ribbit:ribbit@127.0.0.1:5433/ribbit`（与 compose 中用户/库名一致）

3. 执行迁移：

```bash
npm run migrate --prefix server
```

4. （可选）若曾使用旧版 `server/data/users.json`，可在迁移后执行：

```bash
npm run import-json --prefix server
```

## 开发运行

在项目根目录：

```bash
npm run dev
```

浏览器打开 **http://localhost:5173**（Vite 将 `/api` 与 `/socket.io` 代理到 `http://127.0.0.1:3001`）。

## 环境变量（`server/.env`）

| 变量 | 说明 |
|------|------|
| `PORT` | HTTP/Socket 端口，默认 `3001` |
| `JWT_SECRET` | JWT 密钥，生产环境务必修改 |
| `DATABASE_URL` | PostgreSQL 连接串 |

## 功能摘要

- **注册 / 登录**：JWT，密码 bcrypt。
- **好友**：按用户名发起请求；「新的朋友」中同意/拒绝；**仅互为好友可私聊**。
- **在线列表**：非好友可点「加好友」；好友可点进私聊。
- **群聊**：新建群、群主向好友发送**入群邀请**，对方在「群邀请」中**同意**后才会入群；退群（群主退群即解散群）。
- **大厅**：无需好友即可发言。

## HTTP API（节选）

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/health` | 存活 |
| `GET` | `/api/ready` | 数据库可连通 |
| `POST` | `/api/register` | 注册 |
| `POST` | `/api/login` | 登录 |
| `GET` | `/api/me` | 当前用户（需 Bearer） |
| `POST` | `/api/friends/request` | `{ username }` 发好友请求 |
| `GET` | `/api/friends` | 好友列表 |
| `GET` | `/api/friends/requests/incoming` | 收到的请求 |
| `POST` | `/api/friends/requests/:id/accept` | 同意 |
| `POST` | `/api/friends/requests/:id/reject` | 拒绝 |
| `POST` | `/api/groups` | `{ name }` 建群 |
| `GET` | `/api/groups` | 我的群 |
| `POST` | `/api/groups/:groupId/members` | `{ username }` 向好友发**入群邀请**（需对方同意） |
| `GET` | `/api/groups/invites/incoming` | 收到的入群邀请 |
| `POST` | `/api/groups/invites/:inviteId/accept` | 同意入群 |
| `POST` | `/api/groups/invites/:inviteId/reject` | 拒绝邀请 |
| `DELETE` | `/api/groups/:groupId/members/me` | 退群（群主则解散） |

## 生产构建

```bash
npm run build
```

前端产物在 `client/dist/`；需自行配置反向代理与 HTTPS，由 Node 或进程管理器托管 `server`。

## 许可证

私有/学习用途。
