# verifier notes 2026-09-29T13:28:56+02:00
fingerprint start: HEAD 2cf9ac6e9 tree 05eaef5c porcelain empty
## 02:33 (i)
- lifecycle-observation.js:54-76 predicate full identity (+created_at, status, version); transition.js:557-569 uses it; nonauthoritative -> OBSERVED_STATE_CHANGED no write.
- mutant drop identity fields -> authoritative-transition.test 4 reds (tests 1,2,6,8 incl ordinary transition()). RED-ON-REVERT OK.
- NB shape: cleanup-tombstone-owner.js:218-226 takeoverRemoving predicate lacks created_at/replica_id/group_id (local re-derivation of predicate). collision only by same state_entered_at on REMOVING -> clock coincidence.
## 02:33 (ii)
- partition-service-activation.js:257-285 preflight all, then 287-322 mutate. mutant interleave -> test 5 red. MG activation also preflights (base).
- TOCTOU between preflight and mutation (handler unregistered during await) not re-checked; NB.
## F1 boot-incarnation identity not monotonic (candidate: BLOCKER?)
- rejoin-hints.js:293 mint = persisted+1; joiner startup lagrange-runtime-startup.js:112-124 mints then persistJoinSeedRejoinHints (entrypoint-runtime-join-decision.js:165-175) writes hints WITHOUT bootIncarnation (option not forwarded) -> counter stripped until startRejoinHintsPersistence (startup.js:339, after join success).
- falsifier falsifiers/boot-incarnation-mint-falsifier.test.js: file=4 -> G1=5 -> joiner hint write -> G2 mint = 1. RED.
- failed-join reattempt (default MAX_ATTEMPTS 4, entrypoint-runtime-join-startup-policy.js:85-130) re-enters startJoinNode -> mints again -> 1.
- candidate-new consequence: registration refuses knownIncarnation > next (node-registration-owner-durable-rejoin-methods.js:399-407, new) -> node whose row was advanced to N+1 can never rejoin (every attempt/boot mints 1). base upserted over.
- fresh node: attempt1=1, attempt2=1 -> distinct registrations share identity; equal incarnation => registration treats row as own (durable-rejoin :390, :418); all I9 fences blind.
- seed: mint (startup.js:405) no write until cadence (startup.js:579); crash before -> same N reused.
- mint/hints code unchanged since base; candidate newly depends on it as I9 authority.
## fork cache/registry: no blocker; C1 cache wall-clock fallback (base-identical), C2 reservation current-name (idempotent), C3 REMOVE_REPLICA no generation (base, wire change)
## fork rulings: F-R1 node-address-resolution.js:424-431/492-509 judges bootstrap-snapshot G1 endpoint vs snapshot NODES G1 although cache NODES=G2 -> resolves ws://g1 (repro scratch/r1-addr.mjs, rerun by me: confirmed). N-R2 critical-topology merge vs cached NODES (cache lag). N-R3 seed mint window (joiner claimed safe - WRONG, see F1). D-3/D-4 accept, D-7 NB debt (UPSERT unfenced), reaper accept, lease-expiry predicate lacks incarnation NB, admin accept (doc gap), toggle accept, storage-reservation unmapped NB (null changes -> CREATED).
