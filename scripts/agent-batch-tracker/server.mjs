#!/usr/bin/env node
/**
 * Throwaway live tracker for parallel Competition 63–67 agents.
 *   node scripts/agent-batch-tracker/server.mjs --host 0.0.0.0 --port 3940
 */
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, stat, access } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createConnection } from "node:net";

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "../..");
const TRANSCRIPTS = "/home/halla/.cursor/projects/home-halla-ChartStead/agent-transcripts";

const args = process.argv.slice(2);
function flag(name, fallback) {
  const i = args.indexOf(name);
  return i === -1 ? fallback : (args[i + 1] ?? fallback);
}
const HOST = flag("--host", "0.0.0.0");
const PORT = Number(flag("--port", "3940"));

const JOBS = [
  {
    id: "63",
    title: "Messages history",
    ticket: "Competition 63",
    issue: "63-show-full-message-history.md",
    worktree: "competition-63-message-history",
    branch: "competition-63-message-history",
    agentId: "eb102e1f-fb42-47f8-aff6-f1c5585a4a07",
    demoPort: 5863,
    demoPath: "/demo",
  },
  {
    id: "64",
    title: "Agenda multi-day switcher",
    ticket: "Competition 64",
    issue: "64-agenda-multi-day-switcher.md",
    worktree: "competition-64-agenda-day-switcher",
    branch: "competition-64-agenda-day-switcher",
    agentId: "a99549f2-b1a7-41b9-b7a9-336f587b48aa",
    demoPort: 5864,
    demoPath: "/demo",
  },
  {
    id: "65",
    title: "Speakers search layout",
    ticket: "Competition 65",
    issue: "65-fix-speakers-search-layout.md",
    worktree: "competition-65-speakers-search",
    branch: "competition-65-speakers-search",
    agentId: "c38d51ea-6a05-417e-9baf-c42184066f19",
    demoPort: 5865,
    demoPath: "/demo",
  },
  {
    id: "66",
    title: "Forms preview follows selection",
    ticket: "Competition 66",
    issue: "66-forms-preview-follows-selection.md",
    worktree: "competition-66-forms-preview",
    branch: "competition-66-forms-preview",
    agentId: "edb00535-9910-4bbd-a1a3-7d220b644e8e",
    demoPort: 5866,
    demoPath: "/demo",
  },
  {
    id: "67",
    title: "Locked submission rows",
    ticket: "Competition 67",
    issue: "67-obvious-locked-submission-rows.md",
    worktree: "competition-67-locked-rows",
    branch: "competition-67-locked-rows",
    agentId: "0fd88ce9-bead-4b25-8db7-31347f83dbd9",
    demoPort: 5867,
    demoPath: "/demo",
  },
];

function portOpen(port) {
  return new Promise((resolvePort) => {
    const socket = createConnection({ host: "127.0.0.1", port }, () => {
      socket.end();
      resolvePort(true);
    });
    socket.on("error", () => resolvePort(false));
    socket.setTimeout(400, () => {
      socket.destroy();
      resolvePort(false);
    });
  });
}

async function readIssueStatus(issueFile, fromWorktree) {
  const path = fromWorktree
    ? join(REPO, ".worktrees", fromWorktree, ".scratch/chartstead-competition-build/issues", issueFile)
    : join(REPO, ".scratch/chartstead-competition-build/issues", issueFile);
  try {
    const text = await readFile(path, "utf8");
    const m = text.match(/\*\*Status:\*\*\s*(.+)/);
    const checked = [...text.matchAll(/^- \[([ xX])\] /gm)];
    const done = checked.filter((c) => c[1].toLowerCase() === "x").length;
    const total = checked.length;
    const comments = [...text.matchAll(/^- (\d{4}-\d{2}-\d{2}) — (.+)$/gm)].slice(-3);
    return {
      status: m?.[1]?.trim() ?? "unknown",
      checklist: { done, total },
      recentComments: comments.map((c) => ({ date: c[1], text: c[2].slice(0, 220) })),
      path,
    };
  } catch {
    return { status: "missing", checklist: { done: 0, total: 0 }, recentComments: [], path };
  }
}

async function gitSnapshot(worktree) {
  const cwd = join(REPO, ".worktrees", worktree);
  try {
    await access(cwd);
  } catch {
    return { exists: false, short: "missing worktree", files: [], insertions: 0, deletions: 0 };
  }
  try {
    const [{ stdout: status }, { stdout: diffStat }, { stdout: nameOnly }] = await Promise.all([
      execFileAsync("git", ["status", "-sb"], { cwd }),
      execFileAsync("git", ["diff", "--shortstat"], { cwd }),
      execFileAsync("git", ["diff", "--name-only"], { cwd }),
    ]);
    const untracked = (await execFileAsync("git", ["ls-files", "--others", "--exclude-standard"], { cwd })).stdout
      .trim()
      .split("\n")
      .filter(Boolean);
    const files = [...new Set([...nameOnly.trim().split("\n").filter(Boolean), ...untracked])]
      .filter((f) => !f.includes(".scratch/chartstead-competition-build/issues/"))
      .slice(0, 20);
    const ins = Number((diffStat.match(/(\d+) insertion/) || [])[1] || 0);
    const del = Number((diffStat.match(/(\d+) deletion/) || [])[1] || 0);
    return {
      exists: true,
      short: status.trim().split("\n")[0],
      files,
      insertions: ins,
      deletions: del,
      dirty: Boolean(files.length || status.includes(" M") || status.includes("??")),
    };
  } catch (err) {
    return { exists: true, short: String(err.message || err), files: [], insertions: 0, deletions: 0 };
  }
}

function extractText(message) {
  const content = message?.message?.content;
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part?.type === "text") return part.text || "";
        if (part?.type === "tool_use") return `[tool] ${part.name || "tool"}`;
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

async function transcriptActivity(agentId) {
  const path = join(TRANSCRIPTS, agentId, `${agentId}.jsonl`);
  try {
    const st = await stat(path);
    const raw = await readFile(path, "utf8");
    const lines = raw.trim().split("\n").filter(Boolean);
    let lastAssistant = null;
    let toolCount = 0;
    let assistantCount = 0;
    for (const line of lines) {
      try {
        const row = JSON.parse(line);
        if (row.role === "assistant") {
          assistantCount += 1;
          lastAssistant = row;
        }
        const text = extractText(row);
        if (text.includes("[tool]") || /"type":"tool_use"/.test(line) || row?.message?.content?.some?.((p) => p.type === "tool_use")) {
          toolCount += 1;
        }
        // count tool_use parts
        const parts = row?.message?.content;
        if (Array.isArray(parts)) {
          for (const p of parts) if (p?.type === "tool_use" || p?.name) toolCount += 1;
        }
      } catch {
        /* skip */
      }
    }
    const snippet = extractText(lastAssistant)
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 280);
    return {
      path,
      bytes: st.size,
      mtimeMs: st.mtimeMs,
      mtime: st.mtime.toISOString(),
      lines: lines.length,
      assistantTurns: assistantCount,
      snippet: snippet || "(no assistant text yet)",
      ageSeconds: Math.max(0, Math.round((Date.now() - st.mtimeMs) / 1000)),
    };
  } catch {
    return {
      path,
      bytes: 0,
      mtimeMs: 0,
      mtime: null,
      lines: 0,
      assistantTurns: 0,
      snippet: "(transcript missing)",
      ageSeconds: null,
    };
  }
}

async function snapshotJob(job) {
  const [board, worktreeIssue, git, demoUp, activity] = await Promise.all([
    readIssueStatus(job.issue, null),
    readIssueStatus(job.issue, job.worktree),
    gitSnapshot(job.worktree),
    portOpen(job.demoPort),
    transcriptActivity(job.agentId),
  ]);

  let phase = "working";
  const status = board.status.toLowerCase();
  if (status.includes("in-review")) phase = "ready-for-qa";
  else if (status.includes("done")) phase = "done";
  else if (!git.exists) phase = "missing";
  else if (activity.ageSeconds != null && activity.ageSeconds > 180 && !demoUp && git.files.length === 0) phase = "stalled?";
  else if (demoUp && status.includes("in-progress")) phase = "demo-up";

  return {
    ...job,
    phase,
    boardStatus: board.status,
    worktreeStatus: worktreeIssue.status,
    checklist: board.checklist,
    recentComments: board.recentComments,
    git,
    demo: {
      up: demoUp,
      url: `http://100.105.117.93:${job.demoPort}${job.demoPath}`,
      local: `http://127.0.0.1:${job.demoPort}${job.demoPath}`,
    },
    activity,
  };
}

async function buildSnapshot() {
  const jobs = await Promise.all(JOBS.map(snapshotJob));
  const ready = jobs.filter((j) => j.phase === "ready-for-qa" || j.phase === "done").length;
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      total: jobs.length,
      readyForQa: ready,
      demosUp: jobs.filter((j) => j.demo.up).length,
      inProgress: jobs.filter((j) => String(j.boardStatus).toLowerCase().includes("in-progress")).length,
    },
    jobs,
    links: {
      board: "http://100.105.117.93:3939/",
      tracker: `http://100.105.117.93:${PORT}/`,
    },
  };
}

const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Competition 63–67 agent batch</title>
<style>
  :root {
    --ink: #0f1c2e;
    --muted: #5b6b7c;
    --line: #d7dee7;
    --bg: #f3f6f9;
    --card: #fff;
    --ok: #1f7a4d;
    --warn: #9a6700;
    --run: #1a5fb4;
    --bad: #a51d2d;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font: 15px/1.45 "IBM Plex Sans", "Source Sans 3", system-ui, sans-serif;
    color: var(--ink);
    background:
      radial-gradient(900px 420px at 10% -10%, #d9e8f7 0%, transparent 60%),
      radial-gradient(700px 380px at 100% 0%, #e8f0e6 0%, transparent 55%),
      var(--bg);
    min-height: 100vh;
  }
  header {
    padding: 28px 28px 12px;
    display: flex;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    align-items: end;
  }
  h1 { margin: 0; font-size: 28px; letter-spacing: -0.02em; }
  .sub { color: var(--muted); margin-top: 6px; }
  .stats { display: flex; gap: 10px; flex-wrap: wrap; }
  .stat {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 10px 14px;
    min-width: 110px;
  }
  .stat b { display: block; font-size: 22px; }
  .stat span { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
  main { padding: 12px 28px 40px; display: grid; gap: 14px; }
  .card {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 16px 18px;
    display: grid;
    gap: 10px;
  }
  .top { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; align-items: start; }
  .title { font-size: 18px; font-weight: 650; }
  .meta { color: var(--muted); font-size: 13px; }
  .pill {
    display: inline-flex; align-items: center; gap: 6px;
    border-radius: 999px; padding: 4px 10px; font-size: 12px; font-weight: 600;
    border: 1px solid var(--line); background: #f8fafc;
  }
  .pill.ready-for-qa, .pill.done { color: var(--ok); border-color: #b6dfc6; background: #eefaf2; }
  .pill.demo-up, .pill.working { color: var(--run); border-color: #bdd3f0; background: #eef4fc; }
  .pill.stalled\\?, .pill.missing { color: var(--bad); border-color: #f0b8bf; background: #fff1f2; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; }
  .box { border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; background: #fbfcfe; }
  .box h3 { margin: 0 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); font-weight: 600; }
  .box p, .box ul { margin: 0; }
  .box ul { padding-left: 18px; color: var(--muted); }
  .snippet { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; color: #243447; white-space: pre-wrap; }
  a { color: #154a8a; }
  footer { padding: 0 28px 28px; color: var(--muted); font-size: 13px; }
  .bar { height: 8px; background: #e6ebf0; border-radius: 99px; overflow: hidden; }
  .bar > i { display: block; height: 100%; background: linear-gradient(90deg, #2b6cb0, #2f9e6b); }
</style>
</head>
<body>
  <header>
    <div>
      <h1>Competition 63–67 batch</h1>
      <div class="sub">Live tracker · auto-refresh 3s · <span id="stamp">…</span></div>
    </div>
    <div class="stats" id="stats"></div>
  </header>
  <main id="jobs"></main>
  <footer>
    Also: issue board <a href="http://100.105.117.93:3939/">http://100.105.117.93:3939/</a>
    · API <a href="/api/status">/api/status</a>
  </footer>
<script>
async function load() {
  const res = await fetch('/api/status', { cache: 'no-store' });
  const data = await res.json();
  document.getElementById('stamp').textContent = new Date(data.generatedAt).toLocaleTimeString();
  document.getElementById('stats').innerHTML = [
    ['Ready for QA', data.summary.readyForQa],
    ['In progress', data.summary.inProgress],
    ['Demos up', data.summary.demosUp],
    ['Total', data.summary.total],
  ].map(([label, value]) => '<div class="stat"><b>'+value+'</b><span>'+label+'</span></div>').join('');

  document.getElementById('jobs').innerHTML = data.jobs.map(job => {
    const pct = job.checklist.total ? Math.round(100 * job.checklist.done / job.checklist.total) : 0;
    const files = (job.git.files || []).slice(0, 8).map(f => '<li>'+f+'</li>').join('') || '<li>no code diffs yet</li>';
    const comments = (job.recentComments || []).map(c => '<li>'+c.date+' — '+escapeHtml(c.text)+'</li>').join('') || '<li>none</li>';
    return '<section class="card">'
      + '<div class="top"><div><div class="title">'+job.ticket+' — '+job.title+'</div>'
      + '<div class="meta">'+job.worktree+' · agent '+job.agentId.slice(0,8)+' · port '+job.demoPort+'</div></div>'
      + '<span class="pill '+job.phase+'">'+job.phase+'</span></div>'
      + '<div class="bar"><i style="width:'+pct+'%"></i></div>'
      + '<div class="grid">'
      + '<div class="box"><h3>Board status</h3><p><b>'+escapeHtml(job.boardStatus)+'</b></p>'
      + '<p class="meta">checklist '+job.checklist.done+'/'+job.checklist.total+' · worktree status: '+escapeHtml(job.worktreeStatus)+'</p></div>'
      + '<div class="box"><h3>Demo</h3><p>'+(job.demo.up ? '🟢 listening' : '⚪ not up')+'</p>'
      + (job.demo.up ? '<p><a href="'+job.demo.url+'" target="_blank" rel="noreferrer">'+job.demo.url+'</a></p>' : '<p class="meta">will appear when agent starts demo</p>')
      + '</div>'
      + '<div class="box"><h3>Git</h3><p>'+escapeHtml(job.git.short || '')+'</p>'
      + '<p class="meta">+'+job.git.insertions+' / -'+job.git.deletions+' · '+(job.git.files||[]).length+' files</p><ul>'+files+'</ul></div>'
      + '<div class="box"><h3>Agent activity</h3><p class="meta">'+(job.activity.mtime ? ('updated '+job.activity.ageSeconds+'s ago · '+job.activity.lines+' transcript lines') : 'no transcript')+'</p>'
      + '<p class="snippet">'+escapeHtml(job.activity.snippet)+'</p></div>'
      + '<div class="box"><h3>Recent issue comments</h3><ul>'+comments+'</ul></div>'
      + '</div></section>';
  }).join('');
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
load();
setInterval(load, 3000);
</script>
</body>
</html>`;

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    if (url.pathname === "/api/status") {
      const snap = await buildSnapshot();
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end(JSON.stringify(snap, null, 2));
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    res.end(PAGE);
  } catch (err) {
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end(String(err?.stack || err));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Agent batch tracker on http://${HOST}:${PORT}/`);
  console.log(`Tailscale: http://100.105.117.93:${PORT}/`);
});
