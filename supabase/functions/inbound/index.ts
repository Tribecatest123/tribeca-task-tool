// POST /inbound  (PUBLICLY REACHABLE — called by the n8n inbound workflow)
// Receives a cleaned reply (section 6c) and attaches it to the matching task.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const b = await req.json().catch(() => null);
  if (!b || !b.task_id) return json({ error: "Missing task_id" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // The task must exist before we attach a reply.
  const { data: task, error: taskErr } = await supabase
    .from("tt_tasks").select("task_id").eq("task_id", b.task_id).maybeSingle();
  if (taskErr) return json({ error: "DB lookup failed", detail: taskErr.message }, 500);
  if (!task) return json({ error: `No task found for task_id ${b.task_id}` }, 404);

  const reply_text = b.reply_text ?? "";
  const received_at = b.received_at || new Date().toISOString();
  const assignee_email = b.assignee_email ?? null;

  // Append each distinct reply to the thread. Dedup against the most recent one so
  // the Gmail Trigger re-seeing the same message doesn't create a duplicate row.
  const { data: last } = await supabase
    .from("tt_replies").select("reply_text").eq("task_id", b.task_id)
    .order("received_at", { ascending: false }).limit(1).maybeSingle();

  let inserted = false;
  if (reply_text && (!last || last.reply_text !== reply_text)) {
    const { error: insErr } = await supabase.from("tt_replies")
      .insert({ task_id: b.task_id, assignee_email, reply_text, received_at });
    if (insErr) return json({ error: "DB insert failed", detail: insErr.message }, 500);
    inserted = true;
  }

  // Mirror the latest reply onto the task row (back-compat) and flip status.
  const { error: updErr } = await supabase.from("tt_tasks")
    .update({ reply_text, reply_received_at: received_at, status: "Reply received" })
    .eq("task_id", b.task_id);
  if (updErr) return json({ error: "DB update failed", detail: updErr.message }, 500);

  return json({ ok: true, task_id: b.task_id, status: "Reply received", inserted });
});
