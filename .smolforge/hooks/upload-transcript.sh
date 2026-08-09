#!/bin/sh
# Managed by SmolForge. Safe to run from Claude Code hooks or Git hooks.
set -eu

SMOLFORGE_REPO="tylermayberry/ChartStead"
SMOLFORGE_BASE_URL="https://forge.smol.ai"
export SMOLFORGE_BASE_URL

cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

COMMIT_SHA="${SMOLFORGE_COMMIT_SHA:-}"
if [ -z "$COMMIT_SHA" ]; then
  COMMIT_SHA="$(git rev-parse HEAD 2>/dev/null || true)"
fi

HOOK_PAYLOAD="$(cat 2>/dev/null || true)"
SESSION_ID="$(printf '%s' "$HOOK_PAYLOAD" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{try{const j=JSON.parse(s||"{}");console.log(j.session_id||j.sessionId||j.transcript_path||"")}catch{}})' 2>/dev/null || true)"
PAYLOAD_TRANSCRIPT_PATH="$(printf '%s' "$HOOK_PAYLOAD" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{try{const j=JSON.parse(s||"{}");console.log(j.transcript_path||j.transcriptPath||"")}catch{}})' 2>/dev/null || true)"
PAYLOAD_AGENT_TYPE="$(printf '%s' "$HOOK_PAYLOAD" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{try{const j=JSON.parse(s||"{}");console.log(j.agent_type||j.agentType||j.agent||"")}catch{}})' 2>/dev/null || true)"

find_latest() {
  find "$@" -type f -name '*.jsonl' 2>/dev/null | while IFS= read -r file; do
    printf '%s	%s
' "$(stat -f %m "$file" 2>/dev/null || stat -c %Y "$file" 2>/dev/null || echo 0)" "$file"
  done | sort -rn | awk 'NR==1 { sub(/^[^\t]*\t/, ""); print }'
}

find_by_session() {
  sid="$1"
  [ -n "$sid" ] || return 1
  find "$HOME/.claude/projects" "$HOME/.codex/sessions" "$HOME/.cursor/projects" "$HOME/.factory/sessions" -type f \( -name "$sid.jsonl" -o -name "*$sid*.jsonl" \) 2>/dev/null | head -1
}

workspace_slug() {
  printf '%s' "$1" | sed -E 's|[^A-Za-z0-9]|-|g; s|^-+||; s|-+$||'
}

make_devin_jsonl() {
  command -v sqlite3 >/dev/null 2>&1 || return 1
  db=""
  for candidate in "$HOME/.local/share/devin/cli/sessions.db" "$HOME/.config/devin/cli/sessions.db"; do
    [ -f "$candidate" ] && { db="$candidate"; break; }
  done
  [ -n "$db" ] || return 1
  out="$(mktemp -t smolforge-devin.XXXXXX.jsonl 2>/dev/null || mktemp)"
  sqlite3 -json "$db" "SELECT id, model, working_directory FROM sessions ORDER BY rowid DESC LIMIT 1" 2>/dev/null | node -e '
const fs=require("fs");
let s=""; process.stdin.on("data",d=>s+=d); process.stdin.on("end",()=>{try{const rows=JSON.parse(s||"[]"); if(!rows[0]) process.exit(1); fs.writeFileSync(process.argv[1]+".meta", JSON.stringify(rows[0]));}catch{process.exit(1)}})
' "$out" || return 1
  sid="$(node -e 'const fs=require("fs"); const m=JSON.parse(fs.readFileSync(process.argv[1]+".meta","utf8")); process.stdout.write(String(m.id||""))' "$out" 2>/dev/null || true)"
  [ -n "$sid" ] || return 1
  sqlite3 -json "$db" "SELECT chat_message, created_at, updated_at FROM message_nodes WHERE session_id = '$sid' ORDER BY rowid ASC" 2>/dev/null | node -e '
let s=""; process.stdin.on("data",d=>s+=d); process.stdin.on("end",()=>{let rows=[]; try{rows=JSON.parse(s||"[]")}catch{}; for (const row of rows) { try { const msg=JSON.parse(row.chat_message||"{}"); const content=Array.isArray(msg.content)?msg.content.map(p=>typeof p==="string"?p:(p&&p.text)||"").filter(Boolean).join("
"):(msg.content||""); if (msg.role && content) console.log(JSON.stringify({session_id:process.argv[1], role:msg.role, content, timestamp:row.created_at||row.updated_at||""})); } catch {} }})
' "$sid" > "$out"
  [ -s "$out" ] && { printf '%s
' "$out"; return 0; }
  return 1
}

make_opencode_jsonl() {
  command -v sqlite3 >/dev/null 2>&1 || return 1
  db="${OPENCODE_DB:-}"
  if [ -z "$db" ]; then
    db="$(find "$HOME/.local/share/opencode" -maxdepth 1 -type f -name 'opencode*.db' 2>/dev/null | head -1)"
  fi
  [ -f "$db" ] || return 1
  out="$(mktemp -t smolforge-opencode.XXXXXX.jsonl 2>/dev/null || mktemp)"
  sid="$(sqlite3 "$db" "SELECT id FROM session ORDER BY rowid DESC LIMIT 1" 2>/dev/null || true)"
  [ -n "$sid" ] || return 1
  sqlite3 -json "$db" "SELECT m.id, m.time_created, m.data AS message_data, p.data AS part_data FROM message m LEFT JOIN part p ON p.message_id = m.id WHERE m.session_id = '$sid' ORDER BY COALESCE(m.time_created, p.time_created, m.id) ASC" 2>/dev/null | node -e '
let s=""; process.stdin.on("data",d=>s+=d); process.stdin.on("end",()=>{let rows=[]; try{rows=JSON.parse(s||"[]")}catch{}; const by=new Map(); for (const r of rows) { let msg={}, part={}; try{msg=JSON.parse(r.message_data||"{}")}catch{}; try{part=JSON.parse(r.part_data||"{}")}catch{}; const id=r.id; const cur=by.get(id)||{session_id:process.argv[1], role:msg.role||msg.type||"assistant", content:[], timestamp:r.time_created||""}; const text=part.text||part.content||part.data?.text||""; if (typeof text==="string" && text) cur.content.push(text); by.set(id,cur); } for (const m of by.values()) { const content=m.content.join("
").trim(); if (content) console.log(JSON.stringify({...m, content})); }})
' "$sid" > "$out"
  [ -s "$out" ] && { printf '%s
' "$out"; return 0; }
  return 1
}

TRANSCRIPT_FILE="${SMOLFORGE_TRANSCRIPT_FILE:-}"
AGENT_TYPE="${SMOLFORGE_AGENT_TYPE:-$PAYLOAD_AGENT_TYPE}"

if [ -z "$TRANSCRIPT_FILE" ] && [ -n "$PAYLOAD_TRANSCRIPT_PATH" ] && [ -f "$PAYLOAD_TRANSCRIPT_PATH" ]; then
  TRANSCRIPT_FILE="$PAYLOAD_TRANSCRIPT_PATH"
fi

if [ -z "$TRANSCRIPT_FILE" ] && [ -n "$SESSION_ID" ]; then
  TRANSCRIPT_FILE="$(find_by_session "$SESSION_ID" || true)"
fi

if [ -z "$TRANSCRIPT_FILE" ]; then
  CURSOR_PROJECT="$HOME/.cursor/projects/$(workspace_slug "$(pwd)")/agent-transcripts"
  TRANSCRIPT_FILE="$(find_latest "$HOME/.codex/sessions" "$HOME/.claude/projects" "$HOME/.cursor/projects" "$CURSOR_PROJECT" "$HOME/.factory/sessions" 2>/dev/null || true)"
fi

if [ -z "$TRANSCRIPT_FILE" ]; then
  TRANSCRIPT_FILE="$(make_devin_jsonl || true)"
  [ -n "$TRANSCRIPT_FILE" ] && AGENT_TYPE="${AGENT_TYPE:-devin}"
fi

if [ -z "$TRANSCRIPT_FILE" ]; then
  TRANSCRIPT_FILE="$(make_opencode_jsonl || true)"
  [ -n "$TRANSCRIPT_FILE" ] && AGENT_TYPE="${AGENT_TYPE:-opencode}"
fi

case "$TRANSCRIPT_FILE" in
  *"/.codex/"*) AGENT_TYPE="${AGENT_TYPE:-codex}" ;;
  *"/.claude/"*) AGENT_TYPE="${AGENT_TYPE:-claude-code}" ;;
  *"/.cursor/"*) AGENT_TYPE="${AGENT_TYPE:-cursor}" ;;
  *"/.factory/"*) AGENT_TYPE="${AGENT_TYPE:-factory}" ;;
  *) AGENT_TYPE="${AGENT_TYPE:-custom}" ;;
esac

if [ -z "$TRANSCRIPT_FILE" ] || [ ! -f "$TRANSCRIPT_FILE" ]; then
  echo "SmolForge: no agent transcript JSONL found" >&2
  exit 0
fi

if ! command -v sf >/dev/null 2>&1 && ! command -v smolforge >/dev/null 2>&1; then
  echo "SmolForge: sf/smolforge command not found" >&2
  exit 0
fi

BIN="$(command -v sf 2>/dev/null || command -v smolforge)"
set -- transcript upload "$SMOLFORGE_REPO" --file "$TRANSCRIPT_FILE" --agent-type "$AGENT_TYPE"
if [ -n "$COMMIT_SHA" ]; then
  set -- "$@" --commit "$COMMIT_SHA"
fi
if [ -n "$SESSION_ID" ] && [ "$SESSION_ID" != "$PAYLOAD_TRANSCRIPT_PATH" ] && [ "$SESSION_ID" != "$TRANSCRIPT_FILE" ]; then
  set -- "$@" --session-id "$SESSION_ID"
fi

"$BIN" "$@" >/dev/null 2>&1 || {
  echo "SmolForge: transcript upload failed for $TRANSCRIPT_FILE" >&2
  exit 0
}

echo "SmolForge: uploaded transcript $(basename "$TRANSCRIPT_FILE")"
