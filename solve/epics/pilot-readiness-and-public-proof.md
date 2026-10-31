---
id: pilot-readiness-and-public-proof
status: open
proof: deterministic
roadmapRow: null
graduatesTo: null
quests:
  - learner-promotion-progress-proof
  - partition-leader-row-publication-integrity-v2
  - partition-leader-row-publication-integrity-v3
  - partition-leader-row-publication-integrity
  - public-path-multinode-baseline
  - user-table-leader-handoff-demotion-pairing-v2
  - user-table-leader-handoff-demotion-pairing
  - user-table-leader-placement-spread-v2
  - user-table-leader-placement-spread
  - wasi-cell-busy-health-admission
authorizes: []
legacyStatus: null
doneWhen:
  probe: scenario-harness
  args:
    scenario: public-path-multinode-baseline
    consecutive: 3
    metric: priority
---

# Pilot readiness and public-path proof

## Current release allocation

The reviewed published baseline is v0.4.0 at
`07206ba1c8bb396f4eb097a753915bb34580d824`. Its publication does not close
the remaining service-envelope or pilot-certification work. The 2026-10-31
decision below explicitly supersedes the older planning allocation; historical
audits, sealed Quest records and the existing front-matter gate are unchanged.

| Release | Outcome owned or consumed by this epic |
| --- | --- |
| 0.4.1 bounded correctness | Consume the immediate generic-reduction count/byte overflow and no-truncation repair, plus enforcement of the SQL byte budget before local batch materialization. These are prerequisites to the larger service work. |
| 0.5 service and pilot milestone | Retain Q2 typed selectors, Q3 explicit page accumulation, Q4 bounded structured contributions and Q5 one canonical multi-operation target, including a true zero-operation HTTP service. Integrate the Hono/Fetch/SDK contract owned by [standard-http-service-api](../specs/standard-http-service-api/requirements.md). |
| 0.5 operational pilot obligations | Retain Q7–Q12's transport trust, load/cutover, compatibility, public-path scale/failure and supported recovery work with their existing dependencies. Service-envelope evidence alone cannot satisfy the full pilot boundary. |

Existing accepted prerequisites, including Q6's progress-proven learner
promotion, are consumed rather than reopened. Q11 still depends on Q7 and its
other prerequisites. Ordinary SQL, locking-read parameter plumbing and completed
query optimization retain their owners; Q2 concerns the service-selector
planner/executor gap. Comparative benchmark work retains its existing owners
and cannot substitute SQL-only evidence for this epic's public WASI journey.

This is one ordered release sequence. It does not start parallel legacy
tracks, grant completion to an unsealed Quest, or bring later OCI work forward.
The detailed normative requirements are in
[requirements.md](../specs/pilot-readiness-and-public-proof/requirements.md).

## Adversarial risk follow-ups (2026-10-10)

The [final risk review](../../docs/development/adversarial-risk-review-2026-10-10.md)
routes RT1, RT2, OP1 and OP2 here. The existing planned Q7/Q11/Q12 slots remain
the homes for transport trust, public-path failure/resource proof and the
supported upgrade/recovery envelope. This adds neither an umbrella epic nor
new product/edition scope. The existing `authorizes` and gates remain unchanged.

| Risk | Existing or prospective slot | Required evidence before closure |
| --- | --- | --- |
| RT1 | Prospective `wasi-cell-busy-health-admission` | Supported WASI request/call path: busy within budget survives health/admission, concurrency is typed, idle dead and truly hung workers still fail, and recovery preserves result/effect uncertainty |
| RT2 | Planned Q11, current runtime budget/admission owners | Measure host effect/buffer/cloning retention and aggregate Cell/node pressure; prove bounds before unbounded retention, cancellation cleanup, and continued correct SQL/control progress |
| OP1 | Planned Q12, with existing Q8/Q9 prerequisites | Name supported version/topology/storage assumptions and execute preservation, recreate/reload or upgrade rehearsals for that envelope; no unmeasured RPO/RTO or backup claim |
| OP2 | Planned Q7 and security/admin boundary owners | Authenticated/encrypted node trust stays Community core; admin exposure policy is explicit; broader enterprise identity/tenancy remains external |

RT1 has source and synthetic-worker evidence on the reviewed main, not yet a
complete supported-path reproduction. Create its actual bounded fix Quest when
the current candidate and meaningful red witness are ready; the front-matter
name is staged, not sealed. RT2 is an investigation/proof gap, not an established
OOM incident or exploit and not permission for a second resource scheduler.

Keep the running local agent's current cutover work coherent before opening
overlapping runtime edits. Core readiness documentation may clarify rebuild/
reload limits now; commercial backup/restore/PITR implementation stays in its
existing external home. This finding does not move it into AGPL or expand 0.3.

## Intent (why now)

Lagrange has a released code-first WASM service pipeline and substantial
distributed storage machinery. The remaining service contract still needs
typed selectors, correct bounded paging/accumulation, structured partials,
one canonical multi-operation target and real public-path evidence. The
[standard HTTP service API](../specs/standard-http-service-api/requirements.md)
owns the approved Hono authoring boundary. This epic retains data-local
execution and pilot obligations underneath it, without adding parallel
execution, transport, routing or workflow owners.

The operational pilot boundary remains evidence-dependent. Commercial
backup/PITR, enterprise identity and tenancy, secrets/KMS integrations and
cross-region durability retain their edition/implementation homes. Removing
false-positive management success is an immediate correctness obligation; it
does not establish or authorize a backup product.

## Historical source audit (2026-08-07)

HEAD at audit: `761dc17c7facd847843f7e68c39d253bca256a62`.

- Confirmed gaps: typed selector narrowing; inputs beyond the 4096-row batch;
  bounded structured partials; progress-proven learner promotion;
  authenticated/encrypted node transport; bulk migration/cutover; and an
  executable upgrade/recovery envelope.
- Service Cell v2, Binding v3, and handler-aware invocation are landed, but the
  CLI default and examples still emit the single-operation v1 target.
- PostgreSQL has real-client tests but no generated support matrix.
- Internal data-plane scale and cost comparisons have separate owners; Q11
  owns only public WASM-over-HTTP scale/failure certification.
- The scenario harness and seven-node examples are landed, but Q1 still needs
  a named public-path baseline with local-read proof, parity, and telemetry.

## Binding design decisions

1. **One public execution path.** Every call continues through the canonical
   Binding resolver, call invoker, partition-host dispatch, local batch owner,
   partial coordinator, and reducer. No benchmark-only fast path, direct-local
   bypass, alternate fan-out runtime, or legacy callback fallback may satisfy
   a Quest.
2. **Code-first is the source contract.** New capabilities must be reachable
   from `lagrange.service.js` through generated records. Raw Binding JSON may
   be used by low-level tests but is not sufficient product evidence.
3. **Selectors remain declarative.** Per-call narrowing must not concatenate
   SQL or accept arbitrary caller SQL. The Binding owns the statement shape;
   the caller supplies typed values against declared parameter slots.
4. **Bounds and computation remain explicit.** Single-page and multi-page
   inputs use one declared bounded accumulator lifecycle, with a stable
   read view, page identity, backpressure and count/byte/deadline limits.
   Resumable cursor/state progress commits atomically; loss of required
   view/state custody discards the whole attempt. No truncation, implicit
   per-page combine, read-committed continuity claim or raised default may
   replace that contract.
5. **Structured partials remain bounded and canonical.** Richer partials use
   one versioned, size-limited canonical finite-JSON encoding. Runtime
   delivery identity is separate from application group keys: identical
   replay is idempotent, conflicting replay refuses, and distinct valid
   deliveries sharing a group key all reach the declared reducer in a fixed
   order. The host supplies no implicit merge law or top-K.
6. **Evidence uses the public path.** The final comparison must build a
   code-first service, deploy generated records, run genuine WASI components
   on multiple data-host nodes, and measure the public HTTP path. Internal
   `native_js` results may remain a diagnostic comparison but cannot close
   the epic.
7. **No claim without a reproducible receipt.** Every latency, throughput,
   transfer, scale, recovery, or compatibility claim names the release
   commit, topology, workload, sample method, and machine-readable evidence.
8. **Core cluster security stays core.** Cryptographic authentication and
   encryption required for nodes to trust one another belong to the
   Community/AGPL production floor. Enterprise SSO, customer RBAC, hostile
   multi-tenancy, policy providers, and secrets/KMS integrations remain in
   the external commercial implementation home.
9. **Edition boundaries are enforced.** Backup/restore/PITR and cross-region
   work do not land in this repository unless `edition-matrix.md` is changed
   by an explicit product decision first.
10. **No documentation-only closure.** Documentation may be updated as a
    consequence of landed behavior, but a Quest's red direction and
    `doneWhen` must exercise code or live evidence.
11. **Existing owners stay authoritative.** Each Quest identifies the current
    owner before editing and routes new behavior through it. Do not create
    second state, second truth, or second lifecycle owners.
12. **Failure paths are first-class.** Every new success path has attack,
    timeout, retry, restart, movement, and partial-failure cases appropriate
    to its boundary.

## Quest ladder (drafted)

```text
Q1 public-path-multinode-baseline (gate)
  |
  +--> Q2 call-selector-typed-parameter-narrowing (gate)
  |      |
  |      +--> Q3 call-shard-paged-execution (gate)
  |      +--> Q4 call-bounded-structured-partials
  |
  +--> Q5 service-cell-v2-default-multi-operation
  |
  +--> Q6 learner-promotion-progress-proof
  |
  +--> Q7 node-transport-authenticated-encryption (gate)
  |
  +--> Q8 resumable-bulk-data-load
           |
           +--> Q9 pilot-cutover-and-rollback-receipts

Q10 postgres-compatibility-certification-matrix (after Q1)
Q11 public-path-scale-and-failure-certification (depends on Q2-Q7, Q10) (gate)
Q12 supported-upgrade-and-recovery-envelope (depends on Q6, Q7, Q8-Q9, Q11)
```

Q1, Q2, Q3, Q7, and Q11 are real gates. Dependent work does not execute when
a gate refutes its assumed design; a failed gate updates this epic's decision
log rather than being routed around by weakening the statement.

## Commercial companion work (external, not landed here)

Per `edition-matrix.md`, backup/restore/PITR, enterprise identity/policy/secrets,
and cross-region durability stay in the external commercial repository.
Cryptographic node transport remains core because every edition must establish
peer trust. Replica snapshots are primitives, not a user backup product.

## Epic completion criteria

1. The default code-first public path supports the selected pilot workload
   without exceeding the old fixed-selector, one-batch, numeric-partial, or
   one-operation limitations.
2. Multi-node public-path evidence is reproducible and buyer-readable.
3. Learner promotion is progress-proven.
4. Node transport is cryptographically authenticated and encrypted.
5. A resumable load, cutover, parity, and rollback path exists.
6. PostgreSQL compatibility is a generated tested matrix.
7. The final scale/failure certification passes its sealed bar.
8. A named upgrade/recovery envelope is executable rather than prose.

Commercial backup/PITR, enterprise identity/tenancy, secrets/KMS, and
cross-region work are not required to mark this AGPL epic complete, but the
epic links to the companion backlog (above) and must not imply those
guarantees.

## Decision log

- 2026-08-07 — Audited HEAD `761dc17c7`. Drafted the twelve-Quest ladder and
  kept Q1, Q2, Q3, Q7, and Q11 as real gates. Q5 is default cutover rather than
  new mechanism; Q1 and Q10 extend landed harness and compatibility substrates.
  All twelve Quests remain AGPL work; commercial companions stay external.
  `roadmapRow` remains null pending governance. The Q1/Q11 workload must cross
  the public HTTP path, multiple partition hosts, old bounds, multi-operation
  dispatch, and an independent parity oracle with sealed inputs.

## Disposition (2026-09-13, epic-board-curation)

Kept and sealed: `doneWhen` is the scenario-harness probe of its remaining quest work (`public-path-multinode-baseline`, 3 consecutive), and `legacy` is dropped so its `authorizes` scope now binds landings.

## Release baseline and planning supersession — 2026-10-31

### Current coordination summary

- Governing steering: rules/router revision 2026-10-30, read at released
  source `07206ba1c8bb396f4eb097a753915bb34580d824`.
- Last checked: 2026-10-31. The annotated v0.4.0 tag peels to that same
  commit; [release publication](https://github.com/psvensson/lagrange/releases/tag/v0.4.0)
  was 15:16:56 Europe/Stockholm.
- Current unit: planning revision and read-only source/CI audit. No runtime
  implementation, test run or physical comparison is claimed by this update.
- Source-identified service correctness concern: the generic coordinator
  still sorts and slices combined contributions before the reducer. The
  local service SQL call also supplies an empty parameter vector and only a
  row budget. These are source findings requiring bounded executable
  witnesses, not invented production incident reports.
- Next action and owner: the integration owner seals the 0.4.1 bounded
  repairs, then the Hono owner and existing Q2–Q5 owners seal their coupled
  0.5 work against meaningful public-path red witnesses. Q2–Q5 are planned
  slots, not newly accepted Quests or promised measurements.

### What the release changed and what remains

| Observation at the reviewed release | Consequence for the plan |
| --- | --- |
| Canonical artifact publish, mandatory payload-store activation, binding generation/version pinning and object-JSON body normalization landed. | Reuse their owners. Build/publication may read local sources; activation/deployment must not recover artifacts from the publisher's filesystem. |
| The public CLI still normalizes without the multi-operation target; both generated guest HTTP adapters synchronously serialize the handler return. The outer worker already awaits its export. | Q5 performs the canonical target cutover; Hono must prove guest async/Fetch semantics. Adding an outer host await alone is not the missing change. |
| Service selector execution still passes no parameters, reads one bounded batch and admits finite numeric/disjoint-key partials. | Q2–Q4 remain open service work. Ordinary locking reads already have parameter plumbing and are not reopened. |
| The request-call bridge keeps a one-child limit/fixed ordinal; public CALL payload fields omit an invocation key. | Hono owns bounded sequential child-call identity. Q5 also extends the existing SQL/CLI/invoker contract with optional direct-call keys, durable replay/conflict/retention semantics and no exactly-once claim. |
| New J1/J2 composition tests build WASM but invoke imported JavaScript through a handwritten dispatcher; their simulated second owner uses the same in-process store. | These tests support composition claims only. They cannot replace compiled-runtime, independent-host activation, real restart or leader-loss evidence. |
| Generic management owners advertise support with synthetic backup storage/partition defaults and optional lifecycle callbacks. | The immediate correction must make unavailable production capabilities typed and truthful. It is not acceptance of backup/restore or rolling-upgrade guarantees. |
| Most comparison tables now mark absent physical evidence as not measured; benchmark introduction and release prose still contain modelled/older numeric claims. | Existing measurement/publication owners must reconcile those claims and retain original physical receipts. No performance win is inferred here. |

Source anchors for the audit:
[coordinator](https://github.com/psvensson/lagrange/blob/07206ba1c8bb396f4eb097a753915bb34580d824/src/runtime/call-cell-reduce-coordinator.js#L448),
[local service SQL](https://github.com/psvensson/lagrange/blob/07206ba1c8bb396f4eb097a753915bb34580d824/src/node/runtime-service-call-cell-handler.js#L340),
[default pipeline](https://github.com/psvensson/lagrange/blob/07206ba1c8bb396f4eb097a753915bb34580d824/src/cli/service-pipeline-command.js#L176),
[guest entry](https://github.com/psvensson/lagrange/blob/07206ba1c8bb396f4eb097a753915bb34580d824/src/service/service-entry-generator.js#L178),
[worker await](https://github.com/psvensson/lagrange/blob/07206ba1c8bb396f4eb097a753915bb34580d824/src/runtime/wasi-component-cell-worker.js#L332),
[J1 dispatcher](https://github.com/psvensson/lagrange/blob/07206ba1c8bb396f4eb097a753915bb34580d824/test/integration/developer-journey-j1-j2-j3.integration.test.js#L400),
[J2 simulated restart](https://github.com/psvensson/lagrange/blob/07206ba1c8bb396f4eb097a753915bb34580d824/test/integration/developer-journey-j1-j2-j3.integration.test.js#L955),
[management production construction](https://github.com/psvensson/lagrange/blob/07206ba1c8bb396f4eb097a753915bb34580d824/src/bootstrap/bootstrap-api-server-methods.js#L256),
[backup defaults](https://github.com/psvensson/lagrange/blob/07206ba1c8bb396f4eb097a753915bb34580d824/src/bootstrap/owners/backup-restore-owner.js#L210).

Exact-head CI had successful
[release](https://github.com/psvensson/lagrange/actions/runs/41208783969),
[change-gate](https://github.com/psvensson/lagrange/actions/runs/41208311885)
and [Scenario A live admission](https://github.com/psvensson/lagrange/actions/runs/41208311922).
The [version-gated comparison](https://github.com/psvensson/lagrange/actions/runs/41208312056)
and [proof-ownership](https://github.com/psvensson/lagrange/actions/runs/41208311907)
failures reached a history guard requiring a removed README link; the
[public-PG-context](https://github.com/psvensson/lagrange/actions/runs/41208311965)
failure compared a 120000 ms expectation with an actual 300000 ms setting.
These are bounded verifier/document-configuration failures to reconcile
through their existing owners. They do not demonstrate a query-engine
correctness regression or reopen completed optimization work.

### Superseding decisions for remaining Q2–Q5 work

1. The approved HTTP authoring direction is Hono with standard Request/Response
   semantics and the explicitly requested Lagrange client. This epic does not
   create or retain a second Express-like route DSL, handler `calls` list or
   injected `call/json` dialect. The Hono epic owns request-level authority.
2. Q5 retains one canonical operation-dispatch target for both zero-operation
   HTTP artifacts and multi-operation services. Old artifacts receive a typed
   rebuild requirement; no parallel v1 runtime or lasting compatibility flag
   is a planned acceptance requirement.
3. Q2 uses one typed parameter vector for planning and local execution. Q3
   requires an explicit bounded accumulator, stable read view and atomically
   committed recoverable state/cursor, or whole-attempt discard/restart.
   Stateless keyset navigation and a completion digest alone prove neither
   continuity nor recoverability.
4. Q4 distinguishes delivery identity from semantic group identity, uses one
   canonical finite-JSON codec, preserves all admitted contributions in a
   deterministic order and assigns grouping/merging/top-K to the application.
   The earlier disjoint semantic-group requirement is superseded.
5. Q5's direct-call replay extension uses the existing SQL/CLI/invoker and
   durable operation owner. HTTP method/URL intent belongs only to the Hono
   layer. There is no second transport/idempotency store and no exactly-once
   physical-execution promise.
6. The revised requirements and detailed paging/partial specs are normative
   planning for new bounded Quests. Earlier historical decisions, immutable
   logs, sealed Quest receipts and the epic's existing front-matter probe are
   preserved. This update is not acceptance of a major feature, performance
   result, operating envelope or release.
