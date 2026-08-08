---
epicContractVersion: 2
id: pilot-readiness-and-public-proof
roadmapRow: null
graduatesTo: null
---

# Pilot readiness and public-path proof

## Intent (why now)

Lagrange has a real code-first WASM service path and substantial distributed
storage machinery, but a prospective pilot still encounters a bounded,
fixed-selector call contract; no one-command public-path multi-node scale
proof; time-based learner promotion; unauthenticated and unencrypted node
transport; no supported migration/cutover path; and no named compatibility,
upgrade, or operating envelope. This epic closes the Community/AGPL portions
of that gap without introducing parallel execution, transport, routing, or
workflow owners. Commercial backup/PITR, enterprise identity and tenancy,
secrets/KMS integrations, and cross-region durability remain external
companion work unless `edition-matrix.md` is changed first.

## Verified current-HEAD claims (audit basis)

HEAD at audit: `761dc17c7facd847843f7e68c39d253bca256a62`.

- **Fixed selector, confirmed gap.** The account-summary example declares one
  untyped `accountId` argument and filters rows inside the shard-local `run`
  (`examples/call-binding-account-summary/lagrange.service.js`); no typed
  selector-parameter mechanism exists in the call path. The invoker plans
  shards only from the Binding's static WHERE clause
  (`src/service/call-cell-batch-executor.js` `planShards`).
- **One-batch bound, confirmed gap.** Shard inputs above the 4096-row bound
  (`BATCH_ROW_BOUND`, `src/bootstrap/shared/call-cell-invocation-setup.js`)
  fail closed with `BATCH_BOUND_EXCEEDED`; no page identity, cursor, or
  continuation exists in `src/service/call-cell-batch-executor.js` or
  `src/service/call-cell-invoker.js`.
- **Numeric-only partials, confirmed gap.** Partial values must parse to
  finite numbers, enforced at two fail-closed gates
  (`src/service/call-cell-routing-contract.js` `normalizeEmittedPartialEntries`,
  `src/runtime/call-cell-reduce-coordinator.js`); group keys must be disjoint
  across shards (`SHARD_OVERLAP` refusal).
- **One-distributed-operation limit: mechanism landed, default cutover not
  done.** `service-cell-v2`, Binding schema v3, and handler-aware runtime
  invocation are landed and their Quests SOLVED
  (`binding-schema-v3-handler-interfaces`, `handler-aware-runtime-invocation`,
  `service-cell-v2-generic-dispatch-world`). The restriction lifts only for an
  explicit v2 target (`src/service/service-source-contract.js`); the CLI
  generate/build/deploy pipeline never passes `multiOperationTarget: true`
  (`src/cli/service-pipeline-command.js`), so the default still emits the
  single-operation v1 world and no multi-operation example exists. Q5 is
  default-cutover plus compatibility work, not new mechanism work.
- **Time-based learner promotion, confirmed gap.** Both the raft layer
  (`src/raft/raft-replica-base.js` `checkLearnerPromotion`, 30s default) and
  the production partition-service owner
  (`src/partition/partition-service-learner-promotion-methods.js`) promote on
  elapsed time plus leader-identity discovery and quorum-shape gates; no
  applied-index progress proof exists, and snapshot-installed learners reuse
  the same timer path.
- **Unauthenticated, unencrypted node transport, confirmed gap.** The message
  router is a plain `ws` `WebSocketServer`
  (`src/transport/message-router-server-lifecycle.js`); the IDENTIFY handshake
  accepts self-declared node identity guarded only by admission toggles and a
  boot-incarnation fence. TLS exists only for pgwire. The gap is explicitly
  admitted in `src/raft/snapshot-catchup-constants.js`.
- **No bulk load / migration tooling, confirmed gap.** `docs/migration.md`
  states there is no supported PostgreSQL-to-Lagrange migration or CDC
  surface; "bulk" in `src/` is only the internal raft snapshot channel.
- **PostgreSQL compatibility, partially implemented.** Real-client tests
  (`test/compatibility/pgwire-client-compat.test.js`, pg + psql, postgres:16
  baselines) and a test-coverage index exist, but no machine-readable
  supported/unsupported feature matrix is generated from test receipts.
  Edition matrix maps PostgreSQL compatibility to the Community/AGPL repo.
- **No upgrade/recovery envelope, confirmed gap.** `support-envelope` has zero
  matches; no mixed-version or cluster-upgrade machinery or Quests exist.
- **Scale certification, partially covered elsewhere.** The
  `large-scale-data-plane-certification` epic owns internal data-plane scale
  (its profile ladder is undrafted); `comparative-workload-efficiency-evidence`
  owns cost-efficiency comparison. Public-path (WASM service over HTTP)
  scale-and-failure certification is not covered by either — Q11 fills that
  and links rather than duplicates.
- **Scenario substrate, partially implemented.** The `scenario-harness` probe
  and registry are landed (`scripts/solve/probes/scenario-harness.js`,
  `test/distributed/harness/scenario-registry.js`), and `examples-catalog`
  runs the examples against a live 7-node cluster, but no named public-path
  multi-node baseline scenario with local-read proof, parity oracle, and
  resource telemetry exists. Q1 must build that evidence substrate first.

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
4. **Bounds remain explicit.** Larger-than-one-batch execution must use an
   explicit paging or streaming protocol with page identity, backpressure,
   budgets, cancellation/deadline behavior, and deterministic reduction. It
   may not silently raise defaults until the test passes.
5. **Structured partials remain bounded and canonical.** Richer partials use
   a versioned, size-limited canonical encoding. Duplicate cross-shard keys
   keep a defined fail-closed or explicit merge semantic; they must never
   silently double-count.
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

Per `edition-matrix.md`, these live in the external commercial repository and
are explicitly out of scope for this AGPL epic (placeholders until that
repository is ready):

- **Pro companion epic: backup, restore, and PITR** — cluster-consistent
  backup manifest, object-store sink and encryption, retention/deletion
  policy, restore into an empty cluster, PITR replay cutoff, corruption and
  missing-object attacks, measured RPO/RTO, restore certification as a
  release gate. The SQLite replica snapshot protocol may be reused as a
  lower-level primitive but is not itself a user backup product.
- **Enterprise companion epic: identity, policy, and secrets** — OIDC/SAML
  identity adapter, customer-managed RBAC and service accounts,
  policy-provider boundary, secrets/KMS integration and rotation, audit
  export and retention, tenant resource and isolation contract, penetration
  and cross-tenant attack evidence. Cryptographic node transport is NOT moved
  out of the core epic; nodes need to trust peers even in the Community
  product.
- **Enterprise companion epic: cross-region durability** — topology and
  latency-group policy, region failure semantics, write-latency and quorum
  choices, data residency constraints, failover/failback workflow,
  split-brain prevention, named RPO/RTO certification.

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

- 2026-08-07 — **Initial audit and ladder drafting.** HEAD used for the
  audit: `761dc17c7facd847843f7e68c39d253bca256a62`. Gap dispositions:
  confirmed gaps — typed selector narrowing (Q2), paged shard execution (Q3),
  structured partials (Q4), progress-proven learner promotion (Q6),
  authenticated/encrypted node transport (Q7), resumable bulk load (Q8),
  cutover/rollback receipts (Q9), upgrade/recovery envelope (Q12), public-path
  scale/failure certification (Q11, service-plane axis). Reclassified — Q5 is
  default-cutover work, not new mechanism work, because
  `service-cell-v2`/Binding-v3/handler-aware invocation landed under the
  code-first-service-compiler epic (four Quests SOLVED); only the CLI default
  and the example catalog still emit/declare the v1 single-operation shape.
  Partially solved — scenario-harness probe and live 7-node examples
  substrate exist, so Q1 is an evidence-substrate Quest (new named scenario
  with local-read proof, parity oracle, telemetry, report schema) rather than
  new harness machinery; PostgreSQL compatibility has real-client tests, so
  Q10 generates the machine-readable matrix from receipts rather than
  starting from zero. Implementation home: all twelve Quests land in this
  AGPL repository; commercial companion epics (backup/PITR; enterprise
  identity/policy/secrets; cross-region durability) are external placeholders
  per `edition-matrix.md` and decision 9. `roadmapRow` left `null`: the
  feature map has no row for pilot readiness / public-path proof (closest is
  `RM-0.2-release-verification`, scoped to the 0.2 core release gate, and the
  un-id'd Phase 1.0 Production Guarantees rows); assigning or minting a row
  is a governance decision deferred to the first gate review rather than
  invented at draft time. Node transport security is core (decision 8)
  because the cluster cannot enforce its own trust boundary without it —
  unknown nodes must fail before MessageRouter adoption in every edition —
  while enterprise identity concerns (SSO, customer RBAC, tenancy, KMS) are
  about *tenant/operator-facing* policy and stay external. Baseline workload
  criteria for Q1/Q11: a pilot-relevant data-intensive workload (account
  summary is the standing candidate; event/observability/fraud/IoT acceptable
  substitutes) that exercises typed selector narrowing, inputs above one old
  batch, structured partials, more than one service operation, multiple
  partition hosts, and the public HTTP path, with result parity against an
  independent oracle and sealed dataset/generator digests. Gate relationships
  per the ladder above; Q1, Q2, Q3, Q7, Q11 are gates.
