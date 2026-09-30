# Owner decisions 2026-09-29 (round 6, BINDING) — one bounded correction round after the verifier REJECT
Do not freeze the rejected candidate 2cf9ac6e9. Fix exactly F1, the directly coupled D-7, and F-R1; do not reopen unrelated lifecycle design.

## 1. F1 — one durable monotonic boot-incarnation owner
Invariant: once boot incarnation N has been issued by a data directory, that directory may never issue N or any smaller incarnation again, regardless of join failure, process crash, hints rewrite, reseed/rejoin flow or partial startup.
Reserve before use: (1) read authoritative local incarnation state; (2) derive N+1; (3) durably persist/reserve N+1; (4) only after durable success return N+1 to the boot lifecycle. Never mint -> use -> eventually save. A crash after (3) may burn a number (correct); a crash must never cause reuse.
Durability: use the repository's existing durable local-file/state owner and its atomic-replacement/crash contract (reuse fsync/atomic rename if that owner already has it). Do not invent a second filesystem durability protocol.
Separate ownership from rejoin hints: conceptually BootIncarnationOwner -> authoritative persisted counter/current reservation; hints are a consumer/projection. If the simplest safe design keeps the counter inside the hints document, ALL modifications of that document go through one owner that preserves it; no independent raw hints rewrite may omit the field.

## 2. What increments
Not every network-level retry. The incarnation identifies one boot/lifecycle incarnation, not an RPC attempt: retries inside the same live boot attempt keep it; once it is terminalized/reaped/abandoned and a new boot lifecycle begins, reserve a strictly larger one; process restart reserves a new one before registration; failed startup followed by a true fresh start reserves a new one. The "failed-join" witness proves new incarnation after terminal abandonment, not increment-per-retry.

## 3. F1 witnesses
B1 sequential mint: persist 4; mint -> 5; persist/rewrite normal join/rejoin hints; new boot lifecycle; mint > 5, never 1.
B2 crash after reservation: reserve N+1 durably; crash before registration/join completion; restart; next > N+1.
B3 failed join then fresh boot: G1 fails/terminalized; new lifecycle; G2 > G1; delayed G1 effects cannot affect G2.
B4 durable node rejoin: NODES holds G; the local owner cannot issue <= G in a way that strands the node; a legitimate fresh rejoin gets a newer incarnation and passes the monotonic registration rule.
B5 fresh node, successive boot incarnations: distinct, strictly increasing.
B6 hints mutation preservation: every production writer of rejoin/boot hints state; none may lower/remove/reset the reservation. Prefer a writer census + one generic contract test over per-call-site tests.

## 4. D-7 in this round
The NODES registration mutation itself is monotonic: the authoritative write encodes the monotonic predicate (no pre-read then generic UPSERT). A late G1 registration cannot overwrite or lower a G2 row. Outcomes: new incarnation accepted; same exact incarnation idempotent/current; older stale/refused; unknown/lost resolved by authoritative reread. No retry loop.

## 5. N7 — reaped incarnation is terminal
A boot incarnation authoritatively reaped/terminalized may never transition back to READY; a new boot incarnation is required (if today that means process restart, restart is required). No fenced resurrection. Test: G1 lease expires, G1 reaped; late G1 READY delivered -> refused stale/terminal; G1 stays non-current; new G2 registers and becomes READY. Add the delayed G1 READY leg to the cross-owner test.

## 6-7. F-R1 — the bootstrap snapshot is never authority over newer NODES
When an authoritative/current NODES row exists for a logical node, every candidate endpoint, including bootstrap-snapshot candidates, is validated against that authoritative NODES incarnation; never against the snapshot's private node copy. Endpoint G1 vs current NODES G2 -> stale, no route. No authoritative NODES row -> fail closed for this routing decision; the snapshot never self-certifies both identity and address. If an early formation path genuinely cannot work fail-closed, STOP and identify that exact bootstrapping circularity; do not weaken the invariant globally.
Witness: snapshot NODES G1 + endpoint G1; cache advances to NODES G2; G2 endpoint absent; resolver considers the snapshot fallback -> G1 rejected, no current route for G2; add G2 endpoint -> G2 routable. Red when incarnation validation is removed from the owner.

## 8. F-FX-4 — reversal confirmed
Current endpoint validity requires the endpoint incarnation to match the current authoritative NODES incarnation; a lagging/incompatible NODES relationship means not current. Retitle the active-node-projection-lagging-evidence-test-cases.js cases to describe the new contract; record the reversal in the inventory as an intentional I9 contract correction; do not preserve the old expectation.

## 9. Cross-owner test extra leg
G1 has NODES, endpoints, durable replica lifecycle, Raft runtime; delay work at every layer; create G2 under the same logical ids; also delay a G1 READY publication; release all G1 work. G2 retains NODES G2/READY, endpoints G2, durable lifecycle G2, running Raft runtime G2, and current address resolution to G2 only; every G1 effect stale/idempotent.

## 10. Do not reopen accepted mechanisms
I10 runtime registry, cleanup tombstone, MG removal, cache delete ordering, reaper lease fence, full lifecycle CAS, activation preflight: change only if F1's owner mechanically requires a narrow integration update.

## 11. Non-blocking verifier findings stay recorded
cleanup takeover omitting three identity fields (clock rollback only); handler unregister between activation preflight and mutation (keep non-blocking ONLY if the mutation itself fails closed when the handler is gone — record that reasoning explicitly); G1 REMOVE_REPLICA redelivery (wire change, NOT this epic); wall-clock cache-origin fallback (base); peer-reservation census wording; lagging critical-topology cache observation; lease-expiry disconnect protected by the lease pair; missing admin bypass documentation. Documentation/census-only items may be corrected before publication if no semantic code change.

## 12. Order (one bounded round, no full lab cone while code moves)
1 monotonic incarnation owner + D-7; 2 F-R1; 3 delayed READY / cross-owner witness; 4 F-FX-4 test correction; 5 focused incarnation/hints/NODES/endpoint/routing cone; 6 static/census checks. Then stop the writer.

## 13-14. Re-freeze from scratch (lead), fresh verifier
Stop writers; regenerate I1-I10 ledger; NODES writer census; NEW boot-incarnation-owner writer census; endpoint reader/writer census; registry/destructive censuses; update only affected fixture inventory; owner-debt refresh; metadata twice to byte stability; full static/ratchets; focused cone; one full change-selected lab run; new exact freeze SHA. 2cf9ac6e9 and its receipts are historical only.
Fresh verifier statement: "Every identity that can outlive a process/join attempt has one durable monotonic incarnation authority, and delayed work carrying an older incarnation cannot become current or mutate the newer incarnation through NODES, endpoints, caches, lifecycle cleanup, readiness, routing or runtime registries." Require explicit closure of F1 and F-R1; confirm N7 terminality and the F-FX-4 reversal match the documented invariant.

## 15. Sister quest application-write-formation-authority stays paused
Its checkpoint is preserved; after this epic freezes and publishes, rebase/integrate it onto the finalized contract and run its small compatibility pass.
