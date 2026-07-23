import { spawn } from 'child_process';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { analyze } from './analyzer.js';

// AI analysis engine: shells out to the local Claude Code CLI (`claude -p`) and
// asks the model to score a prompt corpus, returning strict JSON. This is an
// alternative to the deterministic NLP heuristic in analyzer.js — the caller
// picks the engine. The structural, deterministic parts of the report (counts,
// corpus stats, timeline, samples, top starters) are still computed locally by
// analyze(); the model only supplies the *judgment* fields (scores, breakdowns,
// behavior, tags, verdict). AI judgment is overlaid on the local base so a bad
// or partial model response degrades gracefully to the heuristic values.

const CLAUDE_BIN = process.env.CLAUDE_BIN || path.join(os.homedir(), '.local', 'bin', 'claude');
const MODEL = process.env.PP_AI_MODEL || 'claude-sonnet-5';
const TIMEOUT_MS = Number(process.env.PP_AI_TIMEOUT_MS || 180000);

// Spawn the CLI in non-interactive print mode with a JSON envelope. The prompt
// is fed on stdin so we don't hit argv length limits on large corpora.
function runClaude(prompt, { model = MODEL, timeoutMs = TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(CLAUDE_BIN)) {
      return reject(
        new Error(
          `Claude CLI not found at ${CLAUDE_BIN}. Install Claude Code or set the CLAUDE_BIN env var.`
        )
      );
    }
    const args = ['-p', '--model', model, '--output-format', 'json'];
    const child = spawn(CLAUDE_BIN, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '',
      err = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Claude CLI timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        return reject(new Error(`Claude CLI exited ${code}: ${(err || out).slice(0, 500)}`));
      }
      resolve(out);
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

// The CLI envelope wraps the assistant text in `.result`; that text is expected
// to be a JSON object (possibly fenced). Pull it out robustly.
function extractJson(cliStdout) {
  let text = cliStdout.trim();
  try {
    const env = JSON.parse(text);
    if (env && typeof env.result === 'string') text = env.result.trim();
    else if (env && typeof env === 'object' && env.scores) return env; // already the payload
  } catch {
    /* not an envelope — treat stdout as the payload text directly */
  }
  // Strip ```json fences if present.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  // Fall back to the first {...} span.
  if (text[0] !== '{') {
    const s = text.indexOf('{');
    const e = text.lastIndexOf('}');
    if (s !== -1 && e > s) text = text.slice(s, e + 1);
  }
  return JSON.parse(text);
}

// Markers that flag a prompt as a correction / follow-up — over-sampling these
// gives the model direct evidence for the engagement & independence signals.
const CORRECTION_MARKERS =
  /\b(no|not|wrong|actually|instead|revert|undo|still|again|didn'?t|doesn'?t|isn'?t|fix|but|however|that'?s not|try again)\b/i;

// Stratified sample of the typed corpus: pure even sampling shows breadth but
// under-represents the tails that carry the most signal, so we deliberately mix
// three strata — an even spread (breadth), the longest prompts (evidence of
// depth), and correction/follow-up prompts (evidence of iteration) — dedup, and
// restore chronological order. Truncate each prompt and cap total characters so
// the CLI call stays within a sane token budget.
function sampleCorpus(prompts, { max = 160, perPromptChars = 360, totalChars = 70000 } = {}) {
  const typed = prompts
    .map((p, idx) => ({ ...p, idx }))
    .filter((p) => !p.isSlash && p.text && p.text.trim());
  if (!typed.length) return '';

  const chosen = new Map(); // idx -> prompt (dedup across strata)
  const take = (p) => chosen.set(p.idx, p);

  // Stratum 1 — even spread across the whole timeline (breadth).
  const evenN = Math.floor(max * 0.6);
  const step = Math.max(1, Math.floor(typed.length / Math.max(1, evenN)));
  typed
    .filter((_, i) => i % step === 0)
    .slice(0, evenN)
    .forEach(take);

  // Stratum 2 — longest prompts (depth capability).
  [...typed]
    .sort((a, b) => b.text.length - a.text.length)
    .slice(0, Math.floor(max * 0.25))
    .forEach(take);

  // Stratum 3 — corrections / follow-ups (iteration & engagement).
  typed
    .filter((p) => CORRECTION_MARKERS.test(p.text))
    .slice(0, Math.floor(max * 0.25))
    .forEach(take);

  const picked = [...chosen.values()].sort((a, b) => a.idx - b.idx).slice(0, max);

  const lines = [];
  let budget = totalChars;
  for (const p of picked) {
    const t = p.text.replace(/\s+/g, ' ').trim().slice(0, perPromptChars);
    if (t.length + 4 > budget) break;
    lines.push('- ' + t);
    budget -= t.length + 4;
  }
  return lines.join('\n');
}

// Compact, mechanically-computed reference block. Giving the model the local
// heuristic numbers (over the FULL corpus, not just the sample) anchors its
// scoring and cuts variance/hallucination — it calibrates against real signal
// instead of guessing from a truncated slice.
function calibrationBlock(base) {
  const m = base.metrics,
    s = base.scores;
  return `Mechanically-computed reference signals over the FULL corpus (calibration — trust these numbers; you supply the judgment and reasons, and may diverge from the heuristic scores if the prompts justify it):
- prompts: ${base.counts.typedPrompts} typed across ${base.counts.sessions} sessions, ${base.counts.totalWords} words
- avg / median prompt length: ${m.avgPromptWords} / ${m.medianPromptWords} words
- vocabulary richness (TTR): ${m.vocabularyRichness}%  · unique words: ${m.uniqueWords}
- correction / iteration ratio: ${m.correctionRatio}%  · reasoning cues: ${m.reasoningRatio}%
- question ratio: ${m.questionRatio}%  · technical terms per prompt: ${m.techTermsPerPrompt}
- code blocks pasted: ${m.codeBlockRatio}%  · avg sentences per prompt: ${m.avgSentences}
- iteration depth (prompts/session): ${m.iterationDepth}
- heuristic baseline scores → technicalDepth ${s.technicalDepth}, authenticityEngagement ${s.authenticityEngagement}, independence ${s.independence}`;
}

function buildPrompt(corpus, base) {
  return `You are an expert analyst scoring a person's AI-coding *prompting style* from a sample of their prompts. Your output is a HEURISTIC SIGNAL for human review, never a verdict on the person's ability.

Score three 0-100 signals:
- technicalDepth — vocabulary richness, precise technical terms, file/path specificity, reasoning, substance.
- authenticityEngagement — genuine back-and-forth: corrections, follow-ups, length variety, iteration (vs one-shot copy-paste or one-liners).
- independence — drives the work with clear intent; balances questions with directives rather than only asking or only dictating.

Scoring anchors (apply to each signal): 0-30 = light/minimal, 31-55 = moderate, 56-75 = strong, 76-100 = exceptional. Use the full range — do NOT cluster everything near the middle. Judge only what the prompts show.

${calibrationBlock(base)}

Return STRICT JSON — no prose, no markdown, ONLY the object, matching EXACTLY this schema (keys spelled exactly, no duplicates):

{
  "scores": { "technicalDepth": <0-100>, "authenticityEngagement": <0-100>, "independence": <0-100>, "composite": <0-100> },
  "breakdowns": {
    "technicalDepth": [{ "label": "<short concrete reason>", "points": <int> }],
    "authenticityEngagement": [{ "label": "<short concrete reason>", "points": <int> }],
    "independence": [{ "label": "<short concrete reason>", "points": <int> }]
  },
  "behavior": [{ "label": "<name>", "key": "<camelCase>", "pct": <0-100> }],   // 10-15 items
  "tags": [{ "name": "<domain/topic>", "count": <int>, "pct": <0-100> }],
  "reliability": { "level": "high|medium|low", "note": "<one sentence; smaller corpus => lower>" },
  "fingerprint": { "style": "<short phrase>", "politeness": "courteous|occasional|blunt" },
  "verdict": "<2-3 sentences, plain language; start with Strong/Moderate/Light; cite specific evidence from the prompts>",
  "summary": "<one sentence of qualitative insight the mechanical heuristics would miss>"
}

Rules:
- composite MUST equal the rounded mean of the three signals.
- Each breakdown lists 3-5 items whose points roughly sum to that signal's score; ground every label in something visible in the prompts.
- Provide 10-15 behavior items (pct = share of prompts showing the trait). Cover a broad range, e.g.: imperative/directive, multi-part requests, planning language, delegates judgment, urgency, frustration, gratitude/praise, politeness, question-asking, specifies files/paths, pastes code/errors, gives examples, states constraints, iterative corrections, provides context/rationale, one-liners/terse, verbose/detailed, references docs/links. Only include markers actually evidenced in the prompts.
- Provide 3-8 tags; base tags on the ACTUAL domains/topics you see.
- Set reliability by corpus size: <60 prompts => low, 60-299 => medium, 300+ => high.
- Return ONLY the JSON object, nothing else.

PROMPTS (stratified sample — even spread + longest + corrections):
${corpus}`;
}

const clampScore = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
const SCORE_KEYS = ['technicalDepth', 'authenticityEngagement', 'independence'];

// Models drift from the schema (out-of-range numbers, stray/duplicate keys,
// string points, wrong composite). Coerce the model payload into exactly the
// shape the UI renders so a slightly-malformed response still renders cleanly
// instead of leaking artifacts into the report.
function sanitizeAi(ai) {
  const clean = {};

  if (ai.scores && typeof ai.scores === 'object') {
    const sc = {};
    for (const k of SCORE_KEYS) if (ai.scores[k] != null) sc[k] = clampScore(ai.scores[k]);
    // Composite is authoritative as the mean — never trust a mismatched value.
    const vals = SCORE_KEYS.map((k) => sc[k]).filter((v) => v != null);
    if (vals.length === SCORE_KEYS.length) {
      sc.composite = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    }
    if (Object.keys(sc).length) clean.scores = sc;
  }

  if (ai.breakdowns && typeof ai.breakdowns === 'object') {
    const bd = {};
    for (const k of SCORE_KEYS) {
      const rows = ai.breakdowns[k]; // ignores stray/misspelled keys
      if (Array.isArray(rows) && rows.length) {
        bd[k] = rows
          .filter((r) => r && r.label != null)
          .slice(0, 6)
          .map((r) => ({ label: String(r.label), points: Math.round(Number(r.points) || 0) }));
      }
    }
    if (Object.keys(bd).length) clean.breakdowns = bd;
  }

  if (Array.isArray(ai.behavior)) {
    const b = ai.behavior
      .filter((x) => x && x.label != null)
      .slice(0, 15)
      .map((x, i) => ({
        label: String(x.label),
        key: String(x.key || 'b' + i),
        pct: clampScore(x.pct),
      }));
    if (b.length) clean.behavior = b;
  }

  if (Array.isArray(ai.tags)) {
    const t = ai.tags
      .filter((x) => x && x.name != null)
      .slice(0, 8)
      .map((x) => ({
        name: String(x.name),
        count: Math.max(0, Math.round(Number(x.count) || 0)),
        pct: clampScore(x.pct),
      }));
    if (t.length) clean.tags = t;
  }

  if (ai.reliability && ['high', 'medium', 'low'].includes(ai.reliability.level)) {
    clean.reliability = {
      level: ai.reliability.level,
      note: String(ai.reliability.note || ''),
    };
  }
  if (ai.fingerprint && typeof ai.fingerprint === 'object') clean.fingerprint = ai.fingerprint;
  if (ai.verdict) clean.verdict = String(ai.verdict);
  if (ai.summary) clean.summary = String(ai.summary);
  return clean;
}

// Overlay sanitized model judgment onto the deterministic local base, field by
// field, so a missing/invalid field falls back to the heuristic value.
function mergeAiOntoBase(base, rawAi) {
  const ai = sanitizeAi(rawAi);
  const out = { ...base, engine: 'claude', model: MODEL };
  if (ai.scores) out.scores = { ...base.scores, ...ai.scores };
  if (ai.breakdowns) out.breakdowns = { ...base.breakdowns, ...ai.breakdowns };
  if (ai.behavior) out.behavior = ai.behavior;
  if (ai.tags) out.tags = ai.tags;
  if (ai.reliability) out.reliability = ai.reliability;
  if (ai.verdict) out.verdict = ai.verdict;
  out.fingerprint = {
    ...base.fingerprint,
    style: ai.fingerprint?.style || base.fingerprint.style,
    politeness: ai.fingerprint?.politeness || base.fingerprint.politeness,
  };
  out.aiSummary = ai.summary || null;
  return out;
}

// Public API mirrors analyze() but is async (spawns the CLI). Reuses analyze()
// for all structural data, then overlays the model's judgment.
export async function analyzeWithClaude(prompts, sessionCount) {
  const base = analyze(prompts, sessionCount);
  if (base.empty) return base;

  const prompt = buildPrompt(sampleCorpus(prompts), base);

  // One retry: the model occasionally wraps or prefaces the JSON. A second,
  // stricter attempt is cheap insurance before surfacing an error to the user.
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    const p =
      attempt === 0
        ? prompt
        : prompt +
          '\n\nIMPORTANT: your previous reply was not valid JSON. Reply with ONLY the JSON object — no prose, no code fences.';
    const stdout = await runClaude(p);
    try {
      return mergeAiOntoBase(base, extractJson(stdout));
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error('Claude returned non-JSON output: ' + lastErr.message, { cause: lastErr });
}
