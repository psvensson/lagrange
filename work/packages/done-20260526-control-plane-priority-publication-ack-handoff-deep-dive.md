# Control-Plane Priority Publication & ACK Handoff Deep Dive

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-26",
    "lane": "discovery",
    "scenario": "none",
    "artifact": "none",
    "playback": "none",
    "owner": "control-plane-publications",
    "boundary": "publication-convergence",
    "dominantReason": "priority-spread-pending",
    "currentState": "Scaffolded for priority publication and ACK handoff deep dive.",
    "nextAction": "Investigate priority publication spread and ACK handoff logic",
    "closed": "2026-05-26"
  },
  "scope": {
    "writeScope": [
      "work/packages/active-20260526-control-plane-priority-publication-ack-handoff-deep-dive.md"
    ],
    "handoffFiles": [],
    "generatedFiles": [],
    "candidateRuntimeFiles": [],
    "commitScope": [
      "work/packages/active-20260526-control-plane-priority-publication-ack-handoff-deep-dive.md",
      "work/sprints/active-2026-q2-rolling-restart-investigation.md",
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "This package advances the active sprint goal with focused proof."
  },
  "modelFit": {
    "packageClass": "discovery-framing",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "outputProfile": "medium",
    "ambiguityScore": 1,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [],
    "theoryLedger": "no-ledger-update",
    "proof": {
      "commands": [
        "regression: npm run work:advance -- --check"
      ]
    },
    "implementation": {
      "parentRevalidatedFocusedProof": true,
      "filesChanged": []
    },
    "verificationFix": {
      "parentRevalidatedFocusedProof": true
    }
  },
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
      "Prefer mechanical-maintenance for docs/templates/schema-only edits.",
      "Prefer test-only-proof for tests that do not change runtime behavior.",
      "Prefer bounded-experiment for one same-owner hypothesis with inherited context."
    ]
  },
  "theoryLedger": "no-ledger-update",
  "implementation": {
    "parentRevalidatedFocusedProof": true,
    "filesChanged": []
  },
  "verificationFix": {
    "parentRevalidatedFocusedProof": true
  },
  "commitAndPushLedgerRequired": true
}
-->

## Why

Sequential rolling restarts cause connection teardowns and re-establishments, during which transient plan and ACK updates are delayed or lost. The rebalancer coordinator stalls under load due to an unresolved `priority_control_plane_spread_pending` wait. This package owns the deep dive into why priority spreads fail to settle and why the readiness service tests have failing assertions.

## Scope Basis

Approved maintenance scope for option A of q2 rolling restarts.

## Workflow Lane

- Selected lane: `discovery`
- Why this lane is sufficient: bounded workflow/tooling scope unless changed.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.


## Core Logic Brief

- Canonical outcome: control-plane-publications / publication-convergence emits the diagnostic findings for the active rolling restart stall and readiness service failures.
- Inputs/signals: test/control-plane/control-plane-readiness-service-part-4-stage-4.js, test/control-plane/control-plane-readiness-service-part-4-stage-1.js.
- State model or invariant: Excluded target nodes must stay in recovery mode by asserting publication_epoch_pending, and settled publications must successfully mark the gate ready.
- Non-goals and forbidden interpretations: This package is a classification-only deep dive in the discovery lane and does not modify runtime or test files directly.
- Proof mapping: Local proof validation via `npm run work:advance -- --check` must pass.
- Wrong-slice trigger: Split or escalate if the work requires changing runtime files under this discovery lane package.

### 1. ACK Carry Logic & Rolling Restart Stalls

- **Carry Rules**: In `src/control-plane/membership-publication-target-selection.js`, `resolveMembershipPublicationAcknowledgedNodeIds` uses `MEMBERSHIP_PUBLICATION_ACK_CARRY_RULES` to merge observed ACKs.
- **Carry Eviction**: If `publicationChanged === true` (triggered by sequential node resets, epoch increments, or topology modifications), the carry rule falls back to `OBSERVED_ACK`. This causes the coordinator to drop pre-acknowledged recovery-active nodes from the acknowledged cohort.
- **Stall Mechanism**: Under high load and frequent rolling sequential restarts, this eviction clears out caught-up recovery nodes and restarts ACK collection from scratch. Since connections tear down and transient ACKs are delayed or lost, ACK accumulation fails to satisfy the quorum, resulting in permanent `priority_control_plane_spread_pending` wait states in `src/rebalancer/operation-workflow-recovery-reconcile-dispatch-pending.js`.

### 2. Readiness Service Diagnostic Failures
Our deep-dive identified two critical design flaws in `ControlPlaneReadinessService` that caused five test failures across the readiness service tests:
- **Target Node Exclusion Diagnostics**:
  - `buildMembershipPublicationDiagnostics(row, observedAt)` calls `buildPublicationRecoveryProtocolSnapshot(row)` with NO options parameter, leaving `targetNodeId` as `undefined`.
  - Because `targetNodeId` is `undefined`, `isTargetNodeExcludedFromPublishedMembership` returns `false`, preventing the diagnostics snapshot from populating `publication_epoch_pending` in the priority recovery reason codes.
  - When `buildMissingNodeReadiness` evaluates readiness, it relies on this diagnostic object where `targetNodeId` is missing, hiding node exclusion.
- **Priority Spread and Ready Gate Evaluation Precedence**:
  - In `src/control-plane/publication-recovery-gate.js`, `resolvePublicationPending` incorrectly prioritized standard publication status flags over derived recovery states:
    ```javascript
    if (hasPublicationStatusPendingMeaning(publicationStatusNormalized)) {
      return publicationStatusNormalized !== CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED;
    }
    ```
  - When the publication status was `'PUBLISHED'`, it immediately returned `false` (meaning publication is not pending), ignoring that the `recoveryProtocolState` was `'publication_pending'` due to target node exclusion.
  - This prevented `publication_epoch_pending` from remaining active when the target node was excluded, breaking recovery-mode invariants.
  - Conversely, when `recoveryProtocolState` was `'unpublished_observation'` and status was `'PUBLISHED'`, placing `recoveryProtocolState` checks too early incorrectly reopened recovery gates.

### 3. Elegant Precedence Correction
To solve both readiness test sets perfectly, the precedence in `resolvePublicationPending` must be corrected so that `recoveryProtocolState === PUBLICATION_PENDING` (which is target-node aware) is checked *before* `hasPublicationStatusPendingMeaning`, while keeping `'unpublished_observation'` evaluated after to avoid false reopens:
```javascript
function resolvePublicationPending(options = {}) {
  const ackClosureSatisfied = options.ackClosureSatisfied === true;
  const publicationStatusNormalized = normalizePublicationStatus(options.publicationStatus);
  if (publicationStatusNormalized === CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING) {
    return ackClosureSatisfied !== true;
  }
  const recoveryProtocolState = normalizeOptionalString(options.recoveryProtocolState);
  if (recoveryProtocolState === RECOVERY_PROTOCOL_STATE.PUBLICATION_PENDING) {
    return ackClosureSatisfied !== true;
  }
  if (hasPublicationStatusPendingMeaning(publicationStatusNormalized)) {
    return publicationStatusNormalized !== CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED;
  }
  if (recoveryProtocolState === RECOVERY_PROTOCOL_STATE.UNPUBLISHED_OBSERVATION) {
    return ackClosureSatisfied !== true;
  }
  const reasonCodes = Array.isArray(options.reasonCodes) ? options.reasonCodes : [];
  return reasonCodes.includes(CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PUBLICATION_EPOCH_PENDING) && ackClosureSatisfied !== true;
}
```
This guarantees that excluded target nodes correctly project `publication_epoch_pending` and remain in recovery mode, while settled publications successfully mark the gate ready.

## Expected Representative Delta

- Baseline artifact: `none`
- Expected delta: Completed classification-only diagnostic deep dive under the discovery lane. No runtime files are modified under this package. Local proof validates successfully.

## Rerun Decision Gate

- Source artifact: `none`
- Route owner: `control-plane-publications`
- Route boundary: `publication-convergence`
- Route dominant reason: `priority-spread-pending`
- Route causal outcome: `pending-before-rerun`
- Stop mode: `pending-before-rerun`
- Next lane: `discovery`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, and pre-implementation validation.

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `not-needed-inline-gate`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Keep classification inside the package unless route truth changes.
- Successor action: `update-current-package`
- Runtime promotion rule: Stable owner/boundary routes move to runtime-owner-boundary work.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Workflow Acceleration Contract

1. Use `npm run work:advance -- --check` before adding more package prose; it combines doctor, subagent-next, and entry/pre-implementation validation.
2. Keep the durable proof ladder to 3-5 commands by default: prefer `npm run work:scenario-route -- <artifact>` for representative routing, one focused test or extractor, and validation. Add static guardrails only when implementation files changed.
3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or open/select an autonomous architecture experiment. Human gates are only for blocked/contradictory evidence.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. Focused package-owned edit.

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `discovery-framing`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `medium`
- Owned files: `work/packages/<this-package>.md`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:advance -- --check`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex-spark`
- Allowed decision depth: bounded local edit after owner, scope, proof, and forbidden files are named
- Safe to execute when:
1. owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared
2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
3. the first focused proof gives a clear pass, fail, or escalate signal
- Split or escalate when:
1. write scope expands beyond the declared lower-model lane
2. proof requires forbidden scope, cross-owner reasoning, or architecture route selection
3. the implementation needs to decide system behavior instead of executing a named local mechanism
- Candidate lower-model child packages:
1. Prefer mechanical-maintenance for docs/templates/schema-only edits.
2. Prefer test-only-proof for tests that do not change runtime behavior.
3. Prefer bounded-experiment for one same-owner hypothesis with inherited context.


## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.

- [x] action: implementation; owner: antigravity; files-changed: work/packages/active-20260526-control-plane-priority-publication-ack-handoff-deep-dive.md; validation: npm run work:validate -- --pre-impl: yes; parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: antigravity; files-changed: none; validation: npm run work:validate -- --pre-impl: yes; parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: `npm run work:repair`; outcome: validated.

## Validation

1. `git diff --check -- <files>`

## Commit And Push Ledger

1. Focused package commit: a9e0ddf74448c4a373adf8cce5f504f70abe416f
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
