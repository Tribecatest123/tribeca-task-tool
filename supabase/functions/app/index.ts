// GET /app -> serves the single-page frontend (text box, confirm card, dashboard, detail).
// HTML is inlined as a template literal (no backticks / ${} inside) so the function is
// fully self-contained and does not depend on reading a sibling file at runtime.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Tribeca Task Tool</title>
<style>
  :root { --ink:#111; --line:#d8d8d8; --muted:#666; --bg:#f4f4f4; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
         color: var(--ink); background: var(--bg); line-height: 1.45; }
  header { background:#111; color:#fff; padding:16px 24px; }
  header h1 { margin:0; font-size:18px; font-weight:700; letter-spacing:.3px; }
  header p { margin:4px 0 0; font-size:12px; color:#bbb; }
  .wrap { max-width: 880px; margin: 24px auto; padding: 0 16px; }
  nav { display:flex; gap:8px; margin-bottom:16px; }
  nav button { border:1px solid var(--line); background:#fff; padding:8px 14px; cursor:pointer; font-size:14px; }
  nav button.active { background:#111; color:#fff; border-color:#111; font-weight:600; }
  .card { background:#fff; border:1px solid var(--line); margin-bottom:16px; }
  .card h2 { margin:0; background:#111; color:#fff; font-size:13px; font-weight:700;
             text-transform:uppercase; letter-spacing:.5px; padding:10px 14px; }
  .card .body { padding:16px; }
  textarea { width:100%; min-height:80px; padding:10px; border:1px solid var(--line); font-size:14px; font-family:inherit; }
  label { display:block; font-size:12px; color:var(--muted); margin:10px 0 4px; text-transform:uppercase; letter-spacing:.4px; }
  input, select { width:100%; padding:8px; border:1px solid var(--line); font-size:14px; font-family:inherit; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:0 16px; }
  .btn { background:#111; color:#fff; border:none; padding:10px 18px; font-size:14px; cursor:pointer; margin-top:14px; font-weight:600; }
  .btn.secondary { background:#fff; color:#111; border:1px solid #111; }
  .btn:disabled { opacity:.5; cursor:default; }
  table { width:100%; border-collapse:collapse; font-size:14px; }
  th { background:#111; color:#fff; text-align:left; padding:8px 10px; font-size:11px; text-transform:uppercase; letter-spacing:.4px; }
  td { padding:8px 10px; border-bottom:1px solid var(--line); }
  tr.row { cursor:pointer; }
  tr.row:hover td { background:#fafafa; }
  .badge { display:inline-block; border:1px solid #111; padding:1px 8px; font-size:11px; text-transform:uppercase; letter-spacing:.4px; }
  .muted { color:var(--muted); font-size:13px; }
  .kv { display:grid; grid-template-columns:170px 1fr; gap:6px 12px; font-size:14px; }
  .kv div:nth-child(odd){ color:var(--muted); text-transform:uppercase; font-size:11px; letter-spacing:.4px; padding-top:2px; }
  .reply { background:#f4f4f4; border-left:3px solid #111; padding:12px; white-space:pre-wrap; font-size:14px; }
  .err { border:1px solid #111; background:#fff; padding:10px; font-size:13px; }
  a { color:#111; }
  .hidden { display:none; }
</style>
</head>
<body>
<header>
  <h1>Tribeca Task Tool</h1>
  <p>Type an instruction in plain English. It is parsed, you approve it, and the assignee is notified.</p>
</header>

<div class="wrap">
  <nav>
    <button id="tab-new" class="active" onclick="show('new')">New Task</button>
    <button id="tab-dash" onclick="show('dash'); loadTasks()">Dashboard</button>
  </nav>

  <!-- NEW TASK -->
  <section id="view-new">
    <div class="card">
      <h2>New Task</h2>
      <div class="body">
        <textarea id="instruction" placeholder="e.g. Schedule a 30-min interview with Priya Sharma (priya.test@example.com) next Wednesday 3pm"></textarea>
        <button class="btn" id="parseBtn" onclick="parse()">Parse</button>
        <div id="parseErr"></div>
        <div id="newMsg"></div>
      </div>
    </div>

    <div class="card hidden" id="confirmCard">
      <h2>Confirm &amp; Edit</h2>
      <div class="body">
        <p class="muted">Every field is editable. Approve when correct.</p>
        <label>Task Type</label>
        <select id="f_task_type"><option value="calendar_event">calendar_event</option><option value="reminder">reminder</option></select>
        <label>Title</label><input id="f_title" />
        <div class="grid">
          <div><label>Assignee Name</label><input id="f_assignee_name" /></div>
          <div><label>Assignee Email</label><input id="f_assignee_email" /></div>
          <div><label>Start (ISO 8601)</label><input id="f_datetime_start" /></div>
          <div><label>End (ISO 8601)</label><input id="f_datetime_end" /></div>
          <div><label>Priority</label><select id="f_priority"><option>high</option><option selected>normal</option><option>low</option></select></div>
          <div><label>Timezone</label><input id="f_timezone" value="Asia/Kolkata" /></div>
        </div>
        <label>Notes</label><input id="f_notes" />
        <button class="btn" id="approveBtn" onclick="approve()">Approve &amp; Notify</button>
        <button class="btn secondary" onclick="document.getElementById('confirmCard').classList.add('hidden')">Cancel</button>
        <div id="approveResult"></div>
      </div>
    </div>
  </section>

  <!-- DASHBOARD -->
  <section id="view-dash" class="hidden">
    <div class="card">
      <h2>Tasks</h2>
      <div class="body">
        <button class="btn secondary" onclick="loadTasks()">Refresh</button>
        <div id="taskList" style="margin-top:12px"></div>
      </div>
    </div>
  </section>

  <!-- DETAIL -->
  <section id="view-detail" class="hidden">
    <div class="card">
      <h2>Task Detail</h2>
      <div class="body" id="detailBody"></div>
      <div class="body"><button class="btn secondary" onclick="show('dash'); loadTasks()">Back to Dashboard</button></div>
    </div>
  </section>
</div>

<script>
  const FN = location.origin + "/functions/v1";
  // Public anon key — safe to embed in frontend JS (NEVER the service_role key).
  // Sent on every call so requests carry an apikey even if the gateway begins to require one.
  const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZnZXJpZnRpbnpodW9pdmZhdmRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1ODY2NDYsImV4cCI6MjA5NzE2MjY0Nn0.QGhVwQoFndyU6A_HKyMSj8rOSu1pGIRyZJt_DyAmLTs";
  const HDRS = { "Content-Type": "application/json", "apikey": ANON, "Authorization": "Bearer " + ANON };
  const AUTH = { "apikey": ANON, "Authorization": "Bearer " + ANON };

  function show(v) {
    for (const s of ["new","dash","detail"]) document.getElementById("view-"+s).classList.add("hidden");
    document.getElementById("view-"+v).classList.remove("hidden");
    document.getElementById("tab-new").classList.toggle("active", v==="new");
    document.getElementById("tab-dash").classList.toggle("active", v==="dash");
  }

  async function parse() {
    const btn = document.getElementById("parseBtn");
    const err = document.getElementById("parseErr"); err.innerHTML = "";
    document.getElementById("newMsg").innerHTML = "";
    const text = document.getElementById("instruction").value.trim();
    if (!text) return;
    btn.disabled = true; btn.textContent = "Parsing...";
    try {
      const r = await fetch(FN + "/parse", { method:"POST", headers: HDRS, body: JSON.stringify({ text }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error + (d.detail ? ": " + d.detail : ""));
      document.getElementById("f_task_type").value = d.task_type || "calendar_event";
      document.getElementById("f_title").value = d.title || "";
      document.getElementById("f_assignee_name").value = d.assignee_name || "";
      document.getElementById("f_assignee_email").value = d.assignee_email || "";
      document.getElementById("f_datetime_start").value = d.datetime_start || "";
      document.getElementById("f_datetime_end").value = d.datetime_end || "";
      document.getElementById("f_priority").value = d.priority || "normal";
      document.getElementById("f_timezone").value = d.timezone || "Asia/Kolkata";
      document.getElementById("f_notes").value = d.notes || "";
      document.getElementById("confirmCard").classList.remove("hidden");
      document.getElementById("approveResult").innerHTML = "";
    } catch (e) {
      err.innerHTML = '<div class="err">Parse failed: ' + e.message + "</div>";
    } finally { btn.disabled = false; btn.textContent = "Parse"; }
  }

  async function approve() {
    const btn = document.getElementById("approveBtn");
    const out = document.getElementById("approveResult"); out.innerHTML = "";
    const payload = {
      task_type: val("f_task_type"), title: val("f_title"),
      assignee_name: val("f_assignee_name"), assignee_email: val("f_assignee_email"),
      datetime_start: val("f_datetime_start"), datetime_end: val("f_datetime_end"),
      priority: val("f_priority"), timezone: val("f_timezone"), notes: val("f_notes"),
    };
    btn.disabled = true; btn.textContent = "Sending...";
    try {
      const r = await fetch(FN + "/approve", { method:"POST", headers: HDRS, body: JSON.stringify(payload) });
      const d = await r.json();
      const link = d.calendar_event_link ? '<br>Calendar: <a href="'+d.calendar_event_link+'" target="_blank">open event</a>' : "";
      if (d.status === "notified") {
        // Success: collapse the confirm card and reset the form so a finished task doesn't linger.
        document.getElementById("confirmCard").classList.add("hidden");
        document.getElementById("instruction").value = "";
        document.getElementById("newMsg").innerHTML = '<div class="err">Task <b>'+esc(d.task_id)+'</b> created &mdash; assignee notified.'+link+'</div>';
      } else {
        const warn = d.error ? '<br><span class="muted">Note: '+d.error+'</span>' : "";
        out.innerHTML = '<div class="err">Task <b>'+esc(d.task_id)+'</b> &mdash; status: <b>'+esc(d.status)+'</b>'+warn+'</div>';
      }
    } catch (e) {
      out.innerHTML = '<div class="err">Approve failed: ' + e.message + "</div>";
    } finally { btn.disabled = false; btn.textContent = "Approve & Notify"; }
  }

  function val(id){ return document.getElementById(id).value.trim(); }
  function esc(s){ return (s==null?"":String(s)).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  async function loadTasks() {
    const el = document.getElementById("taskList");
    el.innerHTML = '<p class="muted">Loading...</p>';
    const r = await fetch(FN + "/tasks", { headers: AUTH });
    const d = await r.json();
    const tasks = d.tasks || [];
    if (!tasks.length) { el.innerHTML = '<p class="muted">No tasks yet.</p>'; return; }
    let h = '<table><thead><tr><th>Title</th><th>Assignee</th><th>Type</th><th>Status</th><th>Created</th></tr></thead><tbody>';
    for (const t of tasks) {
      h += '<tr class="row" data-id="'+esc(t.task_id)+'">'
        + '<td>'+esc(t.title)+'</td>'
        + '<td>'+esc(t.assignee_name)+'</td>'
        + '<td>'+esc(t.task_type)+'</td>'
        + '<td><span class="badge">'+esc(t.status)+'</span></td>'
        + '<td class="muted">'+new Date(t.created_at).toLocaleString()+'</td></tr>';
    }
    el.innerHTML = h + "</tbody></table>";
    el.querySelectorAll("tr.row").forEach(function(tr){
      tr.addEventListener("click", function(){ detail(tr.getAttribute("data-id")); });
    });
  }

  async function detail(id) {
    show("detail");
    const b = document.getElementById("detailBody");
    b.innerHTML = '<p class="muted">Loading...</p>';
    const r = await fetch(FN + "/tasks?id=" + encodeURIComponent(id), { headers: AUTH });
    const t = await r.json();
    let reply = '<p class="muted">No reply received yet.</p>';
    if (t.reply_text) {
      reply = '<div class="reply">'+esc(t.reply_text)+'</div>'
        + '<p class="muted" style="margin-top:8px">From '+esc(t.assignee_name)+' &lt;'+esc(t.assignee_email)+'&gt;'
        + (t.reply_received_at ? ' at ' + new Date(t.reply_received_at).toLocaleString() : '') + '</p>';
    }
    const cal = t.calendar_event_link ? '<a href="'+t.calendar_event_link+'" target="_blank">open event</a>' : '&mdash;';
    b.innerHTML =
      '<div class="kv">'
      + '<div>Task ID</div><div>'+esc(t.task_id)+'</div>'
      + '<div>Title</div><div>'+esc(t.title)+'</div>'
      + '<div>Status</div><div><span class="badge">'+esc(t.status)+'</span></div>'
      + '<div>Type</div><div>'+esc(t.task_type)+'</div>'
      + '<div>Assignee</div><div>'+esc(t.assignee_name)+' &lt;'+esc(t.assignee_email)+'&gt;</div>'
      + '<div>Start</div><div>'+esc(t.datetime_start)+'</div>'
      + '<div>End</div><div>'+esc(t.datetime_end)+'</div>'
      + '<div>Priority</div><div>'+esc(t.priority)+'</div>'
      + '<div>Notes</div><div>'+esc(t.notes)+'</div>'
      + '<div>Calendar</div><div>'+cal+'</div>'
      + '</div>'
      + '<h3 style="font-size:13px;text-transform:uppercase;letter-spacing:.5px;margin:18px 0 8px">Reply</h3>'
      + reply;
  }
</script>
</body>
</html>`;

Deno.serve(() =>
  new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  })
);
