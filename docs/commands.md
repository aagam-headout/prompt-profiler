# Command Reference

Every command below is exposed by the canonical CLI at
`bin/prompt-profiler.js`. Examples use the `prompt-profiler` binary name (global
install); from a clone, substitute `node bin/prompt-profiler.js`, and from
GitHub `npx github:<your-github-username>/prompt-profiler`.

> Every score printed by these commands is a **heuristic signal for human
> review, not a verdict**. Read the raw prompts before drawing conclusions.

## Commands at a glance

| Command | Purpose |
|---------|---------|
| `list` | List every source (Claude Code projects + Cursor). |
| `analyze <id> \| --all` | Print scores, fingerprint, and metrics for one source. |
| `compare <id...>` | Rank 2+ sources side by side. |
| `report [<id> \| --all]` | Generate and open a self-contained HTML report. |
| `serve` | Run the web dashboard on `http://localhost:4321`. |
| `--help`, `-h` | Show usage. |
| `--version`, `-v` | Print the version. |

---

## `list`

**Synopsis:** `prompt-profiler list`

Lists all discovered sources — every Claude Code workspace under
`~/.claude/projects` plus (if `sqlite3` and a Cursor DB are present) the single
Cursor source. Each row shows the source kind, session count, and the source
`id` you pass to other commands.

```bash
prompt-profiler list
```

Sample output:

```text
24 sources (Claude projects + Cursor):

  [claude]  68 sessions  -Users-aagam-code-ho-ai-porygon-mcp-ft-proto-mcp
  [claude]  49 sessions  -Users-aagam-code-ho-ai-porygon-dashboard
  [claude]   2 sessions  -Users-aagam-code-ho-ai-claude-test
  [cursor] 547 sessions  cursor::global

Run: prompt-profiler analyze <id>   (or --all, or compare a b c)
```

A Claude source `id` is the dash-encoded workspace folder name (see
[claude-code.md](claude-code.md)). The Cursor source `id` is always
`cursor::global` (see [cursor.md](cursor.md)).

---

## `analyze`

**Synopsis:** `prompt-profiler analyze <id>` · `prompt-profiler analyze --all`

Prints a text summary for a single source: the three signal scores plus
composite, the style fingerprint, and the full metrics table.

**Options**

| Option | Meaning |
|--------|---------|
| `<id>` | A source id from `list`. |
| `--all` | Aggregate every Claude Code workspace (source id `__all__`). Cursor is **not** included in `--all`. |

```bash
prompt-profiler analyze -Users-aagam-code-ho-ai-claude-test
prompt-profiler analyze --all
prompt-profiler analyze cursor::global
```

Sample output shape:

```text
=== -Users-aagam-code-ho-ai-claude-test ===
prompts: 214 | sessions: 12

SCORES (heuristic signals for human review — not verdicts):
  technicalDepth           58/100
  authenticityEngagement   61/100
  independence             47/100
  composite                55/100

FINGERPRINT:
  style: balanced, iterative / hands-on
  tone : occasional
  top openers: fix(9%), add(7%), the(6%), can(5%), ...

METRICS:
  avgPromptWords         18.4
  medianPromptWords      11
  vocabularyRichness     34.2
  ...
```

If a source has no human-typed prompts (only slash commands / tool traffic), it
prints the empty-source message instead of scores. See
[scoring.md](scoring.md#the-empty-source-case).

---

## `compare`

**Synopsis:** `prompt-profiler compare <id1> <id2> ...`

Ranks 2 or more sources by composite score, highest first. Ids may be
**space-separated or comma-separated** (or a mix). Needs at least 2 ids.

```bash
prompt-profiler compare projA projB projC
prompt-profiler compare projA,projB,projC
prompt-profiler compare -Users-me-code-app cursor::global
```

Sample output:

```text
RANK  COMPOSITE  DEPTH  AUTH  INDEP  PROMPTS  SOURCE
   1        62      64     63     58     412    -Users-me-code-app
   2        55      58     61     47     214    -Users-me-code-lib
   3        41      44     46     33      38    cursor::global

Heuristic ranking — read actual prompts before deciding.
```

Empty sources score `-1` across the board so they sort to the bottom.

---

## `report`

**Synopsis:** `prompt-profiler report [<id> | --all] [--out <path>] [--no-open]`

Generates a **single self-contained `.html` file** (all CSS and charts inlined,
zero network requests, works offline via `file://`) and opens it in your default
browser.

**Source resolution**

- `report <id>` — report on that source.
- `report --all` — aggregate all Claude Code workspaces (`__all__`).
- `report` with no id — if exactly one source exists, it is used automatically;
  otherwise the command errors and asks you to specify one or use `--all`.

**Options**

| Option | Meaning |
|--------|---------|
| `--out <path>` | Write the HTML here instead of the default path. Parent directories are created. |
| `--no-open` | Write the file but do not launch the browser. |

Default output path (current working directory):
`prompt-profiler-report-<sanitized-id>-<timestamp>.html`.

```bash
prompt-profiler report --all                          # aggregate, opens in browser
prompt-profiler report -Users-me-code-app             # one source
prompt-profiler report --all --out ./candidate.html   # custom path
prompt-profiler report -Users-me-code-app --no-open   # write only
```

Output:

```text
Report written: /Users/me/prompt-profiler-report--Users-me-code-app-20260714-113200.html
Heuristic signals for human review, not verdicts — read the prompt samples.
```

The browser open is dependency-free and cross-platform: `open` on macOS,
`start` on Windows, `xdg-open` on Linux. If it can't launch, the path is printed
so you can open it manually. The report contains raw prompt samples — treat the
`.html` as sensitive (see [privacy.md](privacy.md)).

---

## `serve`

**Synopsis:** `prompt-profiler serve`

Runs the Express web dashboard on `http://localhost:4321` (localhost only).
Delegates to `server.js`.

**Environment**

| Variable | Meaning |
|----------|---------|
| `PORT` | Override the port (default `4321`). |

```bash
prompt-profiler serve
PORT=5000 prompt-profiler serve
```

Startup output:

```text
  Prompt Profiler running → http://localhost:4321

  Reads local Claude Code data from ~/.claude/projects
  Scores are heuristic signals for human review, not verdicts.
```

The dashboard has two modes:

- **Deep dive** — pick one source; see full scores, breakdowns, metrics,
  behavioral markers, tags, timeline, and prompt samples. Also shows a
  percentile rank versus the cohort of all analyzed sources (when 3+ sources
  exist).
- **Compare & rank** — select 2+ sources and rank them by any score.

Backing API routes: `/api/projects` (all sources), `/api/analyze?project=<id>`
(single source + samples + percentiles), `/api/compare?projects=a,b,c` (ranked
rows). These are internal to the dashboard.

---

## Global flags

```bash
prompt-profiler --help       # or -h; also `prompt-profiler help`
prompt-profiler --version    # or -v; prints e.g. 0.1.0
```

Running with no command also prints help.

---

## Legacy `cli.js` entry

The original terminal entry point still works and is kept for backward
compatibility, but `bin/prompt-profiler.js` is canonical:

```bash
node cli.js --list
node cli.js --project <id>
node cli.js --all
node cli.js --compare a,b,c
```

`cli.js` covers list / analyze / compare only — it has no `report` or `serve`.
Prefer the subcommand CLI for anything new.

## See Also

- [installation.md](installation.md) — how to obtain the CLI
- [scoring.md](scoring.md) — what the scores and metrics mean
- [claude-code.md](claude-code.md) — Claude Code source ids and `--all`
- [cursor.md](cursor.md) — the `cursor::global` source
- [troubleshooting.md](troubleshooting.md) — port in use, empty analysis, etc.
