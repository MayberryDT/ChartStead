#!/usr/bin/env node
/**
 * Local live board for ChartStead Markdown issues under .scratch/.
 * Re-reads files every request + browser polls /api/board.
 *
 *   npm run issues:board
 *   node scripts/issue-board/server.mjs --port 3939 --host 0.0.0.0
 */

import { createServer } from "node:http";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");

const args = process.argv.slice(2);
function flag(name, fallback) {
  const idx = args.indexOf(name);
  if (idx === -1) return fallback;
  return args[idx + 1] ?? fallback;
}

const HOST = flag("--host", "0.0.0.0");
const PORT = Number(flag("--port", "3939"));

const TRACKS = [
  {
    id: "competition",
    title: "Competition build",
    dir: join(REPO_ROOT, ".scratch/chartstead-competition-build/issues"),
  },
  {
    id: "course-check",
    title: "Course Check",
    dir: join(REPO_ROOT, ".scratch/chartstead-course-check/issues"),
  },
];

const COLUMNS = [
  { id: "done", title: "Done", match: (s) => /^(done|complete|completed)$/i.test(s) },
  {
    id: "in-progress",
    title: "In progress",
    match: (s) => /in[- ]?progress|doing|active/i.test(s),
  },
  {
    id: "open",
    title: "Open",
    match: (s) => /^(open|ready|ready-for-agent|todo|backlog)$/i.test(s) || s === "",
  },
  {
    id: "blocked",
    title: "Other",
    match: () => true,
  },
];

function parseFrontMatterish(text) {
  const lines = text.split(/\r?\n/);
  const title =
    lines.find((line) => line.startsWith("# "))?.replace(/^#\s+/, "").trim() ||
    "Untitled";

  let status = "";
  let blockedBy = "";
  let what = "";
  for (const line of lines.slice(0, 40)) {
    const statusMatch = line.match(/^\*\*Status:\*\*\s*(.+)\s*$/i);
    if (statusMatch) status = statusMatch[1].trim();
    const blockedMatch = line.match(/^\*\*Blocked by:\*\*\s*(.+)\s*$/i);
    if (blockedMatch) blockedBy = blockedMatch[1].trim();
    const whatMatch = line.match(/^\*\*What to build:\*\*\s*(.+)\s*$/i);
    if (whatMatch) what = whatMatch[1].trim();
  }

  const checks = [...text.matchAll(/^- \[([ xX])\]\s+(.+)$/gm)].map((m) => ({
    done: m[1].toLowerCase() === "x",
    text: m[2].trim(),
  }));
  const doneCount = checks.filter((c) => c.done).length;

  const comments = [];
  const commentsIdx = lines.findIndex((line) => /^##\s+Comments\s*$/i.test(line));
  if (commentsIdx >= 0) {
    for (const line of lines.slice(commentsIdx + 1)) {
      if (/^##\s+/.test(line)) break;
      const m = line.match(/^-\s+(.+)$/);
      if (m) comments.push(m[1].trim());
    }
  }

  return {
    title,
    status: status || "ready-for-agent",
    blockedBy: blockedBy === "none" || blockedBy === "None" ? "" : blockedBy,
    what,
    checks,
    doneCount,
    checkTotal: checks.length,
    comments: comments.slice(-4),
  };
}

function columnFor(status) {
  for (const col of COLUMNS) {
    if (col.match(status)) return col.id;
  }
  return "open";
}

async function loadTrack(track) {
  let names = [];
  try {
    names = (await readdir(track.dir))
      .filter((name) => name.endsWith(".md"))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  } catch {
    return { ...track, issues: [], error: "missing directory" };
  }

  const issues = [];
  for (const name of names) {
    const path = join(track.dir, name);
    const raw = await readFile(path, "utf8");
    const st = await stat(path);
    const parsed = parseFrontMatterish(raw);
    issues.push({
      id: basename(name, ".md"),
      file: name,
      path: path.replace(REPO_ROOT + "/", ""),
      mtime: st.mtime.toISOString(),
      column: columnFor(parsed.status),
      ...parsed,
    });
  }
  return { id: track.id, title: track.title, issues };
}

async function buildBoard() {
  const tracks = [];
  for (const track of TRACKS) {
    tracks.push(await loadTrack(track));
  }
  const all = tracks.flatMap((t) => t.issues.map((i) => ({ ...i, track: t.id })));
  const counts = {
    total: all.length,
    done: all.filter((i) => i.column === "done").length,
    open: all.filter((i) => i.column === "open").length,
    inProgress: all.filter((i) => i.column === "in-progress").length,
    blocked: all.filter((i) => i.column === "blocked").length,
  };
  return {
    generatedAt: new Date().toISOString(),
    repoRoot: REPO_ROOT,
    counts,
    columns: COLUMNS.map(({ id, title }) => ({ id, title })),
    tracks,
  };
}

const PAGE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ChartStead · Issues</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    :root {
      --primary: #081d3a;
      --on-primary: #ffffff;
      --secondary: #2f5d98;
      --tertiary: #22b573;
      --background: #ffffff;
      --on-background: #081d3a;
      --surface: #ffffff;
      --surface-subtle: #f3f5f7;
      --surface-muted: #e9edf2;
      --on-surface: #081d3a;
      --on-surface-variant: #526071;
      --on-surface-muted: #5b6878;
      --outline: #d7dee7;
      --outline-strong: #aebac8;
      --selection: #eaf2fb;
      --info-container: #eaf2fb;
      --on-info-container: #244e7d;
      --success-container: #e9f8f1;
      --on-success-container: #087a4d;
      --warning-container: #fff4e5;
      --on-warning-container: #8a4d09;
      --error-container: #fdecea;
      --on-error-container: #8a1c13;
      --focus-ring: #2f5d98;
      --r: 2px;
      --ease: cubic-bezier(0.2, 0.8, 0.2, 1);
      --dur: 140ms;
    }
    * { box-sizing: border-box; }
    html, body { height: 100%; }
    body {
      margin: 0;
      font-family: Inter, system-ui, -apple-system, sans-serif;
      font-size: 13px;
      line-height: 1.4;
      color: var(--on-surface);
      background: var(--surface-subtle);
      font-feature-settings: "tnum" 1;
      -webkit-font-smoothing: antialiased;
    }
    button { font: inherit; color: inherit; cursor: pointer; border: 0; background: none; padding: 0; text-align: left; }
    :focus { outline: none; }
    :focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }

    .app {
      min-height: 100vh;
      display: grid;
      grid-template-rows: auto 1fr;
    }

    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 0 16px;
      height: 48px;
      background: var(--primary);
      color: var(--on-primary);
      border-bottom: 1px solid rgba(255,255,255,0.08);
    }
    .brand {
      display: flex;
      align-items: baseline;
      gap: 10px;
      min-width: 0;
    }
    .brand strong {
      font-size: 14px;
      font-weight: 600;
      letter-spacing: -0.01em;
    }
    .brand span {
      font-size: 12px;
      color: rgba(255,255,255,0.62);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .top-meta {
      display: flex;
      align-items: stretch;
      gap: 0;
      border: 1px solid rgba(255,255,255,0.14);
      background: rgba(255,255,255,0.04);
    }
    .stat {
      display: grid;
      justify-items: center;
      gap: 0;
      min-width: 52px;
      padding: 4px 10px;
      border-right: 1px solid rgba(255,255,255,0.12);
    }
    .stat:last-child { border-right: 0; }
    .stat b {
      font-size: 14px;
      font-weight: 600;
      line-height: 1.1;
      font-variant-numeric: tabular-nums;
    }
    .stat em {
      font-style: normal;
      font-size: 10px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: rgba(255,255,255,0.55);
    }
    .live {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 0 10px;
      font-size: 11px;
      color: rgba(255,255,255,0.7);
      border-left: 1px solid rgba(255,255,255,0.12);
      white-space: nowrap;
    }
    .live i {
      width: 6px;
      height: 6px;
      background: var(--tertiary);
      display: inline-block;
    }

    .shell {
      padding: 12px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      align-items: start;
      max-width: 1440px;
      margin: 0 auto;
      width: 100%;
    }
    @media (max-width: 960px) {
      .shell { grid-template-columns: 1fr; }
    }

    .track {
      background: var(--surface);
      border: 1px solid var(--outline);
      box-shadow: 0 1px 2px rgba(8, 29, 58, 0.04);
      min-width: 0;
    }
    .track-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 10px;
      border-bottom: 1px solid var(--outline);
      background: var(--surface);
    }
    .track-head h2 {
      margin: 0;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--on-surface-variant);
    }
    .track-count {
      font-size: 12px;
      font-weight: 600;
      color: var(--on-surface-muted);
      font-variant-numeric: tabular-nums;
    }

    .cols {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 0;
      border-top: 0;
    }
    .col {
      min-width: 0;
      border-right: 1px solid var(--outline);
      background: var(--surface);
    }
    .col:last-child { border-right: 0; }
    .col-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      padding: 6px 8px;
      border-bottom: 1px solid var(--outline);
      background: var(--surface-subtle);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--on-surface-muted);
    }
    .col-head b {
      font-weight: 600;
      color: var(--on-surface);
      font-variant-numeric: tabular-nums;
    }
    .list { display: flex; flex-direction: column; }
    .empty {
      padding: 10px 8px;
      color: var(--on-surface-muted);
      font-size: 12px;
    }

    .card {
      border-bottom: 1px solid var(--outline);
      background: var(--surface);
    }
    .card:last-child { border-bottom: 0; }
    .card[data-col="done"] { box-shadow: inset 3px 0 0 var(--tertiary); }
    .card[data-col="open"] { box-shadow: inset 3px 0 0 var(--secondary); }
    .card[data-col="in-progress"] { box-shadow: inset 3px 0 0 #5c3f8c; }
    .card[data-col="blocked"] { box-shadow: inset 3px 0 0 var(--warning-container); border-left: 0; }
    .card[data-col="blocked"] { box-shadow: inset 3px 0 0 #c47a16; }

    .summary {
      width: 100%;
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 2px 8px;
      padding: 7px 8px 7px 10px;
      align-items: start;
    }
    .summary:hover { background: var(--selection); }
    .card[open] > .summary,
    .card.is-open > .summary {
      background: var(--selection);
      border-bottom: 1px solid var(--outline);
    }
    .id {
      grid-column: 1;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 10px;
      color: var(--on-surface-muted);
      line-height: 1.2;
    }
    .chev {
      grid-column: 2;
      grid-row: 1 / span 2;
      align-self: center;
      width: 14px;
      height: 14px;
      color: var(--on-surface-muted);
      transition: transform var(--dur) var(--ease);
    }
    .card.is-open .chev { transform: rotate(90deg); }
    .title {
      grid-column: 1;
      font-size: 12px;
      font-weight: 600;
      line-height: 1.25;
      letter-spacing: -0.01em;
      color: var(--on-surface);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .meta-line {
      grid-column: 1 / -1;
      display: flex;
      flex-wrap: wrap;
      gap: 4px 8px;
      align-items: center;
      margin-top: 2px;
      font-size: 11px;
      color: var(--on-surface-muted);
    }
    .flag {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 1px 5px;
      border: 1px solid var(--outline);
      background: var(--surface-subtle);
      color: var(--on-surface-variant);
      font-size: 10px;
      font-weight: 600;
      line-height: 1.3;
      text-transform: lowercase;
      border-radius: var(--r);
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .flag::before {
      content: "";
      width: 6px;
      height: 6px;
      flex: 0 0 auto;
      background: var(--outline-strong);
    }
    .flag.done {
      background: var(--success-container);
      color: var(--on-success-container);
      border-color: #b7e5cf;
    }
    .flag.done::before { background: var(--tertiary); }
    .flag.open {
      background: var(--info-container);
      color: var(--on-info-container);
      border-color: #b7cce8;
    }
    .flag.open::before { background: var(--secondary); }
    .flag.in-progress {
      background: #f0ebfa;
      color: #5c3f8c;
      border-color: #d5c8ef;
    }
    .flag.in-progress::before { background: #5c3f8c; }
    .flag.blocked {
      background: var(--warning-container);
      color: var(--on-warning-container);
      border-color: #f0d4a8;
    }
    .flag.blocked::before { background: #c47a16; }

    .detail {
      display: none;
      padding: 8px 10px 10px;
      background: var(--surface-subtle);
      border-top: 0;
      gap: 8px;
    }
    .card.is-open .detail { display: grid; }
    .detail p {
      margin: 0;
      font-size: 12px;
      color: var(--on-surface-variant);
      line-height: 1.45;
    }
    .detail h3 {
      margin: 0;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--on-surface-muted);
    }
    .checks {
      margin: 0;
      padding: 0;
      list-style: none;
      display: grid;
      gap: 3px;
    }
    .checks li {
      display: grid;
      grid-template-columns: 12px 1fr;
      gap: 6px;
      font-size: 11.5px;
      color: var(--on-surface-variant);
      line-height: 1.35;
    }
    .checks li i {
      width: 10px;
      height: 10px;
      margin-top: 2px;
      border: 1px solid var(--outline-strong);
      background: var(--surface);
      border-radius: var(--r);
    }
    .checks li.on i {
      background: var(--tertiary);
      border-color: var(--tertiary);
    }
    .checks li.on { color: var(--on-surface-muted); text-decoration: line-through; text-decoration-color: var(--outline-strong); }
    .kv {
      display: grid;
      gap: 4px;
      font-size: 11px;
      color: var(--on-surface-muted);
    }
    .kv code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 10.5px;
      color: var(--on-surface-variant);
      word-break: break-all;
    }
    .notes {
      margin: 0;
      padding: 0;
      list-style: none;
      display: grid;
      gap: 4px;
    }
    .notes li {
      font-size: 11.5px;
      color: var(--on-surface-variant);
      padding: 6px 7px;
      border: 1px solid var(--outline);
      background: var(--surface);
      border-radius: var(--r);
    }

    .foot {
      grid-column: 1 / -1;
      font-size: 11px;
      color: var(--on-surface-muted);
      padding: 0 2px;
    }
    .foot code { font-family: ui-monospace, Menlo, monospace; font-size: 10.5px; }
  </style>
</head>
<body>
  <div class="app">
    <header class="topbar">
      <div class="brand">
        <strong>ChartStead</strong>
        <span>Issue board · .scratch Markdown</span>
      </div>
      <div class="top-meta" aria-label="Summary counts">
        <div class="stat"><b id="c-total">0</b><em>total</em></div>
        <div class="stat"><b id="c-done">0</b><em>done</em></div>
        <div class="stat"><b id="c-open">0</b><em>open</em></div>
        <div class="stat"><b id="c-other">0</b><em>other</em></div>
        <div class="live"><i aria-hidden="true"></i><span id="age">connecting</span></div>
      </div>
    </header>
    <main class="shell" id="root">
      <p class="empty">Loading…</p>
    </main>
  </div>
  <script>
    const root = document.getElementById("root");
    let lastJson = "";
    const openIds = new Set();

    function esc(s) {
      return String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    }

    function shortId(id) {
      // 01-walking-skeleton-and-seeded-event → 01
      const m = String(id).match(/^(\\d+[a-z]?)/i);
      return m ? m[1] : id;
    }

    function shortTitle(title) {
      return String(title).replace(/^\\d+[a-z]?\\s*[—–-]\\s*/i, "").trim();
    }

    function render(board) {
      document.getElementById("c-total").textContent = board.counts.total;
      document.getElementById("c-done").textContent = board.counts.done;
      document.getElementById("c-open").textContent = board.counts.open + board.counts.inProgress;
      document.getElementById("c-other").textContent = board.counts.blocked;
      document.getElementById("age").textContent = new Date(board.generatedAt).toLocaleTimeString();

      root.innerHTML = board.tracks.map((track) => {
        const cols = board.columns.map((col) => {
          const cards = track.issues.filter((i) => i.column === col.id);
          return \`
            <section class="col" aria-label="\${esc(col.title)}">
              <div class="col-head"><span>\${esc(col.title)}</span><b>\${cards.length}</b></div>
              <div class="list">
                \${cards.length === 0 ? '<div class="empty">—</div>' : cards.map((issue) => cardHtml(issue, track.id)).join("")}
              </div>
            </section>\`;
        }).join("");
        return \`
          <section class="track">
            <div class="track-head">
              <h2>\${esc(track.title)}</h2>
              <div class="track-count">\${track.issues.length}</div>
            </div>
            <div class="cols">\${cols}</div>
          </section>\`;
      }).join("") + \`
        <p class="foot">
          Source of truth is the Markdown under <code>.scratch/</code>. Click a ticket to expand.
          Auto-refresh 3s · <code>npm run issues:board</code>
        </p>\`;

      root.querySelectorAll("[data-issue]").forEach((el) => {
        const key = el.getAttribute("data-issue");
        if (openIds.has(key)) el.classList.add("is-open");
        el.querySelector(".summary")?.addEventListener("click", () => {
          const open = el.classList.toggle("is-open");
          if (open) openIds.add(key);
          else openIds.delete(key);
        });
      });
    }

    function cardHtml(issue, trackId) {
      const key = trackId + ":" + issue.id;
      const progress =
        issue.checkTotal > 0
          ? issue.doneCount + "/" + issue.checkTotal
          : "—";
      const checks =
        issue.checks && issue.checks.length
          ? \`<div>
              <h3>Checklist</h3>
              <ul class="checks">
                \${issue.checks
                  .map(
                    (c) =>
                      \`<li class="\${c.done ? "on" : ""}"><i aria-hidden="true"></i><span>\${esc(c.text)}</span></li>\`,
                  )
                  .join("")}
              </ul>
            </div>\`
          : "";
      const notes =
        issue.comments && issue.comments.length
          ? \`<div>
              <h3>Recent notes</h3>
              <ul class="notes">\${issue.comments.map((c) => \`<li>\${esc(c)}</li>\`).join("")}</ul>
            </div>\`
          : "";
      return \`
        <article class="card" data-col="\${esc(issue.column)}" data-issue="\${esc(key)}">
          <button type="button" class="summary" aria-expanded="false">
            <div class="id">\${esc(shortId(issue.id))}</div>
            <svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>
            <div class="title">\${esc(shortTitle(issue.title))}</div>
            <div class="meta-line">
              <span class="flag \${esc(issue.column)}">\${esc(issue.status)}</span>
              <span>\${esc(progress)}</span>
            </div>
          </button>
          <div class="detail">
            \${issue.what ? \`<p>\${esc(issue.what)}</p>\` : "<p>No summary.</p>"}
            <div class="kv">
              \${issue.blockedBy ? \`<div>Blocked by: \${esc(issue.blockedBy)}</div>\` : "<div>Blocked by: —</div>"}
              <div>Updated: \${esc(new Date(issue.mtime).toLocaleString())}</div>
              <div><code>\${esc(issue.path)}</code></div>
            </div>
            \${checks}
            \${notes}
          </div>
        </article>\`;
    }

    async function tick() {
      try {
        const res = await fetch("/api/board", { cache: "no-store" });
        const board = await res.json();
        const json = JSON.stringify(board);
        if (json !== lastJson) {
          lastJson = json;
          render(board);
        } else {
          document.getElementById("age").textContent =
            new Date(board.generatedAt).toLocaleTimeString();
        }
      } catch {
        document.getElementById("age").textContent = "offline";
      }
    }

    tick();
    setInterval(tick, 3000);
  </script>
</body>
</html>
`;

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  try {
    if (url.pathname === "/api/board" || url.pathname === "/api/board.json") {
      const board = await buildBoard();
      const body = JSON.stringify(board, null, 2);
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "access-control-allow-origin": "*",
      });
      res.end(body);
      return;
    }
    if (url.pathname === "/" || url.pathname === "/index.html") {
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end(PAGE);
      return;
    }
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found. Try / or /api/board\\n");
  } catch (error) {
    res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`ChartStead issue board`);
  console.log(`  local:     http://127.0.0.1:${PORT}/`);
  console.log(`  tailscale: http://100.105.117.93:${PORT}/`);
  console.log(`  api:       http://127.0.0.1:${PORT}/api/board`);
});
