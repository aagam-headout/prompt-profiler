# Prompt Profiler

A Node CLI that reads your local **Claude Code**, **Cursor**, **Codex**, and
**OpenCode** session history and distills it into prompting-style **signals**
— technical depth, authenticity/engagement, independence, plus a style
fingerprint, metrics, and behavioral markers.

> ⚠ **Read this.** Every score is a _heuristic signal for a human reviewer_, not
> a validated measure of skill, intelligence, or honesty. Prompting style varies
> with the task, tooling familiarity, and mood. Do not make decisions from these
> numbers alone — **always read the raw prompt samples**. This framing is kept
> visible in the CLI, the report, and the dashboard by design.

## Quickstart

This tool is **not published to npm yet** — run it straight from GitHub with
`npx` (replace `<your-github-username>` with the account hosting the repo):

```bash
npx github:<your-github-username>/prompt-profiler report --all
```

That generates a self-contained HTML report across all your Claude Code
workspaces and opens it in your browser. Other install routes (global install,
clone) are in [docs/installation.md](docs/installation.md).

## Commands at a glance

| Command                  | What it does                                                           |
| ------------------------ | ---------------------------------------------------------------------- |
| `list`                   | List all sources (Claude Code workspaces + Cursor + Codex + OpenCode). |
| `analyze <id> \| --all`  | Print scores, fingerprint, and metrics for one source.                 |
| `compare <id...>`        | Rank 2+ sources side by side (space- or comma-separated).              |
| `report [<id> \| --all]` | Generate a self-contained HTML report and open it.                     |
| `serve`                  | Run the web dashboard at `http://localhost:4321`.                      |
| `--help` / `--version`   | Usage / version.                                                       |

`report` options: `--out <path>` (custom output path), `--no-open` (write
without launching the browser). Full reference: [docs/commands.md](docs/commands.md).

## Documentation

| Doc                                                | Covers                                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------------ |
| [docs/installation.md](docs/installation.md)       | Requirements, and the three ways to run (GitHub `npx`, global install, clone). |
| [docs/commands.md](docs/commands.md)               | Full reference for every subcommand, flag, and output shape.                   |
| [docs/claude-code.md](docs/claude-code.md)         | How Claude Code `~/.claude/projects` data is read; profiling someone else.     |
| [docs/cursor.md](docs/cursor.md)                   | How Cursor's SQLite store is read; `sqlite3` setup; limitations.               |
| [docs/codex.md](docs/codex.md)                     | How Codex CLI/Desktop `~/.codex/sessions` rollout files are read; limitations. |
| [docs/opencode.md](docs/opencode.md)               | How OpenCode's SQLite store is read; `sqlite3` setup; limitations.             |
| [docs/scoring.md](docs/scoring.md)                 | The three signals and their transparent formulas, metrics, and markers.        |
| [docs/privacy.md](docs/privacy.md)                 | Runs 100% locally; the report contains raw prompts — treat as sensitive.       |
| [docs/troubleshooting.md](docs/troubleshooting.md) | No sources, Cursor missing, port in use, empty analysis, browser didn't open.  |
| [PUBLISHING.md](PUBLISHING.md)                     | Maintainer guide for publishing to npm (future).                               |

## Project layout

- `bin/prompt-profiler.js` — canonical CLI (list / analyze / compare / report / serve)
- `lib/parser.js` — Claude Code JSONL reader
- `lib/cursor-parser.js` — Cursor SQLite reader
- `lib/codex-parser.js` — Codex JSONL reader
- `lib/opencode-parser.js` — OpenCode SQLite reader
- `lib/analyzer.js` — transparent heuristic scoring
- `lib/report.js` — self-contained HTML report builder
- `server.js` + `public/index.html` — web dashboard (behind `serve`)
- `cli.js` — legacy terminal entry (`--list` / `--project` / `--all` / `--compare`); still works
