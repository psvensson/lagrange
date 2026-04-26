# Guideline Literal Debt Rebaseline And Ratchet

## Why

`npm run audit:guideline:literals` reports 6288 violations. That count is too
large for one cleanup pass, but leaving it as ambient debt makes the critical
generation contract unenforceable during future LLM sprints.

## Scope Basis

Repo-wide generation-contract maintenance scope under Phase `0.1 - Internal
Coherence`.

Sprint:

1. [Roadmap runtime truth and boundary closure](../sprints/active-2026-q2-roadmap-runtime-truth-and-boundary-closure.md)

## In Scope

1. Record a current repo-wide literal audit baseline.
2. Split the baseline by production/test/tooling/domain boundary.
3. Add or document a ratchet policy so touched production files cannot increase
   literal-owner debt.
4. Create follow-on cleanup tranches for hot runtime owners rather than one
   unreviewable repo-wide rewrite.

## Out Of Scope

1. Renaming every fixture literal in one pass.
2. Expanding allowlists without owner, reason, expiry, and follow-on.
3. Moving literals into constants solely to silence the audit when the semantic
   owner is still wrong.

## Invariants

1. Shared domain values live in canonical owner modules.
2. File-private values have one top-level named constant.
3. Test-private values have suite-local named constants when repeated or
   semantically meaningful.
4. Ratchets must not hide new production debt.

## Hotspots

1. `scripts/check-guideline-literals.js`
2. `src/control-plane/priority-recovery-snapshot.js`
3. `src/rebalancer/`
4. `src/bootstrap/`
5. `src/cli/`
6. `test/`

## Initial Baseline

Observed on April 26, 2026:

1. Repo-wide count: 6288 literal-guideline violations across 880 JavaScript
   files.
2. Top files:
   `src/cli/index.js`, `src/cli/core/help-overlay.js`,
   `src/cli/core/dev-tools.js`, `src/cli/core/visual-indicators.js`,
   `src/cli/views/services-view.js`, `src/runtime/pgwire-protocol-handler.js`,
   `src/cli/views/config-view.js`, `src/cli/views/logs-view.js`,
   `scripts/generate-steering-llm-pack.js`,
   `src/cli/core/keyboard-handler.js`.

## Static Drift Ledger

Preflight:

- [ ] Run `npm run audit:guideline:literals`.
- [ ] Record repo-wide count and production/test split.
- [ ] Record touched-file counts before edits.
- [ ] Identify the first owner-scoped cleanup tranche.

Closure:

- [ ] Rerun the literal audit or the selected boundary-scoped literal audit.
- [ ] No touched production file has a higher literal count.
- [ ] Any new allowlist entry has owner, reason, expiry, and follow-on.

## Validation

1. `npm run audit:guideline:literals`
2. Boundary-scoped literal audit for first cleanup tranche.
3. Focused tests for any runtime file changed during cleanup.

## Done When

1. Literal debt has a recorded baseline and ratchet.
2. Future packages can prove no touched-file literal drift even before the
   repo-wide count reaches zero.
