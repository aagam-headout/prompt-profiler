# Troubleshooting

Common issues and fixes. If your problem isn't here, check the relevant reader
doc: [claude-code.md](claude-code.md), [cursor.md](cursor.md),
[codex.md](codex.md), or [opencode.md](opencode.md).

## "No sources found" / empty `list`

`list` shows nothing (or no Claude sources).

- Confirm `~/.claude/projects` exists and contains workspace subfolders with
  `.jsonl` files. If you've never run Claude Code, there's nothing to read.
- The tool reads from the **current user's home** (`os.homedir()`). If you're
  running as a different user (sudo, a service account, a container), `$HOME`
  may point elsewhere — run as yourself.
- To profile someone else, their `~/.claude/projects` subfolder must be dropped
  into **your** `~/.claude/projects`. See
  [claude-code.md](claude-code.md#how-to-profile-someone-else).

## Cursor not showing up

The `cursor::global` source is missing from `list`.

- **`sqlite3` not on PATH.** Check with `sqlite3 --version`. Install it if
  missing (see [cursor.md](cursor.md#troubleshooting)).
- **Database locked (Cursor is running).** The reader opens the DB read-only,
  but a running Cursor can lock it. **Close Cursor** and retry. When locked, the
  reader degrades gracefully to empty rather than crashing.
- **No Cursor DB found.** Confirm `state.vscdb` exists at the platform path in
  [cursor.md](cursor.md#database-locations) and that Cursor has been used at
  least once.

## Codex not showing up

The `codex::global` source is missing from `list`.

- Confirm `~/.codex/sessions` (or `~/.codex/archived_sessions`) exists and
  contains `rollout-*.jsonl` files under the nested `YYYY/MM/DD` layout. If
  you've never run Codex CLI/Desktop, there's nothing to read.
- Like Claude Code, the tool reads from the **current user's home** — run as
  yourself, not a different user/service account.

## OpenCode not showing up

The `opencode::global` source is missing from `list`.

- **`sqlite3` not on PATH.** Check with `sqlite3 --version` (same fix as
  [cursor.md](cursor.md#troubleshooting)).
- **Database locked (OpenCode is running).** Close OpenCode and retry — a
  locked DB degrades to empty rather than crashing.
- **No OpenCode DB found.** Confirm `opencode.db` exists at one of the paths in
  [opencode.md](opencode.md#database-locations) and that OpenCode has been
  used at least once.

## Port 4321 already in use

`serve` fails to bind (`EADDRINUSE`).

```bash
PORT=5000 prompt-profiler serve
```

Set any free port via the `PORT` environment variable.

## Empty analysis ("No human-typed prompts found")

`analyze` prints `No human-typed prompts found (only slash commands / tool
traffic).`

- That source's session(s) contain only slash commands (`/clear`, `/compact`,
  …) and/or tool traffic — nothing the scorer counts. This is expected for
  throwaway or command-only workspaces.
- Try a busier source (higher session count in `list`) or `--all` to aggregate
  across all Claude workspaces. See
  [scoring.md](scoring.md#the-empty-source-case).

## Browser didn't open after `report`

`report` writes the file but no browser appears.

- The path is always printed (`Report written: /abs/path.html`). Open it
  manually.
- Run with `--no-open` to skip the launch entirely, then open the printed path
  yourself:

  ```bash
  prompt-profiler report --all --no-open
  ```

- The open uses the OS default (`open` / `start` / `xdg-open`); on a headless or
  minimal Linux box these may be absent — opening manually is the fix.

## `npx github:...` fails to resolve

- Make sure you replaced `<your-github-username>` with the real account and that
  the repo has been pushed to GitHub. See
  [installation.md](installation.md#publishing-the-repo-to-github-maintainer).
- Remember `npx prompt-profiler` (registry form) does **not** work yet — this
  package is unpublished. Use the `github:` form.

## See Also

- [installation.md](installation.md) — requirements and install routes
- [commands.md](commands.md) — command and flag reference
- [cursor.md](cursor.md) — `sqlite3` setup and DB locations
- [codex.md](codex.md) — Codex session file locations
- [opencode.md](opencode.md) — OpenCode `sqlite3` setup and DB locations
- [scoring.md](scoring.md) — the empty-source case
