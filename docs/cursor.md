# Reading Cursor Data

How `prompt-profiler` finds and interprets Cursor chat history. The reader lives
in `lib/cursor-parser.js`.

## The `sqlite3` requirement

Cursor stores its chat/composer data in a **SQLite database**, not plain files.
The reader shells out to the system **`sqlite3` CLI** (read-only, JSON output)
so there is **no native build dependency** — but the `sqlite3` binary must be on
your `PATH`.

- **macOS:** preinstalled — usually nothing to do.
- **Linux / Windows:** you may need to install it (see [troubleshooting](#troubleshooting)).

If `sqlite3` is missing or no Cursor database is found, the Cursor source simply
does not appear — Claude Code analysis is unaffected.

## Database locations

The reader checks these per-platform paths and uses the first that exists:

| Platform | Path |
|----------|------|
| macOS | `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb` |
| Windows | `%APPDATA%/Cursor/User/globalStorage/state.vscdb` |
| Linux | `~/.config/Cursor/User/globalStorage/state.vscdb` (also lowercase `~/.config/cursor/...`) |

## What counts as a human prompt

Human prompts are rows in the `cursorDiskKV` table keyed
`bubbleId:<composerId>:<msgId>`, where the JSON value has:

- `json_extract(value,'$.type') == 1` (type 1 = user message), and
- a non-empty `$.text` field.

Each distinct **`composerId`** counts as one session. As with Claude Code, text
starting with `/` is flagged `isSlash` and excluded from scoring.

## The single Cursor source

Cursor is exposed as one aggregate source:

| Field | Value |
|-------|-------|
| id | `cursor::global` |
| label | `Cursor — all chats (global store)` |

There is no per-workspace split for Cursor — all chats live in one global store.

```bash
prompt-profiler analyze cursor::global
prompt-profiler report cursor::global
```

Languages are derived from code blocks in the chat data (`codeBlocks[].languageId`),
mapped to friendly names (e.g. `typescriptreact` → TypeScript (React)).

## Limitations vs Claude Code

Cursor's store exposes less than Claude Code's JSONL. Document these honestly
when comparing sources:

| Aspect | Claude Code | Cursor |
|--------|-------------|--------|
| Per-prompt timestamps | Yes | **No** — so the activity timeline and activity-by-hour charts are empty, and session duration is unavailable. |
| Model used | Yes | **Anonymized** — Cursor records `"default"` per message, so models are not available. The report notes this explicitly. |
| Tools invoked | Yes | **None** — tool usage is not recorded, so the tools list is empty. |
| Languages generated | From Write/Edit targets | From chat code blocks' `languageId`. |
| Aggregation | Per-workspace + `--all` | Single `cursor::global` source. |

**Graceful degradation:** if the database is **locked** (Cursor is running) or
`sqlite3` is missing/broken, the reader returns empty results rather than
crashing. Close Cursor and retry to read a locked database.

## Troubleshooting

Check that `sqlite3` is available:

```bash
sqlite3 --version
```

If that fails, install it:

```bash
# macOS (already present, but if needed):
brew install sqlite

# Debian / Ubuntu:
sudo apt-get install sqlite3

# Fedora:
sudo dnf install sqlite

# Windows (choose one):
winget install SQLite.SQLite
choco install sqlite
# or download the "sqlite-tools" bundle from sqlite.org and add it to PATH
```

If Cursor still doesn't appear after installing `sqlite3`, confirm the database
exists at one of the paths above and that Cursor has been used at least once.

## See Also

- [claude-code.md](claude-code.md) — the parallel Claude Code reader
- [commands.md](commands.md) — analyzing and reporting a source
- [scoring.md](scoring.md) — how prompts become signals
- [troubleshooting.md](troubleshooting.md) — Cursor not showing, DB locked
