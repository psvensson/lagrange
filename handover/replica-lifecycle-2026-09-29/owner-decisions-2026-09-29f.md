# Owner decisions 2026-09-29 (round 7, BINDING) — F-R1 option b + N2 fix now

## 1. F-R1 — bounded bootstrap exception (option b), ONLY inside the endpoint-resolution owner
Rule: during bootstrap, when the local authoritative NODES cache has NO row at all for a candidate node, the accepted bootstrap snapshot's own NODES row may supply that node's transport endpoint for the purpose of attempting the connection. A discovery exception, not an authority exception.
Precedence: (1) authoritative/cache NODES row if present; (2) otherwise the accepted bootstrap snapshot's NODES row; (3) otherwise unavailable. If the cache has ANY row for the node, the snapshot loses completely: cache G2 + snapshot G1 -> decide by G2, G1 cannot rescue or override; cache terminal/stale/unusable -> snapshot cannot bypass; no cache row + snapshot G1 -> snapshot provides the dial address only.
Scope: the snapshot row may establish only node identity needed for the dial, address/transport info to attempt connection, and the snapshot incarnation as diagnostic context. It may NOT establish READY, routing eligibility, placement eligibility, lifecycle authority, current-incarnation authority after a cache row exists, or application-write admission. Once a real NODES row is learned, every later decision uses that owner.
Trust root: only a bootstrap snapshot that already passed the repository's existing snapshot/bootstrap authenticity and structural validation; never an arbitrary caller-provided row.
Witnesses: (1) no cache row + snapshot row -> endpoint available; (2) cache G2 + snapshot G1 -> cache wins; (3) cache terminal/refused + live-looking snapshot row -> snapshot cannot revive; (4) no cache row + no snapshot row -> fail closed; (5) snapshot endpoint dead -> connection simply fails, no authority minted; (6) after cache hydration the same snapshot row is no longer consulted for authority.
Do NOT load the whole snapshot into the ordinary cache to avoid the circularity.

## 2. N2 — fix now, no split
Invariant: handler existence for generation G and the durable transition of G to ACTIVE are serialized against handler unregister for G. A pre-write recheck alone is NOT sufficient.
First inspect the serialization owner used by the handler-unregister path. Preferred: activation and unregister already share a per-replica/per-generation lifecycle lane, mutex, owner queue or equivalent; activation performs its final handler validation and durable ACTIVE write while holding that same authority. Use it; no new lock if the lifecycle owner already provides the boundary.
Safe sequence under the common authority: (1) re-read/confirm the exact lifecycle generation; (2) confirm the exact handler registration identity still exists; (3) exact-generation ACTIVE CAS; (4) release. Unregister must be unable to remove the handler between (2) and (3).
If the owner can stay held across the async write safely, do so. If it cannot, do not pretend a pre-write recheck closes the race: STOP and report the owner mismatch before designing a new mechanism. Post-write compensation alone is not fail-closed if the contract forbids a durable orphan ACTIVE.
Bind to the exact handler/generation identity, not registry.has(replicaId): a G2 handler must not satisfy activation of G1.
Witnesses (deterministic scheduling/owner controls, no sleeps): (1) exact-generation handler present -> ACTIVE; (2) handler missing before activation -> refused; (3) handler removed immediately before the final effect -> refused; (4) unregister races activation under the shared owner -> exactly one ordering wins, never orphan ACTIVE; (5) same replica id, wrong generation handler -> refused; (6) delayed G1 activation after G2 registration -> cannot activate G1 or mutate G2.

## 3-4. Preserve completed work
Do not reopen F1/D-7 (durable monotonic owner, reserve-before-use, one reservation per boot lifecycle, hints as copies, typed registration outcomes, reread on unknown, floor raise on a newer NODES row, hints-writer census, B1-B6) unless these fixes directly falsify it. Keep N7 terminality (G1 terminal after reaping; delayed G1 READY/lifecycle work cannot revive it; G2 independent).

## 5. Then hard reset the evidence cycle (lead)
stop writer; regenerate boot-incarnation writer census; SERVICES/NODES/endpoint/lifecycle censuses; stale-fixture inventory; metadata to byte stability; owner-debt; static/ratchets; full focused/lab cone; classify inherited reds vs the same base; NEW exact freeze SHA. Nothing from before round 6 carries forward.

## 6. Fresh verifier must explicitly prove
F1: no boot lifecycle can reuse or lower an incarnation, through hints or any other writer. F-R1: bootstrap snapshot addressing can break the initial connection circularity but never override or out-rank an authoritative NODES row. N2: durable ACTIVE cannot occur unless the exact generation's handler stays registered through the activation effect boundary. N7: old-generation lifecycle/READY work cannot revive a reaped generation or interfere with the new one. Re-check the accepted exact-generation/tombstone mechanisms without reopening them for new mutation variants.

## 7-8. Sister quest and closeout
application-write-formation-authority stays paused until this epic freezes, verifies, certifies, publishes AND pushes. On successful closeout (verification, lab/GCP, A2, SLO, final approval): seal records; normal publication; push immediately; independently verify the remote SHA; record it; only then resume the paused quest. No other production quest while this epic is still local.
