# VoteHope

Self-hosted multiple-choice quizzes and polls for the classroom. The presenter
creates quizzes in the browser and runs them live (students follow one question
at a time on their phones, joining by QR code) or as self-paced quizzes.
No accounts, no third-party services: everything stays on your server.

> Work in progress. See [SPEC.md](SPEC.md) for the design and roadmap.

## Development

Requires Node.js 24 or newer.

```bash
npm install
cp .env.example .env   # then set ADMIN_PASSWORD
npm run dev            # API on :3000, app on http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm run dev` | Server (auto-restarts) + Vite dev server with hot reload |
| `npm test` | Run the test suite |
| `npm run check` | Type-check server and Svelte code |
| `npm run build` | Build the front end into `dist/client` |
| `npm start` | Run the server, serving the built front end on :3000 |
| `npm run hash-password` | Print a hash for `ADMIN_PASSWORD_HASH` |

## Configuration

Environment variables (or a `.env` file):

| Variable | Default | Meaning |
|---|---|---|
| `ADMIN_PASSWORD_HASH` | — | Hashed admin password (preferred) |
| `ADMIN_PASSWORD` | — | Plain admin password (if no hash is set) |
| `PUBLIC_URL` | address in the presenter's browser | Address students use; encoded in join links and QR codes |
| `PORT` | `3000` | HTTP port |
| `HOST` | `127.0.0.1` (dev) / `0.0.0.0` (production) | Interface to listen on |
| `DATA_DIR` | `./data` | Database, uploaded images, session secret |
| `TRUST_PROXY` | `false` | Set to `true` behind a reverse proxy |
| `SESSION_SECRET` | generated | Key for signing login cookies |

## Deployment

The repository includes a `Dockerfile` and an example `docker-compose.yml`
that runs VoteHope behind [Caddy](https://caddyserver.com) for automatic HTTPS.
Edit the domain in `docker-compose.yml` and `deploy/Caddyfile`, put
`ADMIN_PASSWORD_HASH=…` in `.env`, then:

```bash
docker compose up -d --build
```

All data lives in the `votehope-data` volume (SQLite database and images).
