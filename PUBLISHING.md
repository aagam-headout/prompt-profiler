# Publishing `prompt-profiler` to npm

Maintainer guide. Users just run `npx prompt-profiler` — this doc is for
whoever ships releases.

## Status (checked 2026-07-14)

- Name `prompt-profiler` is **available** on the npm registry.
- This machine is **not logged in** to npm yet.

## One-time setup

1. Create a free account at https://www.npmjs.com/signup (skip if you have one).
2. Log in from this machine:
   ```bash
   npm login
   ```
   Enter username, password, email, and the one-time code (2FA). Verify with:
   ```bash
   npm whoami
   ```
3. (Recommended) Add author + repository to `package.json` so the npm page
   links back to source:
   ```json
   "author": "Your Name <you@example.com>",
   "license": "MIT",
   "repository": { "type": "git", "url": "https://github.com/<you>/prompt-profiler.git" }
   ```

## Pre-publish checklist

Run these from the project root — all must pass before publishing:

```bash
# 1. Confirm exactly the intended files ship (node_modules must NOT appear)
npm pack --dry-run

# 2. Smoke-test the CLI end to end
node bin/prompt-profiler.js --help
node bin/prompt-profiler.js list
node bin/prompt-profiler.js report --all --no-open --out /tmp/pp-check.html

# 3. Confirm the report is self-contained (must print 0)
grep -cE '(src|href)="https?://' /tmp/pp-check.html
```

## Publish

```bash
# Public scoped OR unscoped package — this one is unscoped, so:
npm publish

# If the name were scoped (@you/prompt-profiler), you'd need:
# npm publish --access public
```

After publishing, verify:

```bash
npm view prompt-profiler version      # shows the version you just pushed
npx prompt-profiler@latest --help     # runs the published build
```

## Releasing a new version

npm refuses to republish an existing version. Bump first — this also creates a
git tag:

```bash
npm version patch     # 0.1.0 -> 0.1.1   (bug fixes)
npm version minor     # 0.1.0 -> 0.2.0   (new features, back-compatible)
npm version major     # 0.1.0 -> 1.0.0   (breaking changes)

npm publish
git push --follow-tags
```

## Testing the tarball before going public

To dry-run the _installed_ experience without touching the registry:

```bash
npm pack                                  # produces prompt-profiler-<ver>.tgz
npm install -g ./prompt-profiler-0.1.0.tgz
prompt-profiler --help
npm uninstall -g prompt-profiler          # clean up
```

## Notes

- `express` is a runtime dependency (used by `serve`). It installs
  automatically for users — do not remove it from `dependencies`.
- The `files` allowlist in `package.json` controls what ships. If you add a new
  runtime file, add it there or it won't be in the published package.
- `PUBLISHING.md` itself is intentionally **not** in `files`, so it stays in the
  repo but never ships to npm users.
