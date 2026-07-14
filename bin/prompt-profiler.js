#!/usr/bin/env node
// Unified subcommand CLI for prompt-profiler.
//
//   prompt-profiler list                     list all sources
//   prompt-profiler analyze <id> | --all     text scores/metrics for one source
//   prompt-profiler compare <id...> | a,b,c   rank sources side by side
//   prompt-profiler report [<id>|--all]      self-contained HTML report + open
//   prompt-profiler serve                    run the web dashboard
//   prompt-profiler --help | --version
//
// Every score here is a heuristic signal for human review, never a verdict.
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { listSources, loadPrompts } from '../lib/parser.js';
import { analyze } from '../lib/analyzer.js';
import { buildReport, buildSamples } from '../lib/report.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const flagVal = (f) => {
  const i = argv.indexOf(f);
  return i >= 0 ? argv[i + 1] : null;
};
// Positional args = everything that isn't a --flag or a flag's value.
function positionals() {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      if (a === '--out') i++; // skip its value
      continue;
    }
    out.push(a);
  }
  return out;
}

const HELP = `
prompt-profiler — analyze local Claude Code / Cursor session data into
prompting-style signals. Every score is a heuristic signal for human review,
NOT a verdict on a person.

USAGE
  prompt-profiler <command> [options]

COMMANDS
  list                          List all sources (Claude projects + Cursor)
  analyze <id> | --all          Print scores & metrics for one source (text)
  compare <id1> <id2> ...       Rank 2+ sources side by side (also: a,b,c)
  report [<id> | --all]         Generate a self-contained HTML report & open it
  serve                         Run the web dashboard (http://localhost:4321)

REPORT OPTIONS
  --out <path>                  Write the HTML to this path
  --no-open                     Write the file but don't open the browser

GLOBAL
  --help, -h                    Show this help
  --version, -v                 Print version

EXAMPLES
  prompt-profiler list
  prompt-profiler analyze --all
  prompt-profiler compare projA projB projC
  prompt-profiler report --all
  prompt-profiler report my-project --out ./candidate.html --no-open
`;

function cmdList() {
  const sources = listSources();
  console.log(`\n${sources.length} sources (Claude projects + Cursor):\n`);
  for (const p of sources)
    console.log(`  [${p.kind.padEnd(6)}] ${p.sessions.toString().padStart(3)} sessions  ${p.id}`);
  console.log('\nRun: prompt-profiler analyze <id>   (or --all, or compare a b c)\n');
}

function cmdAnalyze(rest) {
  const id = rest.includes('--all') ? '__all__' : positionals().slice(1)[0] || flagVal('--project');
  if (!id) {
    console.error('Provide an id or --all:  prompt-profiler analyze <id>   (see: list)');
    process.exit(1);
  }
  const { prompts, sessionCount } = loadPrompts(id);
  const result = analyze(prompts, sessionCount);

  console.log(`\n=== ${id} ===`);
  if (result.empty) {
    console.log(result.message);
    return;
  }
  console.log(`prompts: ${result.counts.typedPrompts} | sessions: ${result.counts.sessions}\n`);
  console.log('SCORES (heuristic signals for human review — not verdicts):');
  for (const [k, v] of Object.entries(result.scores)) console.log(`  ${k.padEnd(24)} ${v}/100`);
  console.log('\nFINGERPRINT:');
  console.log(`  style: ${result.fingerprint.style}`);
  console.log(`  tone : ${result.fingerprint.politeness}`);
  console.log(`  top openers: ${result.fingerprint.topStarters.map((s) => `${s.word}(${s.pct}%)`).join(', ')}`);
  console.log('\nMETRICS:');
  for (const [k, v] of Object.entries(result.metrics)) console.log(`  ${k.padEnd(22)} ${v}`);
  console.log('');
}

function cmdCompare() {
  // Accept both space-separated ids and a single comma-separated arg.
  const ids = positionals()
    .slice(1)
    .flatMap((a) => a.split(','))
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length < 2) {
    console.error('compare needs 2+ ids:  prompt-profiler compare a b c   (or a,b,c)');
    process.exit(1);
  }
  const rows = ids
    .map((id) => {
      const { prompts, sessionCount } = loadPrompts(id);
      const r = analyze(prompts, sessionCount);
      const s = r.empty ? { technicalDepth: -1, authenticityEngagement: -1, independence: -1 } : r.scores;
      const composite = r.empty
        ? -1
        : Math.round((s.technicalDepth + s.authenticityEngagement + s.independence) / 3);
      return { id, composite, ...s, prompts: r.empty ? 0 : r.counts.typedPrompts };
    })
    .sort((a, b) => b.composite - a.composite);

  console.log('\nRANK  COMPOSITE  DEPTH  AUTH  INDEP  PROMPTS  SOURCE');
  rows.forEach((r, i) =>
    console.log(
      `  ${(i + 1).toString().padStart(2)}      ${String(r.composite).padStart(4)}     ` +
        `${String(r.technicalDepth).padStart(3)}   ${String(r.authenticityEngagement).padStart(3)}   ` +
        `${String(r.independence).padStart(3)}    ${String(r.prompts).padStart(4)}    ${r.id}`
    )
  );
  console.log('\nHeuristic ranking — read actual prompts before deciding.\n');
}

// Open a file in the OS default browser without any npm dependency.
function openInBrowser(file) {
  const p = process.platform;
  const url = 'file://' + path.resolve(file);
  let cmd, args;
  if (p === 'darwin') {
    cmd = 'open';
    args = [url];
  } else if (p === 'win32') {
    // `start` is a cmd builtin; the empty "" is the (ignored) window title.
    cmd = 'cmd';
    args = ['/c', 'start', '""', url];
  } else {
    cmd = 'xdg-open';
    args = [url];
  }
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => console.error(`Could not open browser (${cmd}). Open manually: ${file}`));
    child.unref();
  } catch {
    console.error(`Could not open browser. Open manually: ${file}`);
  }
}

function sanitize(id) {
  return id.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'source';
}

function cmdReport() {
  const sources = listSources();
  const pos = positionals().slice(1);

  // Resolve which source to report on.
  let id;
  if (has('--all')) {
    id = '__all__';
  } else if (pos[0]) {
    id = pos[0];
  } else if (sources.length === 1) {
    id = sources[0].id; // unambiguous: use the only source
  } else {
    console.error(
      `Multiple sources found — specify one or use --all:\n` +
        `  prompt-profiler report <id>\n  prompt-profiler report --all\n\nRun 'prompt-profiler list' to see ids.`
    );
    process.exit(1);
  }

  const source =
    id === '__all__'
      ? { id: '__all__', kind: 'claude', label: 'All Claude Code data (aggregate — every project)' }
      : sources.find((s) => s.id === id) || { id, kind: id.startsWith('cursor::') ? 'cursor' : 'claude', label: id };

  const { prompts, sessionCount } = loadPrompts(id);
  const result = analyze(prompts, sessionCount);
  const samples = buildSamples(prompts);
  const html = buildReport(result, samples, source);

  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15).replace(/(\d{8})(\d{6})/, '$1-$2');
  const outPath =
    flagVal('--out') ||
    path.join(process.cwd(), `prompt-profiler-report-${sanitize(id)}-${stamp}.html`);

  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  fs.writeFileSync(outPath, html, 'utf8');
  const abs = path.resolve(outPath);
  console.log(`\nReport written: ${abs}`);
  console.log('Heuristic signals for human review, not verdicts — read the prompt samples.\n');

  if (!has('--no-open')) openInBrowser(abs);
}

function cmdServe() {
  // Delegate to the existing express server (keeps a single source of truth).
  import('../server.js');
}

async function main() {
  const cmd = argv[0];

  if (has('--version') || has('-v')) {
    console.log(PKG.version);
    return;
  }
  if (!cmd || has('--help') || has('-h') || cmd === 'help') {
    console.log(HELP);
    return;
  }

  switch (cmd) {
    case 'list':
      return cmdList();
    case 'analyze':
      return cmdAnalyze(argv);
    case 'compare':
      return cmdCompare();
    case 'report':
      return cmdReport();
    case 'serve':
      return cmdServe();
    default:
      console.error(`Unknown command: ${cmd}\n${HELP}`);
      process.exit(1);
  }
}

main();
