#!/usr/bin/env node
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { listProjects, listSources, loadPrompts } from './lib/parser.js';
import { analyze } from './lib/analyzer.js';
import { computeCohort, percentilesFor } from './lib/cohort.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4321;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/projects', (_req, res) => {
  try {
    res.json(listSources());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Rank multiple candidates side by side: ?projects=a,b,c
app.get('/api/compare', (req, res) => {
  const ids = String(req.query.projects || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length < 2) return res.status(400).json({ error: 'pass ?projects=id1,id2,...' });

  const sources = listSources();
  const labelOf = (id) => (sources.find((s) => s.id === id) || {}).label || id;
  const kindOf = (id) => (sources.find((s) => s.id === id) || {}).kind || 'claude';

  // Each source is analyzed independently so one bad source can't sink the rest.
  const rows = ids.map((id) => {
    try {
      const { prompts, sessionCount } = loadPrompts(id);
      const r = analyze(prompts, sessionCount);
      return {
        id,
        label: labelOf(id),
        kind: kindOf(id),
        empty: !!r.empty,
        counts: r.counts || null,
        scores: r.scores || null,
        metrics: r.metrics || null,
        style: r.fingerprint ? r.fingerprint.style : null,
      };
    } catch (e) {
      return { id, label: labelOf(id), kind: kindOf(id), empty: true, error: e.message,
        counts: null, scores: null, metrics: null, style: null };
    }
  });
  res.json(rows);
});

app.get('/api/analyze', (req, res) => {
  const id = req.query.project;
  if (!id) return res.status(400).json({ error: 'missing ?project=' });
  try {
    const { prompts, sessionCount, meta } = loadPrompts(id);
    const result = analyze(prompts, sessionCount);
    // Full data drives the analysis; we surface a generous, evenly-sampled
    // slice of raw prompts so a reviewer can read across the whole corpus.
    const typed = prompts.filter((p) => !p.isSlash);
    const step = Math.max(1, Math.floor(typed.length / 40));
    const samples = typed
      .filter((_, idx) => idx % step === 0)
      .slice(0, 40)
      .map((p) => p.text.slice(0, 400));

    // Percentile rank of this source's scores vs every analyzed source.
    let percentiles = null, cohortSize = 0;
    if (!result.empty) {
      try {
        const cohort = computeCohort();
        cohortSize = cohort.size;
        percentiles = percentilesFor(result.scores, cohort);
      } catch { /* percentiles are best-effort */ }
    }
    res.json({ ...result, samples, meta: meta || {}, percentiles, cohortSize });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n  Prompt Profiler running → http://localhost:${PORT}\n`);
  console.log('  Reads local Claude Code (~/.claude/projects) and Cursor');
  console.log('  (global SQLite store, via the sqlite3 CLI) session data.');
  console.log('  Scores are heuristic signals for human review, not verdicts.\n');
});
