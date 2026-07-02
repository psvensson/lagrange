# Legacy Work Archive (pruned)

This directory is a historical archive from a pre-Quest workflow. It is NOT
part of the live codebase or the active steering surface — see `AGENTS.md`
for how work is planned and executed today.

The bulk of the archive (~1,900 files of old work packages, spec archives,
sprint trackers, and agent reports) was removed from the checkout to keep a
fresh clone lean. Everything remains retrievable from git history:

```bash
git log --oneline -- _legacy_work   # find the removal commit
git show <removal-commit>^:_legacy_work/<path>
```

What remains here is the small set of files still referenced by live tooling:

- `theory-ledger.md` — validated by `scripts/check-system-contracts.js`
  (`npm run model:contract-records`).
- `scripts/work-theory-ledger.js` + `scripts/work-package-schema.js` —
  imported by `scripts/solve/theory.js` (the Solver's theory commands).
- `inventory/ordinal-segments.{md,json}` — ordinal-segment migration
  inventory, written by `scripts/inventory-ordinal-segments.js` and cited by
  `src/rebalancer/README.md`.
