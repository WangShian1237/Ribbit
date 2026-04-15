# Ribbit IM

网页即时通信（大厅、好友私聊、群聊）。技术栈：Node.js、PostgreSQL、Socket.io、Vite、React、TypeScript。

## 快速开始

需要 **Node.js 18+**、**Docker**（本地 PostgreSQL；端口 **5433**）。

```bash
git clone https://github.com/WangShian1237/Ribbit.git
cd Ribbit
npm install && npm install --prefix client && npm install --prefix server

docker compose up -d
copy server\.env.example server\.env   # Linux/macOS: cp server/.env.example server/.env
# 编辑 server/.env：DATABASE_URL（示例 postgresql://ribbit:ribbit@127.0.0.1:5433/ribbit）、JWT_SECRET、PORT（默认 3001）

npm run migrate --prefix server
npm run dev
```

浏览器打开 <http://localhost:5173>（Vite 将 `/api`、`/socket.io` 代理到本机 `3001`）。

## 许可证

[MIT](LICENSE)
