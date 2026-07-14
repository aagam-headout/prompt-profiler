import { stemmer } from 'stemmer';
import { distance } from 'fastest-levenshtein';
import {
  QUESTION_WORDS,
  POLITE,
  CORRECTION,
  REASONING,
  TECH,
  IMPERATIVE,
  URGENCY,
  FRUSTRATION,
  AUTONOMY,
  PLANNING,
  GRATITUDE,
  CATEGORIES,
} from './dictionaries.js';

// Heuristic prompting-style analysis.
//
// IMPORTANT: every score here is a HEURISTIC SIGNAL, not a validated measure of
// a person's ability. Prompting style varies with task, tooling familiarity,
// and mood. Treat output as "things a human reviewer should look at", never as
// an automated verdict. The formulas are intentionally transparent (each score
// ships its component breakdown) so a reviewer can judge whether a signal is
// meaningful for their context. Analysis always runs over the FULL prompt set.

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// TECH is large (250+ terms) and checked on every prompt, so split it once at
// load time into two matchers instead of running one regex per term per
// prompt (that was O(prompts * terms)):
//   - single-token terms (no space/slash) are looked up in a Set against the
//     prompt's already-tokenized words — O(1) per token.
//   - multi-word/slash phrases ("stack trace", "pub/sub") can't be tokenized
//     that way, so they're merged into one alternation regex and matched in a
//     single pass over the raw text via matchAll.
const isPhrase = (t) => /[\s/]/.test(t);
const TECH_TOKEN_SET = new Set(TECH.filter((t) => !isPhrase(t)));
const techPhrases = TECH.filter(isPhrase).sort((a, b) => b.length - a.length);
const TECH_PHRASE_RE = techPhrases.length
  ? new RegExp('\\b(?:' + techPhrases.map(escapeRe).join('|') + ')\\b', 'gi')
  : null;

// Precompiled word-boundary matcher per category — robust against substring
// false positives (e.g. "orm" inside "transform", "pr" inside "print").
const CATEGORY_RE = Object.entries(CATEGORIES).map(([cat, kws]) => [
  cat,
  new RegExp('\\b(?:' + kws.map(escapeRe).join('|') + ')\\b', 'i'),
]);

// ---- Morphological (stemming) + fuzzy (typo) widening for single-word terms ----
//
// The curated lists above are matched by exact substring / word-boundary regex,
// which is precise but misses morphological variants ("debugging" vs "debug")
// and typos ("reafctor" vs "refactor"). Multi-word phrases ("stack trace", "not
// working") stay on exact matching only — stemming/fuzzy only make sense for
// single tokens. For single-word keywords we additionally index by Porter stem
// and by a length/first-letter-pruned bucket for bounded Levenshtein fuzzy
// matching, so plurals/tenses and near-typos also count as a hit. All of this
// is precomputed once at module load; per-prompt cost is one tokenize + one
// stem per token, then O(1)-ish map/bucket lookups (no full keyword sweep).
const isSingleWordTerm = (k) => /^[a-z0-9']+$/i.test(k);

const STEM_INDEX = new Map(); // stem -> [{ owner, keyword }]
const FUZZY_BUCKETS = new Map(); // first letter -> [{ owner, keyword, len }]

function registerSingleWordTerms(owner, list) {
  for (const kw of list) {
    if (!isSingleWordTerm(kw)) continue; // multi-word / hyphenated phrases stay exact-only
    const st = stemmer(kw);
    if (!STEM_INDEX.has(st)) STEM_INDEX.set(st, []);
    STEM_INDEX.get(st).push({ owner, keyword: kw });

    if (kw.length >= 4) {
      const fc = kw[0].toLowerCase();
      if (!FUZZY_BUCKETS.has(fc)) FUZZY_BUCKETS.set(fc, []);
      FUZZY_BUCKETS.get(fc).push({ owner, keyword: kw, len: kw.length });
    }
  }
}

const BEHAVIOR_LISTS = {
  POLITE,
  CORRECTION,
  REASONING,
  IMPERATIVE,
  URGENCY,
  FRUSTRATION,
  AUTONOMY,
  PLANNING,
  GRATITUDE,
};
for (const [name, list] of Object.entries(BEHAVIOR_LISTS)) {
  registerSingleWordTerms('behavior:' + name, list);
}
registerSingleWordTerms('tech', TECH);
for (const [cat, kws] of Object.entries(CATEGORIES)) {
  registerSingleWordTerms('cat:' + cat, kws);
}

// One pass over a prompt's tokens, resolving each against the precomputed stem
// index first, then (only on stem miss, and only for tokens/keywords of
// meaningful length) a pruned bounded-Levenshtein fuzzy check against the
// same-first-letter bucket. Returns owner -> Set(matched keyword), used to
// widen (never narrow) the existing exact-match checks below.
function computeWidenHits(tokens, stems) {
  const hits = new Map();
  const record = (owner, keyword) => {
    if (!hits.has(owner)) hits.set(owner, new Set());
    hits.get(owner).add(keyword);
  };
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.length < 3) continue; // too short to meaningfully stem/fuzzy match

    const stemHits = STEM_INDEX.get(stems[i]);
    if (stemHits) {
      for (const { owner, keyword } of stemHits) record(owner, keyword);
      continue; // resolved via stemming; skip fuzzy for this token
    }

    if (tok.length < 4) continue; // fuzzy only meaningful for longer tokens
    const bucket = FUZZY_BUCKETS.get(tok[0]);
    if (!bucket) continue;
    for (const { owner, keyword, len } of bucket) {
      if (Math.abs(len - tok.length) > 2) continue; // cheap prune before Levenshtein
      const maxDist = len <= 6 ? 1 : 2;
      if (Math.abs(len - tok.length) > maxDist) continue;
      if (distance(tok, keyword) <= maxDist) record(owner, keyword);
    }
  }
  return hits;
}

// Single-token variant of the widen check, scoped to one owner — used where the
// original signal only ever looked at ONE specific token (e.g. imperative verbs
// only check the prompt's first word), so widening must stay scoped to that
// same token rather than scanning the whole prompt.
function tokenMatchesOwner(tok, stem, owner) {
  if (!tok || tok.length < 3) return false;
  const stemHits = STEM_INDEX.get(stem);
  if (stemHits) {
    for (const h of stemHits) if (h.owner === owner) return true;
  }
  if (tok.length < 4) return false;
  const bucket = FUZZY_BUCKETS.get(tok[0]);
  if (!bucket) return false;
  for (const c of bucket) {
    if (c.owner !== owner) continue;
    if (Math.abs(c.len - tok.length) > 2) continue;
    const maxDist = c.len <= 6 ? 1 : 2;
    if (Math.abs(c.len - tok.length) > maxDist) continue;
    if (distance(tok, c.keyword) <= maxDist) return true;
  }
  return false;
}

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
const words = (s) => s.toLowerCase().match(/[a-z0-9'+\-#.]+/g) || [];
const median = (arr) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const containsAny = (t, list) => list.some((k) => t.includes(k));

function stddev(arr) {
  if (arr.length < 2) return 0;
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
}

export function analyze(prompts, sessionCount) {
  const typed = prompts.filter((p) => !p.isSlash);
  const n = typed.length;

  if (n === 0) {
    return {
      empty: true,
      message: 'No human-typed prompts found (only slash commands / tool traffic).',
    };
  }

  const lens = typed.map((p) => words(p.text).length);
  const totalWords = lens.reduce((a, b) => a + b, 0);
  const avgLen = totalWords / n;
  const medLen = median(lens);

  const allWords = typed.flatMap((p) => words(p.text));
  const uniq = new Set(allWords).size;
  const ttr = totalWords ? uniq / totalWords : 0;

  let questions = 0,
    polite = 0,
    corrections = 0,
    reasoning = 0,
    codeBlocks = 0,
    hasPath = 0,
    techHits = 0,
    oneLiners = 0,
    emoji = 0,
    imperative = 0,
    urgency = 0,
    frustration = 0,
    autonomy = 0,
    planning = 0,
    gratitude = 0,
    multiPart = 0,
    hasNumbers = 0,
    sentencesTotal = 0,
    charsTotal = 0;

  const lengthBuckets = { terse: 0, short: 0, medium: 0, long: 0 };
  const firstWords = {};
  const techTermCounts = {};
  const tagCounts = {};
  const perSession = {};
  const perDay = {};
  const perHour = new Array(24).fill(0);
  const sessionTimes = {};
  let anyTs = false,
    minTs = Infinity,
    maxTs = -Infinity;

  for (const p of typed) {
    const raw = p.text;
    const t = raw.toLowerCase();
    const w = words(raw);
    const tStems = w.map((tok) => stemmer(tok));
    const widenHits = computeWidenHits(w, tStems);
    const widened = (owner) => (widenHits.get(owner)?.size ?? 0) > 0;

    if (raw.includes('?') || QUESTION_WORDS.includes(w[0])) questions++;
    if (containsAny(t, POLITE) || widened('behavior:POLITE')) polite++;
    if (containsAny(t, CORRECTION) || widened('behavior:CORRECTION')) corrections++;
    if (containsAny(t, REASONING) || widened('behavior:REASONING')) reasoning++;
    if (raw.includes('```')) codeBlocks++;
    if (/[/~][\w.-]+\/[\w.-]+/.test(raw) || /\.\w{1,5}\b/.test(raw)) hasPath++;
    const techSeen = new Set();
    const recordTech = (term) => {
      if (techSeen.has(term)) return;
      techSeen.add(term);
      techHits++;
      techTermCounts[term] = (techTermCounts[term] || 0) + 1;
    };
    for (const tok of w) if (TECH_TOKEN_SET.has(tok)) recordTech(tok);
    if (TECH_PHRASE_RE) {
      TECH_PHRASE_RE.lastIndex = 0;
      let pm;
      while ((pm = TECH_PHRASE_RE.exec(raw))) recordTech(pm[0].toLowerCase());
    }
    const techWiden = widenHits.get('tech');
    if (techWiden) for (const term of techWiden) recordTech(term);
    if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(raw)) emoji++;

    const wl = w.length;
    if (wl <= 3) {
      lengthBuckets.terse++;
      oneLiners++;
    } else if (wl <= 12) lengthBuckets.short++;
    else if (wl <= 40) lengthBuckets.medium++;
    else lengthBuckets.long++;

    const fw = (w[0] || '').replace(/[^a-z]/g, '');
    if (fw) firstWords[fw] = (firstWords[fw] || 0) + 1;

    // behavioral markers — imperative only ever looks at the first word, so its
    // widen check stays scoped to that same token (stemmer(fw)) rather than
    // scanning the whole prompt via widenHits.
    if (IMPERATIVE.includes(fw) || tokenMatchesOwner(fw, stemmer(fw), 'behavior:IMPERATIVE'))
      imperative++;
    if (containsAny(t, URGENCY) || widened('behavior:URGENCY')) urgency++;
    if (containsAny(t, FRUSTRATION) || widened('behavior:FRUSTRATION')) frustration++;
    if (containsAny(t, AUTONOMY) || widened('behavior:AUTONOMY')) autonomy++;
    if (containsAny(t, PLANNING) || widened('behavior:PLANNING')) planning++;
    if (containsAny(t, GRATITUDE) || widened('behavior:GRATITUDE')) gratitude++;
    if (
      /\n\s*\d+[.)]/.test(raw) ||
      /\n\s*[-*]\s/.test(raw) ||
      t.split(/\band\b|\balso\b|;/).length - 1 >= 3
    )
      multiPart++;
    if (/\d/.test(raw)) hasNumbers++;
    sentencesTotal += raw.split(/[.!?]+/).filter((x) => x.trim().length > 1).length || 1;
    charsTotal += w.join('').length;

    // domain / keyword tagging (word-boundary matched; one hit per category per
    // prompt; widened via stemming/fuzzy for single-word category terms)
    for (const [cat, re] of CATEGORY_RE) {
      const exactHit = re.test(raw);
      const widenHit = !exactHit && widened('cat:' + cat);
      if (exactHit || widenHit) tagCounts[cat] = (tagCounts[cat] || 0) + 1;
    }

    const sid = p.session || 'unknown';
    perSession[sid] = (perSession[sid] || 0) + 1;

    if (p.ts) {
      const tms = Date.parse(p.ts);
      if (!Number.isNaN(tms)) {
        anyTs = true;
        perDay[p.ts.slice(0, 10)] = (perDay[p.ts.slice(0, 10)] || 0) + 1;
        const h = new Date(tms).getHours();
        perHour[h]++;
        if (tms < minTs) minTs = tms;
        if (tms > maxTs) maxTs = tms;
        const st = sessionTimes[sid] || (sessionTimes[sid] = { min: tms, max: tms });
        st.min = Math.min(st.min, tms);
        st.max = Math.max(st.max, tms);
      }
    }
  }

  const ratio = (x) => x / n;
  const iterationDepth = n / Math.max(1, sessionCount);

  // ---- Composite signals (0-100) with transparent component breakdown ----
  const mk = (parts) => {
    const value = clamp(parts.reduce((a, c) => a + c.v, 0));
    return { value, breakdown: parts.map((p) => ({ label: p.label, points: Math.round(p.v) })) };
  };

  const depth = mk([
    { label: 'Vocabulary richness', v: ttr * 90 },
    { label: 'Technical density', v: (Math.min(techHits / n, 3) / 3) * 30 },
    { label: 'File/path specificity', v: ratio(hasPath) * 20 },
    { label: 'Reasoning cues', v: ratio(reasoning) * 25 },
    { label: 'Prompt substance (length)', v: Math.min(avgLen / 40, 1) * 15 },
  ]);

  const lenVariety = median(lens) ? Math.min(stddev(lens) / (avgLen || 1), 1) : 0;
  const authenticity = mk([
    { label: 'Corrections / follow-ups', v: ratio(corrections) * 60 },
    { label: 'Length variety', v: lenVariety * 30 },
    { label: 'Iteration depth', v: Math.min(iterationDepth / 8, 1) * 25 },
    { label: 'Not just one-liners', v: (1 - Math.min(ratio(oneLiners), 1)) * 20 },
    { label: 'Reasoning cues', v: ratio(reasoning) * 15 },
  ]);

  const qr = ratio(questions);
  const independence = mk([
    { label: 'Question/command balance', v: (1 - Math.abs(qr - 0.35) / 0.65) * 60 },
    { label: 'Reasoning cues', v: ratio(reasoning) * 40 },
  ]);

  const composite = Math.round((depth.value + authenticity.value + independence.value) / 3);

  // Reliability: how much to trust the scores, driven by corpus volume. Small
  // corpora make ratios and vocabulary richness noisy, so flag them explicitly.
  const reliability =
    n >= 300
      ? { level: 'high', note: 'Large corpus — scores are comparatively stable.' }
      : n >= 60
        ? { level: 'medium', note: 'Moderate corpus — treat scores as directional, not precise.' }
        : {
            level: 'low',
            note: 'Small corpus — scores are noisy; read the prompts directly and weight lightly.',
          };

  const topStarters = Object.entries(firstWords)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([w, c]) => ({ word: w, count: c, pct: Math.round((c / n) * 100) }));

  const topTechTerms = Object.entries(techTermCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([term, c]) => ({ term, count: c, pct: Math.round((c / n) * 100) }));

  const sessionSizes = Object.values(perSession);
  const durs = Object.values(sessionTimes)
    .map((s) => (s.max - s.min) / 60000)
    .filter((x) => x > 0);
  const sessionStats = {
    count: sessionSizes.length,
    avgPromptsPerSession: +(n / Math.max(1, sessionSizes.length)).toFixed(1),
    maxPromptsInSession: sessionSizes.length ? Math.max(...sessionSizes) : 0,
    singlePromptSessions: sessionSizes.filter((x) => x === 1).length,
    avgDurationMin: durs.length
      ? +(durs.reduce((a, b) => a + b, 0) / durs.length).toFixed(0)
      : null,
    longestSessionMin: durs.length ? +Math.max(...durs).toFixed(0) : null,
  };

  const dayMs = 86400000;
  const span =
    anyTs && Number.isFinite(minTs)
      ? {
          first: new Date(minTs).toISOString().slice(0, 10),
          last: new Date(maxTs).toISOString().slice(0, 10),
          days: Math.round((maxTs - minTs) / dayMs) + 1,
          activeDays: Object.keys(perDay).length,
        }
      : null;

  const timeline = Object.entries(perDay)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }));

  return {
    empty: false,
    counts: {
      typedPrompts: n,
      slashCommands: prompts.length - n,
      sessions: sessionCount,
      totalWords,
    },
    metrics: {
      avgPromptWords: +avgLen.toFixed(1),
      medianPromptWords: medLen,
      vocabularyRichness: +(ttr * 100).toFixed(1),
      uniqueWords: uniq,
      questionRatio: +(qr * 100).toFixed(1),
      correctionRatio: +(ratio(corrections) * 100).toFixed(1),
      reasoningRatio: +(ratio(reasoning) * 100).toFixed(1),
      politenessRatio: +(ratio(polite) * 100).toFixed(1),
      codeBlockRatio: +(ratio(codeBlocks) * 100).toFixed(1),
      techTermsPerPrompt: +(techHits / n).toFixed(2),
      iterationDepth: +iterationDepth.toFixed(1),
      emojiPrompts: emoji,
      avgWordLength: +(charsTotal / Math.max(1, totalWords)).toFixed(2),
      avgSentences: +(sentencesTotal / n).toFixed(1),
      numericRefs: +(ratio(hasNumbers) * 100).toFixed(1),
    },
    behavior: [
      {
        label: 'Imperative / directive',
        key: 'imperative',
        pct: +(ratio(imperative) * 100).toFixed(1),
      },
      { label: 'Multi-part requests', key: 'multiPart', pct: +(ratio(multiPart) * 100).toFixed(1) },
      { label: 'Planning language', key: 'planning', pct: +(ratio(planning) * 100).toFixed(1) },
      { label: 'Delegates judgment', key: 'autonomy', pct: +(ratio(autonomy) * 100).toFixed(1) },
      { label: 'Urgency', key: 'urgency', pct: +(ratio(urgency) * 100).toFixed(1) },
      { label: 'Frustration', key: 'frustration', pct: +(ratio(frustration) * 100).toFixed(1) },
      { label: 'Gratitude / praise', key: 'gratitude', pct: +(ratio(gratitude) * 100).toFixed(1) },
    ],
    tags: Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count, pct: Math.round((count / n) * 100) })),
    hourly: anyTs ? perHour.map((count, hour) => ({ hour, count })) : [],
    scores: {
      technicalDepth: depth.value,
      authenticityEngagement: authenticity.value,
      independence: independence.value,
      composite,
    },
    reliability,
    breakdowns: {
      technicalDepth: depth.breakdown,
      authenticityEngagement: authenticity.breakdown,
      independence: independence.breakdown,
    },
    distribution: [
      { label: 'Terse (≤3w)', key: 'terse', count: lengthBuckets.terse },
      { label: 'Short (4–12w)', key: 'short', count: lengthBuckets.short },
      { label: 'Medium (13–40w)', key: 'medium', count: lengthBuckets.medium },
      { label: 'Long (40w+)', key: 'long', count: lengthBuckets.long },
    ],
    topTechTerms,
    sessionStats,
    span,
    timeline,
    fingerprint: {
      topStarters,
      politeness: polite > n * 0.15 ? 'courteous' : polite > 0 ? 'occasional' : 'blunt',
      style: styleLabel(avgLen, qr, ratio(corrections)),
    },
    verdict: verdict(
      composite,
      depth.value,
      authenticity.value,
      independence.value,
      sessionStats,
      n
    ),
  };
}

function styleLabel(avgLen, qr, corr) {
  const parts = [];
  parts.push(avgLen > 25 ? 'verbose / detailed' : avgLen > 10 ? 'balanced' : 'terse / directive');
  if (qr > 0.5) parts.push('inquisitive');
  if (corr > 0.25) parts.push('iterative / hands-on');
  return parts.join(', ');
}

function verdict(comp, d, a, i, s, n) {
  const band = comp >= 66 ? 'Strong' : comp >= 45 ? 'Moderate' : 'Light';
  const lead =
    d >= a && d >= i ? 'technical depth' : a >= i ? 'hands-on engagement' : 'balanced dialogue';
  const vol = n >= 300 ? 'a large corpus' : n >= 60 ? 'a moderate corpus' : 'a small corpus';
  return (
    `${band} overall signal from ${vol} (${n} prompts across ${s.count} sessions). ` +
    `Leans toward ${lead}. Read the prompt samples below before drawing conclusions — these are signals, not scores of the person.`
  );
}
