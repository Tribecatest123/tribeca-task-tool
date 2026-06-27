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
  :root { --ink:#111; --line:#e5e5e5; --muted:#6b6b6b; --bg:#f6f6f7; --r:10px; }
  * { box-sizing: border-box; }
  html, body { max-width:100%; overflow-x:hidden; }
  body { margin:0; font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
         color: var(--ink); background: var(--bg); line-height: 1.5; }
  header { background:#111; color:#fff; padding:18px 24px; }
  header h1 { margin:0; font-size:19px; font-weight:700; letter-spacing:.2px; }
  header p { margin:4px 0 0; font-size:12.5px; color:#b9b9b9; }
  .wrap { max-width: 880px; margin: 24px auto; padding: 0 16px; }
  nav { display:flex; gap:8px; margin-bottom:18px; }
  nav button { border:1px solid var(--line); background:#fff; padding:9px 16px; cursor:pointer; font-size:14px; border-radius:999px; }
  nav button.active { background:#111; color:#fff; border-color:#111; font-weight:600; }
  .card { background:#fff; border:1px solid var(--line); border-radius:var(--r); margin-bottom:16px; overflow:hidden; box-shadow:0 1px 2px rgba(0,0,0,.04); }
  .card h2 { margin:0; background:#111; color:#fff; font-size:12.5px; font-weight:700;
             text-transform:uppercase; letter-spacing:.6px; padding:11px 16px; }
  .card .body { padding:16px; }
  textarea { width:100%; min-height:90px; padding:11px; border:1px solid var(--line); border-radius:8px; font-size:14px; font-family:inherit; resize:vertical; }
  label { display:block; font-size:11.5px; color:var(--muted); margin:10px 0 4px; text-transform:uppercase; letter-spacing:.4px; }
  input, select { width:100%; padding:9px 10px; border:1px solid var(--line); border-radius:8px; font-size:14px; font-family:inherit; background:#fff; }
  input:focus, select:focus, textarea:focus { outline:none; border-color:#111; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:0 16px; }
  .btn { background:#111; color:#fff; border:none; padding:10px 18px; font-size:14px; cursor:pointer; margin-top:14px; font-weight:600; border-radius:8px; }
  .btn:hover { background:#000; }
  .btn.secondary { background:#fff; color:#111; border:1px solid #111; }
  .btn.secondary:hover { background:#f2f2f2; }
  .btn:disabled { opacity:.5; cursor:default; }
  .muted { color:var(--muted); font-size:13px; }
  /* Filter bar */
  .filters { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
  .filters input, .filters select { flex:1 1 150px; min-width:0; }
  .filters .btn { margin-top:0; flex:0 0 auto; }
  /* Task list (responsive cards instead of a table) */
  .tasklist { display:flex; flex-direction:column; gap:10px; }
  .titem { display:flex; flex-wrap:wrap; align-items:center; gap:8px 14px;
           border:1px solid var(--line); border-radius:var(--r); padding:13px 15px; background:#fff; cursor:pointer; transition:border-color .12s, box-shadow .12s; }
  .titem:hover { border-color:#111; box-shadow:0 1px 3px rgba(0,0,0,.08); }
  .titem .t-main { flex:1 1 240px; min-width:0; }
  .titem .t-title { font-weight:600; font-size:15px; overflow-wrap:anywhere; }
  .titem .t-sub { color:var(--muted); font-size:12.5px; margin-top:3px; overflow-wrap:anywhere; }
  .titem .t-meta { display:flex; align-items:center; gap:8px; flex:0 0 auto; }
  .badge { display:inline-block; border:1px solid #cfcfcf; background:#f2f2f2; color:#222;
           padding:3px 9px; font-size:10.5px; font-weight:600; border-radius:999px; text-transform:uppercase; letter-spacing:.4px; white-space:nowrap; }
  .kv { display:grid; grid-template-columns:160px 1fr; gap:8px 12px; font-size:14px; }
  .kv div:nth-child(odd){ color:var(--muted); text-transform:uppercase; font-size:11px; letter-spacing:.4px; padding-top:2px; }
  .reply { background:#f6f6f7; border-left:3px solid #111; border-radius:6px; padding:12px; white-space:pre-wrap; overflow-wrap:anywhere; font-size:14px; }
  .err { border:1px solid var(--line); background:#fff; border-radius:8px; padding:12px; font-size:13.5px; }
  a { color:#111; }
  .hidden { display:none; }
  @media (max-width:560px) {
    .grid { grid-template-columns:1fr; }
    .kv { grid-template-columns:1fr; gap:2px 0; }
    .kv div:nth-child(even){ margin-bottom:8px; }
    .titem .t-meta { flex-basis:100%; }
    .wrap { margin:16px auto; }
  }
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
        <div class="filters">
          <input id="f_search" type="text" list="taskSuggest" autocomplete="off" placeholder="Search by title or assignee" oninput="renderTasks()" />
          <datalist id="taskSuggest"></datalist>
          <select id="f_type" onchange="renderTasks()"><option value="">All types</option></select>
          <select id="f_status" onchange="renderTasks()"><option value="">All statuses</option></select>
          <button class="btn secondary" onclick="loadTasks()">Refresh</button>
        </div>
        <div id="taskCount" class="muted" style="margin:12px 2px"></div>
        <div id="taskList"></div>
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
      if (d.status === "notified") {
        // Success: collapse the confirm card and reset the form so a finished task doesn't linger.
        document.getElementById("confirmCard").classList.add("hidden");
        document.getElementById("instruction").value = "";
        const cal = d.calendar_event_link ? ' and a calendar invitation' : '';
        const calLink = d.calendar_event_link ? '<br>Calendar: <a href="'+d.calendar_event_link+'" target="_blank">open event</a>' : "";
        document.getElementById("newMsg").innerHTML =
          '<div class="err"><b>Task created successfully.</b> The assignee has been notified by email'+cal+'.'
          + calLink
          + '<br><button class="btn secondary" style="margin-top:10px" onclick="dismissMsg()">Dismiss</button></div>';
      } else {
        const warn = d.error ? '<br><span class="muted">Note: '+d.error+'</span>' : "";
        out.innerHTML = '<div class="err">Could not notify the assignee &mdash; status: <b>'+esc(d.status)+'</b>'+warn+'</div>';
      }
    } catch (e) {
      out.innerHTML = '<div class="err">Approve failed: ' + e.message + "</div>";
    } finally { btn.disabled = false; btn.textContent = "Approve & Notify"; }
  }

  function dismissMsg(){ document.getElementById("newMsg").innerHTML = ""; }
  function val(id){ return document.getElementById(id).value.trim(); }
  function esc(s){ return (s==null?"":String(s)).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  let ALL_TASKS = [];

  function fillSelect(id, values, allLabel) {
    const sel = document.getElementById(id);
    const cur = sel.value;
    let h = '<option value="">' + allLabel + '</option>';
    values.forEach(function(v){ h += '<option value="'+esc(v)+'">'+esc(v)+'</option>'; });
    sel.innerHTML = h;
    sel.value = cur; // preserve any active selection across refreshes
  }

  async function loadTasks() {
    const el = document.getElementById("taskList");
    el.innerHTML = '<p class="muted">Loading...</p>';
    try {
      const r = await fetch(FN + "/tasks", { headers: AUTH });
      const d = await r.json();
      ALL_TASKS = d.tasks || [];
    } catch (e) {
      el.innerHTML = '<div class="err">Could not load tasks: ' + e.message + '</div>';
      return;
    }
    const types = Array.from(new Set(ALL_TASKS.map(function(t){return t.task_type;}).filter(Boolean))).sort();
    const statuses = Array.from(new Set(ALL_TASKS.map(function(t){return t.status;}).filter(Boolean))).sort();
    fillSelect("f_type", types, "All types");
    fillSelect("f_status", statuses, "All statuses");

    // Autocomplete suggestions for the search box: titles first, then assignee names.
    const titles = Array.from(new Set(ALL_TASKS.map(function(t){return t.title;}).filter(Boolean)));
    const names = Array.from(new Set(ALL_TASKS.map(function(t){return t.assignee_name;}).filter(Boolean)));
    document.getElementById("taskSuggest").innerHTML =
      titles.concat(names).map(function(v){ return '<option value="'+esc(v)+'"></option>'; }).join("");

    renderTasks();
  }

  function renderTasks() {
    const el = document.getElementById("taskList");
    const count = document.getElementById("taskCount");
    const q = (document.getElementById("f_search").value || "").toLowerCase().trim();
    const ty = document.getElementById("f_type").value;
    const st = document.getElementById("f_status").value;

    const rows = (ALL_TASKS || []).filter(function(t){
      if (ty && t.task_type !== ty) return false;
      if (st && t.status !== st) return false;
      if (q) {
        const hay = ((t.title||"") + " " + (t.assignee_name||"") + " " + (t.assignee_email||"")).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    if (!ALL_TASKS.length) { count.textContent = ""; el.innerHTML = '<p class="muted">No tasks yet.</p>'; return; }
    count.textContent = "Showing " + rows.length + " of " + ALL_TASKS.length + " task" + (ALL_TASKS.length===1?"":"s");
    if (!rows.length) { el.innerHTML = '<p class="muted">No tasks match your filters.</p>'; return; }

    let h = '<div class="tasklist">';
    for (const t of rows) {
      const sub = [esc(t.assignee_name||"—"), esc(t.task_type), new Date(t.created_at).toLocaleString()].join(" &middot; ");
      h += '<div class="titem" data-id="'+esc(t.task_id)+'">'
        + '<div class="t-main"><div class="t-title">'+esc(t.title)+'</div><div class="t-sub">'+sub+'</div></div>'
        + '<div class="t-meta"><span class="badge">'+esc(t.status)+'</span></div>'
        + '</div>';
    }
    el.innerHTML = h + "</div>";
    el.querySelectorAll(".titem").forEach(function(it){
      it.addEventListener("click", function(){ detail(it.getAttribute("data-id")); });
    });
  }

  async function detail(id) {
    show("detail");
    const b = document.getElementById("detailBody");
    b.innerHTML = '<p class="muted">Loading...</p>';
    const r = await fetch(FN + "/tasks?id=" + encodeURIComponent(id), { headers: AUTH });
    const t = await r.json();
    const replies = Array.isArray(t.replies) ? t.replies : [];
    let reply;
    if (replies.length) {
      reply = replies.map(function(r){
        return '<div class="reply">'+esc(r.reply_text)+'</div>'
          + '<p class="muted" style="margin:6px 0 16px">From '+esc(t.assignee_name)+' &lt;'+esc(r.assignee_email||t.assignee_email)+'&gt;'
          + (r.received_at ? ' at ' + new Date(r.received_at).toLocaleString() : '') + '</p>';
      }).join('');
    } else if (t.reply_text) {
      reply = '<div class="reply">'+esc(t.reply_text)+'</div>'
        + '<p class="muted" style="margin-top:8px">From '+esc(t.assignee_name)+' &lt;'+esc(t.assignee_email)+'&gt;'
        + (t.reply_received_at ? ' at ' + new Date(t.reply_received_at).toLocaleString() : '') + '</p>';
    } else {
      reply = '<p class="muted">No reply received yet.</p>';
    }
    const replyHeading = replies.length > 1 ? 'Replies (' + replies.length + ')' : 'Reply';
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
      + '<h3 style="font-size:13px;text-transform:uppercase;letter-spacing:.5px;margin:18px 0 8px">'+replyHeading+'</h3>'
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
