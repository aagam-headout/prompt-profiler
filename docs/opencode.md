# Reading OpenCode Data

How `prompt-profiler` finds and interprets OpenCode session history. The
reader lives in `lib/opencode-parser.js`.

## The `sqlite3` requirement

OpenCode stores its sessions, messages, and message parts in a **SQLite
database**, not plain files. The reader shells out to the system **`sqlite3`
CLI** (read-only, JSON output) — same approach as [cursor.md](cursor.md) — so
there is **no native build dependency**, but the `sqlite3` binary must be on
your `PATH`.

If `sqlite3` is missing or no OpenCode database is found, the OpenCode source
simply does not appear — every other source is unaffected.

## Database locations

The reader checks these paths and uses the first that exists:

| Location                  | Path                                  |
| ------------------------- | ------------------------------------- |
| `$XDG_DATA_HOME` (if set) | `$XDG_DATA_HOME/opencode/opencode.db` |
| Default (macOS / Linux)   | `~/.local/share/opencode/opencode.db` |

## What counts as a human prompt

Human prompts live in the `message` table, joined to the `part` table:

- A row in `message` where `json_extract(data,'$.role') == 'user'` is a
  candidate prompt. Its `session_id` groups it into a session.
- The prompt text is the concatenation (in `part.id` order) of every `part`
  row belonging to that message where `json_extract(data,'$.type') == 'text'`.
  Messages with no text parts are dropped.
- `cwd` is `session.directory`, falling back to `project.worktree` via
  `session.project_id`.
- As with every other source, text starting with `/` is flagged `isSlash` and
  excluded from scoring. There is no `gitBranch` field, so it's always `null`.

### The junk filter

OpenCode's editor integration injects synthetic notes as **user-role**
messages — e.g. "the user opened/selected lines from file X" whenever a file
is opened or a selection changes. These aren't something a person typed, so a
prompt is discarded if its trimmed text starts with `<system-reminder`,
mirroring Claude Code's `SKIP_PREFIXES` filter (see
[claude-code.md](claude-code.md#the-junk-filter-skip_prefixes)). File
attachments the user deliberately pasted in (wrapped in `<path>`/`<content>`)
are **not** filtered — those are real authored content, just IDE-formatted.

## The single OpenCode source

OpenCode is exposed as one aggregate source, mirroring Cursor's style:

| Field | Value                     |
| ----- | ------------------------- |
| id    | `opencode::global`        |
| label | `OpenCode — all sessions` |

There is no per-workspace split — all sessions across every OpenCode project
live in one global database.

```bash
prompt-profiler analyze opencode::global
prompt-profiler report opencode::global
```

## Extra metadata harvested

| Metadata                | Source                                                               | Notes                                                                                               |
| ----------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Models used**         | Assistant `message.data` — `modelID` (falls back to `model.modelID`) | Tallied per assistant message.                                                                      |
| **Tools invoked**       | Every `part` row of type `tool` across **all** messages              | `json_extract(data,'$.tool')`, not filtered by role — e.g. `bash`, `read`, `write`, `edit`, `glob`. |
| **Languages generated** | —                                                                    | Not derived — always empty, unlike Claude's file-extension approach.                                |
| **Client versions**     | —                                                                    | Not derived — always empty.                                                                         |

## Limitations vs Claude Code

| Aspect                | Claude Code             | OpenCode                                         |
| --------------------- | ----------------------- | ------------------------------------------------ |
| Per-prompt timestamps | Yes                     | Yes (`message.time_created`, epoch millis → ISO) |
| Model used            | Yes                     | Yes, per assistant message                       |
| Tools invoked         | Yes                     | Yes, across all parts                            |
| Languages generated   | From Write/Edit targets | **Not derived** — always empty                   |
| Git branch            | Yes                     | **No** — not recorded, always `null`             |
| Aggregation           | Per-workspace + `--all` | Single `opencode::global` source                 |

**Graceful degradation:** if the database is **locked** (OpenCode is running)
or malformed, or `sqlite3` is missing/broken, the reader returns empty results
rather than crashing — close OpenCode and retry to read a locked database.

## Troubleshooting

Check that `sqlite3` is available:

```bash
sqlite3 --version
```

See [cursor.md](cursor.md#troubleshooting) for install instructions per
platform — identical steps apply here.

If OpenCode still doesn't appear after installing `sqlite3`, confirm the
database exists at one of the paths above and that OpenCode has been used at
least once.

## See Also

- [cursor.md](cursor.md) — the parallel SQLite-backed reader
- [codex.md](codex.md) — the Codex JSONL reader
- [commands.md](commands.md) — analyzing and reporting a source
- [scoring.md](scoring.md) — how prompts become signals
