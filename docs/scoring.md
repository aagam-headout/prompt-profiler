# How Scoring Works

> ⚠ **Read this first.** Every score below is a **heuristic signal for a human
> reviewer, not a verdict** on a person's skill, intelligence, or honesty.
> Prompting style varies with the task, tooling familiarity, and mood. These
> numbers exist to point a reviewer at things worth looking at — **always read
> the raw prompt samples** before drawing any conclusion. The report itself
> keeps this disclaimer on the page.

All scoring lives in `lib/analyzer.js`. The formulas are intentionally
**transparent**: every score ships its component breakdown (the exact points
each factor contributed) in the HTML report and the dashboard, so a reviewer can
judge whether a signal is meaningful for their context.

## What gets scored

- Only **non-slash, human-typed prompts** are scored. Slash commands and all the
  filtered junk/tool traffic are excluded (see
  [claude-code.md](claude-code.md#what-counts-as-a-human-prompt)).
- Analysis always runs over the **full** prompt set — never a sample.
- Each of the three signals is a `0–100` value, clamped after summing its
  components. `Math.round` is applied; values below 0 or above 100 are clamped.

## The three signals

Notation: `n` = number of typed prompts; `ratio(x) = x / n`.

### 1. Technical Depth

Vocabulary and engineering-concept signal.

| Component                 | Formula                       | Cap                                                    |
| ------------------------- | ----------------------------- | ------------------------------------------------------ |
| Vocabulary richness       | `TTR × 90`                    | TTR = unique words ÷ total words (type-token ratio)    |
| Technical density         | `min(techHits/n, 3) / 3 × 30` | Curated tech-term hits per prompt, capped at 3/prompt  |
| File/path specificity     | `ratio(hasPath) × 20`         | Prompts referencing a file path or `.ext`              |
| Reasoning cues            | `ratio(reasoning) × 25`       | Prompts containing because/since/trade-off/edge case/… |
| Prompt substance (length) | `min(avgLen/40, 1) × 15`      | Rewards substantive average length up to 40 words      |

The technical vocabulary is a **curated word-boundary list** of engineering
concepts (async, closure, middleware, migration, race condition, refactor,
oauth, …). Generic filler (`const`, `return`, `type`, …) is deliberately
excluded, and matching is word-boundary based so `orm` won't fire inside
`transform`.

### 2. Authenticity / Engagement

Signal of real back-and-forth versus flat one-shot dictation.

| Component                | Formula                               |
| ------------------------ | ------------------------------------- |
| Corrections / follow-ups | `ratio(corrections) × 60`             |
| Length variety           | `min(stddev(lengths)/avgLen, 1) × 30` |
| Iteration depth          | `min(iterationDepth/8, 1) × 25`       |
| Not just one-liners      | `(1 − min(ratio(oneLiners), 1)) × 20` |
| Reasoning cues           | `ratio(reasoning) × 15`               |

`iterationDepth = n / sessionCount` (prompts per session). One-liners are
prompts of ≤ 3 words. Corrections match cues like `no,`, `actually`, `instead`,
`revert`, `doesn't work`, `still broken`.

### 3. Independence

Balance of understanding-seeking questions against pure command dictation.

| Component                | Formula                           |
| ------------------------ | --------------------------------- |
| Question/command balance | `(1 − \|qr − 0.35\| / 0.65) × 60` |
| Reasoning cues           | `ratio(reasoning) × 40`           |

`qr` = question ratio (prompts containing `?` or opening with a question word).
The balance term **peaks at a question ratio around 0.35** — neither all
commands nor all questions scores highest.

### Composite

```text
composite = round( (technicalDepth + authenticityEngagement + independence) / 3 )
```

A plain-language `verdict` string is also generated (band Strong/Moderate/Light

- which signal leads + corpus size), and it always ends by telling the reader to
  read the prompts.

## Reliability flag

Because small corpora make ratios and vocabulary richness noisy, each analysis
carries a reliability level based on prompt count `n`:

| `n`    | Level  | Meaning                                               |
| ------ | ------ | ----------------------------------------------------- |
| ≥ 300  | high   | Large corpus — comparatively stable.                  |
| 60–299 | medium | Directional, not precise.                             |
| < 60   | low    | Noisy — read prompts directly, weight scores lightly. |

## Other data (not scored, for review)

Beyond the three signals, `analyze()` also produces:

- **Metrics** — avg/median words, vocabulary richness (TTR), unique words,
  question / correction / reasoning / politeness / code-block / numeric ratios,
  technical terms per prompt, iteration depth, emoji-prompt count, avg word
  length, and sentences per prompt.
- **Behavioral markers** (as % of prompts) — imperative/directive, multi-part
  requests, planning language, delegates-judgment (autonomy), urgency,
  frustration, gratitude/praise. Tone and working-style signals only.
- **Domain & keyword tags** — each prompt is matched (word-boundary) against 13
  topic keyword sets: Frontend, Backend, Database, Testing, Debugging,
  Refactoring, DevOps, Git, Docs, AI/ML, Security, Performance, Config.
- **Length distribution** — buckets: Terse (≤3w), Short (4–12w), Medium
  (13–40w), Long (40w+).
- **Top technical terms** — the most frequent curated tech terms hit.
- **Session stats** — session count, avg/max prompts per session, single-prompt
  sessions, and (when timestamps exist) avg/longest session duration.
- **Style fingerprint** — top opening words, politeness label
  (courteous/occasional/blunt), and a style label (terse/balanced/verbose,
  inquisitive, iterative/hands-on).
- **Activity timeline + hourly histogram** — only when per-prompt timestamps
  exist. Claude Code, Codex, and OpenCode all have per-prompt timestamps;
  **Cursor does not**, so these are empty for Cursor (see
  [cursor.md](cursor.md#limitations-vs-claude-code)).

## The empty-source case

If a source has **zero typed prompts** (only slash commands / tool traffic),
`analyze()` returns an empty result carrying the message:

```text
No human-typed prompts found (only slash commands / tool traffic).
```

`analyze` prints that message; `report` still writes a valid, self-contained
HTML file showing it; and in `compare` an empty source scores `-1` and sorts
last.

## See Also

- [commands.md](commands.md) — running `analyze`, `report`, `compare`
- [claude-code.md](claude-code.md) — what feeds the scorer
- [cursor.md](cursor.md) — why Cursor timelines are empty
- [codex.md](codex.md) — the Codex reader
- [opencode.md](opencode.md) — the OpenCode reader
- [privacy.md](privacy.md) — reports contain raw prompt samples
