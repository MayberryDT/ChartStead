#!/usr/bin/env node
/**
 * Local live board for ChartStead Markdown issues under .scratch/.
 * Re-reads files every request + browser polls /api/board.
 *
 *   node scripts/issue-board/server.mjs
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
    title: "Open / ready",
    match: (s) => /^(open|ready|ready-for-agent|todo|backlog)$/i.test(s) || s === "",
  },
  {
    id: "blocked",
    title: "Blocked / other",
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
    comments: comments.slice(-3),
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
  <title>ChartStead issue board</title>
  <style>
    :root {
      --bg: #0b1220;
      --panel: #121a2b;
      --panel-2: #182338;
      --ink: #e8eef8;
      --muted: #93a0b8;
      --line: #243149;
      --done: #1f6f4a;
      --done-bg: #123528;
      --open: #2f5d98;
      --open-bg: #15263f;
      --prog: #a dig;
      --warn: #9a6b16;
      --warn-bg: #3a2c12;
      --accent: #22b573;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font: 14px/1.45 Inter, ui-sans-serif, system-ui, sans-serif;
      background: radial-gradient(1200px 600px at 10% -10%, #173056 0%, transparent 55%), var(--bg);
      color: var(--ink);
      min-height: 100vh;
    }
    header {
      display: flex;
      flex-wrap: wrap;
      gap: 12px 24px;
      align-items: end;
      justify-content: space-between;
      padding: 20px 24px 12px;
      border-bottom: 1px solid var(--line);
      position: sticky;
      top: 0;
      background: color-mix(in srgb, var(--bg) 92%, transparent);
      backdrop-filter: blur(8px);
      z-index: 2;
    }
    h1 { margin: 0; font-size: 22px; letter-spacing: -0.02em; }
    .sub { color: var(--muted); font-size: 13px; margin-top: 4px; }
    .meta { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
    .pill {
      border: 1px solid var(--line);
      background: var(--panel);
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 12px;
      color: var(--muted);
    }
    .pill strong { color: var(--ink); font-weight: 600; }
    .live { color: var(--accent); }
    main { padding: 16px 20px 40px; display: grid; gap: 28px; }
    .track h2 {
      margin: 0 0 12px;
      font-size: 15px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
    }
    .board {
      display: grid;
      grid-template-columns: repeat(4, minmax(200px, 1fr));
      gap: 12px;
      align-items: start;
    }
    @media (max-width: 1100px) {
      .board { grid-template-columns: repeat(2, minmax(200px, 1fr)); }
    }
    @media (max-width: 640px) {
      .board { grid-template-columns: 1fr; }
    }
    .col {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 14px;
      min-height: 120px;
      overflow: hidden;
    }
    .col-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 12px;
      border-bottom: 1px solid var(--line);
      background: var(--panel-2);
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .col-head span {
      background: #0d1524;
      border-radius: 999px;
      padding: 1px 8px;
      color: var(--ink);
    }
    .cards { display: grid; gap: 8px; padding: 10px; }
    .card {
      background: #0e1626;
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 10px 11px;
      display: grid;
      gap: 6px;
    }
    .card.done { border-color: color-mix(in srgb, var(--done) 55%, var(--line)); }
    .card.open { border-color: color-mix(in srgb, var(--open) 45%, var(--line)); }
    .card.blocked { border-color: color-mix(in srgb, var(--warn) 55%, var(--line)); }
    .id {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 11px;
      color: var(--muted);
    }
    .title { font-weight: 600; font-size: 13.5px; line-height: 1.3; }
    .what { color: var(--muted); font-size: 12.5px; }
    .status {
      display: inline-flex;
      width: fit-content;
      border-radius: 999px;
      padding: 2px 8px;
      font-size: 11px;
      font-weight: 600;
      text-transform: lowercase;
    }
    .status.done { background: var(--done-bg); color: #8fe0b5; }
    .status.open { background: var(--open-bg); color: #9ec0ef; }
    .status.in-progress { background: #2a2140; color: #d4c2ff; }
    .status.blocked { background: var(--warn-bg); color: #f0c674; }
    .row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 10px;
      font-size: 11.5px;
      color: var(--muted);
    }
    .path { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10.5px; opacity: 0.8; word-break: break-all; }
    .empty { color: var(--muted); font-size: 12px; padding: 8px 2px; }
    footer { padding: 0 24px 28px; color: var(--muted); font-size: 12px; }
    code { color: #c9d7ef; }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>ChartStead issue board</h1>
      <div class="sub">Local Markdown tracker · auto-refreshes from <code>.scratch/</code></div>
    </div>
    <div class="meta">
      <div class="pill"><span class="live">● live</span> · <span id="age">—</span></div>
      <div class="pill">total <strong id="c-total">0</strong></div>
      <div class="pill">done <strong id="c-done">0</strong></div>
      <div class="pill">open <strong id="c-open">0</strong></div>
      <div class="pill">other <strong id="c-blocked">0</strong></div>
    </div>
  </header>
  <main id="root"><p class="empty">Loading…</p></main>
  <footer>
    Source of truth stays the Markdown files. This page only mirrors them.
    Refresh is every 3s. Run: <code>npm run issues:board</code>
  </footer>
  <script>
    const root = document.getElementById("root");
    let lastJson = "";

    function esc(s) {
      return String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    }

    function render(board) {
      document.getElementById("c-total").textContent = board.counts.total;
      document.getElementById("c-done").textContent = board.counts.done;
      document.getElementById("c-open").textContent = board.counts.open + board.counts.inProgress;
      document.getElementById("c-blocked").textContent = board.counts.blocked;
      const gen = new Date(board.generatedAt);
      document.getElementById("age").textContent = "updated " + gen.toLocaleTimeString();

      root.innerHTML = board.tracks.map((track) => {
        const cols = board.columns.map((col) => {
          const cards = track.issues.filter((i) => i.column === col.id);
          return \`
            <section class="col" aria-label="\${esc(col.title)}">
              <div class="col-head"><div>\${esc(col.title)}</div><span>\${cards.length}</span></div>
              <div class="cards">
                \${cards.length === 0 ? '<div class="empty">None</div>' : cards.map(cardHtml).join("")}
              </div>
            </section>\`;
        }).join("");
        return \`
          <section class="track">
            <h2>\${esc(track.title)}</h2>
            <div class="board">\${cols}</div>
          </section>\`;
      }).join("");
    }

    function cardHtml(issue) {
      const progress =
        issue.checkTotal > 0
          ? \`\${issue.doneCount}/\${issue.checkTotal} checks\`
          : "no checklist";
      const blocked = issue.blockedBy
        ? \`<div class="row">blocked by: \${esc(issue.blockedBy)}</div>\`
        : "";
      const comment =
        issue.comments && issue.comments.length
          ? \`<div class="what">\${esc(issue.comments[issue.comments.length - 1])}</div>\`
          : "";
      return \`
        <article class="card \${esc(issue.column)}">
          <div class="id">\${esc(issue.id)}</div>
          <div class="title">\${esc(issue.title)}</div>
          <div class="status \${esc(issue.column)}">\${esc(issue.status)}</div>
          \${issue.what ? \`<div class="what">\${esc(issue.what)}</div>\` : ""}
          <div class="row"><span>\${progress}</span><span>·</span><span>\${esc(new Date(issue.mtime).toLocaleString())}</span></div>
          \${blocked}
          \${comment}
          <div class="path">\${esc(issue.path)}</div>
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
            "updated " + new Date(board.generatedAt).toLocaleTimeString() + " · stable";
        }
      } catch (err) {
        document.getElementById("age").textContent = "offline";
      }
    }

    tick();
    setInterval(tick, 3000);
  </script>
</body>
</html>
`;

// Fix accidental space in CSS variable from draft
const PAGE_FIXED = PAGE.replace("--prog: #a dig;", "--prog: #7c6af0;");

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
      res.end(PAGE_FIXED);
      return;
    }
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found. Try / or /api/board\n");
  } catch (error) {
    res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
  }
});

server.listen(PORT, HOST, () => {
  const tailscale = "http://100.105.117.93:" + PORT + "/";
  console.log(`ChartStead issue board`);
  console.log(`  local:     http://127.0.0.1:${PORT}/`);
  console.log(`  tailscale: ${tailscale}`);
  console.log(`  api:       http://127.0.0.1:${PORT}/api/board`);
  console.log(`  watching:  .scratch/*/issues/*.md (re-read each poll)`);
});
