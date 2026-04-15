# Ribbit IM

**[English](README.en.md)** | 中文

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

浏览器端即时通信示例：公共大厅、好友私聊与群聊；数据持久化在 PostgreSQL，实时通道为 Socket.io。

## 关于本仓库

| | |
| --- | --- |
| **技术栈** | Node.js (Express)、PostgreSQL、`pg`、Socket.io、Vite、React、TypeScript |
| **适用场景** | 学习或个人小项目模板；生产环境请自行加固（HTTPS、密钥、限流等已由基础中间件覆盖部分场景） |

本仓库的说明结构参考 [GitHub 对 README 的说明](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes)，便于他人了解项目、上手运行与协作。

## 环境要求

- [Node.js](https://nodejs.org/) **18+**
- [Docker](https://www.docker.com/)（用于 `docker compose` 启动本地 PostgreSQL；也可用自建数据库并修改 `DATABASE_URL`）

## 快速开始

**1. 克隆并安装依赖**

```bash
git clone https://github.com/WangShian1237/Ribbit.git
cd Ribbit
npm install
npm install --prefix client
npm install --prefix server
```

**2. 启动 PostgreSQL**

```bash
docker compose up -d
```

默认将数据库映射到本机端口 **5433**（见仓库根目录 [`docker-compose.yml`](docker-compose.yml)）。

**3. 配置环境变量**

将 [`server/.env.example`](server/.env.example) 复制为 `server/.env`，并至少设置：

| 变量 | 说明 |
| --- | --- |
| `DATABASE_URL` | 例如 `postgresql://ribbit:ribbit@127.0.0.1:5433/ribbit`（与 compose 默认一致） |
| `JWT_SECRET` | 随机强密钥；**切勿**将真实 `.env` 提交到 Git |
| `PORT` | 可选，默认 `3001` |

**4. 执行数据库迁移**

```bash
npm run migrate --prefix server
```

**5. 启动应用**

```bash
npm run dev
```

在浏览器打开 **<http://localhost:5173>**。开发模式下，Vite 将 `/api` 与 `/socket.io` 代理到 `http://127.0.0.1:3001`（见 [`client/vite.config.ts`](client/vite.config.ts)）。

## 开发说明

- 根目录 `npm run dev` 会同时启动前端与后端（见根目录 [`package.json`](package.json)）。
- 生产构建：`npm run build`（输出在 `client/dist/`），后端以 `npm run start --prefix server` 运行；部署时需自行配置反向代理与 TLS。

## 获取帮助

如有问题，请在仓库中 [提交 Issue](https://github.com/WangShian1237/Ribbit/issues)。

## 参与贡献

欢迎通过 Pull Request 改进本项目；较大改动建议先开 Issue 说明意图。

## 许可证

本项目使用 [MIT License](LICENSE)。
