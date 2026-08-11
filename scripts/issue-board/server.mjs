#!/usr/bin/env node
/**
 * Local live board for ChartStead Markdown issues under .scratch/.
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
const PAGE_PATH = join(__dirname, "page.html");
const FAVICON_SVG = join(REPO_ROOT, "favicon.svg");
const FAVICON_PNG = join(REPO_ROOT, "design/assets/brand/chartstead-favicon.png");

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

// Order is display order left→right. Matching is explicit (not first-match
// on a catch-all), so "done" never falls into Other.
const COLUMN_ORDER = ["open", "in-progress", "blocked", "done"];

const COLUMN_META = {
  open: { id: "open", title: "Open" },
  "in-progress": { id: "in-progress", title: "In progress" },
  blocked: { id: "blocked", title: "Other" },
  done: { id: "done", title: "Done" },
};

function parseIssue(text) {
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

  const comments = [];
  const commentsIdx = lines.findIndex((line) => /^##\s+Comments\s*$/i.test(line));
  if (commentsIdx >= 0) {
    for (const line of lines.slice(commentsIdx + 1)) {
      if (/^##\s+/.test(line)) break;
      const m = line.match(/^-\s+(.+)$/);
      if (m) comments.push(m[1].trim());
    }
  }

  const normalizedStatus = status || "ready-for-agent";
  return {
    title,
    status: normalizedStatus,
    blockedBy: /^(none)?$/i.test(blockedBy) ? "" : blockedBy,
    what,
    checks,
    doneCount: checks.filter((c) => c.done).length,
    checkTotal: checks.length,
    comments: comments.slice(-4),
  };
}

function columnFor(status) {
  const s = String(status || "").trim();
  // Strip parenthetical notes: "done (merged to main)" → "done"
  const head = s.split("(")[0].trim().toLowerCase();
  if (/^(done|complete|completed)$/.test(head)) return "done";
  // Human QA / review still occupies the active lane (no separate column).
  if (
    /in[-\s]?progress|doing|active|in[-\s]?review|ready-for-qa|human[-\s]?qa/.test(
      head,
    )
  ) {
    return "in-progress";
  }
  if (/^(open|ready|ready-for-agent|todo|backlog)?$/.test(head)) return "open";
  // blocked / deferred / unknown labels
  if (/block|defer|hold|park|wont|cancel/.test(head)) return "blocked";
  return "open";
}

async function loadTrack(track) {
  let names = [];
  try {
    names = (await readdir(track.dir))
      .filter((name) => name.endsWith(".md"))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  } catch {
    return { id: track.id, title: track.title, issues: [] };
  }

  const issues = [];
  for (const name of names) {
    const path = join(track.dir, name);
    const raw = await readFile(path, "utf8");
    const st = await stat(path);
    const parsed = parseIssue(raw);
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
  for (const track of TRACKS) tracks.push(await loadTrack(track));
  const all = tracks.flatMap((t) => t.issues);
  return {
    generatedAt: new Date().toISOString(),
    repoRoot: REPO_ROOT,
    counts: {
      total: all.length,
      done: all.filter((i) => i.column === "done").length,
      open: all.filter((i) => i.column === "open").length,
      inProgress: all.filter((i) => i.column === "in-progress").length,
      blocked: all.filter((i) => i.column === "blocked").length,
    },
    columns: COLUMN_ORDER.map((id) => COLUMN_META[id]),
    tracks,
  };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  try {
    if (url.pathname === "/api/board" || url.pathname === "/api/board.json") {
      const board = await buildBoard();
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "access-control-allow-origin": "*",
      });
      res.end(JSON.stringify(board));
      return;
    }
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const html = await readFile(PAGE_PATH, "utf8");
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end(html);
      return;
    }
    if (url.pathname === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (url.pathname === "/favicon.svg" || url.pathname === "/favicon.ico") {
      const svg = await readFile(FAVICON_SVG);
      res.writeHead(200, {
        "content-type": "image/svg+xml",
        "cache-control": "public, max-age=86400",
      });
      res.end(svg);
      return;
    }
    if (url.pathname === "/favicon.png") {
      const png = await readFile(FAVICON_PNG);
      res.writeHead(200, {
        "content-type": "image/png",
        "cache-control": "public, max-age=86400",
      });
      res.end(png);
      return;
    }
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found\n");
  } catch (error) {
    res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
});

server.on("error", (error) => {
  console.error("issue-board failed to start:", error.message);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`ChartStead issue board`);
  console.log(`  local:     http://127.0.0.1:${PORT}/`);
  console.log(`  tailscale: http://100.105.117.93:${PORT}/`);
  console.log(`  api:       http://127.0.0.1:${PORT}/api/board`);
  console.log(`  health:    http://127.0.0.1:${PORT}/health`);
});
