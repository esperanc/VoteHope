# VoteHope

Self-hosted multiple-choice quizzes and polls for the classroom. You write the
quizzes in your browser and run them either **live** — questions on the projector,
students answering on their phones after scanning a QR code — or **self-paced**,
where each student works through the quiz alone.

No accounts, no subscriptions, no third-party services: the questions, the answers
and the images all stay on the machine you run it on.

*[Leia em português](README.pt.md).*

## What it does

- **Live sessions.** Students join with a QR code or a 6-digit code. You show one
  question at a time and close it when you want; a chart of the answers appears on
  the projector. Phones show no scores and no right/wrong marks.
- **Self-paced sessions.** Students answer on their own, with an optional time
  limit for the whole quiz or per question, and confirm before submitting.
- **Questions** can be quiz questions (one or several correct options) or polls
  (no correct answer, only popularity). Text is Markdown with LaTeX formulas
  (`$x^2$`) and images.
- **Options are always shuffled**; the question order can be shuffled too in
  self-paced sessions.
- **Results** per student, per question and as a grid, downloadable as CSV.
- **Interface in Portuguese and English**, chosen per browser.

It is built for one presenter and up to about 50 students in a session.

## Quick start with Docker

You need [Docker](https://docs.docker.com/get-started/get-docker/) and a domain
name pointing at the machine. The included `docker-compose.yml` runs VoteHope
behind [Caddy](https://caddyserver.com), which gets HTTPS certificates by itself.

```bash
git clone <this repository> votehope && cd votehope
```

1. Replace `quiz.example.org` with your domain in `docker-compose.yml` and in
   `deploy/Caddyfile`.
2. Choose a presenter password and hash it. Compose refuses to run until the hash
   exists, so build the image and call the tool directly:

   ```bash
   docker build -t votehope . && docker run --rm votehope npm run hash-password -- 'your password'
   ```

3. Put the printed line in a `.env` file next to `docker-compose.yml`:

   ```
   ADMIN_PASSWORD_HASH=scrypt:16384:8:1:...
   ```

4. Start it:

   ```bash
   docker compose up -d --build
   ```

Open `https://your.domain/admin`, log in with the password, and write your first
quiz. Students go to `https://your.domain` — or simply scan the QR code.

## On a classroom network, without a domain

You do not need a domain or a certificate: any machine on the same Wi-Fi works.

```bash
npm install
npm run build
ADMIN_PASSWORD='your password' HOST=0.0.0.0 npm start
```

Then open the admin page **through the computer's network address**, not through
`localhost` — for example `http://192.168.1.23:3000/admin`. Join links and QR
codes copy whatever address you are using, so phones on the same network can open
them. (If the join link shows `localhost`, VoteHope warns you: phones cannot
resolve it.) To fix the address once and for all, set `PUBLIC_URL`:

```bash
PUBLIC_URL=http://192.168.1.23:3000 ADMIN_PASSWORD='your password' HOST=0.0.0.0 npm start
```

Over plain HTTP everything works except the browser's clipboard API, so "Copy
link" falls back to selecting the text.

## The presenter password

There are no user accounts. One password protects everything that writes: creating
quizzes, starting sessions and seeing results. Students need no password — only the
session code.

Set it with either variable:

- `ADMIN_PASSWORD_HASH` — preferred. Generate it with `npm run hash-password`;
  the plain password is then never stored on the server.
- `ADMIN_PASSWORD` — the password itself, for a quick local run.

Logins are cookies signed with a key kept in `DATA_DIR`, so they survive restarts.
Changing the password invalidates every login.

## Configuration

Environment variables, or a `.env` file next to the project:

| Variable | Default | Meaning |
|---|---|---|
| `ADMIN_PASSWORD_HASH` | — | Hashed presenter password (preferred) |
| `ADMIN_PASSWORD` | — | Plain presenter password (if no hash is set) |
| `PUBLIC_URL` | address in the presenter's browser | Address students use; encoded in join links and QR codes |
| `PORT` | `3000` | HTTP port |
| `HOST` | `127.0.0.1` (dev) / `0.0.0.0` (production) | Interface to listen on |
| `DATA_DIR` | `./data` | Database, uploaded images, session secret |
| `TRUST_PROXY` | `false` | Set to `true` behind a reverse proxy |
| `SESSION_SECRET` | generated | Key for signing login cookies |

## Your data

Everything lives in `DATA_DIR` (the `votehope-data` volume under Docker):
`votehope.db`, the uploaded images in `media/`, and `session-secret`.

- **Backup:** stop the server and copy that directory.

  ```bash
  docker compose stop votehope
  docker run --rm -v votehope_votehope-data:/data -v "$PWD:/backup" busybox \
    tar czf /backup/votehope-backup.tgz -C /data .
  docker compose start votehope
  ```

  The volume's name begins with the folder you cloned into; `docker volume ls`
  shows the one on your machine.

- **Update:** `git pull && docker compose up -d --build`. The database migrates
  itself on start.
- **Moving a single quiz** between installations does not need a backup: use
  Export and Import in the quiz list, which produces a `.zip` with the questions
  and their images.
- Images that no quiz and no session refers to any more are deleted automatically,
  a day after they were uploaded at the earliest.
- Nothing is sent anywhere else. Students are identified by the name (and
  optionally the email) they type when joining, and you can delete a session with
  all its answers at any time.

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

[SPEC.md](SPEC.md) describes how the system is meant to behave and why;
[CLAUDE.md](CLAUDE.md) holds the conventions the code follows.
