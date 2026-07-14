// OpenCode session reader.
//
// OpenCode stores its data in a SQLite db (no JSONL). We read it with the
// system `sqlite3` CLI, same as cursor-parser.js, so there's no native build
// dependency. Human prompts live in `message` rows with role=user, joined to
// their `part` rows of type=text. Session == message.session_id.
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Per-platform locations of OpenCode's SQLite store.
function candidatePaths() {
  const home = os.homedir();
  const xdg = process.env.XDG_DATA_HOME;
  const paths = [];
  if (xdg) paths.push(path.join(xdg, 'opencode', 'opencode.db'));
  paths.push(path.join(home, '.local', 'share', 'opencode', 'opencode.db'));
  return paths;
}

// First existing candidate path, resolved lazily so it works if OpenCode is
// installed after the server starts.
function opencodeDb() {
  return (
    candidatePaths().find((p) => {
      try {
        return fs.existsSync(p);
      } catch {
        return false;
      }
    }) || null
  );
}

export function opencodeAvailable() {
  try {
    if (!opencodeDb()) return false;
    execFileSync('sqlite3', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function query(db, sql) {
  const out = execFileSync('sqlite3', ['-json', '-readonly', db, sql], {
    maxBuffer: 256 * 1024 * 1024,
    encoding: 'utf8',
  }).trim();
  return out ? JSON.parse(out) : [];
}

const sortEntries = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]);

function emptyMeta() {
  return { models: [], tools: [], languages: [], versions: [] };
}

// OpenCode injects synthetic "the user did X" notes as user-role messages
// (e.g. when a file is opened/selected in the editor) — not human typing.
// Mirrors Claude's SKIP_PREFIXES filter in lib/parser.js.
const SKIP_PREFIXES = ['<system-reminder'];

function isSkippable(text) {
  const t = text.trim();
  if (!t) return true;
  return SKIP_PREFIXES.some((p) => t.startsWith(p));
}

export function listOpencodeSources() {
  if (!opencodeAvailable()) return [];
  const db = opencodeDb();
  let rows;
  try {
    rows = query(
      db,
      `SELECT count(DISTINCT session_id) AS sessions, count(*) AS prompts ` +
        `FROM message WHERE json_extract(data,'$.role')='user';`
    );
  } catch {
    return [];
  }
  const r = rows[0] || {};
  if (!r.prompts) return [];

  let lastActive = null;
  try {
    const la = query(db, `SELECT max(time_updated) AS t FROM session;`);
    const t = la[0] && la[0].t;
    if (t) lastActive = new Date(Number(t)).toISOString();
  } catch {
    lastActive = null;
  }

  return [
    {
      id: 'opencode::global',
      kind: 'opencode',
      label: 'OpenCode — all sessions',
      sessions: r.sessions || 0,
      prompts: r.prompts,
      lastActive,
    },
  ];
}

export function loadOpencodePrompts(/* id */) {
  if (!opencodeAvailable()) return { prompts: [], sessionCount: 0, meta: emptyMeta() };
  const db = opencodeDb();

  // User messages, joined to their cwd (via session -> project.worktree).
  let userMsgs;
  try {
    userMsgs = query(
      db,
      `SELECT m.id AS id, m.session_id AS session, m.time_created AS ts, ` +
        `COALESCE(s.directory, p.worktree) AS cwd ` +
        `FROM message m ` +
        `LEFT JOIN session s ON s.id = m.session_id ` +
        `LEFT JOIN project p ON p.id = s.project_id ` +
        `WHERE json_extract(m.data,'$.role')='user' ` +
        `ORDER BY m.session_id, m.time_created;`
    );
  } catch {
    // DB busy/locked (OpenCode open) or malformed — degrade gracefully.
    return { prompts: [], sessionCount: 0, meta: emptyMeta() };
  }
  if (!Array.isArray(userMsgs)) userMsgs = [];

  // Text parts for every message, in id order, to concatenate per message.
  let textParts;
  try {
    textParts = query(
      db,
      `SELECT message_id AS message, json_extract(data,'$.text') AS text ` +
        `FROM part WHERE json_extract(data,'$.type')='text' ORDER BY message_id, id;`
    );
  } catch {
    textParts = [];
  }
  if (!Array.isArray(textParts)) textParts = [];

  const textByMsg = {};
  for (const row of textParts) {
    if (!row.message) continue;
    const t = row.text || '';
    textByMsg[row.message] = textByMsg[row.message] ? textByMsg[row.message] + '\n' + t : t;
  }

  // Model tally from assistant messages.
  const models = {};
  try {
    const assistantRows = query(
      db,
      `SELECT data FROM message WHERE json_extract(data,'$.role')='assistant';`
    );
    for (const row of assistantRows) {
      let d;
      try {
        d = JSON.parse(row.data);
      } catch {
        continue;
      }
      const modelID = (d.model && d.model.modelID) || d.modelID;
      if (modelID) models[modelID] = (models[modelID] || 0) + 1;
    }
  } catch {
    /* best-effort */
  }

  // Tool tally across ALL parts, not filtered by role.
  const tools = {};
  try {
    const toolRows = query(
      db,
      `SELECT json_extract(data,'$.tool') AS tool, count(*) AS n ` +
        `FROM part WHERE json_extract(data,'$.type')='tool' GROUP BY tool;`
    );
    for (const row of toolRows) {
      if (!row.tool) continue;
      tools[row.tool] = (tools[row.tool] || 0) + (row.n || 0);
    }
  } catch {
    /* best-effort */
  }

  const sessions = new Set();
  const prompts = userMsgs
    .map((row) => {
      if (row.session) sessions.add(row.session);
      const text = (textByMsg[row.id] || '').trim();
      return {
        text,
        isSlash: text.startsWith('/'),
        ts: row.ts ? new Date(Number(row.ts)).toISOString() : null,
        session: row.session || 'unknown',
        cwd: row.cwd || null,
        gitBranch: null,
      };
    })
    .filter((p) => !isSkippable(p.text));

  prompts.sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));

  const meta = {
    models: sortEntries(models).map(([name, count]) => ({ name, count })),
    tools: sortEntries(tools).map(([name, count]) => ({ name, count })),
    languages: [],
    versions: [],
  };
  return { prompts, sessionCount: sessions.size, meta };
}
