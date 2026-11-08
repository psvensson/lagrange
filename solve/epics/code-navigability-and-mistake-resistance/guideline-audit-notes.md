# navigability-guideline-audit notes (append-only)

## 2026-11-08 implementer resume (after predecessor lost to a reboot)

- Base: 6ede85472 (seal of 0e4deb694). Predecessor's uncommitted audit,
  test, wiring and doc section kept; detector module present since the
  budget-check quest (86ee709c8), so the real-tree test can run.
- Same-detector: the audit imports scripts/checks/code-navigability-detectors.js
  (per-file `detect*` exports + `detectInheritanceDepthOverTwo` across the
  domain). Its only AST walk is `enclosingFunctionName`, bookkeeping for the
  shared identity (file|kind|function), not pattern detection.
- Promotion: the audit reads `promotedPatterns` from
  scripts/checks/code-navigability-eslint-promotion.js (the budget script's
  reader) on the first src file and drops promoted patterns; an unreadable
  ESLint config promotes none (fail-closed: everything audited). Fixture
  test injects an ESLint stand-in through `main` options (`eslintRunner`).
- Baselines written once with --update-baseline at the current counts
  (scripts/check-guideline-navigability-baseline-<row>.json, shared shape
  version/generatedAt/rawViolationCount/violations): owner_port 2130,
  identity_state 87, prototype_bags 59, inheritance 65, alias_reads 745,
  state_read_defaults 413, then_checks 45, two_source 1789, typeof_dual 627,
  catch_default 387, alias_exports 40, legacy_terms 2924.
- Probe `--rows navigability_patterns_without_ratchet` reads 0.
- Checks on the staged set: audit:guidelines exit 0 (navigability: 0 new,
  9311 inherited over 2034 files); pre-commit hook 0 FAIL; fast-static ok
  after test:metadata:refresh; test:duplication and audit:file-size exit 0;
  steering:check exit 0. Lab cone on carinas-windows, snapshot
  30ee97c56 (refs/wip/nav-audit-1321), base 0e4deb694: 224/224 files pass,
  5517 assertions, no zero-assertion file. The lab snapshot predates this
  bullet only.
- Open for the owner: the real-tree test still requires all twelve baseline
  files; when a pattern is promoted and its baseline deleted, that test must
  read promotion too.
