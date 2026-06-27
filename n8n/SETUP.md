# n8n Setup Runbook (manual, human-operated)

The two workflow JSONs in this folder are complete and importable. Credentials and the
outbound production URL are **stripped on export** and must be wired up by hand. Follow these
steps in order. They require a browser (Google OAuth consent) and so cannot be automated.

Workflows:
- `outbound_workflow.json` — "Tribeca Outbound (Calendar + Gmail)"
- `inbound_workflow.json` — "Tribeca Inbound (Reply -> App)"

Live endpoints (already wired into the JSON where applicable):
- App / functions base: `https://vgeriftinzhuoivfavdp.supabase.co/functions/v1`
- Inbound endpoint: `https://vgeriftinzhuoivfavdp.supabase.co/functions/v1/inbound`

---

## 1. Import both workflows
In n8n: **Workflows -> Import from File**, import `outbound_workflow.json`, then
`inbound_workflow.json`. Two workflows now appear, both **inactive**.

## 2. Create one Google OAuth credential (Calendar + Gmail)
**Credentials -> New -> Google OAuth2 API** (or create both "Google Calendar OAuth2 API" and
"Gmail OAuth2 API" if your n8n version separates them). Enable the **Calendar** and **Gmail**
scopes. Click through the Google consent screen using the provided test account. Save.

> Use a Google account whose Gmail inbox will both **send** the task emails and **receive** the
> assignee replies (the inbound Gmail Trigger polls this same inbox).

## 3. Attach the credential to every Google node
Open each node and select the credential from step 2:
- **Outbound:** `Create Calendar Event`, `Send Email (Calendar)`, `Send Email (Reminder)`
- **Inbound:** `Gmail Trigger`

In `Create Calendar Event`, also pick the target calendar (the `primary` calendar is preselected).

## 4. Activate outbound + copy its Production webhook URL
Activate the **outbound** workflow. Open the `Webhook` node and copy its **Production URL**
(it ends in `/webhook/tribeca-task-outbound`).

## 5. Give the webhook URL to Supabase
Set it as the outbound webhook URL the `approve` function reads. Either is fine (the function
prefers the env secret, then falls back to `tt_config`):
- **Edge Function secret:** Dashboard -> Project Settings -> Edge Functions -> Secrets ->
  `N8N_OUTBOUND_WEBHOOK_URL = <production URL>`, **or**
- **tt_config row:** `insert into tt_config(key,value) values
  ('n8n_outbound_webhook_url','<production URL>')
  on conflict (key) do update set value = excluded.value;`

## 6. Confirm the inbound POST node
Open the inbound workflow's `POST to /inbound` node and confirm:
- **URL:** `https://vgeriftinzhuoivfavdp.supabase.co/functions/v1/inbound`
- **Send Headers:** ON, with `apikey` and `Authorization: Bearer <anon key>` already filled in
  (the anon key is public by design; it is what the Supabase gateway accepts). These are
  pre-set in the JSON — verify they survived import.

## 7. Activate the inbound workflow
Activate it. The Gmail Trigger now polls the inbox roughly every minute.

## 8. End-to-end test
1. Open the app: `https://vgeriftinzhuoivfavdp.supabase.co/functions/v1/app`
2. Type a calendar command, e.g. *"Schedule a 30-min call with Darshak tomorrow 4pm"*.
3. Click **Parse**, review the card (Darshak resolves to the real contact email), then
   **Approve & Notify**.
4. Confirm a real calendar event was created and a real email was sent to the assignee.
5. From the assignee's mailbox, **reply** to that email (keep the `[Tribeca Task #<id>]` subject).
6. Within ~1 minute the reply appears on the task's detail view with status **Reply received**.

---

### Notes
- Email subject tag: `[Tribeca Task #<id>] <title>`; the inbound regex `#([A-Za-z0-9]+)`
  recovers the id even through `Re:` / `Re: Re:`.
- Quote/signature stripping in `Extract + Clean` is a heuristic — fine for controlled test
  accounts (see README "Known fragilities").
- Gmail Trigger polling adds ~1 minute of latency by design.
