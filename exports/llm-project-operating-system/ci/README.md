# Sample CI gate

`gate.yml` is a sample GitHub Actions workflow that mirrors the local git-hook
gate installed by `tooling/hooks/install.js` (which sets `core.hooksPath`).

The local hooks run structural guards on commit/push; CI runs the same full-tree
checks on every push and pull request so the gate also holds for changes that
bypass hooks (`SKIP_GATE_HOOKS=1`, web edits, force-pushes).

To enable it:

1. Copy `ci/gate.yml` to `.github/workflows/gate.yml` in your repo.
2. Ensure your `package.json` defines the scripts it calls: `audit:file-size`,
   `audit:guideline:hot-path-diagnostics`, `test:unused`, and `steering:check`
   (these come from the bundle's script fragment / hook payload).
3. Adjust `node-version`, branch filters, and step names to taste.

The `check-staged-constant-names` guard from the pre-commit hook is not in CI: it
scans the staged diff and only has meaning inside a commit, so the pre-commit
hook remains its enforcement point.
