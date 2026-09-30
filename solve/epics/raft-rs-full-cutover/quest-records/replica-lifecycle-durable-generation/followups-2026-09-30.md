# Follow-ups recorded after the first GCP release proofs of the cutover (2026-09-30)

Found by `full-gate` on `main` 1aea11baf / a5e769c61 (the whole corpus on the GCP runner), i.e. surfaces the
quest's focused sets and the lab changed cone never ran.

## Integration fixture debt (repaired, test-only)
- `cross-node-replica-placement`, `replica-handler-metadata-propagation`: stub partition services had no exact
  transport handler; S-F2/N2 refuses a durable ACTIVE without one. Now bound through
  `test/test-helpers/replica-handler-identity-fixture.js` (the real PartitionService gets a transport and the
  executor's retirement lane, as production wires it).
- `benchmark-replica-instability-admission`: NODES / SERVICE_ENDPOINTS fixture rows carried no boot incarnation;
  service discovery (I9/D5) advertises only endpoints of the node's current incarnation. Rows now carry
  `TEST_BOOT_INCARNATION`.

## Performance regression: virgin-seed bootstrap ~4 s slower (OPEN, product)
- `admin-cdc-propagation` bootstraps two virgin seeds under tap's default 30 s parent budget: ~22 s at base
  e0b0854f3, ~29-34 s on the cutover. Not a hang, no state leak (subtest 3 takes the same time with subtest 2
  skipped). Repaired by the sanctioned literal `{timeout: 120000}` (test-timeout-constants idiom, as the sibling
  `cdc-propagation` file).
- Measured cause: `PARTITION_SERVICE_LOG_MSG.PEER_ADDRESS_FROM_LIST` (`resolveKnownPeerAddress`,
  `src/partition/partition-service-core-base.js:737`) fires ~39,700 times per bootstrap vs ~540 at base (73x).
  The body is unchanged; the cutover added callers: `buildPeerAddress` delegates to it
  (`partition-service-core-base.js:685-698`), `partition-service-raft-init-base.js:548-549` resolves every peer
  per init, and the rs-raft operation port resolves per dispatch
  (`src/raft/raft-replica-base-runtime-helpers.js:114`). Each resolution runs `AddressManager.validate` over
  the peer list plus a cache lookup; the REGISTRATION phase's 135 partition-row Raft writes went from ~18 ms to
  ~58 ms each.
- Proposed quest: memoize the resolved peer address per replica and invalidate on services-row CDC; witness
  the per-bootstrap resolution count and the virgin-seed bootstrap time against base.
