import fs from 'fs';
import path from 'path';
import os from 'os';
import { listCursorSources, loadCursorPrompts } from './cursor-parser.js';

export const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');

// File-extension → language, for "languages generated" (files the agent wrote/edited).
const EXT_LANG = {
  ts: 'TypeScript', tsx: 'TypeScript (React)', js: 'JavaScript', jsx: 'JavaScript (React)',
  mjs: 'JavaScript', cjs: 'JavaScript', py: 'Python', rb: 'Ruby', go: 'Go', rs: 'Rust',
  java: 'Java', kt: 'Kotlin', swift: 'Swift', c: 'C', h: 'C/C++ header', cpp: 'C++', cc: 'C++',
  cs: 'C#', php: 'PHP', sh: 'Shell', bash: 'Shell', zsh: 'Shell', sql: 'SQL', html: 'HTML',
  css: 'CSS', scss: 'SCSS', sass: 'SCSS', json: 'JSON', yaml: 'YAML', yml: 'YAML', toml: 'TOML',
  md: 'Markdown', mdx: 'Markdown', vue: 'Vue', svelte: 'Svelte', dart: 'Dart', scala: 'Scala',
  ex: 'Elixir', exs: 'Elixir', lua: 'Lua', r: 'R', jl: 'Julia', pl: 'Perl', proto: 'Protobuf',
  tf: 'Terraform', graphql: 'GraphQL', gql: 'GraphQL', dockerfile: 'Dockerfile',
};
const extToLang = (fp) => {
  if (!fp) return null;
  const base = fp.split('/').pop().toLowerCase();
  if (base === 'dockerfile') return 'Dockerfile';
  const ext = base.includes('.') ? base.split('.').pop() : '';
  return EXT_LANG[ext] || null;
};
const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const sortEntries = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]);

// Junk / non-authored content we must not treat as a real user prompt.
const SKIP_PREFIXES = [
  '<local-command',
  '<command-name',
  '<command-message',
  '<command-args',
  '<command-stdout',
  '<user-memory',
  '<system-reminder',
  '<task-notification',
  '<post-tool',
  '<hook-',
  '<budget',
  'Caveat:',
  '[Request interrupted',
  'This session is being continued',
  '<bash-',
];

function isSkippable(text) {
  const t = text.trim();
  if (!t) return true;
  return SKIP_PREFIXES.some((p) => t.startsWith(p));
}

// message.content can be a string or an array of content blocks.
// We only keep human-authored text, dropping tool_result blocks etc.
function extractText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n');
}

// Detect content arrays that are actually tool results (not user typing).
function isToolResultOnly(content) {
  if (!Array.isArray(content)) return false;
  return content.length > 0 && content.every((b) => b && b.type === 'tool_result');
}

export function listProjects() {
  if (!fs.existsSync(CLAUDE_PROJECTS_DIR)) return [];
  return fs
    .readdirSync(CLAUDE_PROJECTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const dir = path.join(CLAUDE_PROJECTS_DIR, d.name);
      let files = [];
      try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')); } catch { /* dir vanished */ }
      let latest = 0;
      let bytes = 0;
      for (const f of files) {
        let st;
        try { st = fs.statSync(path.join(dir, f)); } catch { continue; } // file removed mid-scan
        if (st.mtimeMs > latest) latest = st.mtimeMs;
        bytes += st.size;
      }
      return {
        id: d.name,
        kind: 'claude',
        // decoded-path is best-effort: dashes were path separators
        label: d.name.replace(/^-/, '/').replace(/-/g, '/'),
        sessions: files.length,
        bytes,
        lastActive: latest ? new Date(latest).toISOString() : null,
      };
    })
    .sort((a, b) => (b.lastActive || '').localeCompare(a.lastActive || ''));
}

// Unified list across tools (Claude Code projects + Cursor).
export function listSources() {
  const claude = listProjects();
  let cursor = [];
  try {
    cursor = listCursorSources();
  } catch {
    cursor = [];
  }
  return [...claude, ...cursor];
}

// Returns array of prompt records for one source.
// Dispatches Cursor ids to the Cursor reader; everything else is Claude.
export function loadPrompts(projectId) {
  if (projectId && projectId.startsWith('cursor::')) {
    return loadCursorPrompts(projectId);
  }
  const dirs =
    projectId === '__all__'
      ? listProjects().map((p) => path.join(CLAUDE_PROJECTS_DIR, p.id))
      : [path.join(CLAUDE_PROJECTS_DIR, projectId)];

  const prompts = [];
  const sessionIds = new Set();
  const models = {}, tools = {}, langs = {}, versions = {};

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
    for (const file of files) {
      const full = path.join(dir, file);
      let lines;
      try {
        lines = fs.readFileSync(full, 'utf8').split('\n');
      } catch {
        continue;
      }
      for (const line of lines) {
        if (!line.trim()) continue;
        let obj;
        try {
          obj = JSON.parse(line);
        } catch {
          continue;
        }
        if (obj.version) versions[obj.version] = (versions[obj.version] || 0) + 1;

        // Metadata from assistant turns: models, tools used, languages generated.
        if (obj.type === 'assistant' && obj.message) {
          const model = obj.message.model;
          if (model && !model.startsWith('<')) models[model] = (models[model] || 0) + 1;
          const content = Array.isArray(obj.message.content) ? obj.message.content : [];
          for (const b of content) {
            if (b && b.type === 'tool_use') {
              tools[b.name] = (tools[b.name] || 0) + 1;
              if (WRITE_TOOLS.has(b.name)) {
                const lang = extToLang(b.input && (b.input.file_path || b.input.notebook_path));
                if (lang) langs[lang] = (langs[lang] || 0) + 1;
              }
            }
          }
        }

        if (obj.type !== 'user' || obj.isMeta) continue;
        if (obj.isSidechain) continue; // sub-agent traffic, not the human
        const msg = obj.message;
        if (!msg || msg.role !== 'user') continue;
        if (isToolResultOnly(msg.content)) continue;

        const text = extractText(msg.content).trim();
        if (isSkippable(text)) continue;

        const isSlash = text.startsWith('/');

        prompts.push({
          text,
          isSlash,
          ts: obj.timestamp || null,
          session: obj.sessionId || file,
          cwd: obj.cwd || null,
          gitBranch: obj.gitBranch || null,
        });
        if (obj.sessionId) sessionIds.add(obj.sessionId);
      }
    }
  }

  prompts.sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));
  const meta = {
    models: sortEntries(models).map(([name, count]) => ({ name, count })),
    tools: sortEntries(tools).map(([name, count]) => ({ name, count })),
    languages: sortEntries(langs).map(([lang, count]) => ({ lang, count })),
    versions: sortEntries(versions).map(([version, count]) => ({ version, count })),
  };
  return { prompts, sessionCount: sessionIds.size || dirs.length, meta };
}
