// Cohort baseline: analyze every available source so a single candidate's
// scores can be expressed as a percentile rank against the group. A raw score
// like 62 is meaningless alone; "72nd percentile vs 18 candidates" is not.
//
// Results are cached briefly since computing the cohort re-analyzes every
// source. Failures on individual sources are skipped, never fatal.
import { listSources, loadPrompts } from './parser.js';
import { analyze } from './analyzer.js';

const KEYS = ['technicalDepth', 'authenticityEngagement', 'independence', 'composite'];
const TTL_MS = 60_000;
let cache = { at: 0, data: null };

export function computeCohort(force = false) {
  if (!force && cache.data && Date.now() - cache.at < TTL_MS) return cache.data;

  const scores = {
    technicalDepth: [],
    authenticityEngagement: [],
    independence: [],
    composite: [],
  };
  let sources;
  try {
    sources = listSources();
  } catch {
    sources = [];
  }

  for (const s of sources) {
    try {
      const { prompts, sessionCount } = loadPrompts(s.id);
      const r = analyze(prompts, sessionCount);
      if (r.empty || !r.scores) continue;
      for (const k of KEYS) scores[k].push(r.scores[k]);
    } catch {
      /* skip broken/locked source */
    }
  }

  cache = { at: Date.now(), data: { scores, size: scores.composite.length, keys: KEYS } };
  return cache.data;
}

// Percent of the cohort at or below `value` (0–100). Null when there aren't
// enough peers for a percentile to mean anything.
export function percentile(value, arr) {
  if (!Array.isArray(arr) || arr.length < 3) return null;
  const below = arr.filter((x) => x <= value).length;
  return Math.round((below / arr.length) * 100);
}

export function percentilesFor(scores, cohort) {
  if (!scores || !cohort || cohort.size < 3) return null;
  const out = {};
  for (const k of cohort.keys) out[k] = percentile(scores[k], cohort.scores[k]);
  return out;
}
