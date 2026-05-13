# Release Gate LLM Preflight Template

Use this template before runtime implementation or a full distributed rerun in
a release-gate sprint. Fill it from canonical workflow tools first.

## Package

- Package:
- Sprint:
- Scenario:
- Latest artifact:
- Latest playback:
- Active package handoff artifact:
- Artifact freshness decision:

## Canonical Extractors

Run and summarize:

1. `npm run work:evidence-summary -- <artifact>`
2. `npm run analyze:priority-recovery-residuals -- <artifact> --markdown`
3. `npm run analyze:topology-convergence -- <artifact> --explain priority_recovery_partition_progress`
4. `npm run analyze:topology-convergence -- <artifact> --explain active_gate_snapshot_coverage`
5. `npm --silent run analyze:causal-model -- <artifact>`
6. `npm run analyze:distributed-failure -- --report <artifact>`
7. `npm run work:dirty-scope`

Record any raw JSON, raw log, or ad hoc `jq` fallback here, including the
canonical extractor that was insufficient and why.

## First Frontier Decision

- Evidence-summary first frontier:
- Causal-model critical path:
- Distributed-failure dominant reason:
- Priority-recovery residual count:
- Priority-recovery topology decision:
- Active-gate topology decision:
- Decision: `priority-recovery-actionable` |
  `priority-recovery-stale-or-subordinate` | `active-gate-first-frontier` |
  `contradictory-evidence`

## State And Progress Review

For each current state or wait, record entry condition, progress signal,
retry/wake path, timeout/migration path, owning module, and focused proof:

| State or wait | Entry | Progress | Retry/wake | Timeout/migration | Owner | Proof |
| --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |

## Diff Risk Review

Classify each dirty entry as `package-owned`, `sprint-owned`,
`tracker-generated`, `unrelated-ignore`, `blocking-risk`, or `split-required`.

| File | Classification | Reason | Action |
| --- | --- | --- | --- |
|  |  |  |  |

## Activation Result

- Package to activate:
- Packages to supersede or leave parked:
- Focused fixtures/tests before full rerun:
- Static guardrails:
- Full scenario rerun command:
- Same-frontier fallback:
- Owner-boundary migration fallback:

## Agent Result

- Agent identity:
- Review result:
- Fix result, if any:
- Implementation result, if any:
- Final recommendation:
