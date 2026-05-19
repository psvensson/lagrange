# Oversized Semantic Helper Extraction

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-19",
  "lane": "lightweight-maintenance",
  "scenario": "none",
  "artifact": "none",
  "playback": "none",
  "owner": "workflow_tooling_owner",
  "boundary": "file_size_extraction",
  "dominantReason": "oversized_file_ratchet",
  "currentState": "Seven gpt-5.3-codex-spark-sized helper extractions are retained behind existing oversized segment entrypoints; parent discarded one unified-rebalancer extraction after focused proof regressed and tightened workflow guidance so future oversized extraction candidates require semantic helper and package filenames with no digit characters.",
  "nextAction": "Close this validated semantic-helper batch after proof, then queue the next disjoint oversized-file extraction batch from npm run work:oversized-next -- --markdown using semantic helper/package names with no digit characters.",
  "proof": [
    "npm run audit:owner-boundary-segments -- src/rebalancer/operation-workflow-owner-segment-6.js src/admin/admin-websocket-api-segment-3.js src/cdc/cdc-integration-service-segment-3.js src/control-plane/replica-dispatch-service-segment-2.js src/rebalancer/operation-workflow-owner-segment-4.js src/cdc/cdc-integration-service-segment-2.js src/rebalancer/unified-rebalancer-segment-1.js",
    "node --check src/rebalancer/operation-workflow-owner-segment-6.js src/rebalancer/operation-workflow-priority-recovery-superseded-target-decision.js src/admin/admin-websocket-api-segment-3.js src/admin/admin-control-snapshot-query-result-helper.js src/cdc/cdc-integration-service-segment-3.js src/cdc/cdc-system-table-mutation-sql-helpers.js src/control-plane/replica-dispatch-service-segment-2.js src/control-plane/replica-dispatch-priority-recovery-retry-evidence.js src/rebalancer/operation-workflow-owner-segment-4.js src/rebalancer/operation-workflow-dispatch-wake-progress-decision.js src/cdc/cdc-integration-service-segment-2.js src/cdc/cdc-replica-operation-mutation-coalescing-key.js src/rebalancer/unified-rebalancer-segment-1.js src/rebalancer/priority-recovery-visibility-decision.js scripts/check-file-size-thresholds.js scripts/work-oversized-next.js scripts/work-subagent-prompt.js test/scripts/check-file-size-thresholds.test.js test/scripts/work-oversized-next.test.js",
    "npx eslint src/rebalancer/operation-workflow-owner-segment-6.js src/rebalancer/operation-workflow-priority-recovery-superseded-target-decision.js src/admin/admin-websocket-api-segment-3.js src/admin/admin-control-snapshot-query-result-helper.js src/cdc/cdc-integration-service-segment-3.js src/cdc/cdc-system-table-mutation-sql-helpers.js src/control-plane/replica-dispatch-service-segment-2.js src/control-plane/replica-dispatch-priority-recovery-retry-evidence.js src/rebalancer/operation-workflow-owner-segment-4.js src/rebalancer/operation-workflow-dispatch-wake-progress-decision.js src/cdc/cdc-integration-service-segment-2.js src/cdc/cdc-replica-operation-mutation-coalescing-key.js src/rebalancer/unified-rebalancer-segment-1.js src/rebalancer/priority-recovery-visibility-decision.js scripts/check-file-size-thresholds.js scripts/work-oversized-next.js scripts/work-subagent-prompt.js test/scripts/check-file-size-thresholds.test.js test/scripts/work-oversized-next.test.js",
    "npm test -- test/admin/admin-control-snapshot-response-contract.test.js test/cdc/cdc-integration-service.test.js test/cdc/cdc-integration-service.test-part-5.js test/control-plane/replica-dispatch-node-state-update.test-part-2.js test/rebalancer/operation-workflow-owner-decision.test.js test/rebalancer/operation-workflow-progress-event-driven-reentry.test.js test/rebalancer/priority-recovery-visibility-wakeup.test.js test/scripts/check-file-size-thresholds.test.js test/scripts/work-oversized-next.test.js",
    "npm run audit:runtime-grammar:file -- src/rebalancer/operation-workflow-owner-segment-6.js src/rebalancer/operation-workflow-priority-recovery-superseded-target-decision.js src/admin/admin-websocket-api-segment-3.js src/admin/admin-control-snapshot-query-result-helper.js src/cdc/cdc-integration-service-segment-3.js src/cdc/cdc-system-table-mutation-sql-helpers.js src/control-plane/replica-dispatch-service-segment-2.js src/control-plane/replica-dispatch-priority-recovery-retry-evidence.js src/rebalancer/operation-workflow-owner-segment-4.js src/rebalancer/operation-workflow-dispatch-wake-progress-decision.js src/cdc/cdc-integration-service-segment-2.js src/cdc/cdc-replica-operation-mutation-coalescing-key.js src/rebalancer/unified-rebalancer-segment-1.js src/rebalancer/priority-recovery-visibility-decision.js"
  ],
  "writeScope": [
    "src/rebalancer/operation-workflow-owner-segment-6.js",
    "src/admin/admin-websocket-api-segment-3.js",
    "src/cdc/cdc-integration-service-segment-3.js",
    "src/rebalancer/operation-workflow-priority-recovery-superseded-target-decision.js",
    "src/admin/admin-control-snapshot-query-result-helper.js",
    "src/cdc/cdc-system-table-mutation-sql-helpers.js",
    "src/control-plane/replica-dispatch-service-segment-2.js",
    "src/control-plane/replica-dispatch-priority-recovery-retry-evidence.js",
    "src/rebalancer/operation-workflow-owner-segment-4.js",
    "src/rebalancer/operation-workflow-dispatch-wake-progress-decision.js",
    "src/cdc/cdc-integration-service-segment-2.js",
    "src/cdc/cdc-replica-operation-mutation-coalescing-key.js",
    "src/rebalancer/unified-rebalancer-segment-1.js",
    "src/rebalancer/priority-recovery-visibility-decision.js",
    "scripts/check-file-size-thresholds.js",
    "scripts/work-oversized-next.js",
    "scripts/work-subagent-prompt.js",
    "test/scripts/check-file-size-thresholds.test.js",
    "test/scripts/work-oversized-next.test.js"
  ],
  "handoffFiles": [],
  "generatedFiles": [],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "src/rebalancer/operation-workflow-owner-segment-6.js",
    "src/admin/admin-websocket-api-segment-3.js",
    "src/cdc/cdc-integration-service-segment-3.js",
    "src/rebalancer/operation-workflow-priority-recovery-superseded-target-decision.js",
    "src/admin/admin-control-snapshot-query-result-helper.js",
    "src/cdc/cdc-system-table-mutation-sql-helpers.js",
    "src/control-plane/replica-dispatch-service-segment-2.js",
    "src/control-plane/replica-dispatch-priority-recovery-retry-evidence.js",
    "src/rebalancer/operation-workflow-owner-segment-4.js",
    "src/rebalancer/operation-workflow-dispatch-wake-progress-decision.js",
    "src/cdc/cdc-integration-service-segment-2.js",
    "src/cdc/cdc-replica-operation-mutation-coalescing-key.js",
    "src/rebalancer/unified-rebalancer-segment-1.js",
    "src/rebalancer/priority-recovery-visibility-decision.js",
    "scripts/check-file-size-thresholds.js",
    "scripts/work-oversized-next.js",
    "scripts/work-subagent-prompt.js",
    "test/scripts/check-file-size-thresholds.test.js",
    "test/scripts/work-oversized-next.test.js"
  ],
  "modelFit": {
    "packageClass": "bounded-implementation",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "boundedExperiment": {
    "hypothesis": "Independent Spark workers can extract semantically named helpers from oversized segment files without changing public entrypoints or runtime behavior, while failed slices are discarded instead of repaired into behavior changes.",
    "expectedMetric": "Each retained target records one semantic owner-boundary helper extraction and keeps syntax, import, lint, runtime grammar, decision-boundary, focused tests, and scoped diff checks green.",
    "inheritsFrom": "npm run work:oversized-next -- --markdown",
    "timebox": "24h",
    "mergeRequirement": "focused test plus canonical route or evidence command",
    "killRule": "Discard or split any slice that needs runtime behavior changes, cross-owner decisions, or files outside the exact batch scope."
  },
  "validationTier": "file-local",
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex-spark",
    "allowedDecisionDepth": "bounded local edit after owner, scope, proof, and forbidden files are named",
    "safeToExecuteWhen": [
      "owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared",
      "the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence",
      "the first focused proof gives a clear pass, fail, or escalate signal"
    ],
    "splitTriggers": [
      "write scope expands beyond the declared lower-model lane",
      "proof requires forbidden scope, cross-owner reasoning, or architecture route selection",
      "the implementation needs to decide system behavior instead of executing a named local mechanism"
    ],
    "childPackageCandidates": [
      "gpt-5.3-codex-spark extracts the priority recovery superseded-target decision helper from the operation workflow owner boundary",
      "gpt-5.3-codex-spark extracts the control snapshot query-result normalization helper from the admin websocket boundary",
      "gpt-5.3-codex-spark extracts the system-table mutation SQL helper from the CDC integration boundary",
      "gpt-5.3-codex-spark extracts the replica-dispatch priority recovery retry evidence helper from the control-plane boundary",
      "gpt-5.3-codex-spark extracts the operation workflow dispatch wake progress decision helper from the rebalancer boundary",
      "gpt-5.3-codex-spark extracts the CDC replica operation mutation coalescing key helper from the CDC boundary",
      "gpt-5.3-codex-spark extracts the priority recovery visibility decision helper from the unified rebalancer boundary",
      "parent updates oversized workflow tooling so future package/helper names require semantic concerns and no digit characters"
    ]
  }
}
-->

## Why

The repository still has many oversized source/test files and owner-boundary
segment candidates. This batch keeps the low-cost path concrete: split large
segment files into independent Spark-sized semantic helper extractions, keep
public entrypoints stable, discard slices whose focused proof regresses, and
validate locally before queuing the next batch.

## Scope Basis

Maintenance ratchet from `npm run work:oversized-next -- --markdown`; no
roadmap behavior or runtime ownership decision changes.

## Workflow Lane

- Selected lane: `lightweight-maintenance`
- Why this lane is sufficient: bounded workflow/tooling scope unless changed.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Status: `not-needed` because this package does not change runtime, scenario, or shared contract decisions.

## Bounded Experiment

- Hypothesis: Independent Spark workers can extract semantically named helpers from oversized segment files without changing public entrypoints or runtime behavior.
- Expected metric: Each retained target records one semantic owner-boundary helper extraction and keeps syntax, import, lint, runtime grammar, decision-boundary, focused tests, and scoped diff checks green.
- Inherits from: `npm run work:oversized-next -- --markdown`
- Timebox: `24h`
- Validation tier: `file-local`
- Merge requirement: focused test plus canonical route or evidence command
- Kill rule: Discard or split any slice that needs runtime behavior changes, cross-owner decisions, or files outside the exact batch scope.
- Subagent sequencing is optional before implementation; use post-hoc review before merge when runtime behavior changed.

## Expected Representative Delta

- Baseline artifact: `none`
- Expected delta: no representative runtime evidence should change; this is a maintenance ratchet.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result when a scenario drives the work.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction triggers architecture or human escalation instead of another local patch.

## Rerun Decision Gate

- Source artifact: `none`
- Route owner: `workflow_tooling_owner`
- Route boundary: `file_size_extraction`
- Route dominant reason: `oversized_file_ratchet`
- Route causal outcome: `pending-before-rerun`
- Stop mode: `pending-before-rerun`
- Next lane: `lightweight-maintenance`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, and pre-implementation validation when representative evidence is involved.

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `not-needed-inline-gate`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Keep classification inside the package unless route truth changes.
- Successor action: `update-current-package`
- Runtime promotion rule: Stable owner/boundary routes move to runtime-owner-boundary work.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

- Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
- Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
- Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
- Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
- Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Workflow Acceleration Contract

- Use `npm run work:advance -- --check` before adding more package prose; it combines doctor, subagent-next, and entry/pre-implementation validation.
- Keep the durable proof ladder compact by default: prefer the representative route command when representative evidence exists, one focused test or extractor, and validation. Add static guardrails only when implementation files changed.
- If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or present a human gate.
- Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
- For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.
- Oversized extraction names new files for the semantic concern they own; never use digit characters or derive a new helper or package filename from segment, stage, part, or batch ordinals.

## In Scope

- `src/rebalancer/operation-workflow-owner-segment-6.js`
- `src/rebalancer/operation-workflow-priority-recovery-superseded-target-decision.js`
- `src/admin/admin-websocket-api-segment-3.js`
- `src/admin/admin-control-snapshot-query-result-helper.js`
- `src/cdc/cdc-integration-service-segment-3.js`
- `src/cdc/cdc-system-table-mutation-sql-helpers.js`
- `src/control-plane/replica-dispatch-service-segment-2.js`
- `src/control-plane/replica-dispatch-priority-recovery-retry-evidence.js`
- `src/rebalancer/operation-workflow-owner-segment-4.js`
- `src/rebalancer/operation-workflow-dispatch-wake-progress-decision.js`
- `src/cdc/cdc-integration-service-segment-2.js`
- `src/cdc/cdc-replica-operation-mutation-coalescing-key.js`
- `src/rebalancer/unified-rebalancer-segment-1.js`
- `src/rebalancer/priority-recovery-visibility-decision.js`
- `scripts/check-file-size-thresholds.js`
- `scripts/work-oversized-next.js`
- `scripts/work-subagent-prompt.js`
- `test/scripts/check-file-size-thresholds.test.js`
- `test/scripts/work-oversized-next.test.js`

## Out Of Scope

- Runtime ownership changes.
- Files outside the exact batch scope above.
- The discarded unified-rebalancer planning extraction; focused proof regressed and the slice is not retained.

## Model Fit

- Package class: `bounded-implementation`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `medium`
- Owned files: the exact files listed in scope.
- Forbidden files: everything outside the exact batch-owned files.
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run audit:owner-boundary-segments -- ...`, `node --check ...`, `npx eslint ...`, `npm test -- ...`, `npm run audit:runtime-grammar:file -- ...`, `node scripts/check-guideline-decision-boundaries.js ...`, `npm run work:validate -- --entry work/packages/active-oversized-semantic-helper-extraction.md`, `npm run work:validate -- --pre-impl work/packages/active-oversized-semantic-helper-extraction.md`, and scoped `git diff --check`.
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex-spark`
- Allowed decision depth: bounded local edit after owner, scope, proof, and forbidden files are named
- Safe to execute when: owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared; the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence; the first focused proof gives a clear pass, fail, or escalate signal.
- Split or escalate when: write scope expands beyond the declared lower-model lane; proof requires forbidden scope, cross-owner reasoning, or architecture route selection; the implementation needs to decide system behavior instead of executing a named local mechanism.
- Candidate lower-model child packages: the seven retained helper extractions listed in scope plus the parent workflow-tooling naming guardrails.

## Execution Evidence

Preferred closure evidence for new packages. Agent identity is optional provenance; implementation proof, scope, status, and parent revalidation are blocking.
Use legacy subagent ledgers only when the package explicitly requires sequenced subagents.
If review directly fixes metadata-only findings, record `review-fixed-metadata-only` as execution evidence and continue without a separate fix package.

- [ ] review: status: not-needed; evidence: lane permits direct implementation or package review found no required fix; next: implementation.
- [x] implementation: status: validated; evidence: gpt-5.3-codex-spark workers extracted semantically named helpers for operation workflow owner segment 6, admin websocket API segment 3, CDC integration service segment 3, replica dispatch service segment 2, operation workflow owner segment 4, CDC integration service segment 2, and unified rebalancer segment 1; parent discarded the unified-rebalancer segment 5 slice after `test/rebalancer/unified-rebalancer.test-part-5-5.js` regressed; parent added no-digit semantic naming guardrails to oversized workflow tooling; parent revalidated focused proof: yes; next: close this batch after proof, then queue the next oversized extraction batch.
- [ ] repair: status: not-needed; evidence: no generated current-blocker or Current Edge Card changes were needed for this standalone maintenance batch; next: validation.

## Validation

- PASS - First retained batch: owner-boundary audit, syntax, ESLint, dynamic import, runtime grammar, decision-boundary scan, workflow prompt/tool checks, focused tests, package validation, package doctor, and scoped diff check were green.
- PASS - Second retained batch: focused tests passed 347/347 for CDC integration part 5, replica dispatch node-state update part 2, operation workflow owner decision, operation workflow progress reentry, and priority recovery visibility wakeup.
- PASS - Parent review fixed raw numeric literals in `src/cdc/cdc-replica-operation-mutation-coalescing-key.js` and import shape in `src/rebalancer/priority-recovery-visibility-decision.js`, then rechecked syntax, dynamic imports, and ESLint for the affected helpers.
- PASS - Final combined focused validation passed 479/479 after package reconciliation and the semantic naming-rule test fix.
- PASS - `npm run work:model-ledger -- record ...` recorded the Spark-sized helper extraction outcome.
- Discarded - unified-rebalancer segment 5 extraction because `npm test -- test/rebalancer/unified-rebalancer.test-part-5-5.js` regressed 3 assertions.
