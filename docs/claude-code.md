# Reading Claude Code Data

How `prompt-profiler` finds and interprets Claude Code session history. The
reader lives in `lib/parser.js`.

## Where the data lives

Claude Code stores session history under:

```text
~/.claude/projects/<workspace>/*.jsonl
```

- Each **subfolder** of `~/.claude/projects` is one **workspace** — a directory
  Claude Code was run in.
- The folder name is a **dash-encoded path**: path separators become dashes. For
  example the folder `-Users-me-code-app` decodes to `/Users/me/code/app`.
- Each `.jsonl` file inside is one session's event log; every line is a JSON
  event.

## Source ids

The **source id** for a Claude workspace is the raw folder name, exactly as
`list` prints it — e.g. `-Users-me-code-app`. Pass that id to `analyze`,
`report`, or `compare`.

`list` shows the decoded path as a human label but you address the source by its
encoded id. Session count = number of `.jsonl` files in the folder for `list`;
for analysis it is the number of **distinct `sessionId`s** seen.

## `--all` aggregation

`--all` (source id `__all__`) reads **every** workspace under
`~/.claude/projects` and pools all prompts into one analysis. Use it for a
whole-history profile of a person across all their projects.

```bash
prompt-profiler analyze --all
prompt-profiler report --all
```

Note: `--all` covers Claude Code workspaces only. It does **not** fold in the
Cursor, Codex, or OpenCode sources — analyze `cursor::global`, `codex::global`,
or `opencode::global` separately (see [cursor.md](cursor.md),
[codex.md](codex.md), [opencode.md](opencode.md)).

## What counts as a human prompt

The parser is deliberately strict — it keeps only text a person actually typed.
For each JSONL line it requires **all** of:

- `type === 'user'`
- `message.role === 'user'`
- NOT `isMeta` (excludes injected meta events)
- NOT `isSidechain` (excludes sub-agent / Task traffic — that isn't the human)
- NOT a tool-result-only message (content that is entirely `tool_result` blocks)
- Text that survives the junk filter below

`message.content` may be a string or an array of content blocks; only `text`
blocks are kept, so `tool_result` and other block types are dropped.

### The junk filter (SKIP_PREFIXES)

A prompt is discarded if its trimmed text is empty or **starts with** any of
these prefixes (system-generated content, not human typing):

```text
<local-command      <command-name       <command-message
<command-args       <command-stdout     <user-memory
<system-reminder    <task-notification  <post-tool
<hook-              <budget             <bash-
Caveat:             [Request interrupted
This session is being continued
```

### Slash commands

Text starting with `/` (e.g. `/clear`, `/compact`, custom slash commands) is
**kept but flagged** `isSlash`. Slash commands are counted separately and are
**excluded from scoring** — the analyzer only scores non-slash, human-typed
prompts. See [scoring.md](scoring.md).

## Extra metadata harvested from assistant turns

While scanning, the parser also reads `assistant` events to surface context
(shown in the report / dashboard, not scored):

| Metadata                 | Source                                                                    | Notes                                                  |
| ------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------ |
| **Models used**          | `message.model` on assistant turns                                        | Masked models (starting with `<`) are skipped.         |
| **Tools invoked**        | `tool_use` blocks                                                         | Counts per tool name (Bash, Read, Edit, MCP tools, …). |
| **Languages generated**  | file extension of `Write` / `Edit` / `MultiEdit` / `NotebookEdit` targets | Extension → language name (e.g. `.ts` → TypeScript).   |
| **Claude Code versions** | `version` field on any event                                              | Distribution of CLI versions seen.                     |

## How to profile someone else

Claude Code data is just files, so profiling another person is a copy-and-run:

1. Have them share their `~/.claude/projects` folder — either the whole thing or
   a single workspace subfolder (e.g. just `-Users-them-code-app`).
2. Drop it into **your** `~/.claude/projects` (place the subfolder alongside your
   own workspaces). Their folder name is self-contained, so it won't collide.
3. Run `prompt-profiler list` — the new workspace appears as a source.
4. Run `prompt-profiler analyze <their-id>` or
   `prompt-profiler report <their-id>` for the full HTML report.

Remember the ethical framing: these are signals for a human reviewer, never a
verdict. Always read the raw prompt samples the report surfaces.

## See Also

- [cursor.md](cursor.md) — the parallel Cursor reader
- [codex.md](codex.md) — the parallel Codex reader
- [opencode.md](opencode.md) — the parallel OpenCode reader
- [scoring.md](scoring.md) — what happens to the prompts after parsing
- [commands.md](commands.md) — `list`, `analyze`, `report`, `--all`
- [privacy.md](privacy.md) — everything stays local
