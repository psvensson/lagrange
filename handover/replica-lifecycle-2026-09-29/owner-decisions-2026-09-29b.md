# Owner decisions 2026-09-29 (round 3, BINDING) — do not freeze yet

## D1 message-group removal
Do NOT keep updated_at as the removal fence. The cache ignoring the delete shows an interaction defect between two concerns (replica lifecycle authority vs CDC/cache event ordering) that must not share updated_at as accidental authority.
Removal CAS fence = full replica identity + expected source lifecycle state + canonical lifecycle generation (the ReplicaStateMachine one). Role/heartbeat/telemetry/diagnostic updates must not stale valid removal evidence.
Separately find why the cache treats the successful removal/tombstone as older than the live row; repair at the existing CDC/cache ordering owner. Do not invent another generation; do not make the lifecycle CAS depend on ordinary row freshness.
Witness: G STOPPED; role/heartbeat updates ordinary metadata; remove carrying G succeeds; new generation G+1; delayed remove carrying G fails closed; cache observes the G/G+1 removal correctly and cannot resurrect the removed generation.
If the cache fix needs a genuinely broader cache architecture change rather than a bounded correction at its existing owner: STOP and split into a prerequisite quest. No freeze while updated_at is the semantic removal fence.

## D2 cleanup tombstone
cleanup_token stays the fence IF it is already the canonical durable generation of cleanup ownership. Prove permanently: durably attached to canonical services.service_id; creation and cleanup contend on that identity; only the exact token holder performs destructive cleanup; an old token cannot delete a later recreation's artifacts; same-token replay idempotent; invented token fails closed; lost cleanup outcomes resolved by authoritative token/state observation. Do not replace it with state_entered_at.

## D3 shutdown and failed-join withdrawal — fix in this epic
A previous process incarnation must never shut down or withdraw a replacement incarnation. Both final durable mutations carry the exact canonical node incarnation from registration, in the final mutation itself (no pre-read then UPDATE WHERE node_id).
Witness: N@G1 begins shutdown/withdraw; N replaced by G2, G2 READY; delayed G1 op arrives; G2 unchanged; G1 op classified stale-incarnation. Lost ack: same G1 transition durable, ack lost, authoritative readback sees exact G1 destination -> idempotent completion. No retry queue.

## D4 stranded-JOINING reaper — do not defer
TOCTOU: reaper reads lease expired -> current incarnation renews -> reaper acts on stale observation -> live node reaped. First identify the canonical lease authority and its durable revision/currentness token. If the schema already has a bounded authoritative fence, fix here: final reap requires exact node incarnation + expected JOINING/source state + the exact lease state/revision whose expiry authorized reaping; a renewal in between makes the CAS fail.
Witnesses: read expired L1, renew same incarnation to L2, reap authorized by L1 -> zero destructive mutation, current incarnation alive; read genuinely expired L1, no renewal, reap -> succeeds once.
If no canonical lease revision/currentness primitive exists and this needs a lease-ownership redesign: STOP; create prerequisite quest nodes-lease-safe-reaping; the lifecycle epic stays blocked from final certification until it lands.

## NODES writer census (regenerate after the changes)
Per live writer: transition, semantic owner, exact identity, source-state fence, generation/currentness fence, lost-outcome authority, runtime reachability. Allow-list is a ratchet, not permission. No two live writers own the same transition. Admin raw SQL only as explicitly classified privileged operator-repair authority with documented bypass semantics.

## Test-fixture audit
Produce a mechanical inventory of every test change introducing boot_incarnation/bootIncarnation (file, line, construction, value, why). For the verifier: fixture edits supply missing identity rather than weaken assertions; no two logically distinct incarnations share an identity by accident; replacement/rejoin semantics preserved; owner under test not bypassed; failure expectations not changed merely to fit the new contract. Red-on-fence-removal for representative high-value tests where practical: node registration idempotency, durable rejoin, failed join, shutdown, atomic claim, READY trigger, move handoff, multi-join formation.
Do not patch assertions of move-replica-handoff / multi-join-formation beyond what first-divergence analysis supports (multi-join: routed owner read = production fix; move-handoff: fixture incarnation only).

## Final pre-freeze gate (all true)
MG removal on lifecycle generation not updated_at; cache/CDC ordering correct; cleanup_token proofs green; shutdown exact-incarnation green; failed-join exact-incarnation green; reaper race closed or prerequisite landed; 12 lifecycle CAS sites classified; all live NODES writers transition-classified; READY lost-outcome green; 02:33 #1 and #2 green; all candidate-only compatibility regressions green; ESLint 0; impact contracts green; full static green; full change-selected cone green. Base reds identified by exact test + failure signature (not counts). Lab-load-only reds mechanism-classified before being dismissed.

## Then freeze (lead runs this, not the writer)
1 stop writer permanently; 2 refresh metadata; 3 refresh owner debt; 4 refresh metadata again, prove byte identity; 5 full static; 6 full compatibility/authority cone, cluster-heavy on the lab; 7 Quest probe; 8 record byte fingerprint; 9 fresh Opus 5.5 independent verifier; 10 verifier explicitly supersedes the 02:33 REJECT and audits the fixture migration; 11 only after approval create the solver candidate commit; 12 certify that exact SHA on lab/A2/SLO; 13 final evidence approval; 14 publish normally and independently verify the remote SHA. Any byte changed after the fingerprint invalidates downstream evidence.
