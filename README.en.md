# Ribbit IM

English | **[中文](README.md)**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Browser-based instant messaging demo: public lobby, friend DMs, and group chat. Data is persisted in PostgreSQL; real-time transport uses Socket.io.

## About this repository

| | |
| --- | --- |
| **Stack** | Node.js (Express), PostgreSQL, `pg`, Socket.io, Vite, React, TypeScript |
| **Use case** | Learning or small personal projects. For production, harden deployment yourself (HTTPS, secrets, rate limiting—some basics are already covered by middleware). |

This README follows [GitHub’s guidance on README files](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes): help visitors understand the project, run it locally, and collaborate.

## Prerequisites

- [Node.js](https://nodejs.org/) **18+**
- [Docker](https://www.docker.com/) (for `docker compose` to run PostgreSQL locally; you may also use your own database and adjust `DATABASE_URL`)

## Getting started

**1. Clone and install dependencies**

```bash
git clone https://github.com/WangShian1237/Ribbit.git
cd Ribbit
npm install
npm install --prefix client
npm install --prefix server
```

**2. Start PostgreSQL**

```bash
docker compose up -d
```

By default the database is exposed on host port **5433** (see [`docker-compose.yml`](docker-compose.yml) in the repo root).

**3. Configure environment**

Copy [`server/.env.example`](server/.env.example) to `server/.env` and set at least:

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | e.g. `postgresql://ribbit:ribbit@127.0.0.1:5433/ribbit` (matches the default compose settings) |
| `JWT_SECRET` | A strong random secret; **never** commit real `.env` files to Git |
| `PORT` | Optional, default `3001` |

**4. Run migrations**

```bash
npm run migrate --prefix server
```

**5. Start the app**

```bash
npm run dev
```

Open **<http://localhost:5173>** in your browser. In development, Vite proxies `/api` and `/socket.io` to `http://127.0.0.1:3001` (see [`client/vite.config.ts`](client/vite.config.ts)).

## Development notes

- `npm run dev` at the repo root runs the client and server together (see the root [`package.json`](package.json)).
- Production build: `npm run build` (output in `client/dist/`); run the backend with `npm run start --prefix server`. Configure a reverse proxy and TLS for deployment.

## Need help?

Please [open an Issue](https://github.com/WangShian1237/Ribbit/issues) in this repository.

## Contributing

Pull requests are welcome. For larger changes, open an Issue first to discuss.

## License

This project is licensed under the [MIT License](LICENSE).
