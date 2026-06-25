// GET /tasks        -> all tasks (dashboard), newest first
// GET /tasks?id=xxx  -> single task (detail view)
// Read-only convenience endpoint for the frontend.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const id = new URL(req.url).searchParams.get("id");
  if (id) {
    const { data, error } = await supabase.from("tt_tasks").select("*").eq("task_id", id).maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!data) return json({ error: "not found" }, 404);
    return json(data);
  }

  const { data, error } = await supabase.from("tt_tasks").select("*").order("created_at", { ascending: false });
  if (error) return json({ error: error.message }, 500);
  return json({ tasks: data });
});
