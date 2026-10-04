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

You need no domain and no certificate: any machine on the same Wi-Fi will do, and
students reach it by its address on that network. One command does the whole thing:

```bash
npm install
npm run serve:lan
```

It works out this machine's address on the network, builds the front end if that
has not been done yet, asks for a presenter password the first time — storing only
its hash, in `.env` — and then prints what to open:

```
──────────────────────────────────────────────────────────
  VoteHope is running on this network.

  Students     http://192.168.1.23:3000
  Presenter    http://192.168.1.23:3000/admin
──────────────────────────────────────────────────────────
```

Join links and QR codes carry that address, so the phones on the Wi-Fi can open
them. The address is worked out again at every start, so when the router hands
this machine a different one, stopping with Ctrl+C and running the command again
is all it takes.

A few things worth knowing about this mode:

- Everything works over plain HTTP except the browser's clipboard API, so "Copy
  link" falls back to selecting the text.
- The machine has to stay awake and on the same network for the whole session.
- The first time, macOS asks whether "node" may accept incoming network
  connections, and it has to be allowed. Refused, phones cannot connect while the
  presenter's own browser — which never leaves the machine — works perfectly, so
  everything looks fine from the front of the room. To undo a refusal: System
  Settings → Network → Firewall → Options. On Linux, open the port the usual way
  (`sudo ufw allow 3000`).
- The same symptom — phones cannot connect, this machine can — also comes from
  school networks that keep devices from talking to each other ("client isolation"
  or "AP isolation"). A phone hotspot is the quick way around that one.

To do it by hand instead — for a fixed address, or a name from the school's own
DNS — set `PUBLIC_URL` yourself and serve the built front end:

```bash
npm run build
PUBLIC_URL=http://192.168.1.23:3000 ADMIN_PASSWORD='your password' HOST=0.0.0.0 npm start
```

Opening the admin page through the machine's network address rather than
`localhost` is enough even without `PUBLIC_URL`: join links copy whatever address
you are using. If one ever shows `localhost`, VoteHope warns you, since phones
cannot resolve it.

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

## Writing quizzes without the editor

A quiz can also be written as a text file — by hand, or by a script that turns existing
material into questions — and brought in with **Import** on the quiz list. It then
opens in the editor, which points out anything still incomplete (a missing option, no
correct answer marked) before the quiz can be run.

Two formats are accepted: **Markdown**, the easier one to write by hand, and **JSON**,
handy for scripts. Either can be imported on its own or zipped together with its
images. Save the file as UTF-8, which most editors do by default.

### Markdown

```markdown
# Derivatives: warm-up {time=45}

A few questions to start the class.

## What is the derivative of $x^2$?

- [ ] $x$
- [x] $2x$
- [ ] $\frac{x^3}{3}$

## Which functions are continuous at every real number?

- [x] $\sin x$
- [x] $|x|$
- [ ] $\frac{1}{x}$

## How confident do you feel about the chain rule? {time=20}

- Very
- Somewhat
- Not yet
```

- The file starts with the quiz title, after `#`. Text between it and the first
  question is the quiz's description.
- Each question starts with `##`. The heading is the question, and whatever comes
  between it and the options — more text, formulas, an image — is added below it. A
  bare `##` starts a question with what follows it, a picture for instance.
- The options are the list that ends the question: `- [x]` marks a correct option and
  `- [ ]` a wrong one. With more than one correct, students may choose several.
- Options without boxes, like `- Very`, make the question a **poll**: there is no right
  answer, and only how many chose each option is reported.
- Formulas go between `$…$` or `$$…$$` as in the editor, with single backslashes:
  `$\frac{1}{2}$`.
- Settings go in braces at the end of a heading. `{time=20}` gives a question its own
  time, in seconds from 5 to 600; on the `#` title it sets the time of every question,
  otherwise 30. `{multiple}` lets students choose more than one option even when only
  one is correct, or in a poll. They combine: `{time=20 multiple}`.
- Lines of `---` between questions are ignored, and so are `<!-- comments -->`.

If the question itself ends with a list, mark that list with `*` and the options with
`-`: two lists in a row with the same marker are read as one.

### JSON

The same kind of quiz, for scripts. Only the title, the questions and their options are
required:

```json
{
  "title": "Derivatives: warm-up",
  "questions": [
    {
      "body": "What is the derivative of $x^2$?",
      "options": [
        { "body": "$x$" },
        { "body": "$2x$", "correct": true },
        { "body": "$\\frac{x^3}{3}$" }
      ]
    },
    {
      "kind": "poll",
      "body": "How confident do you feel about the chain rule?",
      "timeLimitS": 20,
      "options": [
        { "body": "Very" },
        { "body": "Somewhat" },
        { "body": "Not yet" }
      ]
    }
  ]
}
```

**Backslashes.** In JSON every backslash is written twice: `\\frac`, `\\theta`,
`\\sqrt`. With a single one, some commands make the file invalid (`\sqrt`, `\sin`)
while others quietly turn into invisible characters (`\frac`, `\theta`, `\times`,
`\nabla`). The import catches the usual cases and says where they are. A line break
inside a text is written `\n`.

**Quiz**

| Field | If left out | Meaning |
|---|---|---|
| `title` | required | Up to 200 characters |
| `questions` | required | Up to 200 questions |
| `description` | empty | Notes about the quiz, up to 2000 characters |
| `defaultTimeLimitS` | `30` | Seconds for each question, from 5 to 600, in live sessions and in self-paced sessions timed per question |

**Question**

| Field | If left out | Meaning |
|---|---|---|
| `body` | required | The question: Markdown with `$…$` and `$$…$$` formulas, up to 10 000 characters |
| `options` | required | 2 to 10 options |
| `kind` | `"quiz"` | `"quiz"` has correct options; `"poll"` has none, and only how many chose each option is reported |
| `selection` | follows from the options | `"single"` (students choose one option) or `"multiple"` (one or more). Left out, it is `"multiple"` when more than one option is correct |
| `timeLimitS` | the quiz's | Seconds for this question alone |

**Option**

| Field | If left out | Meaning |
|---|---|---|
| `body` | required | Markdown with formulas, up to 2000 characters |
| `correct` | `false` | Whether choosing it is right. A question counts as right only when exactly the correct options are chosen |

Questions and options may also have an `id`; one is made up when it is missing.

### Images

Put the images in a `media` folder beside the quiz file, show them with
`![description](media/graph.png)`, and zip the two together:

```
derivatives/
├── quiz.md
└── media/
    ├── graph.png
    └── circuit.svg
```

```bash
cd derivatives && zip -r ../derivatives.zip quiz.md media
```

In a zip, the quiz is `quiz.md` or `quiz.json`, or else the only `.md` file in it.
Compressing the folder in the Finder or in Windows Explorer works just as well. PNG,
JPEG, WebP, GIF and SVG images up to 15 MB are accepted, and are treated like images
added in the editor: photos are scaled down and lose their metadata.

### When something is wrong

The import lists each problem it finds and where it is: the line, in a Markdown file
(`Line 12: text after the options…`), or the question and field, in a JSON one
(`Question 3 › option 2 › correct: …`). A file with problems is not imported at all; a
quiz that is merely incomplete is imported, and the editor shows what is missing.

**Export** on the quiz list produces a zip in the JSON format, with every `id` filled in
and the quiz wrapped as `{"format": "votehope-quiz", "version": 1, "quiz": …}`, which
imports just as well.

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
