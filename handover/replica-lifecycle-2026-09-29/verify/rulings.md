# Rulings track (fork) — 2cf9ac6e9 / tree 05eaef5c

## Endpoint reader attack
- 73 src files name endpoint tables; each checked against census A/B. Currentness rule itself sound: number-only positive incarnation, missing NODES row => not current, legacy 0 never current, string/BigInt => fail closed.
- F-R1 (NEW SHAPE of I9 reader, mixed-freshness NODES source): src/transport/node-address-resolution.js:424-431 + :492-509. When the cache has the G2 NODES row but no current endpoint, resolution falls through to the bootstrap snapshot and judges the snapshot's G1 endpoint against the snapshot's own G1 NODES row => G1 address RESOLVED/routable while the reader's authoritative-most NODES view says G2. Reachable: connect-websocket-phase.js:571-579 (joiner mesh dial with bootstrapResponse). Repro: scratch/r1-addr.mjs -> cache only: unavailable; cache NODES=G2 + bootstrap G1: resolved ws://g1:8082. Owner: endpoint-incarnation-currentness / node-address-resolution (judge snapshot rows against cache NODES row when the cache has one).
- N-R2 (cache-lag class, non-blocking): unified-rebalancer-critical-topology-methods.js:344-378,555 merges cached+authoritative endpoint rows but judges against cached NODES; consistent-stale cache (NODES G1 + endpoint G1) counts G1 endpoint. Consistent snapshot lag, not an owner bypass.
- aggregate raw toggle active-node-projection.js:129/457/514: accepted (raw is the stricter direction: stale rows keep the requirement on; per-node check filtered).
- admin-service-discovery.js:477-481 inlines the currentness filter instead of selectCurrentEndpointRows (R03 nit).
- admin-runtime-service-views.js handleListRuntimeServiceReplicas: raw, but zero src callers (dormant).
## Rulings
- D-3 accept (fail-safe: no count -> readback).
- D-4 accept (successor adopting predecessor rows; CAS on observed incarnation refuses a newer owner).
- D-7 non-blocking recorded debt, but an I9 hole in principle: nodes-owner.js:43 upsertRow unfenced; a late-delivered dead-G1 registration UPSERT (or same-node-id second host) landing after G2's absence read+UPSERT downgrades boot_incarnation to G1 -> G2 publication REFUSED_SOURCE_CHANGED, G1 endpoints become current. Cheap fix: monotonic ON CONFLICT ... WHERE nodes.boot_incarnation <= excluded.boot_incarnation.
- N-R3 incarnation uniqueness on the seed path: lagrange-runtime-startup.js:405 mints, hints persisted only at ~:580 after bootstrap wrote NODES; crash in between => next boot mints the same incarnation (joiner path persists immediately at :116). Pre-existing, but load-bearing for every I9 fence.
- reaper fence: accept (boot_incarnation + JOINING + lease pair; every applied publication strictly advances the watermark).
- lease-expiry disconnect heartbeat-service-publication-methods.js:535-540: no boot_incarnation in predicate; pair collision with G2 practically impossible; effect DISCONNECTED self-heals. Hardening only.
- admin raw SQL: accept as privileged repair; bypass documented only in test census comment + quest census, not in architecture/ — doc gap.
- unmapped reservation files: out of I1-I10 scope (R16 recorded widening). Hole: changeCount null (unknown) after INSERT OR IGNORE is treated as CREATED (reservation-lifecycle-methods.js:310) — non-blocking.
- NodeLifecyclePublication: CAS predicate has node_id+boot_incarnation+created_at+status+connection_state+last_heartbeat; missing wire incarnation -> REFUSED_INCARNATION_REQUIRED (no current fallback); readback refuses stale before resolving. Sound.
Tests run (local, green): endpoint-incarnation-authority 20/20, endpoint-reader-currentness 9/9, endpoint-writer-census 3/3, node-incarnation-fence 50/50, node-lifecycle-publication 71/71, node-terminal-transition-fence 14/14, cross-owner anchor 7/7.
