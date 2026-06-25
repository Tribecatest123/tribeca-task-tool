// POST /approve
// Generates the canonical task_id, saves the task, POSTs the outbound payload (6a)
// to the n8n outbound webhook, and stores the returned status + calendar link (6b).
// The APP owns task_id — it flows app -> n8n -> email subject -> reply -> back here.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const TZ = "Asia/Kolkata";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

// 8-char lowercase alphanumeric; matches the inbound regex #([A-Za-z0-9]+).
function genId(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % 36]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const f = await req.json().catch(() => null);
  if (!f || !f.title || !f.assignee_email || !f.task_type) {
    return json({ error: "Missing required fields (title, assignee_email, task_type)" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const task_id = genId();
  const row = {
    task_id,
    task_type: f.task_type,
    title: f.title,
    assignee_name: f.assignee_name ?? "",
    assignee_email: f.assignee_email,
    datetime_start: f.datetime_start || null,
    datetime_end: f.datetime_end || null,
    timezone: f.timezone || TZ,
    priority: f.priority || "normal",
    notes: f.notes ?? "",
    status: "Approved",
  };

  const { error: insertErr } = await supabase.from("tt_tasks").insert(row);
  if (insertErr) return json({ error: "DB insert failed", detail: insertErr.message }, 500);

  // Outbound payload — the data contract, section 6a.
  const payload = {
    task_id,
    task_type: row.task_type,
    title: row.title,
    assignee_name: row.assignee_name,
    assignee_email: row.assignee_email,
    datetime_start: row.datetime_start,
    datetime_end: row.datetime_end,
    timezone: row.timezone,
    priority: row.priority,
    notes: row.notes,
  };

  const n8nUrl = Deno.env.get("N8N_OUTBOUND_WEBHOOK_URL");
  if (!n8nUrl) {
    await supabase.from("tt_tasks").update({ status: "Notify failed" }).eq("task_id", task_id);
    return json({ task_id, status: "notify_failed", error: "N8N_OUTBOUND_WEBHOOK_URL secret not set", calendar_event_link: null });
  }

  try {
    const res = await fetch(n8nUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    const calendar_event_link = body.calendar_event_link ?? null;

    await supabase.from("tt_tasks")
      .update({ status: "Notified", calendar_event_link })
      .eq("task_id", task_id);

    return json({ task_id, status: "notified", calendar_event_link });
  } catch (e) {
    await supabase.from("tt_tasks").update({ status: "Notify failed" }).eq("task_id", task_id);
    return json({ task_id, status: "notify_failed", error: String(e), calendar_event_link: null });
  }
});
