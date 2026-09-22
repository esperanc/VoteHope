# VoteHope — Specification (draft for review)

A self-hosted multiple-choice quiz and polling system for classrooms. One person
(the owner/presenter) authors quizzes and runs sessions; students join from their
phones via QR code. Anyone can host their own copy — there are no user accounts
and no third-party services.

---

## 1. Decisions so far

| Topic | Decision |
|---|---|
| Users | Single admin (the presenter). No accounts. Admin password configured on the server. |
| What needs the password | Creating/editing quizzes, uploading images, creating/controlling sessions, viewing results. |
| Participants | Anonymous-ish: type a name (email optional). No password. |
| Scale | ≤ 50 participants per session, never more than one live session at a time. |
| Reuse | A quiz can be run in many sessions. |
| Languages | UI in Portuguese and English. Quiz content is whatever the author writes. |
| Hosting | Self-hosted, one Docker container + SQLite file + uploads folder. No external CDNs or services. |
| Question kinds | **Quiz** (one or more correct options) and **Poll** (no correct option). |
| Content | Markdown with LaTeX formulas (`$…$`, `$$…$$`) and images, in questions and options. |
| Scoring | One point per quiz question, **all-or-nothing** (selected set must equal correct set). No speed bonus. Polls are not scored. |
| Shuffling | Options always shuffled per participant. Questions shuffled only in async mode. |
| Sync: time-up | Answers lock; phones show "time up"; projector shows the results chart; **presenter clicks Next**. |
| Sync: reveal | **Answer distribution chart on projector only.** No correct-answer highlight, no right/wrong on phones, no leaderboard. |
| Stack | TypeScript on Node.js (server) + TypeScript in the browser. |
| Hosting target | Open — Docker makes it portable. |

---

## 2. Concepts

- **Quiz** — reusable template: title, description, default time limit, ordered questions.
- **Question** — Markdown body, kind (`quiz` | `poll`), selection mode (`single` | `multiple`),
  optional time limit override, 2–10 options.
- **Option** — Markdown body (may contain formula/image), `isCorrect` flag (always false for polls).
- **Session** — one run of a quiz, in `sync` or `async` mode, with its own join code,
  settings, participants and answers. At creation the quiz content is **snapshotted**
  into the session, so later edits to the quiz never corrupt past results.
- **Participant** — a name (+ optional email) inside one session, identified by a
  random token stored on their device.
- **Answer** — the set of option ids a participant selected for one question (or none).

### Validation rules
- `quiz` + `single`: exactly 1 correct option → rendered as radio buttons.
- `quiz` + `multiple`: ≥ 1 correct option → checkboxes, with the hint "select all that apply".
  (The author may choose `multiple` even with 1 correct option, to avoid giving hints.)
- `poll` + `single` / `multiple`: 0 correct options.

---

## 3. Joining (both modes)

- Each session gets a 6-digit code, never reused. Join URL: `PUBLIC_URL/j/482913` (without
  `PUBLIC_URL`, the address the presenter's browser is using). The QR code encodes that URL.
- Student enters a name (1–40 chars) and optionally an email.
  Names are unique within a session (case- and accent-insensitive comparison).
- The server returns a participant token, kept in the phone's `localStorage`.
  Reloading the page, locking the screen or losing connectivity brings the student
  back as the same participant — no re-typing.
- Resuming from a *different* device is not possible (otherwise anyone could type
  someone else's name and take over). The presenter can remove a participant, freeing the name.
- Names are always HTML-escaped when displayed (they appear on the projector).

---

## 4. Synchronous mode

### 4.1 Session state machine (server-authoritative)

```
LOBBY ──start──▶ OPEN(q1) ──deadline or "close now"──▶ CLOSED(q1) ──Next──▶ OPEN(q2) … ──▶ FINISHED
                                                                         └──End──▶ FINISHED
```

- Only the server changes state; clients only render the current state.
- State (`phase`, `questionIndex`, `deadline`) is persisted to SQLite on every change,
  so a server restart mid-class resumes correctly (an `OPEN` question whose deadline
  passed during the restart becomes `CLOSED`).
- Questions are in authored order; options shuffled per participant.

### 4.2 Timing
- When a question opens, the server broadcasts an **absolute deadline** (server clock).
- Each client measures its clock offset to the server at connect (ping round-trip) and
  displays a countdown corrected by that offset.
- The client disables input at its local deadline; the server accepts answers received
  up to a **grace period** (default 1 s, configurable) after the deadline, to absorb
  network latency, and rejects later ones.
- The presenter can close the question early (e.g. when everyone has answered).

### 4.3 Answers
- Student selects option(s) and taps **Submit**. The answer is then locked.
- Not answering before the deadline = unanswered (counts as wrong for quiz questions).
- Latecomers may join at any time; they start at the current question.

### 4.4 Screens

**Presenter / projector (laptop, admin-authenticated)**
- Lobby: large QR code, join code, URL, live list/count of joined names, button to remove a name, **Start**.
- Question open: question text (rendered formulas/images), options, countdown,
  "answered: 23 / 31", **Close now**.
- Question closed: bar chart of how many chose each option (no correct-answer highlight), **Next** / **End**.
- Finished: "Quiz finished" + link to results (results page is for the presenter, not projected by default).
- Keyboard: → or Page Down performs the main action (start, close question, next question),
  so a presentation clicker can drive the session. The join address stays visible in the top
  bar during questions for latecomers.

**Student (phone)**
- Join form → "Waiting for the presenter to start…"
- Question: text, shuffled options, Submit, countdown.
- After submitting: "Answer received — waiting for the others."
- Time up without answer: "Time's up!"
- Between questions: "Waiting for the next question…"
- Finished: "Thank you!" (no score shown in sync mode, per current decision).

### 4.5 Connectivity
- Real-time transport: **Socket.IO** (automatic reconnection, heartbeats, fallback to
  HTTP long-polling on hostile networks).
- On every (re)connect the client sends its token and receives a **full state snapshot**
  (current phase, question, deadline, whether it already answered). No incremental
  state is trusted across disconnects. This covers: iOS Safari killing sockets when
  the screen locks, app switching, Wi-Fi hiccups, presenter refreshing the page.
- The session keeps running if the presenter's laptop disconnects; timers are on the server.

---

## 5. Asynchronous mode

- Session settings:
  - Optional **opens at / closes at** date-times.
  - **Timer mode:** `none` | `total` (whole quiz, e.g. 20 min) | `perQuestion` (uses each question's limit).
  - **Show score at the end:** yes / no.
- Questions and options shuffled per participant (deterministic from participant id,
  so a reload shows the same order).
- One attempt per name. Resume on the same device via token.
- Navigation:
  - `none` / `total`: student can move back and forth and change answers freely.
  - `perQuestion`: forward only; when a question's time is up it is recorded as
    unanswered, a "time's up" message appears, and the next question is shown automatically.
    A question's clock keeps running while the phone is locked; a student who returns after
    it ran out continues with the next question and its full time (breaks between questions
    are possible, stretching a question is not).
- Timers start when the student taps **Start** on the intro screen, not when they join.
- Answers are saved to the server as they are chosen (nothing lost if the phone dies).
- The attempt ends with a **review screen** listing unanswered questions →
  "Submit answers". Only then is the attempt considered complete. With a timer per
  question there is nothing left to review, so leaving the last question submits.
- If the total timer expires or the session closes, the attempt is auto-submitted with
  whatever was answered.
- All timers are enforced by the server (start time stored); the client countdown is cosmetic.

---

## 6. Results

Per session (admin only):
- **Participants table:** name, email, correct / total quiz questions, answered count,
  (async) started / submitted times.
- **Per-question view:** distribution of choices (count and %); for quiz questions, % correct.
  Polls show distribution only.
- **Matrix view:** participants × questions, ✓ / ✗ / — (unanswered).
- **CSV export:** UTF-8 with BOM (opens correctly in Excel). Separator `;` when the UI
  is in Portuguese (matches pt-BR Excel), `,` otherwise. One row per student with the
  option letters (in editor order) chosen for each question; built in the browser.
- Per quiz: list of all its sessions with date, mode, participant count.
- Delete a session and its data.

---

## 7. Admin and security

- Configuration via environment variables: `ADMIN_PASSWORD` (or `ADMIN_PASSWORD_HASH`),
  `PUBLIC_URL`, `PORT`, `DATA_DIR`.
- Login page → signed, HTTP-only, `SameSite=Lax` session cookie.
- Login attempts rate-limited. Participant endpoints are **not** rate-limited per IP
  aggressively, because a whole classroom usually shares one public IP (NAT).
- All admin routes and admin socket events require the cookie.
- Markdown rendered to HTML is sanitized (DOMPurify).
- HTTPS expected in production (via a reverse proxy such as Caddy, which obtains
  certificates automatically). Example `docker-compose.yml` provided.

---

## 8. Authoring (quiz editor)

- Quiz list: create, duplicate, delete, open.
- Quiz editor: title, description, default time limit; list of questions (add, delete,
  duplicate, reorder by drag or up/down buttons).
- Question editor: kind, selection mode, time limit override, Markdown body with
  **live preview** (formulas + images rendered exactly as students will see them),
  options with correct-flag toggles, inline validation messages.
- Image upload (button, drag-and-drop, or paste from clipboard) → inserted as Markdown
  image. Server downsizes to max 1600 px and re-encodes, to keep phone downloads small.
- "Preview as student" (phone-sized) for a whole quiz.
- **Import / export a quiz as a single file** (JSON + images in a zip): backup, and
  sharing quizzes between different VoteHope installations.

---

## 9. Technology

| Layer | Choice | Why |
|---|---|---|
| Runtime | Node.js LTS, TypeScript | Single language, shared types between client and server. |
| HTTP server | Fastify | Fast, typed, good plugin ecosystem (cookies, static files, uploads). |
| Real time | Socket.IO | Reconnection and heartbeats built in. |
| Database | SQLite via `better-sqlite3` | Zero-admin, single file, ample for this scale. |
| Validation | Zod | Shared schemas for API payloads and quiz files. |
| Front end | Svelte + Vite | Small bundles (good on phones), simple component code. |
| Markdown / math | markdown-it + KaTeX, DOMPurify | Rendered in the browser; all assets self-hosted. |
| QR codes | `qrcode` (npm) | Generated locally. |
| Charts | Plain SVG/CSS bars | No chart library needed. |
| Images | `sharp` | Resize/re-encode uploads. |
| i18n | Simple key → string dictionaries (pt, en), browser language detection + toggle | |
| Tests | Vitest; a load script simulating 50 phones joining and answering | |
| Packaging | Multi-stage Dockerfile, `docker-compose.yml` with Caddy example; also runnable with `npm start` | |

Single repository, three front-end areas (admin/editor, presenter, student) in one app
with routes, plus the server.

### Data model (SQLite)

```
quizzes      (id, title, description, default_time_limit_s, questions_json, revision,
              created_at, updated_at)
images       (id, filename, mime, width, height, created_at)

sessions     (id, quiz_id, code, mode, status, settings_json, quiz_snapshot_json,
              phase, question_index, deadline, created_at, started_at, ended_at)
participants (id, session_id, name, name_key, email NULL, token_hash,
              joined_at, started_at NULL, submitted_at NULL, removed INTEGER)
answers      (id, session_id, participant_id, question_id, option_ids_json,
              is_correct NULL, answered_at, UNIQUE(participant_id, question_id))
```

Questions (with their options) are stored as a JSON document on the quiz
(`questions_json`), each with a short random string id. The editor saves whole
quizzes, and `revision` rejects a save based on an outdated copy (e.g. the quiz
open in two windows). `question_id` in `answers` refers to the question id in the
session's snapshot.

Images: raster uploads are scaled to fit 1600×1600 and re-encoded as WebP (which
also strips photo metadata such as GPS position); SVGs are kept as vectors and all
media is served with a sandboxing Content-Security-Policy.

---

## 10. Implementation phases

1. **Skeleton** — repo, TypeScript build, Fastify + Vite, SQLite migrations, admin login,
   i18n scaffolding, Dockerfile. *Outcome: log in to an empty admin page in pt/en.*
2. **Authoring** — quiz editor, Markdown + KaTeX rendering component (shared with the
   student view), image upload, validation, student preview, import/export.
   *Outcome: create a realistic quiz with formulas and images.*
3. **Async mode + results** — session creation, join page + QR, taking the quiz with
   shuffling, timers, confirmation, scoring, results views, CSV.
   *Outcome: a full async quiz can be run and graded.* (Built before sync because it
   exercises the data model, rendering, scoring and results with fewer moving parts.)
4. **Sync mode** — Socket.IO layer, server state machine, deadline/clock-offset logic,
   presenter/projector screens, phone screens, reconnection snapshots, answer chart.
   Tested with the 50-phone simulator and on real phones (iOS Safari + Android Chrome,
   including screen lock mid-question). *Outcome: classroom-ready live sessions.*
5. **Polish** — README for self-hosters (pt/en), deployment example with HTTPS,
   accessibility pass, session deletion, small UX fixes.

---

## 11. Out of scope for now / possible later

- Other question types (free text, numeric, ordering, matching).
- Showing correct answers / right-wrong feedback / scores in sync mode (easy to add as options).
- Presenter remote control from a phone, separate from the projector screen.
- Verified identity (email login links, class rosters).
- LMS integration (Moodle, Google Classroom).
- Automatic data retention / purge policy.

## 12. Open items

- Where it will be hosted (affects only the deployment docs, not the code).
