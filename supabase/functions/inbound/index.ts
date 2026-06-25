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

  const { data, error } = await supabase.from("tt_tasks")
    .update({
      reply_text: b.reply_text ?? "",
      reply_received_at: b.received_at || new Date().toISOString(),
      status: "Reply received",
    })
    .eq("task_id", b.task_id)
    .select();

  if (error) return json({ error: "DB update failed", detail: error.message }, 500);
  if (!data || data.length === 0) return json({ error: `No task found for task_id ${b.task_id}` }, 404);

  return json({ ok: true, task_id: b.task_id, status: "Reply received" });
});
