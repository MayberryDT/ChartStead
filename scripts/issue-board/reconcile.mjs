#!/usr/bin/env node
/**
 * Frontier maintenance for ChartStead issue boards.
 *
 *   node scripts/issue-board/reconcile.mjs           # dry-run
 *   node scripts/issue-board/reconcile.mjs --apply   # write main-checkout Markdown
 *
 * Rules (match Masthead Pages board discipline):
 * - A ticket is unblocked when every declared blocker is done/complete.
 * - Newly free agent tickets become ready-for-agent.
 * - human-tandem tickets never auto-promote to ready-for-agent.
 * - Still-blocked tickets get a short Comments annotation of remaining blockers.
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "../..");
const APPLY = process.argv.includes("--apply");
const TODAY = new Date().toISOString().slice(0, 10);

const TRACKS = [
  {
    id: "competition",
    label: "Competition",
    dir: join(REPO_ROOT, ".scratch/chartstead-competition-build/issues"),
    aliases: ["competition", "comp"],
  },
  {
    id: "course-check",
    label: "Course Check",
    dir: join(REPO_ROOT, ".scratch/chartstead-course-check/issues"),
    aliases: ["course check", "course-check", "cc"],
  },
];

function parseFront(raw) {
  const lines = raw.split(/\r?\n/);
  let status = "";
  let blockedBy = "";
  let statusLine = -1;
  let blockedLine = -1;
  let commentsIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const sm = line.match(/^\*\*Status:\*\*\s*(.+)\s*$/i);
    if (sm) {
      status = sm[1].trim();
      statusLine = i;
    }
    const bm = line.match(/^\*\*Blocked by:\*\*\s*(.+)\s*$/i);
    if (bm) {
      blockedBy = bm[1].trim();
      blockedLine = i;
    }
    if (/^##\s+Comments\s*$/i.test(line)) commentsIdx = i;
  }

  const idMatch = (lines[0] || "").match(/^#\s*(\d+[a-z]?)\b/i);
  const num = idMatch ? idMatch[1].toLowerCase() : "";

  return { lines, status, blockedBy, statusLine, blockedLine, commentsIdx, num };
}

function statusHead(status) {
  return String(status || "")
    .split("(")[0]
    .trim()
    .toLowerCase();
}

function isDone(status) {
  return /^(done|complete|completed)$/.test(statusHead(status));
}

function isHumanTandem(status) {
  return /human[-\s]?tandem/i.test(status || "");
}

function isBlockedColumn(status) {
  const head = statusHead(status);
  if (isDone(status)) return false;
  if (/in[-\s]?progress|in[-\s]?review|ready-for-qa|human[-\s]?qa/.test(head)) {
    return false;
  }
  if (/^(open|ready|ready-for-agent|todo|backlog)?$/.test(head)) return false;
  return /block|defer|hold|park|wont|cancel|human/.test(head) || isHumanTandem(status);
}

function parseBlockers(blockedBy, defaultTrackId) {
  const text = String(blockedBy || "").trim();
  if (!text || /^(none|n\/a|—|-)$/i.test(text.split(/[—(]/)[0].trim())) {
    return [];
  }

  const parts = text
    .split(/;/)
    .map((p) => p.trim())
    .filter(Boolean);
  const out = [];

  for (const part of parts) {
    const m = part.match(
      /^(?:(Competition|Comp|Course Check|Course-Check|CC)\s+)?(\d+[a-z]?)\b/i,
    );
    if (!m) continue;
    const prefix = (m[1] || "").toLowerCase();
    const num = m[2].toLowerCase();
    let trackId = defaultTrackId;
    if (/^comp/.test(prefix)) trackId = "competition";
    if (/^course|^cc$/.test(prefix)) trackId = "course-check";
    out.push({ trackId, num, raw: part });
  }
  return out;
}

function key(trackId, num) {
  return `${trackId}:${String(num).toLowerCase()}`;
}

async function loadAll() {
  const tickets = [];
  for (const track of TRACKS) {
    let names = [];
    try {
      names = (await readdir(track.dir))
        .filter((n) => n.endsWith(".md"))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    } catch {
      continue;
    }
    for (const name of names) {
      const path = join(track.dir, name);
      const raw = await readFile(path, "utf8");
      const parsed = parseFront(raw);
      tickets.push({
        trackId: track.id,
        trackLabel: track.label,
        name,
        path,
        raw,
        ...parsed,
        blockers: parseBlockers(parsed.blockedBy, track.id),
      });
    }
  }
  return tickets;
}

function remainingBlockers(ticket, byKey) {
  const remaining = [];
  for (const b of ticket.blockers) {
    const dep = byKey.get(key(b.trackId, b.num));
    if (!dep) {
      remaining.push(`${b.trackId} ${b.num} (missing file)`);
      continue;
    }
    if (!isDone(dep.status)) {
      const label =
        b.trackId === ticket.trackId
          ? `${ticket.trackLabel} ${b.num}`
          : `${TRACKS.find((t) => t.id === b.trackId)?.label || b.trackId} ${b.num}`;
      remaining.push(`${label} (${statusHead(dep.status) || "unknown"})`);
    }
  }
  return remaining;
}

function ensureCommentsSection(lines, commentsIdx) {
  if (commentsIdx >= 0) return { lines, commentsIdx };
  const next = [...lines];
  if (next.length && next[next.length - 1] !== "") next.push("");
  next.push("## Comments");
  next.push("");
  return { lines: next, commentsIdx: next.length - 2 };
}

function upsertComment(lines, commentsIdx, marker, body) {
  const { lines: withSection, commentsIdx: idx } = ensureCommentsSection(
    lines,
    commentsIdx,
  );
  const full = `- ${TODAY} — ${marker}: ${body}`;
  // Replace prior reconcile note with same marker if present.
  let replaced = false;
  for (let i = idx + 1; i < withSection.length; i++) {
    if (withSection[i].includes(marker)) {
      withSection[i] = full;
      replaced = true;
      break;
    }
  }
  if (!replaced) {
    if (withSection[withSection.length - 1] !== "") withSection.push("");
    withSection.push(full);
    if (withSection[withSection.length - 1] !== "") withSection.push("");
  }
  return withSection;
}

function setStatus(lines, statusLine, status) {
  if (statusLine < 0) {
    // Insert after Blocked by or title.
    const next = [...lines];
    next.splice(1, 0, "", `**Status:** ${status}`);
    return next;
  }
  const next = [...lines];
  next[statusLine] = `**Status:** ${status}`;
  return next;
}

async function main() {
  const tickets = await loadAll();
  const byKey = new Map(tickets.map((t) => [key(t.trackId, t.num), t]));

  const actions = [];

  for (const t of tickets) {
    // Normalize bare "open" on non-human tickets → ready-for-agent only if unblocked.
    const head = statusHead(t.status);
    const remaining = remainingBlockers(t, byKey);
    const free = remaining.length === 0;

    if (isHumanTandem(t.status)) {
      if (free) {
        actions.push({
          ticket: t,
          kind: "annotate-human-tandem",
          note: "Blockers satisfied; remains human-tandem only (not agent-ready).",
        });
      } else {
        actions.push({
          ticket: t,
          kind: "annotate-blocked",
          note: `Still blocked on: ${remaining.join("; ")}.`,
        });
      }
      continue;
    }

    if (head === "open") {
      // Invalid status. Prefer human-tandem when the ticket already declares it.
      if (/human[-\s]?tandem|not agent-ready/i.test(t.raw)) {
        actions.push({
          ticket: t,
          kind: "block",
          to: "blocked — human-tandem only (not agent-ready)",
          note: `Normalized invalid status "open" to human-tandem (not solo agent-ready).`,
        });
      } else if (free) {
        actions.push({
          ticket: t,
          kind: "promote",
          to: "ready-for-agent",
          note: `Normalized invalid status "open"; all blockers done.`,
        });
      } else {
        actions.push({
          ticket: t,
          kind: "block",
          to: "blocked",
          note: `Normalized invalid status "open"; still blocked on: ${remaining.join("; ")}.`,
        });
      }
      continue;
    }

    if (isBlockedColumn(t.status) && free) {
      actions.push({
        ticket: t,
        kind: "promote",
        to: "ready-for-agent",
        note: `All blockers done → ready-for-agent.`,
      });
      continue;
    }

    if (isBlockedColumn(t.status) && !free) {
      actions.push({
        ticket: t,
        kind: "annotate-blocked",
        note: `Still blocked on: ${remaining.join("; ")}.`,
      });
      continue;
    }

    // ready-for-agent but still has unfinished blockers → re-block
    if (/^(ready-for-agent|ready|todo|backlog)$/.test(head) && !free) {
      actions.push({
        ticket: t,
        kind: "block",
        to: "blocked",
        note: `Had ready status but blockers remain: ${remaining.join("; ")}.`,
      });
    }
  }

  const material = actions.filter((a) =>
    ["promote", "block"].includes(a.kind),
  );
  const annotations = actions.filter((a) =>
    ["annotate-blocked", "annotate-human-tandem"].includes(a.kind),
  );

  console.log(
    APPLY
      ? "Applying frontier reconciliation on main checkout…"
      : "Dry-run frontier reconciliation (pass --apply to write)…",
  );
  console.log("");

  if (!material.length && !annotations.length) {
    console.log("No status or annotation changes needed.");
    return;
  }

  for (const a of material) {
    const id = `${a.ticket.trackLabel} ${a.ticket.num}`;
    console.log(
      `* ${id}: ${a.ticket.status} → ${a.to} — ${a.note}`,
    );
  }
  for (const a of annotations) {
    const id = `${a.ticket.trackLabel} ${a.ticket.num}`;
    if (a.kind === "annotate-human-tandem" || a.kind === "annotate-blocked") {
      // Only print when useful
      if (a.kind === "annotate-human-tandem" || material.length === 0) {
        console.log(`· ${id}: ${a.note}`);
      }
    }
  }

  if (!APPLY) {
    console.log("");
    console.log("Re-run with --apply to write Markdown.");
    return;
  }

  const byPath = new Map();
  for (const a of actions) {
    const t = a.ticket;
    let lines = byPath.get(t.path)?.lines || [...t.lines];
    let statusLine = t.statusLine;
    let commentsIdx = lines.findIndex((l) => /^##\s+Comments\s*$/i.test(l));

    if (a.kind === "promote" || a.kind === "block") {
      lines = setStatus(lines, statusLine, a.to);
      // refresh status line index
      statusLine = lines.findIndex((l) => /^\*\*Status:\*\*/i.test(l));
      commentsIdx = lines.findIndex((l) => /^##\s+Comments\s*$/i.test(l));
      lines = upsertComment(
        lines,
        commentsIdx,
        "frontier-reconcile",
        a.note,
      );
    } else if (
      a.kind === "annotate-blocked" ||
      a.kind === "annotate-human-tandem"
    ) {
      commentsIdx = lines.findIndex((l) => /^##\s+Comments\s*$/i.test(l));
      lines = upsertComment(
        lines,
        commentsIdx,
        "frontier-reconcile",
        a.note,
      );
    }

    byPath.set(t.path, { lines });
  }

  for (const [path, { lines }] of byPath) {
    let body = lines.join("\n");
    if (!body.endsWith("\n")) body += "\n";
    await writeFile(path, body, "utf8");
  }

  console.log("");
  console.log(`Wrote ${byPath.size} issue file(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
