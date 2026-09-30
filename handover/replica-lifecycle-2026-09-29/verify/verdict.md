# Independent verification: replica-lifecycle-durable-generation

**Verdict: REJECT**

Two blockers, both in the I9 layer:

- **F1:** the node-incarnation identity primitive is not monotonic.
- **F-R1:** one semantic endpoint reader judges a stale endpoint against a stale NODES source.

The 02:33 findings (i) and (ii) are closed on these bytes and are explicitly superseded (see below). Everything else is non-blocking.

## Fingerprint

These checks were run in labwt at the start and again before reporting.

| Check | Result |
| --- | --- |
| HEAD | `2cf9ac6e942ce26f7690d07f7ba5dbbdb7fcab82` |
| `git rev-parse HEAD^{tree}` | `05eaef5caf912ab97b1634b760b5b585dcf7540f` (matches) |
| `git status --porcelain --untracked-files=no` | empty |

- No tracked file was edited in labwt or base-wt.
- The scratch worktrees (`verify/wt-main`, `wt-fixture`, `wt-cache*`) are removed and pruned.
- No child processes are left running.
- No lab run was made: the first blocker was found with node-free falsifiers, so expensive suites were stopped under the protocol.

## Findings

| id | class | severity | file:line | reproduction | suggested owner |
| --- | --- | --- | --- | --- | --- |
| F1 | NEW MECHANISM: the I9 identity authority (boot incarnation) is not monotonic or unique per data directory | **blocker** | See F1 detail below | `verify/falsifiers/boot-incarnation-mint-falsifier.test.js`: hints=4, G1 mints 5, the joiner hint write runs, then G2 mints **1**. RED on the frozen bytes | rejoin-hints / startup (boot-incarnation mint) |
| F-R1 | KNOWN MECHANISM (I9 endpoint reader), NEW SHAPE: validity is judged against a staler NODES source than the one available | **blocker** (by the owner's own permanent-test rule) | `src/transport/node-address-resolution.js:424-431` (`getBootstrapSnapshotEndpointRows` uses the snapshot's own NODES row), `:492-509`; reached from `bootstrap/phases/connect-websocket-phase.js:571-579` (mesh dial) | `verify/scratch/r1-addr.mjs`: cache NODES=G2 with no current cache endpoint, plus a bootstrap snapshot with NODES=G1 and endpoint=G1, resolves `ws://g1:8082` (authority `canonical_node_endpoint`). Cache only gives `unavailable` | node-address-resolution / endpoint-incarnation-currentness |
| N1 | known shape of the 02:33 (i) family: a locally re-derived CAS predicate | non-blocking | `src/node/replica-cleanup-tombstone-owner.js:218-226` | See N1 detail below | ReplicaCleanupTombstoneOwner (build the predicate from `buildReplicaLifecycleMutationPredicateFromState`) |
| N2 | TOCTOU in activation | non-blocking | `src/bootstrap/shared/partition-service-activation.js:257-322` | The handler preflight is a snapshot, so a handler unregistered during the mutation loop's awaits is not rechecked. The only realistic cause is shutdown | partition activation |
| N3 (fork C3) | known mechanism, base-identical | non-blocking, recorded | See N3 detail below | Delayed G1 REMOVE after G2 exists binds to G2 by logical id. The durable side is now safe (MG gets IDENTITY_CONFLICT; partitions go through a fresh REMOVING CAS on G2's own generation); the in-process `localReplicas` overwrite is transient | replica-operation contract (a wire change, so a separate quest) |
| N4 (fork C1) | known mechanism, base-identical | non-blocking | `src/cache/system-table-cache-row-merge.js` `isDeleteSupersededByExistingRecord`, which falls back to wall-clock ordering without an origin HLC | `verify/falsifiers/cache-reuse-falsifier.test.js`: needs skew or the same millisecond; the result is the same on base, and the HLC path is correct | cache/CDC ordering owner |
| N5 (fork C2) | new shape: current-name lookup that mutates but is idempotent | non-blocking | `src/raft/raft-rs-membership-administration.js:25-40`, caller `partition-service-raft-membership-administration.js:34-42` | `verify/falsifiers/reservation-current-name.test.js`: a late G1 admit appends a deterministic, idempotent peer-identity row under G2 | raft-rs membership administration. The census wording "non-destructive" should read "idempotent" |
| N6 (fork N-R2) | cache-lag class | non-blocking | `src/rebalancer/unified-rebalancer-critical-topology-methods.js:344-378,555` | Merged cached and authoritative endpoint rows are judged against cached NODES | rebalancer critical topology |
| N7 (fork N-1) | liveness change | non-blocking, **owner ruling needed** | See N7 detail below | By reading; not run | NodeLifecyclePublication / LeaseService |
| N8 | anchor coverage gap | non-blocking | See N8 detail below | Fork M-C: dropping `boot_incarnation` and `created_at` from the READY CAS stays behaviourally green; only shape tests go red | quest witnesses |
| N9 | hardening | non-blocking | `src/control-plane/heartbeat-service-publication-methods.js:535-540` | The lease-expiry disconnect predicate lacks `boot_incarnation`; it is protected by the observed lease pair, which G2 cannot plausibly reproduce | lease authority |

### F1 detail

The mint and write sites involved:

- `src/bootstrap/rejoin-hints.js:293-296` mints the incarnation.
- `src/lagrange-runtime-startup.js:112-124` is the joiner path: it mints, then calls `persistJoinSeedRejoinHints`.
- `src/entrypoint-runtime-join-decision.js:165-175` does not forward `bootIncarnation`, so it rewrites the hints file without the counter.
- The counter is restored only by `startRejoinHintsPersistence` at `lagrange-runtime-startup.js:339`, after a successful join.
- On the seed path, the incarnation is minted at `:405` and not persisted until `:579`.

The reproduction and its reachable paths:

- The falsifier's second mint returns 1 because the joiner hint write stripped the counter.
- A failed-join reattempt re-enters `startJoinNode` in the same process (`entrypoint-runtime-join-startup-policy.js:85-130`, default `MAX_ATTEMPTS` 4) and mints again from the stripped file.
- A crash during join does the same on the next boot.

Consequences:

- **Durable node:** attempt 1 advanced NODES to N+1. Every later attempt or boot mints 1, and the candidate-new `assertNodeBootIncarnationNotStale` (`node-registration-owner-durable-rejoin-methods.js:399-407`) refuses it as STALE. The node can never rejoin. At base, the registration UPSERT overwrote the value.
- **Fresh node:** attempt 1 and attempt 2 are both incarnation 1. Equal incarnation is treated as "own row" (`:390`, `:418`), so every I9 fence is blind between two distinct registrations. For example, a routed READY publication still in flight from attempt 1 matches attempt 2's JOINING row.
- **Seed:** a crash before `:579` re-mints the same N.
- The mint code is unchanged since base, but the candidate makes it the sole I9 authority and adds the terminal stale refusal.

### N1 detail

`takeoverRemoving` fences only `{service_id, type, partition_id, node_id, status, version}`. It omits `created_at`, `replica_id` and `group_id`. It can collide only if a later generation's REMOVING `state_entered_at` equals the earlier one, which needs the clock to regress.

### N3 detail

`src/node/replica-handler-remove-request-methods.js` (`handleRemoveReplica`) and `src/node/replica-handler-remove-execution-methods.js:563` (`getTrackedService(replicaId)`) resolve by logical name. So do the message-group equivalents at `message-group-service-handler.js:440-600`.

### N7 detail

READY from STOPPED is now refused, and registration is the only way back. A live joiner that the stranded-JOINING reaper genuinely reaped (for example, its lease lapsed under event-loop starvation) cannot become READY without restarting. At base, dispatch revived such a node.

### N8 detail

`test/control-plane/incarnation-reuse-cross-owner-anchor.test.js` covers NODES terminal, endpoints and the Raft registry. It does not include:

- a delayed G1 NodeLifecyclePublication READY or telemetry publication;
- the SERVICES lifecycle and cleanup-token layer;
- the cache layer;
- the reaper trigger, `reapStrandedJoiningRows`.

Separate witnesses cover the SERVICES and cleanup layers: `replica-lifecycle-durable-generation.test.js` "stale REMOVING projection…", "replacement inserted after marker release…" and "lost unlink outcome… stale cleanup cannot touch recreation". They also cover the cache: `system-table-cache-lifecycle-delete-ordering`.

## Explicit supersession of the 2026-09-28T02:33 REJECT

**(i) The ordinary ReplicaStateMachine CAS fences the full identity it validated: SUPERSEDED (closed).**

- `replica-state-machine-lifecycle-observation.js:54-76` builds the predicate from service_id, service_type, partition_id, node_id, replica_id, group_id (null is rendered as IS NULL, `control-plane-system-table-gateway-query-execution.js:333`), created_at, status and the generation column.
- `replica-state-machine-transition.js:557-569` writes with exactly that predicate. A non-authoritative identity yields `OBSERVED_STATE_CHANGED` and no write.
- The lost-ACK readback (`:67-90`) matches the same full identity plus the destination generation.
- `test/node/replica-state-machine-authoritative-transition.test.js` passes 30/30, including test 8, "ordinary transition() cannot mutate a same-key replacement…".
- `replica-lifecycle-durable-generation.test.js` passes 162/162.
- Red-on-revert: removing the identity fields from the builder turns tests 1, 2, 6 and 8 red (14 assertions).
- Residual same-family shape: N1, non-blocking.

**(ii) Activation preflights every handler before any replica mutates: SUPERSEDED (closed).**

- `partition-service-activation.js:257-285` checks runtime readiness and handler registration for every replica before the mutation loop at `:287-322`.
- The message-group activation (`message-group-service-activation.js:100-117`) has the same shape.
- `test/bootstrap/partition-service-activation.test.js` passes 25/25. Test 5 asserts `activated == []` when a later handler is missing.
- Red-on-revert: moving the handler check back into the mutation loop turns test 5 red.
- Residual: N2 (a TOCTOU during the awaits), non-blocking.

## Fixture migration audit

Full notes are in `verify/fixture-audit.md`. The result is no blocking defect.

**Recount on the frozen bytes:**

- 258 test paths: 238 modified, 20 added, 0 deleted.
- 723 added lines name the incarnation, across 121 files.
- The implementer's inventory (616 rows in 105 files) was generated against o1-gate, not the frozen commit, so it is stale (F-FX-5).

**Sample and verdict:**

- **Identity supply or tightening, OK:**
  - node-registration-idempotency
  - register-node-in-cluster (durable rejoin)
  - node-registration-owner (failed-join withdrawal)
  - heartbeat reporter-and-shutdown
  - node-terminal-transition-fence
  - move-replica-handoff
  - join-checkpoint-progression
  - phase-event-ordering
  - node-joining-service
  - bootstrap-api-ready-nodes
  - transport-registry
  - endpoint-sync-source-client
  - multi-node-raft-replication
  - user-table-local-cdc-readiness
- **Stronger than base:** node-joining-service-message-group-activation, which now proves an exact CAS with authoritative reads off.
- **heartbeat-storage-budget-preservation:** two write options were dropped (`deferOnPressure: false`, `REPLACE_PENDING`). Both are behaviourally inert.
- **replica-dispatch-atomic-claim and ready-trigger:** now driven by an injected durable READY row. That is valid, but publication-to-claim is no longer tested end to end.
- **Dispatch node-state reversals** (no revive from STOPPED, no bootstrap upsert, no forwarding, no deferred slot) trace to owner directive §4.

**Red-on-fence-removal:**

| Mutation | Result |
| --- | --- |
| Terminal fence incarnation (M-A) | red in 4 suites, including the anchor |
| Rejoin advance CAS observed incarnation (M-B) | red only in shape tests (F-FX-3 gap) |
| READY CAS incarnation and created_at (M-C) | red only in shape tests (N8) |
| Stale-incarnation refusal (M-D) | red, including lost-outcome proof (c) |

**Fixture findings (all non-blocking):**

- **F-FX-1 and F-FX-2:** retry and reattempt fixtures reuse incarnation 1 across attempts (`cluster-test-helpers.js` `createJoiningNodeFixtureOwner`; `node-joining-service-lifecycle-owner-handoff.test.js:233,292,302,321`). This happens to mirror F1's production defect rather than hiding it, and it should be fixed with F1.
- **F-FX-3:** there is no behavioural race witness for the rejoin advance CAS.
- **F-FX-4:** `active-node-projection-lagging-evidence-test-cases.js:14/68-75` reverses the base expectation. I9 justifies the reversal, but the title contradicts the assertion and the inventory's "no assertion weakened" does not list it. It needs an owner ruling and a retitle.

No assertion was weakened, no timeout was widened and no owner under test was bypassed. Two `setTimeout(0)` flushes were added, each covering one extra turn for the new pre-read.

**Deleted retry machinery:** four tests were removed, and the three owner proofs in `test/control-plane/node-lifecycle-publication.test.js` cover them.

- **(a) `:304`:** READY durable but the ack is lost. The readback resolves it, and the re-drive returns ALREADY_CURRENT with one write in total.
- **(b) `:320`:** the outcome is unknown and not durable. The result is NOT_APPLIED with no invented success, and the re-drive applies it once.
- **(c) `:341`:** a replacement incarnation arrives before the re-drive. The old publication is refused as REFUSED_STALE_INCARNATION and the replacement is untouched. This proof goes red when its check is removed.

How the four deleted tests map onto them:

- The two "defers transient/participant failures" tests in node-row-bootstrap-failures map to (b) plus the typed deferred completion (`deferRetry`, `retryAfterMs`).
- The backoff/single-slot test needs no successor: the queue is gone and re-drive is level-triggered.
- The payload-wakeup deferred-slot test and ready-node-retry's missing-row test map to the REFUSED_ROW_MISSING and AUTHORITY_UNAVAILABLE tests.

Gap: the three proofs are owner-level only; there is no adapter-level lost-ack test.

## Rulings on recorded items

- **D-3 (NodeLifecyclePublication counts as applied only when `affectedRows > 0`): ACCEPT.** It is fail-safe. A missing or zero count goes to the authoritative readback, which refuses a stale incarnation before resolving. The rule differs from the classifier, but it cannot manufacture success.
- **D-4 (rejoin reads its own endpoint rows raw): ACCEPT** as authority-mediated semantic. The advance is a CAS on the observed incarnation, which refuses a newer owner and throws "advance not observed".
- **D-7 (the NODES registration UPSERT is unfenced): NON-BLOCKING recorded debt**, but it is a real I9 hole in principle.
  - `nodes-owner.js:43` `upsertRow` can drop `boot_incarnation` back to G1 when it runs after G2's absence read: for example, from a dead G1's in-flight UPSERT, or from a same-node-id process on another host.
  - Cheap fix: a monotonic `ON CONFLICT ... WHERE boot_incarnation <= excluded.boot_incarnation`.
  - This fix only helps once F1 makes incarnations monotonic.
- **MG removal CAS: ACCEPT.**
  - The predicate is identity, STOPPED, created_at and `durableRowVersion` (state_entered_at), with no updated_at (`message-group-service-row-owner.js:236-243,302-307`).
  - If G2 is present, the result is SERVICE_IDENTITY_CONFLICT, not a delete.
  - The witnesses pass: row-owner 39/39, lifecycle-delete-ordering 6/6 and cdc-delete-cache-absence 28/28.
- **Cache delete-ordering repair: ACCEPT** for the HLC path. The wall-clock fallback (N4) is identical to base.
- **Reaper fence** (`last_heartbeat` plus `ready_lease_expires_at` as currentness): **ACCEPT.**
  - The predicate carries `boot_incarnation`, JOINING and the observed pair.
  - Every applied publication strictly advances the watermark, so a renewal always changes the pair.
  - Endpoint reaping is fenced by the reaped incarnation and runs only after the node reap applies.
  - N7 is the liveness corollary and needs an owner ruling.
- **Admin raw SQL `updateNodeStatus` and `removeNode`: ACCEPT** as privileged operator repair.
  - Documentation gap: the bypass is documented only in the census test and the quest census, not in `architecture/`.
- **Observational endpoint-reader exceptions: CONFIRMED.**
  - The cache's `getEndpointsForNode` and `filterEndpointsByStatus` have no src callers.
  - `admin-runtime-service-views.js` is dormant.
  - The CLI and preflight counts are display only.
  - Nit: `admin-service-discovery.js:477-481` inlines the filter instead of calling `selectCurrentEndpointRows` (R03).
- **Raw "any websocket endpoints exist" toggle: ACCEPT.** Raw is the stricter direction: stale rows keep the requirement on, and the per-node check is filtered.
- **The two unmapped storage-reservation files: ACCEPT** as recorded scope widening (R16).
  - Non-blocking hole: after `INSERT OR IGNORE`, an unknown (null) change count is treated as CREATED (`rebalance-coordinator-reservation-lifecycle-methods.js:310`).
  - Owner: rebalancer reservation.
- **Raft runtime registry (I10): ACCEPT.**
  - The registry is a WeakMap keyed by the exact port, unregister is compare-and-delete, and the only retire caller passes its captured service.
  - `lifecycle-registry-runtime-generation` passes 6/6.
  - No destructive current-name registry operation exists in src. The reservation shape is N5.
- **Cleanup token (I2/I3): ACCEPT.**
  - The token is re-read before every unlink and the rmdir.
  - The marker's primary key blocks G2's INSERT.
  - Release is token plus updated_at.
  - `replica-cleanup-token-authority` passes 31/31.

## What would flip the verdict to APPROVE (for the lead; no production edits made)

1. **F1:** the minted incarnation must be durably persisted before first use and must never be dropped by a later hints write. `persistJoinSeedRejoinHints` should forward `bootIncarnation`, and the mint should write through. The seed should persist before its first durable effect. Add a witness: mint, then a joiner hint write, then mint again must be strictly greater; the failed-join reattempt must get a strictly greater incarnation; and a durable node whose join failed must be able to rejoin.
2. **F-R1:** when the cache has a NODES row for the target, judge bootstrap-snapshot endpoint rows against that row, or refuse. Add the permanent witness "stale G1 endpoint cannot route when NODES says G2" for the snapshot fallback.
3. **Recommended:**
   - Add a delayed G1 READY publication to the cross-owner anchor (N8).
   - Get an owner ruling on N7 and F-FX-4.
   - Regenerate the fixture inventory on the frozen bytes.
