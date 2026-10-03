# Owner decisions 2026-09-29 (round 8, BINDING) — answers to the four open decisions after round 7

Round 7 tree: 78b0cfbd3 (lab r7-2 898/899). Round 8 is bounded to the items below; then re-freeze from scratch exactly as in owner-decisions-2026-09-29f.md section 5.

## 1. N2 effect section — ACCEPTED, with conditions
The invariant was never "hold the whole lane"; it is "unregister of G's exact handler cannot land between the in-lane exact-handler check and the settle of G's ACTIVE CAS". The effect section provides exactly that exclusion at the same owner (ReplicaStateMachine per-replica state): check+open and final-check+retire are each one synchronous step. Holding the whole lane was a means, and lab r7-1 showed it deadlocks teardown behind unrelated lifecycle writes.

Procedural record: the round-7 rule said to STOP and report before designing a new mechanism if the lane could not be held across the write. The implementer narrowed instead of stopping. Accepted retroactively because it is the same owner and the same exclusion, not a new lock; this is not a precedent.

Conditions (round 8):
- a. No fail-open fallbacks. Every path that can weaken the boundary fails closed instead:
  - the handler check falls back to presence (`isRegistered`) when the router lacks `getRegisteredHandler`;
  - retirement falls back to a non-exact by-address `unregister` when the transport lacks `unregisterExact` or the service has no captured handler;
  - retirement runs the removal outside the boundary when no lane or replica id resolves.
  If a production transport/router genuinely lacks the identity API, that is a defect to fix, not a reason to downgrade.
- b. Activation and retirement must provably use the same ReplicaStateMachine instance (seed: the lazily resolved seed state machine; joiner: the joining service's state machine). A test fails if they diverge.
- c. Retirement must not wait forever on a section whose CAS can never settle. Bound it with an existing deadline owner if one covers the CAS; otherwise prove the CAS is bounded by shutdown ordering. Timing out must not remove the handler under an open section (that would reopen the race): it fails the retirement closed, and the shutdown path reports it.

## 2. Message-group activation — EXTEND the same fix (class repair)
Same shape (preflight-only handler check, then the persistMessageGroupActivation CAS). Apply the same effect section at the same owner, bound to the exact handler identity, with every message-group handler removal that can race activation routed through the exact retirement. Witnesses 1-6 from round 7 section 2, plus the stuck-unrelated-lane witness. Red-on-revert for each part.

## 3. formation-sim-production-partitions — classify by first divergence
Simulator quests never touch src. Find the first divergence (base 6831054b1 vs candidate) in the simulator's seed path against the new seed storage admission.
- If the simulator's seed presents storage/admission state production never presents: adapt the simulator seed to the production contract (test-side fidelity), record it in the fixture inventory.
- If production itself can present that state: it is a candidate defect; fix in src under this quest, not in the simulator.

## 4. bootstrap-mode-routing.property — adapt the generator, after a census
First census every production caller of upsertSystemTableRow that can target SERVICES (including table names passed through variables). If none: adapt the generator to the production contract (SERVICES insert-only or identity-fenced update) and record the reason. If any production path can still issue a SERVICES upsert: that is a candidate defect; fix the caller.

## Then
Re-freeze from scratch (29f section 5, including the lab run, which needs the local environment), fresh verifier with the 29f section 6 statement plus: "N2 holds for both partition and message-group activation, with no fail-open fallback".
