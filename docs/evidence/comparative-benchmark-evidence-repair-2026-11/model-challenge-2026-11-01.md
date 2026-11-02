---
audience: evidence
recorded: 2026-11-02
quest: comparative-benchmark-evidence-repair
---

# Model challenge (verification protocol phase 3), 2026-11-01

Read-only challenger run against the design note and the base-commit code before stream evidence
was written. Findings folded into the implementer briefs the same hour; the headline items are
binding amendments to `chain-design.md`.

## Headline amendments

1. `oltp-paired-sweep-runner.js` is NOT a reusable owner as it stands: it substitutes
   `{committed:true}` when no executor is supplied (:240-246), fabricates `p50:p99, p95:p99`
   (:438-446), carries a hard-coded commit `ea537171a…`, `0.3.0`, a fixed `recordedAt`
   (:419-436,478,486), `?? 0` fallbacks (:24-51,63) and a version-gate cache that returns a cached
   record with `skipped:true` instead of running (:176-199). It is rewritten in stream B1: delete
   every substitute/fallback; a skipped run is a typed `not-measured` cell, never a cached number.
2. `oltp-open-loop-step-owner.js:237-248` records `succeeded` for any resolved promise. The outcome
   owner wraps `adapter.executeTransaction`; the step owner consumes the typed outcome; `Promise.all`
   (:262) must be replaced by a settle path that can be aborted by the watchdog and still summarise
   (`unissued`/`unresolved`). Because this adds accounting states, the open-loop profile is
   superseded explicitly to `scenario-a-open-loop-v2` with the reason recorded (R09), not mutated.
3. Record v2 gains binding fields: `endpoint.containerId` per arm (listener owner from the container
   network namespace), `executedOperationsDigest` over the ordered issued operations (the planner
   digest covers the whole plan, not the slice a rate executes), and a MANDATORY post-run
   `correctness.finalState` snapshot (`collectOltpStateSnapshot`, all nine tables) with reconciliation
   deltas (`Δorders == committed new-orders`, `Δhistory == committed payments`,
   `Δnew_order == committed new-orders − Σ delivered`). Admission refuses a Scenario A cell missing
   any of them.
4. Three arms: `oltp-scenario-a-comparison-systems.js` gains `POSTGRESQL`; the semantic gate and the
   sweep plan generalise to N systems with recorded order (plan superseded to
   `scenario-a-paired-sweep-v2`); `semanticGate: null` is refused for Scenario A claims.

## Further findings (owner -> stream)

- Affected-row checks are partial in `oltp-baseline-transaction-executor.js` (only
  CUSTOMER_PAYMENT checks rowCount; DISTRICT_SET_NEXT_ORDER, STOCK_UPDATE, ORDER_LINE_INSERT,
  DELIVERY_* unchecked; Lagrange adapter defaults missing rowCount to 0) -> B1.
- `25P04` (definite rollback) is flattened into `commitOutcomeUnknown` with `08007`; socket error
  codes (`EPIPE`, `ETIME`, `ENXIO`, `EBUSY`) match the retry owner's SQLSTATE regex -> B1
  (`product_error` vs `unresolved` vs `transport_failure`; add `harness_fault` for overlapping
  dispatch).
- Delivery commits with zero effect; order-status returns `{orderId:null}` committed -> B1 (effect
  summary per request; reconciliation with final state).
- Empty latency arrays yield 0 (`oltp-baseline-workload.js:301-311`) -> B1/A (`null` + status).
- `errorRate` denominator ignores `unresolved` -> B1.
- Fresh dataset per rate is impossible in place on Lagrange (`DROP TABLE` unsupported) ->
  record `dataset.resetMethod`; smoke uses one fresh formation per arm -> B1/B2.
- Load-generator identity (host, node version, pg/mysql2 versions) and off-data-path proof;
  imageId inspected before AND after the window; `events[]` (restarts via `State.StartedAt`, tc
  apply time, lock loss); `closure` for teardown; `deployment.roles` must include the PG-wire
  listener host -> B2.
- Dataset verification must compare a product-content snapshot digest, not generator-vs-generator
  -> B1 (comparator) / B2 (invocation).
- Gate tallies self-reported status; proof records carry no deployment binding; a failed Lagrange
  proof throws before writing (-> `missing`, not `failed`) -> B1/A.
- Statistical sufficiency: minimum committed count for any capacity metric, dispersion across
  repetitions, `insufficient-samples` with `null` metrics; a 100-op smoke may claim only
  "canonical workload executed end-to-end, per-request correctness, complete accounting" -> A.
- Vocabulary: one status owner imported everywhere (hyphen spelling); map `refused` -> `blocked`;
  a campaign of only non-valid cells must not exit 0 as passed (`scenario-outcome.js:427-434`);
  cell vs operation vs gate vs scenario mapping table -> A.
- Duplicate claimKey without a ledger entry -> `invalid-measurement: duplicate-claim` -> A.
- Watchdog must be derived from the product timing ladder (engine 30 s + unknown-outcome
  redelivery + 3 retries) and recorded; a request completing after the watchdog stays
  `unresolved` while the final-state reconciliation may still show it committed -> B1.

## Adversarial acceptance tests the original design would not have caught

1. Wrong container did the work (a leftover cluster's listener answers campaign B's discovery).
2. Committed set never reconciled with state (acks for 100, state grew by 70).
3. Right plan digest, wrong executed operations (all reads, every request committed).
