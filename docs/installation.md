# Installation

How to get `prompt-profiler` running. It is a small Node CLI with a single
runtime dependency (`express`, used only by the `serve` dashboard).

## Requirements

| Requirement | Needed for | Notes |
|-------------|-----------|-------|
| Node.js ≥ 18 | Everything | The `"engines"` field in `package.json` enforces this. |
| `sqlite3` binary on `PATH` | Cursor data only | Not needed for Claude Code. Preinstalled on macOS; on Linux/Windows you may have to install it. See [cursor.md](cursor.md). |

Claude Code analysis has **no external dependencies** beyond Node — it reads
plain `.jsonl` files. The `sqlite3` requirement only applies if you want to
profile Cursor chats.

## This tool is unpublished

`prompt-profiler` is **not on the npm registry yet**. Install it from GitHub.
The npm-registry route (`npx prompt-profiler`) is documented last as a
*future* option and does not work today.

---

## 1. Run straight from GitHub (no install)

The fastest way — `npx` fetches the repo, runs the command, and leaves nothing
installed:

```bash
npx github:<your-github-username>/prompt-profiler report --all
```

Replace `<your-github-username>` with the account that hosts the repo. Any
subcommand works the same way:

```bash
npx github:<your-github-username>/prompt-profiler list
npx github:<your-github-username>/prompt-profiler analyze --all
npx github:<your-github-username>/prompt-profiler serve
```

### Publishing the repo to GitHub (maintainer)

If you are the maintainer and the repo isn't on GitHub yet, publish it so the
`npx github:...` form resolves:

```bash
# from the project root
git add -A
git commit -m "Initial prompt-profiler release"

# create an empty repo named prompt-profiler on github.com first, then:
git remote add origin https://github.com/<your-github-username>/prompt-profiler.git
git push -u origin main
```

After the push, anyone can run `npx github:<your-github-username>/prompt-profiler ...`.

---

## 2. Global install from GitHub

Installs a `prompt-profiler` command onto your `PATH`:

```bash
npm install -g github:<your-github-username>/prompt-profiler
prompt-profiler report --all
```

Update later with the same `npm install -g github:...` command; uninstall with
`npm uninstall -g prompt-profiler`.

---

## 3. From a clone (development)

Best if you want to read or modify the source:

```bash
git clone https://github.com/<your-github-username>/prompt-profiler.git
cd prompt-profiler
npm install
node bin/prompt-profiler.js report --all
```

The `npm run` scripts are shortcuts for the clone workflow:

```bash
npm start          # → node bin/prompt-profiler.js serve
npm run serve      # same as above
npm run cli -- list
npm run report -- --all
```

---

## Future: install from the npm registry (not yet available)

Once the package is published to npm, these will work — **they do not work
today**:

```bash
npx prompt-profiler report --all        # NOT YET PUBLISHED
npm install -g prompt-profiler          # NOT YET PUBLISHED
```

Publishing to npm is a maintainer task documented in
[../PUBLISHING.md](../PUBLISHING.md).

## See Also

- [commands.md](commands.md) — full command and flag reference
- [claude-code.md](claude-code.md) — how Claude Code data is read
- [cursor.md](cursor.md) — Cursor requirements and `sqlite3` setup
- [troubleshooting.md](troubleshooting.md) — "no sources found" and other issues
