# Reading Codex Data

How `prompt-profiler` finds and interprets Codex CLI / Desktop session
history. The reader lives in `lib/codex-parser.js`.

## Where the data lives

Codex writes one JSONL **rollout** file per session under:

```text
~/.codex/sessions/YYYY/MM/DD/rollout-<timestamp>-<uuid>.jsonl
~/.codex/archived_sessions/YYYY/MM/DD/rollout-<timestamp>-<uuid>.jsonl
```

Both directories are scanned recursively; archived sessions are included
alongside active ones with no distinction in the output. Every line in a
rollout file is a JSON event.

## The single Codex source

Like Cursor, Codex is exposed as one aggregate source (no per-workspace split,
since a single rollout file can span multiple cwds via `turn_context`):

| Field | Value                  |
| ----- | ---------------------- |
| id    | `codex::global`        |
| label | `Codex — all sessions` |

```bash
prompt-profiler analyze codex::global
prompt-profiler report codex::global
```

`sessions` in `list` is the number of rollout files found; for analysis it is
the number of distinct `session_meta.payload.id`s seen (falling back to the
file name if a file has no `session_meta` line).

## What counts as a human prompt

Each rollout line is one JSON event with a top-level `type`. The reader looks
at:

- `session_meta` — one per file, gives the session id and initial `cwd`.
- `turn_context` — appears per turn; gives the current `cwd` and the `model`
  in use for that turn.
- `response_item` wrapping a `payload.type === 'message'` with
  `payload.role === 'user'` — a candidate human prompt.
- `response_item` wrapping a `payload.type === 'function_call'` — tool/function
  calls (`exec_command`, `apply_patch`, …), tallied into the tools metadata.

Only `response_item` user messages survive; everything else (`event_msg`,
`reasoning`, `token_count`, assistant messages, …) is ignored for prompt
extraction.

### The junk filter

Many `role: "user"` response items are **not** human-typed — they're synthetic
content Codex injects itself. A prompt is discarded if its trimmed text starts
with:

```text
<environment_context>
The following is the Codex agent history whose request action you are assessing
```

The first is the environment-context block Codex prepends to a turn; the
second is the transcript-review wrapper injected by a sub-process reviewing
agent history. Both are always skipped, mirroring Claude Code's
`SKIP_PREFIXES` filter (see [claude-code.md](claude-code.md#the-junk-filter-skip_prefixes)).

Message text is the concatenation of all `input_text` / `output_text` blocks in
`payload.content`, same join convention as Claude's `extractText`.

### Slash commands

Text starting with `/` is kept but flagged `isSlash`, excluded from scoring —
same convention as every other source.

## Extra metadata harvested

| Metadata                | Source                             | Notes                                                                                                            |
| ----------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Models used**         | `turn_context.payload.model`       | Tallied per turn (e.g. `gpt-5.4`, `gpt-5.3-codex`).                                                              |
| **Tools invoked**       | `function_call.payload.name`       | `exec_command`, `apply_patch`, `write_stdin`, …                                                                  |
| **Client versions**     | `session_meta.payload.cli_version` | Distribution of Codex CLI/Desktop versions seen.                                                                 |
| **Languages generated** | —                                  | Not derived for Codex — there's no signal as clean as Claude's Write/Edit file targets, so this is always empty. |

## Limitations vs Claude Code

| Aspect                | Claude Code             | Codex                                 |
| --------------------- | ----------------------- | ------------------------------------- |
| Per-prompt timestamps | Yes                     | Yes (`timestamp` field on every line) |
| Model used            | Yes                     | Yes, per turn                         |
| Tools invoked         | Yes                     | Yes                                   |
| Languages generated   | From Write/Edit targets | **Not derived** — always empty        |
| Git branch            | Yes                     | **No** — not recorded, always `null`  |
| Aggregation           | Per-workspace + `--all` | Single `codex::global` source         |

**Graceful degradation:** if `~/.codex` or `~/.codex/sessions` doesn't exist,
the Codex source simply doesn't appear — other sources are unaffected.

## See Also

- [claude-code.md](claude-code.md) — the parallel Claude Code reader
- [opencode.md](opencode.md) — the OpenCode reader
- [commands.md](commands.md) — analyzing and reporting a source
- [scoring.md](scoring.md) — how prompts become signals
