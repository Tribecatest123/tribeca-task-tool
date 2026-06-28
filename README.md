# Tribeca Task Tool

A plain-English instruction becomes a real Google Calendar event and/or a real Gmail to the
assignee. When the assignee replies, the reply is captured and posted back against the original
task. The graded spine fires for real:

```
App  ->  LLM (parse)  ->  n8n  ->  Google Calendar / Gmail  ->  email reply  ->  back into App
```

## Live URLs

The backend and frontend run on Supabase (Postgres + Edge Functions). Base:
`https://vgeriftinzhuoivfavdp.supabase.co/functions/v1`

| Surface | URL |
|---|---|
| **App (frontend)** | **`https://tribecatest123.github.io/tribeca-task-tool/`** |
| Stakeholder overview (deck) | `https://tribecatest123.github.io/tribeca-task-tool/stakeholder-overview.html` |
| Architecture & flow (2-page doc) | `https://tribecatest123.github.io/tribeca-task-tool/architecture-flow.html` |
| POST /parse | `.../functions/v1/parse` |
| POST /approve | `.../functions/v1/approve` |
| POST /inbound (public, n8n -> app) | `.../functions/v1/inbound` |
| GET /tasks, GET /tasks?id= | `.../functions/v1/tasks` |

A plain-language stakeholder presentation (the flow, where data lives, why AI
parsing sits in Supabase vs n8n, and the production roadmap) lives at
[`docs/stakeholder-overview.html`](docs/stakeholder-overview.html) — open it in a
browser to present full-screen, or use its **Print / PDF** button to export.

The API base for all four endpoints is `https://vgeriftinzhuoivfavdp.supabase.co/functions/v1`.

### Frontend hosting (why it is not served from Supabase)

`*.supabase.co` sandboxes any HTML it serves: **both** Edge Function responses **and** Storage
public objects come back with `Content-Type: text/plain`, `X-Content-Type-Options: nosniff`, and
`Content-Security-Policy: default-src 'none'; sandbox` — an anti-abuse measure that prevents the
domain from hosting renderable web pages. A browser pointed at `.../functions/v1/app` (or a public
Storage URL) therefore shows the raw source, not the rendered app, regardless of any `apikey`.

So the single-page frontend is hosted on **GitHub Pages** from [`docs/index.html`](docs/index.html)
(`main` branch, `/docs`) — a normal static host that serves real `text/html`. The page points its
API base at the absolute functions URL and calls the endpoints cross-origin (the functions set
`Access-Control-Allow-Origin: *`). The `app` Edge Function is retained as the canonical source of
the page markup, but is not the browser entry point.

### API key on requests (anon header)

The frontend sends the **public anon key** on every call (`apikey: <anon>` and
`Authorization: Bearer <anon>`), and the n8n inbound `POST to /inbound` node sends the same, so the
requests always carry a key the gateway accepts. The anon key is **public by design** and safe to
embed in frontend JS and the workflow JSON. The **service_role** key is never exposed to the
browser — only the edge functions use it (injected automatically by Supabase). (Function responses
are JSON consumed by `fetch`, so the sandbox content-type above does not affect them.)

## Deviations from the brief (stated honestly)

1. **OpenAI instead of Claude for parsing.** The brief says "Claude parses it." Only an OpenAI
   API key was available, so `/parse` uses OpenAI structured outputs (`gpt-4o-mini`,
   `response_format: json_schema`, `strict: true`) to produce the exact schema. The mechanism
   (LLM + structured/tool output) and the schema are identical; only the provider differs.
2. **Supabase Edge Functions (serverless) instead of one always-on FastAPI/Express service.**
   The brief warns against serverless because "the inbound webhook plus persistent state fights
   the serverless model." That concern is specifically about *in-memory* state not surviving a
   restart. Here the state lives in **Postgres**, so the functions are stateless and the inbound
   reply (which arrives minutes/hours later) always survives. The `/inbound` endpoint is a plain
   public HTTPS URL — exactly what n8n needs. No separate Render/Railway service is required.

Everything else follows the brief: n8n is required (two workflows, exported as JSON), the email
is **sent** (not drafted), reply detection uses the n8n **Gmail Trigger (polling)**, and there is
**no login/auth** in the app.

## Architecture

- **Postgres** — `public.tt_tasks` owns the canonical `task_id`; `public.tt_contacts` maps a
  lowercased first name (`name_key`) to a real `full_name` + `email` for the parse override;
  `public.tt_config` holds private key/value secrets; `public.tt_replies` stores one row per
  inbound reply (the full thread; `tt_tasks` also mirrors the latest reply). Namespaced `tt_*`
  because this Supabase project also hosts an unrelated app.
- **Edge functions** (Deno), all deployed with `verify_jwt = false` because the brief requires no
  auth and both the browser and n8n must reach them without a token:
  - `parse` — calls OpenAI, returns structured fields, **does not save**. After the model
    returns, it looks up the first token of `assignee_name` in `tt_contacts`; on a match the
    real `full_name` + `email` **override** the model output (so known assignees get a
    deliverable address instead of a fabricated `@example.com`).
  - `approve` — generates `task_id`, saves the task, POSTs payload (6a) to the n8n outbound
    webhook, stores the returned status + calendar link (6b). Status -> `Notified`.
  - `inbound` — receives the cleaned reply (6c), attaches it to the matching task. Status ->
    `Reply received`. **Publicly reachable.**
  - `tasks` — read-only list/detail for the dashboard.
  - `app` — serves the single-page vanilla-HTML/JS frontend.

## The data contract (locked first — everything keys off it)

`task_id` is generated by the **app** inside `/approve`, before the email is sent. It flows:
app -> n8n payload -> email subject -> reply -> back to app.

**6a. App -> n8n (outbound payload)**
```json
{ "task_id":"abc123","task_type":"calendar_event","title":"Interview with Priya Sharma",
  "assignee_name":"Priya Sharma","assignee_email":"priya.test@example.com",
  "datetime_start":"2025-07-02T15:00:00+05:30","datetime_end":"2025-07-02T15:30:00+05:30",
  "timezone":"Asia/Kolkata","priority":"normal","notes":"30-min interview" }
```
**6b. n8n -> app (response to /approve)**
```json
{ "task_id":"abc123","status":"notified","calendar_event_link":"https://calendar.google.com/event?eid=..." }
```
**6c. n8n -> app (POST /inbound)**
```json
{ "task_id":"abc123","assignee_email":"priya.test@example.com",
  "reply_text":"Got it, will do Tuesday afternoon.","received_at":"2025-07-01T11:05:00+05:30" }
```
**6d. Email conventions**
- Subject: `[Tribeca Task #abc123] <title>`
- Body contains the literal line:
  `Reply to this email with any update — your reply will be recorded against this task.`

The inbound regex matches `#([A-Za-z0-9]+)` anywhere in the subject, so it survives `Re:` / `Re: Re:`.

## Parse schema

`task_type` (`calendar_event` | `reminder`), `title`, `assignee_name`, `assignee_email`,
`datetime_start` (ISO 8601 with `+05:30`), `datetime_end` (calendar only; defaults to +30 min),
`priority` (`high`|`normal`|`low`), `notes`. Today's date and `Asia/Kolkata` are injected into the
prompt so "next Wednesday 3pm" resolves to the correct wall-clock hour.

---

## Setup / run instructions

### 1. Configure the OpenAI key and the n8n webhook URL
Two values are needed. Each can be supplied **either** as an Edge Function secret **or** as a row
in the private `tt_config` table — the functions prefer the env secret and fall back to `tt_config`.

| Value | Env secret | tt_config key |
|---|---|---|
| OpenAI key | `OPENAI_API_KEY` | `openai_api_key` |
| n8n outbound webhook URL | `N8N_OUTBOUND_WEBHOOK_URL` | `n8n_outbound_webhook_url` |

Env secret: Supabase Dashboard -> Project Settings -> Edge Functions -> Secrets.
tt_config: `insert into tt_config(key,value) values ('openai_api_key','sk-...');`

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically — do not set them.

(In the live deployment the OpenAI key is already configured via `tt_config`; the n8n webhook URL
is set the same way once the outbound workflow is activated and its production URL is known.)

### 2. Import the n8n workflows
Import `n8n/outbound_workflow.json` and `n8n/inbound_workflow.json` into your n8n instance.

### 3. Manual steps after import (credentials/URLs are stripped on export — these do NOT import)
The full numbered, human-operated runbook is in [`n8n/SETUP.md`](n8n/SETUP.md). In short:
1. Re-attach the **Google OAuth credential** to: `Create Calendar Event`, both `Send Email`
   nodes (outbound), and the `Gmail Trigger` node (inbound).
2. In the outbound workflow, **activate** it, then open the `Webhook` node and copy its
   **Production URL**. Paste that into the `N8N_OUTBOUND_WEBHOOK_URL` Supabase secret (step 1).
3. The inbound workflow's `POST to /inbound` node is **already pre-filled** with the deployed
   `/inbound` URL **and the `apikey` / `Authorization` anon headers**. Change them only if you
   redeploy the app elsewhere.
4. **Activate both workflows.**

### 4. Use it
Open the app URL, type an instruction (e.g. *"Schedule a 30-min interview with Priya Sharma
(priya.test@example.com) next Wednesday 3pm"*), review/edit the parsed card, click **Approve &
Notify**. A real calendar event + real email are created. Reply to that email from the assignee
account; within ~1 minute the reply appears on the task's detail view with status
`Reply received`.

## Build order followed (riskiest leg first)

1. Locked the data contract.
2. Built the app side (DB + functions) and verified the full reply round-trip live with curl:
   inbound matched a seeded task, status flipped to `Reply received`, reply text + timestamp
   stored, detail read-back correct.
3. Built both n8n workflows as importable JSON (validated as parseable).
4. Built the frontend.

## Known fragilities (stated honestly, per the brief)

- **Quote/signature stripping is a heuristic.** The inbound Code node cuts the body at the first
  quoted-history marker (`On ... wrote:`, a line starting with `>`, `-----Original Message-----`,
  or a forwarded `From:` header) and strips a `-- ` signature block. This is not robust across all
  mail clients; it is fine for controlled test accounts. Reply de-duplication is intentionally not
  implemented — if the Gmail Trigger sees the same message twice, the task is simply re-stamped.
- **Gmail Trigger polling adds ~1 minute latency** versus a true inbound webhook. Acceptable for a
  demo; it is a deliberate trade-off the brief calls for.
- **No input validation / error handling / multi-user / auth**, by design and per the brief's
  in-scope-to-skip list.
- **`verify_jwt = false`** on all functions is intentional (the brief mandates no auth). It means
  the endpoints are open; acceptable for an assessment, not for production.
- **Datetimes are stored as `timestamptz`** and read back in UTC (e.g. `09:30Z` = `15:00 IST`).
  The instant is correct; the calendar event lands in IST because the outbound payload carries the
  `+05:30` offset and the `timezone` field.

## Handoff — current state & how to continue

Full context for the next person picking this up. Where earlier sections and this one
disagree, **this section is current.**

### TL;DR
A working **assessment** build. The full spine — type → parse → confirm → notify → reply → track —
runs live with real Google Calendar events, real emails, and captured replies. Frontend on GitHub
Pages, backend on Supabase, automation on n8n Cloud. Remaining work is a final end-to-end retest of
the latest n8n node edits, plus the production-hardening list at the end.

### Where everything runs
- **Supabase** — project ref `vgeriftinzhuoivfavdp` (region ap-southeast-2). Postgres 17 + Edge Functions.
- **GitHub** — repo `github.com/Tribecatest123/tribeca-task-tool` (currently **public**). Frontend is
  served by **GitHub Pages** from `main` → `/docs`.
- **n8n** — cloud instance `tribecatest.app.n8n.cloud`. Two workflows. Outbound production webhook:
  `https://tribecatest.app.n8n.cloud/webhook/tribeca-task-outbound`.
- **Google** — Calendar + Gmail via the single Google account authorized inside n8n. That same inbox
  both **sends** the task emails and **receives** the replies (the Gmail Trigger polls it).

### Secrets & config (values are NOT in the repo)
| What | Where it lives | Notes |
|---|---|---|
| OpenAI API key | `tt_config.openai_api_key` (server-only) | read by `/parse`; model `gpt-4o-mini` |
| n8n webhook URL | `tt_config.n8n_outbound_webhook_url` | read by `/approve` |
| Supabase **anon** key | embedded in frontend + n8n inbound headers | **public by design** — safe |
| Supabase **service_role** key | injected into Edge Functions automatically | never in the browser or repo |

- View/update config with SQL: `select key from tt_config;` then
  `insert into tt_config(key,value) values ('<k>','<v>') on conflict (key) do update set value = excluded.value;`
- A **GitHub PAT** and the **OpenAI key** were used during the build. Rotate both per your security
  policy. (The repo and frontend contain only the public anon key.)

### Data model (Postgres, `public`)
- `tt_tasks` — canonical task: `task_id` (PK), status, calendar link, latest-reply mirror, timestamps.
- `tt_contacts` — `name_key` (lowercased first name) → `full_name` + `email`. Used by `/parse` to
  replace fabricated `@example.com` addresses. Seeded: `darshak`, `kalpesh`.
- `tt_config` — private key/value (the two secrets above).
- `tt_replies` — one row per inbound reply (the thread). `/inbound` appends and de-dups against the
  most recent identical reply.
- Migrations: `0001` tasks, `0002` config, `0003` contacts, `0004` replies.

### Edge Functions (Deno, `verify_jwt = false`)
- `parse` — OpenAI `gpt-4o-mini` structured output, then `tt_contacts` override. Does not save.
- `approve` — generates `task_id`, inserts `tt_tasks`, POSTs the payload to the n8n webhook (URL from
  `tt_config`), stores returned status + calendar link.
- `inbound` — appends the reply to `tt_replies`, mirrors latest onto `tt_tasks`, sets status
  `Reply received`. De-dups vs the last reply. Publicly reachable.
- `tasks` — `GET` list; `GET ?id=` returns the task **plus** its `replies[]` thread.
- `app` — serves the page markup (canonical source), but is **not** the browser entry point.
- **Deploy** via the Supabase Dashboard/CLI/MCP; keep `verify_jwt = false`. After editing the `app`
  function, **regenerate the Pages copy**: fetch `/functions/v1/app`, replace
  `location.origin + "/functions/v1"` with the absolute functions base, write to `docs/index.html`,
  commit (Pages rebuilds in ~1 min).

### Frontend (`docs/index.html` on GitHub Pages)
- One self-contained file. `FN` points at the absolute functions base; sends the anon `apikey` on
  every call (same-origin is not available because Supabase sandboxes served HTML — see
  **Frontend hosting** above).
- Screens: New Task (parse → confirm/edit → approve), Dashboard (search + autocomplete + type/status
  filters, responsive card list, "showing N of M"), Detail (full reply thread). Footer links the
  deck, the flow doc, and the GitHub source.

### n8n workflows (`/n8n/*.json` are the source of truth)
- **Outbound** — `Webhook → Is calendar_event?` → *calendar:* `Create Calendar Event` (assignee added
  as **attendee**, **Send Updates = All** → real RSVP invite) → `Send Email (Calendar)` → `Respond`;
  *reminder:* `Send Email (Reminder)` → `Respond`. Emails are **HTML**, time rendered in **IST**, the
  n8n auto-attribution is **off**, footer reads "This task was created with the Tribeca Task Tool",
  and the calendar email notes that a separate invite was sent.
- **Inbound** — `Gmail Trigger` (~1 min poll) → `Subject contains tag?` → `Extract + Clean` (requires
  a **`Re:`** subject so the original notification is never captured as a reply; reads `#id`; strips
  quoted history + HTML entities) → `POST /inbound` (sends `apikey` + `Authorization` anon headers).
- On a fresh import, credentials and the production webhook URL are stripped — re-attach Google OAuth
  and re-set the webhook URL per [`n8n/SETUP.md`](n8n/SETUP.md). The latest node edits were applied
  **directly in the live n8n** by the human and were being retested; re-importing the JSON gives the
  same fixed versions.

### Fixes already made (so you don't redo them)
- anon `apikey`/`Authorization` headers on all frontend calls and the inbound node.
- Frontend moved to GitHub Pages (Supabase sandboxes served HTML — `text/plain` + CSP `sandbox`).
- `/parse` contacts override via `tt_contacts`.
- `Send Email (Calendar)` read `$json.body` after the calendar node had replaced the item →
  changed to `$node["Webhook"].json.body`.
- Inbound was capturing the outbound notification → fixed with the `Re:` reply guard + better body/
  quote cleaning.
- Multiple replies now stored as a thread (`tt_replies`) and shown on the detail view.
- UI overhaul: responsive cards, filters, autocomplete, success toast + dismiss, footer.
- Stakeholder deck + 2-page architecture/flow doc (in `/docs`).

### Outstanding / to verify
- Final **end-to-end retest** after the latest live n8n edits: create a calendar task, approve,
  confirm the formatted email + RSVP invite, reply twice from a mailbox you control, and confirm both
  replies appear as a thread with status `Reply received`.

### Production roadmap (not built — required before org-wide rollout)
- **Login / authentication**, and locking down the currently-open endpoints (`verify_jwt = false`,
  no apikey enforcement on this project).
- **Employee directory** (name + email) and a **company database with name de-duplication**
  (two "Kalpesh"/"Darshak" must be disambiguated).
- **Edit a created task** (and re-notify).
- **Calendar conflict warning** (clash detection) and **block scheduling in the past**.
- **Private repository + Vercel hosting** with a clean domain.
- **Audit log**, delivery/failure **alerts**, **role-based permissions**, **multi-time-zone** support,
  and robust reply de-duplication (by message-id).

### Quick test / smoke
- UI: open the app → create → approve → reply → watch the Dashboard.
- API (anon key as `apikey`): `GET /tasks`, `POST /parse {"text": "..."}`,
  `POST /inbound {"task_id":"...","reply_text":"...","received_at":"..."}`.
- DB: Supabase Dashboard SQL or MCP — `select * from tt_tasks order by created_at desc;`

## Repo layout
```
supabase/
  functions/{parse,approve,inbound,tasks,app}/index.ts
  migrations/0001_create_tt_tasks.sql
  migrations/0002_create_tt_config.sql
  migrations/0003_create_tt_contacts.sql
  migrations/0004_create_tt_replies.sql
n8n/
  outbound_workflow.json
  inbound_workflow.json
  SETUP.md
docs/
  index.html                 # GitHub Pages frontend (absolute API base + anon headers)
  stakeholder-overview.html  # plain-language stakeholder presentation
  architecture-flow.html     # 2-page end-to-end flow + node/data map
.env.example
README.md
```
