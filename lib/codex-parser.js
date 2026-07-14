// Codex CLI / Desktop session reader.
//
// Codex stores one JSONL "rollout" file per session under
// ~/.codex/sessions/YYYY/MM/DD/rollout-<timestamp>-<uuid>.jsonl (and archived
// sessions under ~/.codex/archived_sessions/ with the same nested layout). No
// sqlite involved — read directly like Claude's own JSONL reader in parser.js.
import fs from 'fs';
import path from 'path';
import os from 'os';

export const CODEX_HOME = path.join(os.homedir(), '.codex');
export const CODEX_SESSIONS_DIR = path.join(CODEX_HOME, 'sessions');
export const CODEX_ARCHIVED_DIR = path.join(CODEX_HOME, 'archived_sessions');

// Junk / synthetic wrapper content injected by Codex itself — never a real
// human-typed prompt. Mirrors parser.js's SKIP_PREFIXES/isSkippable for Claude.
const SKIP_PREFIXES = [
  '<environment_context>',
  'The following is the Codex agent history whose request action you are assessing',
];

function isSkippable(text) {
  const t = text.trim();
  if (!t) return true;
  return SKIP_PREFIXES.some((p) => t.startsWith(p));
}

function extractText(content) {
  if (!Array.isArray(content)) return '';
  return content
    .filter(
      (b) =>
        b && (b.type === 'input_text' || b.type === 'output_text') && typeof b.text === 'string'
    )
    .map((b) => b.text)
    .join('\n');
}

// Recursively find all *.jsonl rollout files under a root dir (nested YYYY/MM/DD layout).
function findRolloutFiles(root) {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(root, e.name);
    if (e.isDirectory()) {
      out.push(...findRolloutFiles(full));
    } else if (e.isFile() && e.name.endsWith('.jsonl')) {
      out.push(full);
    }
  }
  return out;
}

function allRolloutFiles() {
  return [...findRolloutFiles(CODEX_SESSIONS_DIR), ...findRolloutFiles(CODEX_ARCHIVED_DIR)];
}

export function codexAvailable() {
  try {
    return fs.existsSync(CODEX_SESSIONS_DIR) || fs.existsSync(CODEX_ARCHIVED_DIR);
  } catch {
    return false;
  }
}

export function listCodexSources() {
  if (!codexAvailable()) return [];
  const files = allRolloutFiles();
  if (!files.length) return [];

  let bytes = 0;
  let latest = 0;
  for (const f of files) {
    let st;
    try {
      st = fs.statSync(f);
    } catch {
      continue;
    }
    bytes += st.size;
    if (st.mtimeMs > latest) latest = st.mtimeMs;
  }

  return [
    {
      id: 'codex::global',
      kind: 'codex',
      label: 'Codex — all sessions',
      sessions: files.length,
      bytes,
      lastActive: latest ? new Date(latest).toISOString() : null,
    },
  ];
}

const sortEntries = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]);

export function loadCodexPrompts(/* id */) {
  const files = allRolloutFiles();
  const prompts = [];
  const sessionIds = new Set();
  const models = {},
    tools = {},
    versions = {};

  for (const file of files) {
    let lines;
    try {
      lines = fs.readFileSync(file, 'utf8').split('\n');
    } catch {
      continue;
    }

    let sessionId = null;
    let cwd = null;

    for (const line of lines) {
      if (!line.trim()) continue;
      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }

      if (obj.type === 'session_meta' && obj.payload) {
        sessionId = obj.payload.id || sessionId;
        cwd = obj.payload.cwd || cwd;
        if (obj.payload.cli_version)
          versions[obj.payload.cli_version] = (versions[obj.payload.cli_version] || 0) + 1;
        continue;
      }

      if (obj.type === 'turn_context' && obj.payload) {
        cwd = obj.payload.cwd || cwd;
        if (obj.payload.model) models[obj.payload.model] = (models[obj.payload.model] || 0) + 1;
        continue;
      }

      if (obj.type !== 'response_item' || !obj.payload) continue;
      const payload = obj.payload;

      if (payload.type === 'function_call' && payload.name) {
        tools[payload.name] = (tools[payload.name] || 0) + 1;
        continue;
      }

      if (payload.type !== 'message' || payload.role !== 'user') continue;

      const text = extractText(payload.content).trim();
      if (isSkippable(text)) continue;

      prompts.push({
        text,
        isSlash: text.startsWith('/'),
        ts: obj.timestamp || null,
        session: sessionId || path.basename(file),
        cwd,
        gitBranch: null,
      });
      if (sessionId) sessionIds.add(sessionId);
    }

    if (!sessionId) sessionIds.add(path.basename(file));
  }

  prompts.sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));
  const meta = {
    models: sortEntries(models).map(([name, count]) => ({ name, count })),
    tools: sortEntries(tools).map(([name, count]) => ({ name, count })),
    languages: [],
    versions: sortEntries(versions).map(([version, count]) => ({ version, count })),
  };
  return { prompts, sessionCount: sessionIds.size || files.length, meta };
}
