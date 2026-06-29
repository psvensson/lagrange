---
id: rolling-restart-liveness-observatory
roadmapRow: RM-0.1-fs-rolling-restart
status: sharpening
graduatesTo: topology-convergence-hardening
---

# Epic: Rolling restart liveness observatory

## Intent

The run4 evidence shows safety-clean rolling-restart failures where the cluster
stalls before the harness deadline. That does not prove the run would have
converged with more time, and it also does not prove the mechanism is dead. This
epic reframes the next work around success metrics: build a deterministic
classifier/emulator that can say which owner action was enabled, whether it
executed, whether its result became visible, and whether any concrete progress
continued after the budget expired.

The output is not a faster rolling-restart run. The output is an honest,
replayable liveness verdict for failed samples, so future fixes and statistical
gates start from mechanism evidence instead of longer timeouts.

## Success model

Current gate result:

- `rolling-restart-run4-drain-residual` remains open.
- `stat-gate-20260629T045155Z` is mixed: run1 stalled on
  `publication_missing_active_node`, run2 passed.
- The failed run is safety-clean and includes `owner_reconcile_enqueued`,
  `ownerQueue=3`, and `cdcLag=517`, but enqueue plus backlog is not a progress
  proof.

This epic's success metric is a structured verdict, not pass/fail before a
deadline. A positive liveness verdict requires a post-action progress witness:
queue or in-flight depth decreasing, reconcile execution starting or completing,
publication epoch or readback changing, `missingPublished` shrinking, or CDC lag
decreasing across timestamps. Without such a witness, the classifier must emit a
stuck or insufficient-evidence verdict.

## Verdict taxonomy

- `observed_progressing_budget_exhausted` - an owner action was enabled or
  executed, and a later progress witness shows the system was still advancing
  when the budget ended.
- `stuck_no_enabled_action` - the missing convergence step has no observed owner
  obligation, scheduled wake, or retry path.
- `stuck_enabled_action_not_executed` - the owner obligation was scheduled or
  enqueued, but no execution is observed in the evidence window.
- `stuck_executed_no_visibility` - the owner action executed, but the durable
  publication/readback/projection did not advance.
- `stuck_downstream_workflow_progress` - publication visibility is not the
  current blocker; drain or replica-operation workflow progress is the remaining
  liveness boundary.
- `insufficient_evidence` - the available report bundle cannot distinguish the
  boundary honestly; the verdict must name the missing evidence.

Every verdict should include the owner, boundary, enabled action, last progress
timestamp, queue state, publication delta, and evidence path.

## Active Quest

- `rolling-restart-liveness-emulation` - implement and prove the
  classifier/emulator with fixtures for the latest `publication_missing_active_node`
  stall and at least one known drain/in-flight stall.

This Quest does not mutate the sealed doneWhen of
`rolling-restart-run4-drain-residual`, does not close any product stability claim,
and does not replace the statistical gate. It creates the below-gate success
model used before the next expensive certification run.

## First frontier: publication liveness emulation

Scope:

- active-gate reconcile owner
- membership-publication coordinator queue
- owner wake, queue admission, queue drain, and retry
- publication write/readback visibility

Acceptance shape:

- Given `test-output/reports/stat-gate-20260629T045155Z-run1.report.json`, the
  analyzer/emulator emits one verdict from the taxonomy.
- The verdict may not be `observed_progressing_budget_exhausted` unless it cites
  a concrete post-enqueue progress witness.
- A red fixture asserts that `owner_reconcile_enqueued` plus nonzero owner queue
  depth is not enough to classify a run as progressing.
- Deterministic fixtures cover both a slow-progressing case and a true stuck
  case.

## Second frontier: drain and in-flight progress model

Once publication classification is honest, extend the same evidence model to a
known drain/in-flight stall. The target is to distinguish downstream workflow
progress from a stuck downstream boundary, not to discount
`replica_operations_in_flight` or convert timeout into success.

## Starting artifacts

Consult or link these before implementation:

- `solve/quests/rolling-restart-run4-drain-residual.json`
- `test-output/reports/stat-gate-20260629T045155Z.md`
- `test-output/reports/stat-gate-20260629T045155Z-run1.report.json`
- `test-output/reports/stat-gate-20260629T045155Z-run2.report.json`
- `scripts/analyze-topology-convergence.js`
- `test/scripts/analyze-topology-convergence.test.js`
- `test/scripts/__fixtures__/topology-convergence/publication-active-gate-reduced-handoff.fixture.json`
- `test/scripts/__fixtures__/topology-convergence/priority-workflow-timeout-transition-deferred.fixture.json`
- `test/scripts/__fixtures__/topology-convergence/priority-workflow-progress-recovering-in-flight.fixture.json`
- `test/distributed/harness/publication-evidence-replay.js`
- `scripts/analyze-monotone-drain.js`
- `docs/deterministic-directed-testing-plan.md`
- `test/distributed/harness/README.md`

## Guardrails

- Do not claim a failed run would have converged from timeout extension alone.
- Do not use gate retries as the iteration loop; mechanism classification is a
  deterministic question.
- Do not treat sparse playback absence as proof an action did not run; use full
  logs or emit `insufficient_evidence`.
- Do not classify enqueue, backlog, or retry scheduling as progress unless a
  later progress witness exists.
- Do not mutate the run4 Quest's sealed metric or closure bar.

## Decision log

- 2026-06-29 - Epic authored after run4 review reframed the next work from
  efficiency to success metrics and liveness classification. Subagent review
  tightened the positive verdict to require observed post-action progress and
  recommended the six-way taxonomy above.
