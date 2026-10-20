# U1 post-approval production source reconciliation — 2026-10-20

**Review subject:** immutable candidate `ccdd6938c5e79ff95fbd71a2090ba4c800223266`,
against previously source-approved `ac092686975dd22b4843be8df8e2e1d3663c0b7f`.
**Disposition:** all ten *changed source files* traced to their owner; no
unexplained source owner or parallel authority was found in the enumerated
diffs. **Limited source review only: combined U1 acceptance remains OPEN.**
This reviewer made no implementation, test or generated-file modifications
to the positive candidate, and makes no claim of a normal publish-gate run.
This document is an additive finding; it does not supersede sealed U1 acceptance.

## Exact changed-owner inventory

The older seven-gate checklist identifies nine post-approval paths in ten
commits. Reading the current GitHub commit patches, both old/new source and
their consumers also requires the separately introduced exact WASM handler
retirement, making **ten distinct net production paths to reconcile**.
The Git blob SHAs below bind the source actually inspected at `ccdd6938`.

| Owner / net file | Git blob at `ccdd6938` | Source interaction and review finding |
| --- | --- | --- |
| `service-lifecycle-manager.js` | `3919d4846d31d9e8df65ebbc66539dbf7810bc66` | Capture bounded journal rows; reject duplicated operation ID with divergent content globally; malformed unkeyed/isolated rows do not manufacture creation grants. |
| `service-lifecycle-recovery.js` | `0263881ebff7d56cb3dd98102ef34538ecac3690` | The manager's `__recoveryCorrupt` internal marker yields a failed record before context resolution or physical dispatch. No handler-local journal decision is added. |
| `runtime-service-creation-execution.js` | `1ff2f7c002168ca06af7b80abd3aa8960a700814` | Startup-created CREATE has no inbound request envelope; the original retained creation is used for exact duplicate comparison. The same installed operation/replica gate still rejects conflicts. |
| `runtime-service-bound-creation-route.js` | `75645d06ad8f88a8c651744260676eaee59145ec` | Cancelled tokenless creation requires the original journal's exact CANCELLED answer, null physical token and same complete retained identity; physical FINAL plus journal ROW_COMPLETED remains the separate completion route. Terminal local memo is non-retryable but still named. |
| `runtime-service-handler.js` | `f6c1b1e8190c3e38c7e7fa4e134e7f75b9f20c33` | A services-row hint no longer installs a guessed memo before opaque target authorization. After the existing dispatch owner answers, exact local memo object and live handler are checked; generic and bound removal remain routed through their existing owners. |
| `guarded-runtime-service-handler.js` | `f972914b66042b34012d27b39f137a6e615ca8a9` | Injects the existing dispatch owner's legacy cleanup predicate by late-bound function. No second durable operation table reader is introduced. |
| `runtime-service-handler-setup.js` | `2e1bcf419c07eb558837a0d0246636f4bcaa7ba2` | Passes the same dispatch-owned authorization dependency to handler construction. No new state/authority. |
| `replica-dispatch-service.js` | `71c27771fb70bd602af5b23adc6282ac9c604c4c` | Requests strict OWNER_RPC_REQUIRED observation, requiring absence confirmation; matches original operation ID/type, entity type/id, replica, physical target node and incomplete non-PENDING step. Caller/cache identity cannot authorize opaque STOP. |
| `runtime-service-generic-replica.js` | `8ce0fde88e295ba41157d334592c9b32fd61dc8b` | Captured admitted memo + installed execution jointly fence queued/pre-STOP/post-STOP settlement. Initial obsolete-task exit now occurs **inside** try/finally, so the old gate is released. The generic adapter remains the physical STOP authority. |
| `wasm-service-replica-lifecycle.js` | `e4e78970acb29041e78257b87bd96742d9687190` | Exact handler retirement is invoked in the first synchronous shutdown call before opening/reconciliation joins; the shared `retireReplicaTransportHandler` already owns identity-based unregistration. Release/tombstone still waits for its typed retirement result. |

### Review provenance and dispositions

- Journal isolation: `ed6b3c5a3`, corrected global duplicate policy
  `39b09b1f4`; its last policy is intentionally **fail the scan on conflicting
  same ID**, not choose the first nor isolate conflicting contenders. The current
  R2-E positive test is in the [#439](https://github.com/psvensson/lagrange-lab/issues/439)
  fifteen-file selection. A source-only duplicate-ID regression is separately
  proposed on branch `probe/u1-journal-duplicate-integrity-mutation-20261020`
  (`4abea00ba498b0bef25d2441a88ac0c19b0c3eba`); an issue submission
  is not an executed result and cannot be credited before its terminal receipt.
- Startup request identity: `d04dab162`. The new comparison consumes the
  source-of-truth retained origin; it does not synthesize one from the caller's
  missing envelope.
- Cancellation/memo: `588c34990`, `7919e405b`, `9d658acec`.
  The final helper requires explicit original-row cancellation plus full intent
  and token context. It must not be generalized to generic FAILED/UNKNOWN.
  `CREATION.CANCELLED` is a journal-owner state; physical absence alone never
  becomes a terminal journal answer.
- Strict legacy REMOVE: `f07ed5311`, `78b0364e6`, `5ce738450`.
  Authorization for opaque historical IDs is on the existing dispatch/repository
  path, with no fallback to local cache on owner unavailability. The handler's
  initial guessed services memo is not published before acceptance. This is a
  **consumer/handler correctness argument**; the scripted repository witness is
  not a full cross-host owner-RPC test.
- Generic STOP: `2ab37a85f` plus separately independently reviewed guard
  move on the consolidated candidate. Frozen-source mutation receipts:
  [#448](https://github.com/psvensson/lagrange-lab/issues/448)
  (late STOP overwrites successor),
  [#449](https://github.com/psvensson/lagrange-lab/issues/449)
  (execution gate release omitted).
- Exact WASM handler retirement: `a1d3b056`, corrected committed-effects
  test fixture at `69f59709`. Positive [#422](https://github.com/psvensson/lagrange-lab/issues/422),
  original-red [#419](https://github.com/psvensson/lagrange-lab/issues/419)
  and source-only late-retirement red [#431](https://github.com/psvensson/lagrange-lab/issues/431).
  Shared identity owner `src/node/replica-transport-handler-identity.js`
  remains unchanged: with lane null, `unregisterExact` is invoked during the
  async helper's synchronous prefix.

### Unresolved proof ceilings / explicit boundary

**R1 — legacy authority:** the owner-RPC options and durable-row response
identity are verified at a scripted repository consumer, not by a real
partition-leader failure and recovery test. Existing handler tests prove local
memo replacement while an owner read is pending. They do not establish a
remote operation owner serialization lease extending until physical STOP.

**R2 — generic STOP physical target:** the gate captures the exact
`localReplicas` memo and suppresses stale publication. The scripted
`stopReplica` test deliberately does not prove that a generic adapter
whose final physical selection is keyed by service ID can never stop a newer
resource if an independent physical owner replaces that ID while STOP is
in flight. Avoid presenting V3 component tests as a native generation/custody
proof. This is an **interaction-review ceiling**, not evidence a currently
reachable production path does replace a generic resource in that interval.

**R3 — restart corruption:** total handling of malformed independent rows and
global fail-closed duplicate-ID integrity are different contracts. A missing
operation ID cannot authorize a specific retained creation. Don't turn an
unkeyed failed row into either a fabricated durable operation or a silent
claim of fully healthy inventory. The accepted v3 design's malformed-row
policy remains unchanged; whole-cluster operational policy is not reviewed here.

**R4 — source and publication verification:** the independently recorded
positive suites [#439](https://github.com/psvensson/lagrange-lab/issues/439)
and [#440](https://github.com/psvensson/lagrange-lab/issues/440)
cover 38 selected files on one frozen candidate. They do not run the normal
full changed-owner selector, generator checks, classification outputs,
publish/merge guard, multi-host native failure proof, or the original 55-item
U1 acceptance checklist. Two reconstructed V1/V3 tests require their own
independent oracle review; our previous review of executed mutants is not a
substitute for that verifier's approval.

## Review decision

This review resolves the **inventory question** of which production files
changed after the earlier coherent source verdict, and identifies the existing
owner and intent of each changed boundary. It does **not** give a final
independent implementation-APPROVED verdict for the whole candidate:
the preserved R1/R2 evidence ceilings and R4 release/static obligations are
still OPEN. No U2 source/test implementation, activation expansion or
`main` merge is authorized.

Only the present additive review file is committed on
`review/u1-ten-owner-source-reconciliation-20261020`. No negative-control
branch should be merged.
