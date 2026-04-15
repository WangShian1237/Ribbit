# Ribbit IM

**中文 | [English](#english)**

基于浏览器的即时通信演示项目：公共大厅、好友与私聊、用户自建群。后端使用 **Node.js + Express + PostgreSQL**，实时层 **Socket.io**；前端 **Vite + React + TypeScript**。

---

## 功能概览

| 模块 | 说明 |
|------|------|
| 账户 | 注册 / 登录，JWT 鉴权，密码 bcrypt |
| 大厅 | 无需好友即可参与公共频道 |
| 好友 | 按用户名发起请求，对方同意后成为好友；**仅好友可私聊** |
| 私聊 | 好友之间一对一实时消息 |
| 群聊 | 创建群组；群主向好友发送**入群邀请**，对方在「群邀请」中同意后入群；支持退群（群主退群即解散） |
| 在线状态 | 侧栏展示在线用户，非好友可发起加好友 |
| 数据持久化 | 用户、好友关系、群与邀请、**聊天记录**（按房间保留最近若干条）均存 PostgreSQL |

---

## 技术栈

- **前端**：React 19、TypeScript、Vite、Socket.io Client  
- **后端**：Express 5、Socket.io、PostgreSQL（`pg`）、JWT、Helmet、速率限制  
- **本地数据库**：Docker Compose 提供 PostgreSQL（默认映射主机端口 **5433**，避免占用常见 `5432`）

---

## 前置要求

- **Node.js** 18 或更高  
- **Docker**（用于一键启动本地 PostgreSQL；也可使用自建实例并修改 `DATABASE_URL`）

---

## 快速开始

### 1. 克隆与安装依赖

```bash
git clone https://github.com/WangShian1237/Ribbit.git
cd Ribbit

npm install
npm install --prefix client
npm install --prefix server
```

### 2. 启动数据库

```bash
docker compose up -d
```

### 3. 配置环境变量

复制示例文件并编辑：

```bash
copy server\.env.example server\.env
# Linux / macOS: cp server/.env.example server/.env
```

在 `server/.env` 中至少配置：

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | PostgreSQL 连接串，示例：`postgresql://ribbit:ribbit@127.0.0.1:5433/ribbit`（与 `docker-compose.yml` 中默认用户/库名一致） |
| `JWT_SECRET` | JWT 签名密钥，**生产环境必须改为强随机字符串** |
| `PORT` | HTTP 与 Socket 端口，默认 `3001` |

### 4. 数据库迁移

```bash
npm run migrate --prefix server
```

### 5. （可选）从旧版 JSON 导入用户

若曾使用早期 `users.json` 存储用户，迁移后可执行：

```bash
npm run import-json --prefix server
```

> 请勿将含真实密码哈希的 `server/data/*.json` 提交到仓库（已在 `.gitignore` 中忽略）。

### 6. 启动开发环境

在项目**根目录**执行：

```bash
npm run dev
```

- 前端：<http://localhost:5173>  
- 后端 API / WebSocket：开发时由 Vite 将 `/api` 与 `/socket.io` **代理**到 `http://127.0.0.1:3001`

---

## 项目结构（节选）

```text
Ribbit/
├── client/                 # 前端（Vite + React）
├── server/
│   ├── index.js            # HTTP + Socket.io 入口
│   ├── db/                 # 数据访问层
│   ├── migrations/         # SQL 迁移（按文件名顺序执行）
│   └── .env.example
├── docker-compose.yml      # 本地 PostgreSQL
└── package.json            # 根脚本：并发启动前后端 dev
```

---

## 环境变量（`server/.env`）

| 变量 | 说明 |
|------|------|
| `PORT` | 服务端口，默认 `3001` |
| `JWT_SECRET` | JWT 密钥，生产环境务必修改 |
| `DATABASE_URL` | PostgreSQL 连接串 |

---

## HTTP API（节选）

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/health` | 存活探测 |
| `GET` | `/api/ready` | 数据库连通性 |
| `POST` | `/api/register` | 注册 |
| `POST` | `/api/login` | 登录 |
| `GET` | `/api/me` | 当前用户（`Authorization: Bearer <token>`） |
| `POST` | `/api/friends/request` |  body: `{ username }`，发起好友请求 |
| `GET` | `/api/friends` | 好友列表 |
| `GET` | `/api/friends/requests/incoming` | 收到的请求 |
| `POST` | `/api/friends/requests/:requestId/accept` | 同意 |
| `POST` | `/api/friends/requests/:requestId/reject` | 拒绝 |
| `GET` | `/api/friends/requests/outgoing` | 发出的好友请求 |
| `POST` | `/api/groups` | body: `{ name }`，建群 |
| `GET` | `/api/groups` | 我的群 |
| `GET` | `/api/groups/:groupId` | 群详情 |
| `GET` | `/api/groups/:groupId/members` | 群成员列表 |
| `POST` | `/api/groups/:groupId/members` | body: `{ username }`，向好友发**入群邀请** |
| `GET` | `/api/groups/invites/incoming` | 收到的入群邀请 |
| `POST` | `/api/groups/invites/:inviteId/accept` | 同意入群 |
| `POST` | `/api/groups/invites/:inviteId/reject` | 拒绝邀请 |
| `DELETE` | `/api/groups/:groupId/members/me` | 退群（群主退群则解散） |

> 路径与字段以 `server/index.js` 为准；若与上表不一致，以代码实现为准。

---

## 生产构建

```bash
npm run build
```

产物位于 `client/dist/`。生产环境需自行配置 **HTTPS**、反向代理，并用进程管理器（如 systemd、PM2）运行 `npm run start`（即 `server` 的 `node index.js`），并确保数据库迁移与 `JWT_SECRET`、`DATABASE_URL` 已正确配置。

---

## 贡献与反馈

欢迎通过 Issue / Pull Request 提出建议或修复。提交前请确保本地迁移可执行、`npm run dev` 可正常运行。

---

## 许可证

本项目以 **[MIT License](LICENSE)** 发布。使用或分发时请保留 `LICENSE` 中的版权声明与许可全文。

---

## English

**Ribbit IM** is a browser-based instant messaging demo: public lobby, friend requests & DMs, and user-created groups. Stack: **Node.js (Express) + PostgreSQL + Socket.io** on the backend, **Vite + React + TypeScript** on the frontend. Chat history and social graph are persisted in PostgreSQL.

**Quick start**: install Node 18+, run `docker compose up -d`, copy `server/.env.example` to `server/.env`, set `DATABASE_URL` / `JWT_SECRET`, run `npm run migrate --prefix server`, then `npm run dev` from the repo root. Open <http://localhost:5173>.

For API details see the table above or `server/index.js`. Licensed under the [MIT License](LICENSE).
