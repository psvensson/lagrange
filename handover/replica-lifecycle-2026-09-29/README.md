# Handover: replica-lifecycle-durable-generation (2026-09-29, work stopped at owner request)

Quest `replica-lifecycle-durable-generation` (epic raft-rs-full-cutover), branch `quest/o1-committed-read-gate` at 6831054b1.
The candidate is UNCOMMITTED on that branch; its full tree is the parent commit of this notes commit:
`wip/replica-lifecycle-r7-final` = 78b0cfbd3 (end of round 7; lab r7-2 898/899, only impact-proof-cone-producer, env).

## State
- Last verifier verdict: REJECT on freeze candidate 2cf9ac6e9 (F1 non-monotonic boot incarnation, F-R1 snapshot endpoint routing). Rounds 6-7 fixed F1, D-7, N7, F-R1 (option b), N2. NOT re-frozen, NOT re-verified.
- 02:33 REJECT findings (i) full-identity CAS and (ii) activation preflight were superseded by that verifier on 2cf9ac6e9.

## Open owner decisions (asked, unanswered)
1. N2 design: implemented as an "effect section" (activation opens it at the in-lane exact-handler check, closes when CAS/readback settle; retirement waits only on an open section) instead of holding the whole ReplicaStateMachine lane (that hung teardown ~191 s in lab r7-1). Lead recommends accepting.
2. Message-group activation has the same preflight-only shape: lead recommends extending the same fix (class repair).
3. Two candidate-only reds (green at base 6831054b1): formation-sim-production-partitions ("Seed partition storage admission deferred"); bootstrap-mode-routing.property (generator emits SERVICES upsert now refused, ~1/3). Need first-divergence classification (simulator quests never touch src).

## Next, after the decisions
Round 8 (the above) -> re-freeze from scratch (owner-decisions-2026-09-29e/f.md section 13 / 5): regenerate ledger + censuses (incl. boot-incarnation writer census), fixture inventory, owner-debt, metadata x2 byte-stable, full static, full change-selected lab (LAGRANGE_LAB_HOME inventory without carinas-windows; detached worktree at the snapshot needs `node scripts/generate-global-owner-debt-inventory.js --refresh-import-graph-only`), new freeze SHA -> fresh verifier (statement in owner-decisions-2026-09-29f.md section 6) -> commit via solve land -> lab/A2/SLO -> publish + push, verify remote SHA -> only then resume the paused sister quest application-write-formation-authority.

## Files
- owner-directive-2026-09-29.md and owner-decisions-2026-09-29{b..f}.md: binding owner rulings, in order.
- progress.md: the implementer's full round-by-round record (census tables, witnesses, lab runs).
- fixture-incarnation-inventory.md: fixture migration inventory (verifier audit input).
- verify/: the rejecting verifier's verdict, notes, fixture audit, rulings, falsifiers.
- investigations/: earlier investigation notes (preflight red, mg-1 livelock, READY owner design, MG envelope fix).
- *checkpoint*/directive memory copies: the lead's running checkpoint.

## Related branches on origin
fixes/mg-forwarded-application-envelope (c3cfd229f, separate transport fix, not published); records/followups-2026-09-28 (48ff6df78, draft quests message-group-leader-safe-movement, message-group-forward-completion-propagation).
