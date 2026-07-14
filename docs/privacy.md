# Privacy & Data Handling

`prompt-profiler` is designed to run entirely on your own machine.

## Everything runs locally

- **No network calls.** The tool makes zero outbound requests. It never uploads
  your prompts or scores anywhere. (You can verify: the generated report has no
  `http(s)://` `src`/`href` references — see the check in
  [../PUBLISHING.md](../PUBLISHING.md).)
- **Reads local files/DB only.** Claude Code data comes from
  `~/.claude/projects/*.jsonl`; Cursor data is read **read-only** from the local
  `state.vscdb` SQLite database via the `sqlite3` CLI. Nothing is written back to
  either source.
- **`serve` binds localhost only.** The dashboard listens on
  `http://localhost:4321` (or your `PORT`); it is not exposed to your network.

## The report contains raw prompts — treat it as sensitive

The HTML report is a **self-contained local file** (all CSS and charts inlined,
works offline via `file://`). All user-derived text is **HTML-escaped** before
embedding, since prompts are untrusted input.

However, the report **intentionally includes raw prompt samples** — an
evenly-spaced slice of up to 40 typed prompts (each truncated to 400 characters)
across the full corpus — so a reviewer can read actual prompts rather than trust
the numbers. That means:

- The `.html` file can contain **real content a person typed**, including
  whatever they pasted into prompts.
- Treat the report file as **sensitive**. Store it somewhere private and be
  deliberate about who you share it with.
- The same applies to anyone else's `~/.claude/projects` data you copy in to
  profile them (see
  [claude-code.md](claude-code.md#how-to-profile-someone-else)) — handle it with
  the person's consent and care.

## Ethical framing

Scores are heuristic signals for human review, **not verdicts**. Do not make
consequential decisions (hiring, evaluation) from the numbers alone. See
[scoring.md](scoring.md) for the full disclaimer.

## See Also

- [scoring.md](scoring.md) — the heuristic-signals framing
- [claude-code.md](claude-code.md) — what local files are read
- [cursor.md](cursor.md) — read-only SQLite access
- [commands.md](commands.md) — the `report` and `serve` commands
