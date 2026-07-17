# AI Quiz Generator — Software Requirements Specification & Product Blueprint

**Version:** 1.0
**Prepared for:** Mrunal, AKOS Web Studios
**Target:** Mobile-first, production-grade EdTech SaaS
**Scale target:** Hundreds of concurrent users at launch, architected to scale further

---

## 1. Product Overview

AI Quiz Generator is a web platform where faculty upload study material (PDF/DOC/DOCX) and an AI engine converts it into a configurable quiz in minutes. Students take the quiz on any device — mobile is the primary surface — and get instant, detailed results. Faculty get a live analytics dashboard showing performance, weak topics, and leaderboards.

**Core value proposition:** turn a lecture PDF into a graded, analyzed quiz in under 5 minutes, with zero manual question-writing.

**Who it's for:** colleges/universities first (matches your FixMyCity/academic context), but the architecture is generic enough to sell to coaching institutes and corporate L&D later.

**Non-negotiables driving every design decision below:**
- Mobile is the primary client — every screen is designed mobile-first, then scaled up.
- Must comfortably handle several hundred concurrent quiz-takers (a class taking an exam simultaneously is the worst-case load spike).
- No heavy frontend framework — HTML + Tailwind + vanilla JS/GSAP, so it stays fast on low-end Android devices common in Indian colleges.

---

## 2. Feature Breakdown

### 2.1 Faculty
- Secure login (email/password + optional Google OAuth)
- Create/manage classes, subjects
- Upload PDF/DOC/DOCX study material
- Configure AI generation: question types, count, difficulty, Bloom's taxonomy level
- Review/edit AI-generated questions before publishing (critical — never auto-publish unreviewed AI output)
- Configure quiz rules: timer, negative marking, shuffle, attempts, start/end window, pass %
- Dashboard: analytics cards, charts, leaderboard, question-wise breakdown
- Export results (CSV/Excel/PDF)
- Per-student report drill-down

### 2.2 Student
- Register/login, join class via code
- View available/upcoming/past quizzes
- Attempt quiz: timer, progress bar, question nav, mark-for-review, autosave, auto-submit
- Instant results: score, correct/wrong/skipped, full review with explanations
- Personal profile: quiz history, improvement graph, strong/weak topics, rank

### 2.3 Admin (optional, recommended from day one for a real product)
- Manage faculty/student accounts, departments, subjects
- Storage usage monitoring
- Role & permission management
- System-wide analytics

---

## 3. User Flow

**Faculty flow:**
Login → Select/Create Class → Select/Create Subject → Upload Document → AI processes (async, faculty sees progress) → Review/edit generated questions → Configure quiz settings → Publish → Monitor live dashboard as students attempt → Export/analyze results.

**Student flow:**
Login → Join class (one-time, via code) → See "Available Quizzes" → Tap Start → Attempt (timer running) → Submit (manual or auto) → Instant Result screen → Review answers → Return to dashboard, see updated rank/history.

**Critical UX decision:** AI generation is asynchronous. Faculty should never stare at a blinking spinner for 2 minutes. Show a progress state ("Extracting text… Identifying topics… Drafting 30 questions…") and let them navigate away; notify when done (in-app + email).

---

## 4. UI Wireframe Description (Mobile-First)

Since mobile is the primary target, every wireframe below is described bottom-up: base layout at ~375–414px width, then how it expands at tablet (768px) and desktop (1280px+).

**Global shell:**
- Mobile: bottom tab bar (Home, Quizzes, Leaderboard/Analytics, Profile) — thumb-reachable, not a hamburger sidebar.
- Tablet/desktop: bottom bar becomes a left sidebar; top bar adds search + notifications.
- Sticky top bar: logo/back button, page title, avatar.

**Faculty Dashboard (mobile):** vertically stacked stat cards (2-per-row grid), horizontally scrollable chart carousel, "Recent Quizzes" list below, floating action button (FAB) bottom-right → "Create Quiz."

**Quiz Attempt Screen (mobile) — the most important screen in the product:**
- Fixed top: timer (color shifts amber → red under 2 min) + progress bar (Q7/30).
- Question body: large readable type, generous line-height, MCQ options as full-width tap targets (min 48px height, thumb-friendly).
- Fixed bottom bar: Previous | Mark for Review | Next, with Submit surfaced only on the last question or via a swipe-up sheet.
- No modals blocking the timer view; confirmations use bottom sheets, not center dialogs (easier one-thumb dismissal).

**Result Screen (mobile):** score ring (animated with GSAP) at top, summary chips (Correct/Wrong/Skipped) below, then a scrollable per-question review list with green/red left-border cards.

---

## 5. Screen-by-Screen Design

| # | Screen | Key Elements |
|---|--------|--------------|
| 1 | Landing | Hero, how-it-works (3 steps), CTA, testimonials placeholder |
| 2 | Login/Signup | Role toggle (Faculty/Student), email/password, OAuth |
| 3 | Faculty Dashboard | Stat cards, charts, recent quizzes, FAB |
| 4 | Class/Subject Manager | List + create modal (bottom sheet on mobile) |
| 5 | Upload & Configure | Drag-drop/tap-to-upload, format validation, generation options form |
| 6 | Generation Progress | Step tracker, cancel option |
| 7 | Question Review/Edit | Card-per-question, inline edit, delete, regenerate single question |
| 8 | Quiz Settings | Timer, negative marking, shuffle, dates, pass % — grouped in collapsible sections |
| 9 | Student Dashboard | Available quizzes, upcoming, past, streak/rank widget |
| 10 | Join Class | Code entry |
| 11 | Quiz Attempt | As described in §4 |
| 12 | Result Screen | Score ring, summary, review list |
| 13 | Analytics Dashboard | Question-wise table, charts, leaderboard tabs |
| 14 | Student Report | History graph, topic strength radar/bar, rank |
| 15 | Admin Panel | Tables for users/departments/subjects, role editor |
| 16 | Profile/Settings | Avatar, password change, dark/light toggle, notification prefs |

---

## 6. Database Schema

Relational (PostgreSQL) — quizzes/results are inherently relational with strong integrity needs (a wrong FK here means a broken exam). Below is the core schema; types are Postgres-flavored.

```sql
-- USERS (base identity table, faculty/student/admin share this)
users (
  id UUID PK,
  name VARCHAR,
  email VARCHAR UNIQUE,
  password_hash VARCHAR,
  role ENUM('faculty','student','admin'),
  department VARCHAR,
  avatar_url VARCHAR,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

-- CLASSES
classes (
  id UUID PK,
  name VARCHAR,
  join_code VARCHAR UNIQUE,
  faculty_id UUID FK -> users.id,
  created_at TIMESTAMPTZ
)

-- CLASS_STUDENTS (many-to-many)
class_students (
  id UUID PK,
  class_id UUID FK -> classes.id,
  student_id UUID FK -> users.id,
  joined_at TIMESTAMPTZ,
  UNIQUE(class_id, student_id)
)

-- SUBJECTS
subjects (
  id UUID PK,
  name VARCHAR,
  class_id UUID FK -> classes.id,
  created_at TIMESTAMPTZ
)

-- DOCUMENTS
documents (
  id UUID PK,
  subject_id UUID FK -> subjects.id,
  uploaded_by UUID FK -> users.id,
  file_name VARCHAR,
  file_url VARCHAR,        -- S3/R2 object key
  file_type ENUM('pdf','doc','docx'),
  extracted_text_url VARCHAR,  -- pointer to processed text (not stored inline)
  status ENUM('uploaded','processing','processed','failed'),
  created_at TIMESTAMPTZ
)

-- QUIZZES
quizzes (
  id UUID PK,
  subject_id UUID FK -> subjects.id,
  document_id UUID FK -> documents.id,
  created_by UUID FK -> users.id,
  title VARCHAR,
  description TEXT,
  timer_minutes INT,
  negative_marking BOOLEAN DEFAULT false,
  negative_mark_value DECIMAL DEFAULT 0,
  shuffle_questions BOOLEAN DEFAULT true,
  shuffle_options BOOLEAN DEFAULT true,
  allow_resume BOOLEAN DEFAULT true,
  max_attempts INT DEFAULT 1,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  pass_percentage DECIMAL,
  status ENUM('draft','published','closed'),
  created_at TIMESTAMPTZ
)

-- QUESTIONS
questions (
  id UUID PK,
  quiz_id UUID FK -> quizzes.id,
  type ENUM('mcq','fill_blank','true_false','short_answer'),
  text TEXT,
  topic VARCHAR,
  difficulty ENUM('easy','medium','hard'),
  bloom_level ENUM('remember','understand','apply','analyze','evaluate','create'),
  marks DECIMAL,
  explanation TEXT,
  source_reference TEXT,   -- excerpt/page pointer into the document for traceability
  order_index INT,
  created_at TIMESTAMPTZ
)

-- OPTIONS (for MCQ/true-false)
options (
  id UUID PK,
  question_id UUID FK -> questions.id,
  text VARCHAR,
  is_correct BOOLEAN,
  order_index INT
)

-- QUIZ_ATTEMPTS
quiz_attempts (
  id UUID PK,
  quiz_id UUID FK -> quizzes.id,
  student_id UUID FK -> users.id,
  attempt_number INT,
  started_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  status ENUM('in_progress','submitted','auto_submitted'),
  time_taken_seconds INT,
  UNIQUE(quiz_id, student_id, attempt_number)
)

-- STUDENT_ANSWERS
student_answers (
  id UUID PK,
  attempt_id UUID FK -> quiz_attempts.id,
  question_id UUID FK -> questions.id,
  selected_option_id UUID FK -> options.id NULL,
  answer_text TEXT NULL,       -- for fill-blank/short-answer
  is_correct BOOLEAN,
  marks_obtained DECIMAL,
  is_marked_for_review BOOLEAN DEFAULT false,
  answered_at TIMESTAMPTZ
)

-- RESULTS (denormalized summary per attempt, for fast dashboard reads)
results (
  id UUID PK,
  attempt_id UUID FK -> quiz_attempts.id UNIQUE,
  total_marks DECIMAL,
  marks_obtained DECIMAL,
  percentage DECIMAL,
  correct_count INT,
  wrong_count INT,
  skipped_count INT,
  pass_fail ENUM('pass','fail'),
  rank INT NULL,
  created_at TIMESTAMPTZ
)

-- QUESTION_ANALYTICS (aggregated, recomputed on a schedule or trigger)
question_analytics (
  id UUID PK,
  question_id UUID FK -> questions.id UNIQUE,
  correct_pct DECIMAL,
  wrong_pct DECIMAL,
  skipped_pct DECIMAL,
  most_selected_option_id UUID FK -> options.id NULL,
  avg_response_time_seconds DECIMAL,
  updated_at TIMESTAMPTZ
)

-- SESSIONS (refresh tokens / device tracking)
sessions (
  id UUID PK,
  user_id UUID FK -> users.id,
  refresh_token_hash VARCHAR,
  device_info VARCHAR,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
```

**Relationships summary:** `users 1—N classes (as faculty)`, `classes N—N users (as students, via class_students)`, `classes 1—N subjects`, `subjects 1—N documents`, `subjects 1—N quizzes`, `quizzes 1—N questions`, `questions 1—N options`, `quizzes 1—N quiz_attempts`, `quiz_attempts 1—N student_answers`, `quiz_attempts 1—1 results`.

**Normalization:** schema is in 3NF. The one deliberate denormalization is `results` (summary fields duplicated from what could be derived from `student_answers`) and `question_analytics` — both are read-heavy, dashboard-facing aggregates, recomputed asynchronously so we never do expensive live aggregation queries when a faculty member opens their dashboard.

**Indexes to add day one:** `quiz_attempts(quiz_id, student_id)`, `student_answers(attempt_id)`, `questions(quiz_id)`, `results(attempt_id)`, `class_students(class_id)`.

---

## 7. ER Diagram Explanation

Center of gravity: `quizzes`. A `subject` (owned by a `class`, owned by `faculty`) can generate many `documents`, each `document` can back one or more `quizzes`, each `quiz` has many `questions`, each `question` has many `options` (for MCQ). On the attempt side, a `student` creates a `quiz_attempt` for a `quiz`, which produces many `student_answers` (one per question) and exactly one `results` row. `question_analytics` sits off to the side as an aggregate table, recomputed from `student_answers` across all attempts of a question — this is what powers the faculty's question-wise analysis without re-scanning raw answer data on every dashboard load.

A text-form ER diagram (render this in dbdiagram.io or similar for a visual):

```
users ──1:N──> classes ──1:N──> subjects ──1:N──> documents
  │                                  │
  │                                  └──1:N──> quizzes ──1:N──> questions ──1:N──> options
  │                                                │
  └──N:N (class_students)──> classes               │
  │                                                 │
  └──1:N──> quiz_attempts <──N:1── quizzes          │
                  │                                 │
                  ├──1:N──> student_answers <──N:1──┘
                  └──1:1──> results
```

---

## 8. API Design

RESTful JSON API, versioned (`/api/v1`), JWT bearer auth on all routes except `/auth/*`.

### Auth
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`

### Classes & Subjects
- `POST /api/v1/classes` (faculty)
- `GET /api/v1/classes` — faculty's classes / student's joined classes
- `POST /api/v1/classes/:id/join` (student, via join_code)
- `POST /api/v1/classes/:id/subjects`
- `GET /api/v1/subjects/:id`

### Documents & AI Generation
- `POST /api/v1/documents/upload` — multipart, returns `document_id`, kicks off async processing job
- `GET /api/v1/documents/:id/status` — polling endpoint (or use WebSocket, see §9)
- `POST /api/v1/quizzes/generate` — body: `{document_id, question_types[], count, difficulty, bloom_levels[]}` → enqueues generation job, returns `job_id`
- `GET /api/v1/jobs/:job_id` — status: queued/processing/completed/failed

### Quizzes
- `GET /api/v1/quizzes/:id` (with nested questions, for faculty review)
- `PATCH /api/v1/quizzes/:id` — settings update
- `PATCH /api/v1/questions/:id` — edit AI-generated question
- `DELETE /api/v1/questions/:id`
- `POST /api/v1/quizzes/:id/publish`
- `GET /api/v1/quizzes?class_id=&status=` — student's list of available quizzes

### Attempts
- `POST /api/v1/quizzes/:id/attempts` — start attempt (creates `quiz_attempts` row, returns shuffled question set — options/answers stripped of `is_correct`)
- `PATCH /api/v1/attempts/:id/answers` — autosave one answer at a time (called on every option tap, debounced)
- `POST /api/v1/attempts/:id/submit` — finalizes, triggers grading job
- `GET /api/v1/attempts/:id/result` — full result + review payload

### Analytics
- `GET /api/v1/quizzes/:id/analytics` — dashboard cards + question-wise breakdown
- `GET /api/v1/quizzes/:id/leaderboard`
- `GET /api/v1/quizzes/:id/export?format=csv|xlsx|pdf`
- `GET /api/v1/students/:id/report`

### Admin
- `GET/PATCH/DELETE /api/v1/admin/users`
- `GET /api/v1/admin/departments`, `/subjects`, `/storage-usage`

**Design notes:**
- Never send `is_correct` to the client during an active attempt — grade server-side only, or a student inspecting network traffic sees the answer key.
- Autosave endpoint must be idempotent and cheap (single-row upsert) since it fires dozens of times per attempt.
- Generation is always async — never block an HTTP request on an LLM call.

---

## 9. Folder Structure

```
ai-quiz-generator/
├── frontend/                      # static HTML/Tailwind/JS, no build step required (or minimal, e.g. Vite for bundling only)
│   ├── public/
│   │   ├── index.html
│   │   ├── faculty/
│   │   │   ├── dashboard.html
│   │   │   ├── upload.html
│   │   │   ├── review.html
│   │   │   └── analytics.html
│   │   ├── student/
│   │   │   ├── dashboard.html
│   │   │   ├── quiz.html
│   │   │   └── result.html
│   │   └── shared/ (login.html, profile.html)
│   ├── src/
│   │   ├── js/
│   │   │   ├── api.js            # fetch wrapper, auth header injection, refresh logic
│   │   │   ├── quiz-timer.js
│   │   │   ├── quiz-attempt.js
│   │   │   ├── charts.js         # Chart.js init wrappers
│   │   │   ├── gsap-animations.js
│   │   │   └── autosave.js
│   │   ├── css/
│   │   │   └── tailwind.css      # @tailwind directives + custom tokens
│   │   └── components/           # HTML partials injected via fetch or a tiny templating helper
│   └── sw.js                     # service worker (PWA, offline quiz resilience)
│
├── backend/
│   ├── src/
│   │   ├── config/                (db.js, redis.js, s3.js, env.js)
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   ├── classes/
│   │   │   ├── documents/
│   │   │   ├── quizzes/
│   │   │   ├── attempts/
│   │   │   ├── analytics/
│   │   │   └── admin/
│   │   │       (each module: controller.js, service.js, routes.js, validation.js)
│   │   ├── ai/
│   │   │   ├── extractText.js     # pdf-parse / mammoth
│   │   │   ├── ocr.js             # tesseract fallback for scanned PDFs
│   │   │   ├── chunker.js
│   │   │   ├── topicDetector.js
│   │   │   ├── questionGenerator.js  # Claude API calls, prompt templates
│   │   │   └── answerValidator.js
│   │   ├── jobs/
│   │   │   ├── queue.js           # BullMQ setup
│   │   │   ├── generateQuizJob.js
│   │   │   └── gradeAttemptJob.js
│   │   ├── middleware/            (auth.js, rateLimit.js, errorHandler.js, validate.js)
│   │   ├── db/
│   │   │   ├── migrations/
│   │   │   └── schema.sql
│   │   └── app.js
│   └── server.js
│
├── infra/
│   ├── docker-compose.yml         # local dev: postgres, redis, backend
│   └── deploy/ (platform-specific configs)
│
└── docs/
    └── this SRS, API collection, ER diagram export
```

---

## 10. Technology Stack

Matching your constraint (HTML/Tailwind + vanilla JS/GSAP, mobile-first, hundreds of concurrent users, no heavy frontend framework):

| Layer | Choice | Why |
|---|---|---|
| Frontend markup/style | HTML5 + Tailwind CSS | You already specified this; Tailwind keeps mobile-first breakpoints trivial (`sm:`/`md:`/`lg:`) |
| Frontend interactivity | Vanilla JS (ES modules) + **Alpine.js** (optional, ~15KB) | Alpine gives you reactive state (timer, question nav, form validation) without a build pipeline or React overhead — pairs naturally with Tailwind, keeps pages light on low-end Android |
| Animation | GSAP (+ ScrollTrigger for landing page) | You already use this at AKOS; reuse the skill |
| Charts | Chart.js | Lightweight, mobile-responsive, easy pie/bar/line for analytics |
| PWA layer | Service Worker + Web App Manifest | Installable on mobile, caches quiz shell for resilience against flaky classroom WiFi, queues autosave writes if connection drops mid-quiz |
| Backend | Node.js + Express | JS end-to-end (matches your existing stack knowledge from AKOS/FixMyCity), huge ecosystem for the doc-parsing/queue libraries below |
| Database | PostgreSQL (managed: Neon or Supabase) | Relational integrity for grading/results is non-negotiable; Supabase also gives you managed auth/storage if you want to reduce custom auth code later |
| Cache/Queue backing | Redis (managed: Upstash) | Session cache, rate limiting, and backs the job queue |
| Job queue | BullMQ | Runs document parsing + AI generation as background jobs — keeps HTTP requests fast, retries failed AI calls |
| AI / LLM | Claude API (Anthropic), `claude-sonnet-4-6` for generation, cheaper model for simple extraction tasks if needed | Strong at structured JSON output for question generation; use tool-use/structured-output mode so you get clean `{question, options, answer, explanation}` objects |
| Document parsing | `pdf-parse` (text PDFs), `mammoth` (DOC/DOCX) | Standard, well-maintained Node libraries |
| OCR (scanned PDFs) | Tesseract.js or a cloud OCR API (Google Vision) if volume grows | Start with Tesseract.js to keep costs at zero; graduate to cloud OCR only if accuracy complaints show up |
| File storage | Cloudflare R2 or AWS S3 | Cheap, S3-compatible, serve via signed URLs |
| Auth | JWT (access + refresh tokens), bcrypt for hashing | Stateless, scales horizontally without sticky sessions |
| Deployment (backend) | Railway or Render (start), migrate to AWS/GCP only once you outgrow it | Fast to ship, autoscaling available, good free/low tiers for MVP |
| Deployment (frontend) | Cloudflare Pages or Vercel (static hosting) | Global CDN — critical for mobile users on variable networks |
| Email | Resend or AWS SES | Transactional emails: quiz-ready notification, results summary |
| Monitoring | Sentry (errors) + a basic uptime monitor (Better Uptime/UptimeRobot) | Catch crashes before students do, especially during live exam windows |

**Why not React/Next.js here**, despite it being your AKOS stack: you explicitly want mobile-first, low-overhead, and this app's UI is form-heavy and screen-based rather than the highly custom WebGL/motion work AKOS does — Tailwind + Alpine + GSAP ships faster and stays lighter on low-end devices than a full SPA framework, without giving up interactivity.

---

## 11. AI Pipeline

```
Document Upload
      │
      ▼
File validated (type, size ≤ 25MB, virus-scanned)
      │
      ▼
Stored in R2/S3 → documents.status = 'uploaded'
      │
      ▼
Job enqueued (BullMQ) → documents.status = 'processing'
      │
      ▼
Text Extraction
   ├── PDF (text layer present) → pdf-parse
   ├── PDF (scanned/image-only) → OCR fallback (Tesseract.js)
   └── DOC/DOCX → mammoth
      │
      ▼
Cleaning (strip headers/footers, page numbers, fix hyphenation breaks)
      │
      ▼
Chunking (split into ~1500-token chunks with slight overlap, preserving paragraph boundaries)
      │
      ▼
Topic Detection (LLM pass: cluster chunks into named topics, dedupe overlapping content)
      │
      ▼
Question Generation (per faculty config: type mix, count, difficulty, Bloom level)
   — LLM prompted per-topic with structured output requirement:
     {question, type, options[], correct_answer, explanation, difficulty,
      bloom_level, topic, marks, source_reference}
      │
      ▼
Answer Validation (programmatic checks):
   ├── exactly one correct option for MCQ
   ├── no duplicate/near-duplicate questions (embedding similarity check)
   ├── question text references content actually present in source chunk
   └── flag ambiguous questions (e.g. multiple options in source could be "correct") for faculty review
      │
      ▼
Quiz Draft Created (status = 'draft', questions saved) → documents.status = 'processed'
      │
      ▼
Faculty Review/Edit (human-in-the-loop — required before publish)
      │
      ▼
Database Storage finalized → quiz publishable
```

**Key design principle:** the AI never publishes directly to students. Every generation run lands in a review queue. This is both a quality safeguard and a trust feature you can market — "AI drafts, faculty approves."

**Duplicate detection:** generate embeddings (via Claude/OpenAI embeddings or a local model) for each question and cosine-similarity check against others in the same quiz; flag anything above ~0.9 similarity for faculty to merge/delete.

---

## 12. Security Architecture

- **Auth:** JWT access tokens (short-lived, ~15 min) + refresh tokens (rotated, stored hashed in `sessions`), bcrypt (cost factor ≥ 12) for passwords.
- **RBAC:** middleware checks `role` claim on every protected route; faculty-only routes reject student tokens at the middleware layer, not just in the UI.
- **Transport:** HTTPS everywhere (HSTS enabled), no mixed content.
- **Input validation:** schema validation (Zod/Joi) on every request body before it touches business logic.
- **Rate limiting:** Redis-backed, per-IP and per-user (stricter on `/auth/*` and `/attempts/*/answers` to stop scripted quiz-bots).
- **File upload validation:** MIME-type + magic-byte check (not just extension), size cap, virus scan (ClamAV or a cloud scanning API) before the file is processed by the AI pipeline.
- **XSS:** sanitize any user-generated text rendered as HTML (question text, explanations); Content-Security-Policy header restricting inline scripts.
- **CSRF:** if using cookies for refresh tokens, set `SameSite=Strict` + CSRF token on state-changing requests; if using header-based bearer tokens exclusively, CSRF risk is naturally reduced.
- **SQL injection:** parameterized queries only (via an ORM like Prisma or Knex query builder) — never raw string concatenation.
- **Answer-key protection:** as noted in §8, `is_correct` and correct answers are never sent to the client during an active attempt; grading happens server-side, only revealed after submission.
- **Anti-cheat basics (mobile exam context):** disable copy/paste on question text (soft deterrent only, not foolproof), detect tab/app-switch via `visibilitychange` and log (not block) for faculty review, optional fullscreen-lock prompt on quiz start.

---

## 13. Deployment Architecture

```
                     ┌────────────────────┐
                     │   Cloudflare CDN     │  (static frontend: HTML/CSS/JS, PWA assets)
                     └─────────┬───────────┘
                               │
                     ┌─────────▼───────────┐
                     │   Load Balancer       │  (provided by Railway/Render, or Cloudflare)
                     └─────────┬───────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
        ┌───────────┐   ┌───────────┐    ┌───────────┐
        │ API node 1 │   │ API node 2 │    │ API node N │   (Node/Express, stateless, autoscaled)
        └─────┬─────┘   └─────┬─────┘    └─────┬─────┘
              │                │                │
              └────────────────┼────────────────┘
                                ▼
                   ┌─────────────────────────┐
                   │   PostgreSQL (managed)    │  primary + read replica once load demands it
                   └─────────────────────────┘
                                │
                   ┌─────────────────────────┐
                   │   Redis (managed)          │  sessions, rate-limit counters, BullMQ backing
                   └─────────────────────────┘
                                │
                   ┌─────────────────────────┐
                   │  Worker node(s)            │  BullMQ consumers: doc parsing, AI generation, grading
                   └─────────────────────────┘
                                │
                   ┌─────────────────────────┐
                   │  R2/S3 object storage      │  uploaded documents, exports
                   └─────────────────────────┘
```

API and worker processes are deployed **separately** so a burst of AI-generation jobs never degrades response times for students actively taking a live quiz — this separation is the single most important scaling decision in this architecture.

---

## 14. Future Enhancements

Prioritized roughly by effort-to-impact:

**Near-term (post-MVP):**
- Adaptive quizzes (next question difficulty adjusts to running accuracy)
- Flashcard + study-notes auto-generation from the same uploaded document
- Certificate generation (PDF) on quiz completion
- Gamification: streaks, badges, achievement toasts

**Mid-term:**
- Multilingual question generation/translation (high value for Indian college market)
- AI tutor chat — students ask "why was I wrong" and get a conversational explanation grounded in the source document
- Parent/guardian dashboard (relevant for school-level expansion beyond college)
- Voice-based quiz attempt (accessibility + hands-free revision use case)

**Long-term:**
- AI plagiarism/similarity detection across short-answer responses
- Full adaptive learning paths spanning multiple quizzes/subjects
- Institution-level analytics (cross-class, cross-department benchmarking) for admin/management buyers

---

## 15. Development Roadmap

| Phase | Focus | Duration (est.) |
|---|---|---|
| 0 | Setup: repo, CI/CD, infra provisioning, design system in Tailwind | 1 week |
| 1 | Auth + Classes/Subjects (faculty & student core flows) | 2 weeks |
| 2 | Document upload + AI extraction/generation pipeline | 3 weeks |
| 3 | Question review/edit UI + quiz settings + publish | 2 weeks |
| 4 | Student quiz-attempt experience (the highest-polish screen) | 2 weeks |
| 5 | Grading engine + result screen | 1.5 weeks |
| 6 | Faculty analytics dashboard + leaderboard + export | 2 weeks |
| 7 | Student report/profile | 1 week |
| 8 | Admin panel | 1 week |
| 9 | PWA hardening, offline resilience, load testing | 1.5 weeks |
| 10 | Security audit, bug bash, beta with one real class | 2 weeks |

**Total to a real-world beta: ~19 weeks (~4.5 months)** for a small team (you + Akhil), assuming AI generation is scoped tightly (MCQ + true/false first; fill-blank/short-answer can slip to a fast-follow release without blocking launch).

---

## 16. Sprint Planning

Using 2-week sprints against the roadmap above (10 sprints ≈ the 19-week estimate, rounded):

- **Sprint 1:** Infra + Tailwind design system + auth (register/login/JWT)
- **Sprint 2:** Classes/subjects CRUD, class-join flow, RBAC middleware
- **Sprint 3:** File upload + storage + text extraction (PDF/DOCX) + OCR fallback
- **Sprint 4:** Chunking, topic detection, LLM question generation (MCQ + true/false first)
- **Sprint 5:** Answer validation/dedup, question review/edit UI
- **Sprint 6:** Quiz settings UI + publish flow + student "available quizzes" list
- **Sprint 7:** Quiz attempt screen (timer, nav, autosave, mark-for-review, auto-submit)
- **Sprint 8:** Grading engine, result screen, review-with-explanations UI
- **Sprint 9:** Faculty analytics dashboard, question analytics, leaderboard, CSV/Excel/PDF export
- **Sprint 10:** Student report/profile, admin panel v1, PWA + offline autosave queue
- **Sprint 11 (buffer):** Security audit, load test (simulate a full class of ~150 concurrent attempts), beta launch fixes

---

## 17. Estimated Timeline

- **MVP (faculty upload → AI quiz → student attempt → basic result), no analytics dashboard:** ~8–9 weeks
- **Full v1 (everything in this document except "Future Enhancements"):** ~19–20 weeks
- **Public beta with one real college class:** end of week ~20
- **Iterate on real usage data, harden for scale:** ongoing, 4–6 weeks post-beta before wider rollout

These are engineering-only estimates for a 2-person team working part-time around your coursework — pad by ~30–40% if AKOS client work competes for your time during this window, which it likely will.

---

## 18. Risks and Mitigation

| Risk | Impact | Mitigation |
|---|---|---|
| AI generates factually wrong or ambiguous questions | Student trust, faculty trust | Mandatory human review before publish; programmatic answer-validation pass; source-reference field so faculty can verify against the document instantly |
| Traffic spike when a whole class starts a timed quiz simultaneously | Downtime during an actual exam = reputational disaster | Separate API/worker processes (§13); load-test to your real target (a few hundred concurrent) before any live exam; queue-based autosave so a brief hiccup doesn't lose answers |
| Scanned/low-quality PDFs produce poor extraction | Bad quiz quality | OCR fallback + a "extraction confidence" flag shown to faculty before they generate questions |
| LLM API cost scales with usage (per-document generation is not free) | Margin risk as you grow | Cache/reuse embeddings, generate in a single batched call per topic rather than per-question, monitor token usage per document and set a soft cap with a faculty-facing warning |
| Mobile network flakiness during exams (real risk in Indian college WiFi) | Lost answers, student frustration | PWA offline-first autosave queue that syncs on reconnect; local timer continues even if network drops briefly |
| Academic integrity (screen sharing answers, multiple devices) | Faculty adoption blocker | Tab-switch detection/logging, single-active-attempt enforcement, optional fullscreen lock — communicate clearly these are deterrents, not guarantees |
| Data privacy (student PII, academic records) | Legal/compliance | Minimal PII collection, encrypted at rest (managed Postgres/S3 already do this), clear data retention policy, especially if you sell to institutions with their own compliance requirements |

---

## 19. Testing Strategy

- **Unit tests:** business logic in each backend module (grading calculations, answer validation, JWT logic) — Jest.
- **Integration tests:** full API flows (upload → generate → publish → attempt → submit → result) against a test database — Supertest + a disposable Postgres test container.
- **AI pipeline tests:** golden-set of sample documents with expected question-count/topic-coverage ranges (not exact-match, since LLM output varies) — run in CI to catch pipeline regressions, not to grade AI "quality" precisely.
- **Load testing:** k6 or Artillery, simulate the target concurrency (start with 200 concurrent quiz-attempt sessions, autosaving every 5–10 seconds) against a staging environment before any real exam use.
- **Mobile device testing:** real-device testing (not just Chrome DevTools emulation) on at least one low-end Android device — this is where most "works on my machine" mobile bugs actually surface.
- **Manual QA pass:** full faculty-to-student flow before every release, plus a dedicated "timer edge cases" checklist (submit exactly at 0:00, resume after browser refresh, resume after app backgrounding on mobile).
- **Security testing:** OWASP ZAP baseline scan pre-launch; manual check that no `is_correct`/answer data ever appears in network responses during an active attempt.

---

## 20. Complete System Architecture

**Summary diagram (logical layers):**

```
┌─────────────────────────────────────────────────────────┐
│  CLIENT LAYER                                              │
│  HTML + Tailwind + Alpine.js + GSAP + Chart.js + PWA SW    │
│  (mobile-first, installable, offline-resilient)             │
└───────────────────────┬─────────────────────────────────┘
                         │ HTTPS / REST JSON
┌───────────────────────▼─────────────────────────────────┐
│  API LAYER (Node.js + Express, stateless, autoscaled)       │
│  Auth · Classes · Documents · Quizzes · Attempts · Analytics │
│  · Admin — each behind JWT + RBAC middleware                │
└───────┬───────────────────────────────────┬─────────────┘
        │                                   │
┌───────▼──────────┐                ┌───────▼──────────────┐
│  DATA LAYER         │                │  ASYNC LAYER            │
│  PostgreSQL (primary │                │  Redis + BullMQ         │
│  store) + Redis      │                │  Worker processes:      │
│  (cache/session)      │                │  extract→chunk→        │
│                        │                │  generate→validate      │
└───────┬──────────┘                └───────┬──────────────┘
        │                                   │
┌───────▼──────────┐                ┌───────▼──────────────┐
│  OBJECT STORAGE      │                │  AI LAYER                │
│  R2/S3 — uploaded     │                │  Claude API (question     │
│  docs, exports        │                │  generation) + Tesseract  │
│                        │                │  OCR + pdf-parse/mammoth  │
└───────────────────┘                └───────────────────┘
```

**Cross-cutting concerns:**
- **Monitoring:** Sentry for error tracking (both frontend and backend), structured logging (pino/winston) shipped to a log aggregator, uptime monitoring on the public quiz-attempt endpoint specifically (that's the one that can't go down mid-exam).
- **Caching:** Redis caches hot reads — published quiz metadata, leaderboard snapshots (recomputed on a short interval, not on every request), question_analytics rows.
- **Scalability path by user count:**
  - **10–100 users:** single API instance + single Postgres instance is plenty. Focus effort on correctness, not scale.
  - **100–500 users:** add a second API instance behind a load balancer, move the job queue workers to a separate instance so grading/generation load never competes with live attempt traffic. Add the indexes listed in §6 if not already present.
  - **500–1000 users:** read replica for Postgres (analytics/dashboard reads hit the replica, transactional writes hit primary), Redis cluster if session/rate-limit load grows, CDN cache headers tuned aggressively on static quiz assets.
  - **1000–5000 users:** horizontal autoscaling of API nodes based on CPU/connection count, connection pooling (PgBouncer) in front of Postgres to avoid connection exhaustion, consider sharding `student_answers`/`quiz_attempts` by academic term if table size becomes unwieldy, dedicated worker pool sized to AI provider rate limits rather than raw request volume.

---

## Immediate Next Steps

1. Confirm question-type priority for MVP (recommend: MCQ + True/False first, Fill-blank/Short-answer as fast-follow — short-answer grading is inherently fuzzier and will slow you down if it's in scope for launch).
2. Stand up infra skeleton (Postgres + Redis + R2 buckets + repo with the folder structure in §9).
3. Build the AI generation pipeline against 3–5 real sample PDFs from your own coursework to calibrate prompt quality before any UI exists — this is the riskiest, highest-uncertainty part of the whole build, so de-risk it first.
