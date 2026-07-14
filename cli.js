#!/usr/bin/env node
// USAGE:
//   node cli.js --list
//   node cli.js --project <id> | --all
//   node cli.js --compare <id1>,<id2>,...
import { listSources, loadPrompts } from './lib/parser.js';
import { analyze } from './lib/analyzer.js';

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };

if (has('--list') || args.length === 0) {
  const sources = listSources();
  console.log(`\n${sources.length} sources (Claude projects + Cursor):\n`);
  for (const p of sources)
    console.log(`  [${p.kind.padEnd(6)}] ${p.sessions.toString().padStart(3)} sessions  ${p.id}`);
  console.log('\nRun: node cli.js --project <id>   (or --all, or --compare a,b,c)\n');
  process.exit(0);
}

if (has('--compare')) {
  const ids = (val('--compare') || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (ids.length < 2) { console.error('--compare needs 2+ ids: node cli.js --compare a,b'); process.exit(1); }
  const rows = ids.map((id) => {
    const { prompts, sessionCount } = loadPrompts(id);
    const r = analyze(prompts, sessionCount);
    const s = r.empty ? { technicalDepth: -1, authenticityEngagement: -1, independence: -1 } : r.scores;
    const composite = r.empty ? -1 : Math.round((s.technicalDepth + s.authenticityEngagement + s.independence) / 3);
    return { id, composite, ...s, prompts: r.empty ? 0 : r.counts.typedPrompts };
  }).sort((a, b) => b.composite - a.composite);

  console.log('\nRANK  COMPOSITE  DEPTH  AUTH  INDEP  PROMPTS  SOURCE');
  rows.forEach((r, i) =>
    console.log(
      `  ${(i + 1).toString().padStart(2)}      ${String(r.composite).padStart(4)}     ` +
      `${String(r.technicalDepth).padStart(3)}   ${String(r.authenticityEngagement).padStart(3)}   ` +
      `${String(r.independence).padStart(3)}    ${String(r.prompts).padStart(4)}    ${r.id}`
    )
  );
  console.log('\nHeuristic ranking — read actual prompts before deciding.\n');
  process.exit(0);
}

const id = has('--all') ? '__all__' : val('--project');
if (!id) { console.error('Provide --project <id> or --all (see --list)'); process.exit(1); }

const { prompts, sessionCount } = loadPrompts(id);
const result = analyze(prompts, sessionCount);

console.log(`\n=== ${id} ===`);
if (result.empty) { console.log(result.message); process.exit(0); }
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
