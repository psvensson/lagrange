# WS4 — Generalization + validation hooks

**Verdict: doneWhen MET.** Two structurally distinct invariant classes are live-verified, both
HELD on clean code and BREACHED-on-regression proven, the registry renders both, and no new
store was introduced.

**Date:** 2026-06-26  ·  **Base HEAD:** `168dc8f0` (+ uncommitted WS4 registry entry during the proof)

## Second invariant class (beyond raft Election Safety)

Added `raft-log-matching-committed-entry-identity` to `architecture/contracts/invariants.json`
— Raft §5.3 **Log Matching** (a follower never stale-commits its own same-index/different-term
entry on catch-up). This is a distinct invariant class from `raft-election-safety-one-vote-per-term`
(Election Safety): different property, different boundary (`log_replication` vs `leader_election`),
different code path (log-adapter catch-up vs vote handler). Live evidence: `npm run repro -- CL-040`
(cheap, ~1 s). `restoration.autoSpawn: true`.

> A genuinely cross-owner invariant (e.g. rebalancer-handoff CL-038, control-plane CL-001) is the
> natural next addition. Deferred here only to avoid reverting actively-churning rebalancer code
> for the regression proof; the live tier is subsystem-agnostic (it runs the entry's evidence
> command), so no new mechanism is needed to add one.

## Proof (selective, independent verification)

Run on clean HEAD — both HELD:

```
HELD  raft-election-safety-one-vote-per-term       <- npm run repro -- CL-041
HELD  raft-log-matching-committed-entry-identity   <- npm run repro -- CL-040
```

Reverting the CL-040 fix in an isolated worktree (`truncateConflictingSameIndexTail` disabled) —
**selective breach**:

```
HELD      raft-election-safety-one-vote-per-term       (unaffected)
BREACHED  raft-log-matching-committed-entry-identity   (+ restore-raft-log-matching-… Quest auto-created)
```

The two classes are verified independently: regressing one does not perturb the other. (Election
Safety's own BREACHED-on-regression was proven in WS1/WS3.)

## Requirement 9.2b — doc-amendment as a breach resolution

A BREACH has two honest resolutions (design §7.5): fix the runtime, OR amend the
doc/registry/owner-map when the boundary legitimately moved. The amendment path is structurally
supported: editing `invariants.json` (statement / `holdsWhen` / scope) keeps the formal tier green
— `npm run model:invariants` and `model:contract-records` stayed `ok` across every registry edit
this session (WS0/WS3/WS4). A forced "breach fixed only by re-stating the property" is left as an
operational example rather than manufactured here, because an honest such case requires a real,
deliberate property change — which would be its own Quest, not a synthetic edit.

## Tier documented

`architecture/INDEX.md` now describes Tier-1 (formal-model) vs Tier-2 (live-evidence) verification
and the `solve invariants` gate alongside the other architecture verification gates.

## Out of scope (epic-tracked follow-ons)

- Cross-owner invariant (rebalancer/control-plane) — recommended next.
- `on-touched-owner` trigger via the owner-boundary map (WS2 left this optional).
- EvoClaw/SWE-EVO external scoring; memory-layer (Letta/Mem0) graft — separate efforts per
  `continuous-ai-workflow-landscape.md`.
- Unifying the standing altitude review onto the live tier (WS1 decision).
