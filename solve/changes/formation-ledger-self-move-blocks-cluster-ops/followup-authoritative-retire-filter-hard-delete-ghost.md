# Follow-up — authoritative terminal-REPLACE retire-filter (hard-delete drain-handoff ghost)

Status: OPEN residual, deferred from the E-cheap commit (documented, not a regression).

## The residual
E-cheap refreshes `currentReplicas` for a fresh leader's count decision via an
authoritative-over-cache **UNION** (`unified-rebalancer-replica-state.js`
`mergeAuthoritativeReplicaRowsOverCache`). Union is deliberate — a pure REPLACE would
under-count in the non-atomic delete-then-insert removal window on services-p1 and
REINTRODUCE the phantom ADD (see `verify-e-cheap-union-vs-replace.md`). But union cannot drop
a **hard-deleted ghost**: a voter whose authoritative row is GONE but whose stale ACTIVE cache
row has no authoritative collision survives the union → a drain-handoff **over-count REMOVE**
remains possible.

This is the count-path twin of the interlock-path stale-ghost that `c7a3bf19` fixed.

## Why it does NOT block the E-cheap commit
- It is NOT the run-5 driver: run-5's cycle originates at the stale-LOW under-count (phantom
  ADD), which union fully corrects. The over-count REMOVE in run-5 is real cleanup of a prior
  over-creation, not a hard-delete ghost miscount (`research-selfmove-limit-cycle.md:53-63`;
  `verify-e-cheap-union-vs-replace.md`).
- No read-merge closes it without reintroducing under-count.
- `filterReplicasRetiredByTerminalReplaceOperations` does NOT close it today: it reads the
  terminal-REPLACE retirement ops from the SAME frozen cache
  (`unified-rebalancer-replica-state.js:627-628`), so in the handoff window it does not retire
  the ghost.

## The complementary fix (when a demo/DT shows this leg binds)
Make `filterReplicasRetiredByTerminalReplaceOperations` (or the count path) read the
**terminal-REPLACE retirement operations AUTHORITATIVELY** (cache-bypassing owner-RPC, the
`c7a3bf19` / `OWNER_RPC_REQUIRED` pattern already used for the SERVICES rows here). An
authoritatively-terminal REPLACE that supersedes the ghost voter then retires it even when its
SERVICES row is hard-deleted — closing the over-count without any under-count risk (it removes
a voter only on authoritative terminal-REPLACE evidence, never on a stale/partial read).

## Tracking
- DT: `test/convergence/dt6-formation-fresh-leader-stale-view-phantom-count-move.test.js` has a
  `{todo}` test ("stale-HIGH (HARD delete) — DOCUMENTED RESIDUAL") asserting the DESIRED
  behavior. When this follow-up lands, flip it from `todo` to a passing assertion.
- Docstring: `resolveFreshCurrentReplicasForCountDecision` states the residual inline.
