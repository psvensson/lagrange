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
