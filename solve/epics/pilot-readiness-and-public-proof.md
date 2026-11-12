---
id: pilot-readiness-and-public-proof
status: open
proof: deterministic
roadmapRow: null
graduatesTo: null
quests:
  - call-bounded-structured-partials
  - call-selector-typed-parameter-narrowing
  - call-shard-paged-execution
  - learner-promotion-progress-proof
  - node-transport-authenticated-encryption
  - partition-leader-row-publication-integrity-v2
  - partition-leader-row-publication-integrity-v3
  - partition-leader-row-publication-integrity
  - pilot-cutover-and-rollback-receipts
  - postgres-compatibility-certification-matrix
  - public-path-multinode-baseline
  - public-path-scale-and-failure-certification
  - readonly-execution-cancellation
  - resumable-bulk-data-load
  - service-cell-v2-default-multi-operation
  - supported-upgrade-and-recovery-envelope
  - user-table-leader-handoff-demotion-pairing-v2
  - user-table-leader-handoff-demotion-pairing
  - user-table-leader-placement-spread-v2
  - user-table-leader-placement-spread
  - wasi-cell-busy-health-admission
  - wasi-component-startup-budget
authorizes:
  - src/authoring
  - src/service
  - src/runtime
  - src/node
  - src/bootstrap
  - src/control-plane/owners
  - src/cli
  - src/query
  - src/partition
  - src/raft
  - src/rebalancer
  - src/transport
  - src/public-api.js
  - wit
  - package.json
  - package-lock.json
  - examples
  - test
  - architecture
  - docs
  - README.md
  - CHANGELOG.md
  - scripts/checks
  - scripts/check-current-capabilities.js
  - scripts/check-service-portability-claims.js
  - scripts/generate-current-capabilities-doc.js
  - solve/epics
  - solve/specs
  - solve/quests
legacyStatus: null
doneWhen:
  probe: scenario-harness
  args:
    scenario: public-path-multinode-baseline
    consecutive: 3
    metric: priority
---

# Pilot readiness and public-path proof

## Current convergence decision (2026-11-12)

Planning baseline: main `ef93af85dcd6add82ff5b5fee21ca12d205c61cd`,
rule-set revision 5. The independent source review also inspected WIP
`dc29d85bedbbe4310bfcd4cf7e46e8b65a654b2d`; its
[hydration-image owner](https://github.com/psvensson/lagrange/blob/dc29d85bedbbe4310bfcd4cf7e46e8b65a654b2d/src/partition/partition-hydration-image-pages.js)
is absent from this main baseline. This is branch divergence, not evidence
that main deleted that owner. No runtime witness, lab run or receipt was
executed or generated for this planning reconciliation.

Q2–Q5, Q10 and Q11 have historical sealed records and terminal logs on main.
Their exact predicates and receipts stay unchanged. The broader production
composition required below remains evidence-dependent; a script guard's
historical verdict does not prove a newly identified race, current resource
bound or the entire public journey. New drafts require a real red measurement
before sealing, then exact-candidate evidence and independent review.

| Order | Existing owner and bounded next work | Completion boundary |
| --- | --- | --- |
| 0.4.1 prerequisite | [Operation integrity and formation](operation-integrity-and-reliable-formation.md) owns formation/CDC/generation/checkpoint repairs and the new `retained-read-view-generation-custody` and `postgres-wire-description-contract` continuations. | Current admitted readers retire before storage replacement; actual retained-resource pressure is measured; admitted pgwire behavior describes its parameters/results truthfully or refuses. Neither continuation grants a new API or global snapshot. |
| 0.5 execution continuation | Draft [readonly-execution-cancellation](../quests/readonly-execution-cancellation/quest.json) extends the existing query/read-view and runtime owners after custody is sound. | Prove the exact SQLite binding's interruption capability, isolate admitted read work with generation-safe cleanup, and measure SQL/control progress and cancellation on the supported runtime. Preserve Raft/apply ownership. |
| 0.5 capability decisions and public proof | Existing Q3/Q10/Q11 and [HTTP service requirements](../specs/standard-http-service-api/requirements.md) consume those repairs. | Decide separately whether to admit a coherent cross-shard cut, a mutating operation descriptor, a SELECT call alias or cluster cancellation. Unsupported choices stay explicit; the existing public-path gate and compatibility evidence still apply. |

The normative boundaries live in [paging](../specs/pilot-readiness-and-public-proof/paged-execution.md),
[execution isolation and certification](../specs/pilot-readiness-and-public-proof/scale-failure-certification.md)
and [pilot requirements](../specs/pilot-readiness-and-public-proof/requirements.md).
Use one physical SQLite-handle custody boundary, while query snapshots and CDC
images retain their distinct logical contracts. Resource cancellation, durable
operation outcome and read consistency are separate facts. This sequence adds
no catalog, queue, scheduler, transaction coordinator or parallel roadmap.

Next owner: each named draft's implementation owner must pin its candidate,
trace its existing seam and preregister its witnesses before runtime edits.
Independent lab work can proceed concurrently after those contracts are fixed;
shared owner changes land in the dependency order above. Missing native API
support or live evidence is a blocker, never a success synthesized from a spec.

## Edition-ownership supersession (2026-11-01)

The [edition matrix](../../edition-matrix.md) now supersedes earlier statements
in this epic that assigned all user backup/restore/PITR or cross-region
replication to commercial implementations. Those underlying mechanisms, normal
security/authorization and supported tenancy are Community/AGPL; recurring
recovery drills, organization identity, policy approvals, billing and fleet
governance are separate external commercial outcomes. The 0.5 pilot still does
not implement the full 1.0 backup product or certify the 1.2 regional profiles.
Historical D8/D9 reasoning and audit entries below remain dated records;
their old edition allocations no longer direct new work. Sealed Quest
acceptance, Q7-Q12 boundaries, this epic's gate and existing evidence are
unchanged. No new runtime feature or proof is claimed by this correction.

## Current release allocation

The reviewed published baseline is v0.4.0 at
`07206ba1c8bb396f4eb097a753915bb34580d824`. Its publication does not close
the remaining service-envelope or pilot-certification work. The 2026-10-31
decision below explicitly supersedes the older planning allocation; historical
audits, sealed Quest records and the existing front-matter gate are unchanged.

| Release | Outcome owned or consumed by this epic |
| --- | --- |
| 0.4.1 bounded correctness | Consume the generic-reduction count/byte overflow and no-truncation repair, early SQL byte enforcement, and current admitted-reader custody and pgwire truthfulness corrections coordinated by operation integrity. These are prerequisites to the larger service work. |
| 0.5 service and pilot milestone | Retain Q2 typed selectors, Q3 explicit page accumulation, Q4 bounded structured contributions and Q5 one canonical multi-operation target, including a true zero-operation HTTP service. Integrate the Hono/Fetch/SDK contract owned by [standard-http-service-api](../specs/standard-http-service-api/requirements.md) and the bounded read-worker/cancellation continuation after its native API feasibility gate. |
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
reload limits now; the user backup/restore/PITR mechanisms belong to the later
AGPL 1.0 milestone. This finding neither implements them nor expands 0.5.

## Intent (why now)

Lagrange has a released code-first WASM service pipeline and substantial
distributed storage machinery. The remaining service contract still needs
typed selectors, correct bounded paging/accumulation, structured partials,
one canonical multi-operation target and real public-path evidence. The
[standard HTTP service API](../specs/standard-http-service-api/requirements.md)
owns the approved Hono authoring boundary. This epic retains data-local
execution and pilot obligations underneath it, without adding parallel
execution, transport, routing or workflow owners.

The operational pilot boundary remains evidence-dependent. Future AGPL user
backup/PITR and regional durability profiles retain their assigned 1.0/1.2
milestones; enterprise organizational identity and secrets/KMS integrations
remain external. Removing false-positive management success is an immediate
correctness obligation; it does not establish or implement backup capability.

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
8. **Core cluster security stays core.** Cryptographic peer trust, ordinary
   authentication/authorization, basic roles and the isolation required by a
   supported operating profile are Community/AGPL. Enterprise SSO group
   provisioning, organization policy governance and KMS integrations remain
   external; hostile multi-tenancy requires an explicit supported contract.
9. **Edition boundaries are enforced.** User backup/restore/PITR mechanisms
   and regional correctness are Community/AGPL in their assigned later
   milestones. This 0.5 pilot epic does not implement those later features
   merely because their edition classification changed.
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

## Later recovery, regional and commercial work (not landed here)

Per the current `edition-matrix.md`, AGPL owns future user backup/restore/PITR
and regional replication/locality; its recovery mechanisms are separate from
replica-internal snapshots. External commercial services own recovery
assurance, organization identity/policy/secrets integrations and fleet
governance. This 0.5 pilot acceptance does not certify those later outcomes.

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

Future AGPL backup/PITR and regional profile qualification, and separate
enterprise organization integrations, are not required to close this 0.5
epic. Its pilot evidence must not imply those later guarantees.

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

## 0.5 service tests off the controller — 2026-11-02

- h1–h5 and q2–q4 fail on the 2-core hosted runner and the lab hosts with
  `request_cell_start_failed 'Component startup timed out'`. The cause is that
  every Cell start re-runs the jco transpile (97% of start time) under the
  fixed 10 s bound. Owner: quest `wasi-component-startup-budget` (derive once
  per component per node; start becomes instantiate-only). Design and
  measurements are in its relocated evidence bundle
  (`solve/changes/evidence-relocation/wasi-component-startup-budget`).
- Immediate CI trigger: the nine files are resource class `ordinary` (four
  jobs), unlike their toolchain siblings. Owner: `class: fix` quest
  `solve/quests/service-test-toolchain-classification` (branch
  `fix/service-test-toolchain-classification-20261102`, PR #193). That quest
  does not close the R12 defect.
- R17 finding for `postgres-compatibility-certification-matrix`: the
  committed `docs/postgres-compatibility-matrix.json` pins
  `driverVersions.psql` 14.24, which is the controller's psql. The hosted
  runner's psql 16.15 changes `driverVersions` and `matrixDigest`, so the
  deep-equal at test line 1254 fails. The logged refusals ("multiple
  statements…", "OFFSET without LIMIT…") are expected negative controls. Next
  action owner: that quest's owner.
