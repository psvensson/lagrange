# WS0 — Expressibility gate audit (Standing Invariant Closure)

**Verdict: PASS.** A closed, repro-backed CL is expressible as a cheap, re-entrant
live-evidence predicate, and a reverted fix demonstrably fails it while the restored
fix passes it. WS1+ are unblocked.

**Date:** 2026-06-26  ·  **Base HEAD:** `f95e53c3`  ·  **Flag:** `LAGRANGE_STANDING_INVARIANTS` (not yet introduced; WS0 is hand/inspection only, no runtime wiring)

## Chosen invariant

| | |
|---|---|
| Closed CL | **CL-041** — @markwylde/liferaft vote-handler double-vote TOCTOU |
| Property | Raft §5.2 Election Safety: a follower grants ≤1 vote per term ⇒ ≤1 leader per term |
| Registry entry (added) | `raft-election-safety-one-vote-per-term` in `architecture/contracts/invariants.json` |
| Fix under guard | `src/raft/liferaft.js:291-295` (vote serialization, commit `1eee32dd`) |
| Anchoring decision (ADR) | `.kiro/specs/membership-lifecycle-placement-hard-cutover/closure-ledger/CL-041.md` (entry `contractRef`) |

There was **no** pre-existing raft invariant in the registry, so WS0 added one — closing
a real registry gap (Tier-1 `formalPredicate` documented; `modelRef` intentionally omitted
because no formal raft model exists — raft safety is guarded by repros + the chaos sweep,
not TLA+).

## Live-evidence predicate (Tier 2)

- **`holdsWhen`**: the CL-041 deterministic repro asserts `grantedTo.length == 1` (a follower
  with a log grants at most one vote in a term) and exits 0.
- **evidence**: `kind: repro`, `ref: npm run repro -- CL-041`, `test: test/closure/CL-041.repro.test.js`
- **cost classification**: **cheap** (~1 s, in-process unit repro; no VirtualNetwork, no gate).
  Permits the `on-quest-closure` trigger (no cadence restriction needed).

## Falsifier — revert round-trip (the proof)

The repro was run on fixed code (main tree, non-destructive) and on regressed code (isolated
git worktree `.claude/worktrees/ws0-cl041-revert`, removed after; the shared tree was never
touched). The regression was a faithful surgical revert of the CL-041 fix — disabling the
vote-serialization branch so concurrent same-term votes race across `await getLastInfo()`:

```js
// src/raft/liferaft.js — serialization DISABLED for the revert leg
if (packet?.type === RAFT_PACKET_TYPE.VOTE && raft.log) {
  return originalListener(packet, write);   // was: chained through voteSerializationChain
}
```

| Leg | Code | Result | Exit |
|---|---|---|---|
| HELD | fixed (HEAD `f95e53c3`) | `ok 1 — granted its vote to exactly one candidate in term 5 (granted: A)` | **0** |
| BREACHED | CL-041 fix reverted | `not ok 1 … { total: 1, pass: 0, fail: 1 }` (follower granted both) | **1** |

The predicate **distinguishes** healthy from regressed code: a live-evidence fold of
"`npm run repro -- CL-041` exits 0" yields HELD on `f95e53c3` and would flip to BREACHED on
the reverted code. This is exactly the standing `HELD → BREACHED` drift transition the spec
defines, demonstrated against live evidence.

## Registry validation

- `npm run model:invariants` → `ok` (new entry + additive `liveEvidence` block validate; the
  validator ignores unknown fields, so no validator change was needed for WS0).
- `npm run model:contract-records` → `ok` (adding the entry broke no contract citation).

## Conclusion

All WS0 `doneWhen` conditions met:

1. A closed CL (CL-041) is bound to an `invariants.json` entry. ✓
2. A `liveEvidence.holdsWhen` predicate exists and is classified **cheap**. ✓
3. Reverting the fix fails the predicate; restoring it passes — proven against the repro. ✓
4. `npm run model:invariants` is green. ✓

**WS1 is unblocked.** The WS1 next step is to build the event-log fold that computes
`UNGUARDED/HELD/BREACHED` from this predicate and renders it (`status --invariants`), reusing
the `doneWhen` evaluator, behind `LAGRANGE_STANDING_INVARIANTS` (default-off). Note the
boundary surfaced here: the live tier evaluates an invariant via its declared `evidence.ref`
(a repro/command), so faithful Tier-2 predicates require a deterministic repro per invariant —
invariants without one are bounded to the `on-cadence` (gate) trigger.
