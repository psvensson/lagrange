# Independent ADMIN admission review

Reviewer: subagent:/root/fresh_seed_review. Candidate: `a97f79c35b7e1f6428032493918e16e623339688`. Review is of frozen source and the bounded operations below; it is not full caller migration, a native fleet scenario, Quest landing, publication, or release approval.

| Unit | Exact boundary | Verdict |
| --- | --- | --- |
| Core admission/admin/debug/harness migration | `9adb6f5de25ec4a630438fa2c195df5e536cba2e` → `8fee98abecb29133815f9ffab9c096019692f24b`, reviewed in composed candidate a97 | **REVISE**: F-ADMIN-1 and F-ADMIN-2 below |
| Terminal node removal | `8fee98abecb29133815f9ffab9c096019692f24b` → `e701ca2b35b9f682dcd051997d521fe3134bfc89` | Prior **APPROVE retained**, with source identity checked |
| Built-in PostgreSQL wire desired scale | `e701ca2b35b9f682dcd051997d521fe3134bfc89` → `6a228ced9439af07216b492bb8fdbba5540c3671` | **APPROVE**, bounded 27-path delta; independent 545 assertions pass |
| Exact-case logical table identity | `6a228ced9439af07216b492bb8fdbba5540c3671` → `a97f79c35b7e1f6428032493918e16e623339688` | **APPROVE**, bounded 19-path delta; independent 517 assertions pass. Separate coordinator/TX1 follow-up remains pending |

Approval of the two later deltas does not approve the rejected core or the full composed candidate. The scale route persists desired state; it does not promise achieved placement or reconfiguration of an already running listener. The name correction does not claim complete coordinator/ALTER identity coverage. Marker scenario migration and user capability choices are separately pending. No reviewed production source was changed by this reviewer.

## Exact-source custody

The frozen author checkpoint was copied with the repository's session-worktree owner into `/tmp/session-worktree-WNHfFV/tree`. The snapshot remained at a97 with no tracked changes after review probes were removed from discovery. `snapshot-manifest.json` binds every changed path at each unit head and at the actual reviewed candidate: core 99 paths, node 29, scale 27, name 19. Its SHA256 is `9d4eae23a29bb78dfd775ef93e81fddf8354bbb42c772436f751647d5907f545`. Every candidate hash was rechecked before this report.

The node production files remain identical to the approved e701 images except the shared `src/admin/admin-owner-operations.js`, whose later changes add the scale operation and preserve useful owner failure details. Its terminal-removal operation and observed tuple semantics are unchanged. Prior report: `/tmp/session-worktree-ngIB0q/tree/test-output/independent-node-removal-review/REVIEW.md`, SHA256 `0d7f0b8c94c103757387799b0413a7314ce5ce97845b7a7bb73d5c1ebe8daf33`. That report's 508 assertions are reused, not represented as newly executed.

Read AGENTS → rules → router, the runtime and authority contracts, the original system-table-write-admission design/owner approval, and the sealed scale/name Quests. Applicable review lenses: admission, retry, transport, recovery, concurrency, harness fidelity, owner interaction, and hostile JavaScript. A new native formation is outside these bounded deltas.

## Required correction F-ADMIN-1 — actual owners discard failed effects

**High: PUT config and PATCH table policy return HTTP 200 / `success:true,outcome:applied` after the actual gateway returns refused or zero-row mutation results.**

The complete observed route is real Fastify registration → `AdminOwnerOperations` → actual `DynamicConfigService.set` or `TablePolicyService.updateTablePolicy` → real `ControlPlaneSystemTableGateway.submitMutation` → controlled CDC write-result seam. The read seam returns absence. The gateway and owner result classification are not stubbed. Each operation reaches CDC, as asserted independently.

Each of these CDC results produces false applied success for both operations:

```json
{"success":false,"outcome":"deferred","deferRetry":true,"error":"authority not ready","errorCode":"AUTHORITY_HELD"}
{"success":false,"outcome":"rejected","error":"write rejected","errorCode":"WRITE_REJECTED"}
{"success":true,"affectedRows":0}
```

`src/config/dynamic-config-service.js:253–327` awaits either gateway mutation but discards its result, increments writes, logs a completed update, and returns success. `src/policy/table-policy-service.js:351–378` does the same, also invalidating policy cache and emitting `POLICY_UPDATED`. `src/admin/admin-owner-operations.js:197–211` and its policy counterpart then convert normal returns to applied answers. The gateway legitimately has nonthrowing readiness/refusal/zero results; its diagnostics wrapper does not turn every refusal into an exception. Zero is normalized as an observed-state change.

This is a canonical owner effect-handling defect exposed by the new semantic APIs. Fix the existing config/policy operation owners, using the existing mutation-outcome contract. Refused, deferred, zero, and unknown effects must not produce success side effects or an applied answer. If uncertainty requires readback, the owner must obtain an authoritative successful read with the relevant exact predicate; the HTTP adapter must not acquire a competing row-truth oracle. Preserve useful typed causes and retry state. Add source-bound controls for refused/zero/unknown/uncertain read failures and an actual successful effect through the same route.

Evidence: `independent-admin-outcomes.test.js` and `core-owner-outcome-red.tap`. Six false-success leaf assertions fail; all six CDC engagement assertions pass (12 leaves, runner count 13). This diagnostic controls the CDC answer and does not claim actual SQLite failure application. The deferred/rejected witnesses establish the defect independently of whether zero-row config INSERT occurs in normal SQLite. The missing-table policy zero case is also a valid owner concern.

The source file was executed as `test/admin/independent-admin-outcomes.test.js`; the preserved copy keeps those relative imports. Restore it at that location in an isolated tree to rerun. The author received this finding before the consolidated report and is preparing a separate correction. No future correction bytes are approved here.

## Required correction F-ADMIN-2 — partial partition naming falsely satisfies readiness

**Medium: the read-only replacement for the deleted partition repair does not prove that every target partition carries its table name.**

The approved original design requires readback of every partition row for the table ID. `test/distributed/scenarios/postgres-baseline-comparison-benchmark-table-load.js:736–744` instead returns immediately on any row found by name. Even its fallback helper at lines 706–715 only checks that a later by-name result is nonempty, not that it covers the by-ID cohort.

The actual readiness helper was invoked with a controlled read source containing:

```json
[
  {"partition_id":"p-good","table_id":"tbl-one","table_name":"events"},
  {"partition_id":"p-bad","table_id":"tbl-one","table_name":null}
]
```

It succeeds after only `SELECT partition_id FROM partitions WHERE table_name = 'events'`. The expected `partition_table_name_missing` refusal fails, and a separate assertion confirms the helper issues no UPDATE. A correctly named row therefore conceals a broken row in the same target cohort.

Repair the existing readiness/readback owner so it resolves the target table and compares the full relevant partition cohort/identities, rejecting missing and wrong names even when another row is correct. Keep the mutation repair deleted. Add the mixed cohort and wrong-name controls, alongside the fully correct cohort and existing eventual-visibility behavior. Do not replace this with another harness write.

Evidence: `independent-partition-readback.test.js` and `core-partition-readback-red.tap` (2 leaves: one failed readiness assertion, one passed no-write assertion; runner count 3). The preserved source restores under `test/distributed/harness/__tests__/independent-partition-readback.test.js`. This is an actual exported-helper diagnostic with controlled metadata responses, not a fleet scenario.

## Core admission and semantic owner trace

The two corrections above prevent approval. The remainder of this bounded trace was inspected to locate the actual authority and avoid treating the broad client-entry policy as a blanket internal SQL ban:

- `sql-statement-ingress.js` owns classification. Canonical SqlRequest dispatch stamps a private client Symbol into new options, the remote envelope carries the explicit client origin, and application execution markers/nonempty service identity retain the client classification. There is no public missing-method fallback that grants permission.
- Statement execution refuses client INSERT/UPDATE/DELETE to reserved system identities after parsing and before admission/transaction staging. Routed writes preserve origin through execution options, request builders, remote partition handling and retries. The remote handler performs the same owner refusal before participant staging or execution. Current public admin WebSocket, PG-wire and InternalSqlAdapter SQL paths enter canonical SQLSTATEMENT dispatch. Actual admission tests exercise both origin and the no-write result.
- Unmarked host-internal execution is an explicitly retained in-process owner route under the approved design. It is not a general exemption exposed through the current client API. This review does not claim cryptographic protection from arbitrary trusted host JavaScript or fabricated internal RPC messages. Existing raw internal callers are not silently certified as migrated.
- The debug metadata service deletes its generic SQL writer fallback and uses the fixed debug-table gateway operations. Its tenant predicates and gateway-unavailable refusal remain. This is a narrow in-process owner route, not an arbitrary table/SQL bypass.
- Local drain routes through the existing shutdown lifecycle selection, shared by shutdown and admin; remote node drain is refused. Terminal removal retains the independently reviewed exact-incarnation/terminal-state CAS and strict HTTP/CLI observed tuple. The removed activate/old lifecycle path was not retained as a compatibility operation.
- The CLI uses semantic owner endpoints, not new raw system-table mutations. The harness deletes the partition repair and migrates policy writes, but the replacement validation remains defective as F-ADMIN-2 shows.
- The core duplication ratchet tightens; this review found no baseline increase. It does not independently certify the full global audit inventory.

The current administration network/authentication posture and general DDL policy are not promoted to new guarantees. INSERT/UPDATE/DELETE is the admission scope; the successor reserved CREATE validator is separate. User capability choices and remaining marker/caller work must stay explicit.

## PG-wire scale — bounded approval rationale

The exact built-in route accepts only desired replica count and runtime configuration. The existing `ServiceDefinitionsOwner` resolves the operation, compiles immutable request data before asynchronous retries, and uses its existing private metadata update/retry owner. Its mutation fixes the built-in service ID, native runtime kind, runtime reference, PostgreSQL protocol and active status. Only `replica_count` and `runtime_config` change. No generic service mutation, SQL bypass, new scheduler, endpoint publication, or parallel placement owner was added.

The existing PG-wire descriptor validates configuration. The canonical effect classifier requires confirmed applied count 1 before reporting persisted desired state. Zero is a typed mismatch; unknown, invalid, multi-row and deferred/visibility-pending effects do not claim persisted state. Retry preserves original intent and the logical write identity. Useful owner error codes, outcome and retry delay survive the adapter.

The real HTTP → owner → gateway → CDC builder → SQLite integration engages each immutable row predicate, unchanged lifecycle metadata, repeated assignment, zero target and the existing runtime rebalancer wake path. This is a local integrated seam, not proof of achieved distributed scale. The runtime module tests demonstrate that updated desired config is consumed on subsequent stop/prepare/start, while an existing listener retains its current config.

The two prior raw writers now use the one owner HTTP operation. Endpoint/client checks remain separate from desired-state acceptance; the embedded caller matches requested host and port. All four actual listener consumers are accounted for; the fifth shared helper consumer does not issue scaling. No duplicated fallback mutation remains in those callers.

Independent execution of all ten specified files passes 545 assertions. The predecessor's retained red is engaged: the real registered server returns 404 and the desired count remains zero, rather than failing on an unavailable import. The full 27-path delta is approved subject to the stated local/scenario ceiling and the rejected core dependency remaining unresolved.

## Exact-name — bounded approval rationale

The system identity predicate now uses the existing logical-name resolver without folding case, consistent with authoritative exact catalog lookup. Optional `global.` interpretation remains shared. Runtime grant syntax accepts uppercase ASCII and its matching preserves exact names. The old folding helper is removed; no parallel legacy alias is retained.

Durable schema intent preserves the parsed table name, yielding distinct IDs for `Logs` and `logs` while preserving existing lowercase bytes. One `validateUserTableCreateIntent` owner holds reserved-name and primary-key requirements, called both before persistence and during provisioning/resume. The two old primary-key validation copies are deleted. Every 46 reserved names is refused without catalog reliance, and a retained reserved job fails typed on resume before physical/catalog mutation. Reserved CREATE has its own error code, mapped to PG42501 separately from DML refusal.

The independent six-file run passes 517 assertions. It exercises actual parser → durable identity → resume → exact catalog lookup; grant configure/read/match; and engine → remote admission → SQLite UPDATE of the exact user table while retaining client origin. The source-bound predecessor and CREATE SQLSTATE reds are preserved in this packet.

No old folded-record migration is introduced. At the witnessed crash-after-intent point, the original uppercase spelling is absent from the old durable intent; this does not claim later metadata or results could never retain it. The known coordinator/TX1 folding correction is a separate unfrozen follow-up, not a newly discovered finding here and not approved future source. Existing primary-key-column case handling and general ALTER/DROP policy are outside the 19-path correction. These limits prevent claiming complete logical-identity/caller closure while allowing approval of this bounded source delta.

## Independent execution and evidence

All executions used the canonical file runner with `LAGRANGE_RETRY_FAILED_ONCE=0 LAGRANGE_LANE_JOBS_CAP=1`, normal thermal checks, and existing classifications. No broad corpus, lab/native fleet or acceptance receipt was run. Root was notified when the integration window was released. The counts below overlap across runs and must not be summed into unique coverage.

| Raw file | Result | Coverage |
| --- | --- | --- |
| `core-authored.tap` | 188 pass | Admin owner 77, CLI admin 21, client admission 83, debug metadata 7 |
| `core-owner-outcome-red.tap` | 6/12 leaves fail | Actual HTTP/owner/gateway false applied answers; all engagement controls pass |
| `core-partition-readback-red.tap` | 1/2 leaves fail | Mixed actual readiness cohort; no-write control passes |
| `scale-authored.tap` | 545 pass | 10 files: 439 ordinary, 52 bootstrap, 54 integration |
| `name-authored.tap` | 517 pass | 6 ordinary files, including parser, grant, schema and actual remote SQLite admission |

Exact scale and name command lists are preserved in `scale-author-handoff.md` and `name-author-handoff.md`; the raw independent streams record every classified file and count. The authored red evidence is retained separately as `scale-author-red.log`, `name-author-red.log`, and `name-author-create-sqlstate-red.log`. `evidence-hashes.json` binds each copied artifact. The original author failures and handoffs are retained; they are not relabelled independent runs.

To reproduce each independent red, place its preserved source at the original discovery path noted above and run that single path with the same canonical runner settings. Do this only in an isolated review tree. The copied source is unchanged from the engaged red; its relative imports intentionally describe the original test path.

Required next dependency: owner correction for F-ADMIN-1, readback correction for F-ADMIN-2, independent review of their exact frozen delta and reuse/re-execution of the corresponding negative controls. Existing node approval and the two bounded approvals above may be reused by exact bytes. There is no approval of unstaged author work, remaining marker/capability decisions, final composition, or release.
