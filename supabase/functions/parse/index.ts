// POST /parse
// Plain-English instruction -> structured task fields via OpenAI structured outputs.
// Does NOT save anything. The app injects today's date + Asia/Kolkata so relative
// dates ("next Wednesday 3pm") resolve to the right wall-clock hour on the calendar.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const TZ = "Asia/Kolkata";
const OFFSET = "+05:30"; // Asia/Kolkata has no DST, so a fixed offset is safe.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Human-readable "now" in IST for the model to anchor relative dates against.
function nowInIST(): string {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const p: Record<string, string> = {};
  for (const part of f.formatToParts(new Date())) p[part.type] = part.value;
  return `${p.year}-${p.month}-${p.day} (${p.weekday}) ${p.hour}:${p.minute} IST`;
}

const SCHEMA = {
  name: "task",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      task_type: { type: "string", enum: ["calendar_event", "reminder"] },
      title: { type: "string" },
      assignee_name: { type: "string" },
      assignee_email: { type: "string" },
      datetime_start: { type: "string", description: `ISO 8601 with ${OFFSET} offset` },
      datetime_end: { type: ["string", "null"], description: `ISO 8601 with ${OFFSET} offset; calendar only` },
      priority: { type: "string", enum: ["high", "normal", "low"] },
      notes: { type: "string" },
    },
    required: [
      "task_type", "title", "assignee_name", "assignee_email",
      "datetime_start", "datetime_end", "priority", "notes",
    ],
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: { ...cors, "Content-Type": "application/json" } });
  }

  // Prefer the env secret; fall back to the private tt_config table so the key never lives in code.
  let apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data } = await sb.from("tt_config").select("value").eq("key", "openai_api_key").maybeSingle();
    apiKey = data?.value;
  }
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "OpenAI key not configured (set OPENAI_API_KEY secret or tt_config row)." }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const { text } = await req.json().catch(() => ({ text: "" }));
  if (!text || typeof text !== "string") {
    return new Response(JSON.stringify({ error: "Body must be { text: string }" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const system = [
    `You convert a plain-English task instruction into structured fields.`,
    `RIGHT NOW it is ${nowInIST()}. The timezone is ${TZ}.`,
    `Resolve all relative dates ("today", "tomorrow", "next Wednesday 3pm") against that.`,
    `Always output datetime_start (and datetime_end for calendar events) as ISO 8601 WITH the ${OFFSET} offset, e.g. 2026-07-02T15:00:00${OFFSET}.`,
    `task_type is "calendar_event" when the instruction implies a scheduled meeting/event at a specific time; otherwise "reminder".`,
    `For calendar_event, if no end time is stated, set datetime_end to 30 minutes after datetime_start.`,
    `For reminder, datetime_end may be null. datetime_start is the due time.`,
    `If the email address is not given explicitly, infer a plausible test address from the name (e.g. "Priya Sharma" -> "priya.sharma@example.com").`,
    `priority defaults to "normal" unless urgency is implied. notes holds any extra context; use "" if none.`,
  ].join("\n");

  const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        { role: "system", content: system },
        { role: "user", content: text },
      ],
      response_format: { type: "json_schema", json_schema: SCHEMA },
    }),
  });

  if (!aiRes.ok) {
    const detail = await aiRes.text();
    return new Response(JSON.stringify({ error: "OpenAI request failed", detail }), { status: 502, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const data = await aiRes.json();
  const parsed = JSON.parse(data.choices[0].message.content);

  // Belt-and-suspenders: enforce the +30min default in code too.
  if (parsed.task_type === "calendar_event" && !parsed.datetime_end && parsed.datetime_start) {
    const start = new Date(parsed.datetime_start);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    parsed.datetime_end = end.toISOString().replace("Z", OFFSET); // approximate; the model normally fills this
  }
  parsed.timezone = TZ;

  return new Response(JSON.stringify(parsed), { headers: { ...cors, "Content-Type": "application/json" } });
});
