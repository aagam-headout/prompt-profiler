// Cursor session reader.
//
// Cursor stores chat/composer data in a SQLite db (no JSONL). We read it with
// the system `sqlite3` CLI so there's no native build dependency. Human prompts
// live in `cursorDiskKV` under keys `bubbleId:<composerId>:<msgId>` where the
// blob has `type=1` (user) and a non-empty `text` field. Session == composerId.
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Per-platform locations of Cursor's global SQLite store.
function candidatePaths() {
  const home = os.homedir();
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return [path.join(appData, 'Cursor', 'User', 'globalStorage', 'state.vscdb')];
  }
  if (process.platform === 'darwin') {
    return [
      path.join(
        home,
        'Library',
        'Application Support',
        'Cursor',
        'User',
        'globalStorage',
        'state.vscdb'
      ),
    ];
  }
  // Linux (and other unixes)
  return [
    path.join(home, '.config', 'Cursor', 'User', 'globalStorage', 'state.vscdb'),
    path.join(home, '.config', 'cursor', 'User', 'globalStorage', 'state.vscdb'),
  ];
}

// First existing candidate path, resolved lazily so it works if Cursor is
// installed after the server starts.
function cursorDb() {
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

export function cursorAvailable() {
  try {
    if (!cursorDb()) return false;
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

const USER_BUBBLE_WHERE =
  "key LIKE 'bubbleId:%' AND json_extract(value,'$.type')=1 " +
  "AND length(json_extract(value,'$.text'))>0";

// Cursor languageId → friendly language name.
const LANG_MAP = {
  typescriptreact: 'TypeScript (React)',
  typescript: 'TypeScript',
  javascriptreact: 'JavaScript (React)',
  javascript: 'JavaScript',
  python: 'Python',
  shellscript: 'Shell',
  bash: 'Shell',
  json: 'JSON',
  jsonc: 'JSON',
  markdown: 'Markdown',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  go: 'Go',
  rust: 'Rust',
  java: 'Java',
  ruby: 'Ruby',
  php: 'PHP',
  sql: 'SQL',
  yaml: 'YAML',
  plaintext: 'Plain text',
  cpp: 'C++',
  c: 'C',
  csharp: 'C#',
  swift: 'Swift',
  kotlin: 'Kotlin',
  dart: 'Dart',
  vue: 'Vue',
  graphql: 'GraphQL',
  dockerfile: 'Dockerfile',
  xml: 'XML',
};

function cursorLanguages() {
  let rows;
  try {
    rows = query(
      cursorDb(),
      `SELECT json_extract(cb.value,'$.languageId') AS lang, count(*) AS n ` +
        `FROM cursorDiskKV, json_each(cursorDiskKV.value,'$.codeBlocks') cb ` +
        `WHERE cursorDiskKV.key LIKE 'bubbleId:%' AND json_array_length(json_extract(cursorDiskKV.value,'$.codeBlocks'))>0 ` +
        `GROUP BY lang ORDER BY n DESC;`
    );
  } catch {
    return [];
  }
  const agg = {};
  for (const r of rows) {
    if (!r.lang) continue;
    const name = LANG_MAP[r.lang] || r.lang;
    agg[name] = (agg[name] || 0) + r.n;
  }
  return Object.entries(agg)
    .sort((a, b) => b[1] - a[1])
    .map(([lang, count]) => ({ lang, count }));
}

export function listCursorSources() {
  if (!cursorAvailable()) return [];
  let rows;
  try {
    rows = query(
      cursorDb(),
      `SELECT count(*) AS prompts, count(DISTINCT substr(key,10,36)) AS sessions FROM cursorDiskKV WHERE ${USER_BUBBLE_WHERE};`
    );
  } catch {
    return [];
  }
  const r = rows[0] || {};
  if (!r.prompts) return [];
  return [
    {
      id: 'cursor::global',
      kind: 'cursor',
      label: 'Cursor — all chats (global store)',
      sessions: r.sessions || 0,
      prompts: r.prompts,
      lastActive: null,
    },
  ];
}

export function loadCursorPrompts(/* id */) {
  if (!cursorAvailable()) return { prompts: [], sessionCount: 0, meta: emptyMeta() };
  let rows;
  try {
    rows = query(
      cursorDb(),
      `SELECT substr(key,10,36) AS session, json_extract(value,'$.text') AS text ` +
        `FROM cursorDiskKV WHERE ${USER_BUBBLE_WHERE};`
    );
  } catch {
    // DB busy/locked (Cursor open) or malformed — degrade gracefully.
    return { prompts: [], sessionCount: 0, meta: emptyMeta() };
  }
  if (!Array.isArray(rows)) rows = [];
  const sessions = new Set();
  const prompts = rows.map((row) => {
    if (row.session) sessions.add(row.session);
    const text = (row.text || '').trim();
    return {
      text,
      isSlash: text.startsWith('/'),
      ts: null,
      session: row.session || 'unknown',
      cwd: null,
      gitBranch: null,
    };
  });
  const meta = {
    models: [],
    modelsNote: 'Cursor anonymizes the model per message ("default"); not available.',
    tools: [],
    languages: cursorLanguages(),
    versions: [],
  };
  return { prompts, sessionCount: sessions.size, meta };
}

function emptyMeta() {
  return { models: [], tools: [], languages: [], versions: [] };
}
