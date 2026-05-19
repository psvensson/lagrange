# Topology Publication Pressure Stability Runtime

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-18",
  "lane": "runtime-owner-boundary",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-after-pressure-stability-20260519T050912Z/rolling-restart/",
  "owner": "topology_publication_owner",
  "boundary": "publication_pressure_stability",
  "dominantReason": "pressure_deferred",
  "currentState": "Focused pressure proof is green, but the fresh representative rerun did not surface pressure_deferred or reduce the frontier: rolling-restart remains red at topology_publication_owner / publication_convergence / publication_pending with publication OPEN, publishedActive=1/5, missingPublished=4, active=0/5, snapshotCoverage=2/5, and four owner-reconcile nodes.",
  "nextAction": "Close this package as same-frontier/architecture-stop and record an architecture decision gate before any further local runtime patch on publication_convergence.",
  "proof": [
    "npm test -- test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-recovery-evidence.test.js",
    "npm run work:validate -- --pre-impl"
  ],
  "writeScope": [
    "src/control-plane/publication-owner-constants.js",
    "src/control-plane/publication-owner-evidence.js",
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/publication-owner-state.js",
    "src/control-plane/publication-recovery-gate.js",
    "src/control-plane/publication-recovery-evidence.js",
    "test/control-plane/publication-recovery-gate.test.js",
    "test/control-plane/publication-recovery-evidence.test.js",
    "work/packages/done-20260518-topology-publication-pressure-stability-runtime.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-after-priority-observation-narrowing-20260518T184535Z.report.json",
    "test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json",
    "test-output/reports/.playback/rolling-restart-after-pressure-stability-20260519T050912Z/rolling-restart/triage-summary.md",
    "work/packages/active-20260518-topology-publication-no-debt-handoff-runtime.md"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "src/control-plane/publication-owner-constants.js",
    "src/control-plane/publication-owner-evidence.js",
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/publication-owner-state.js",
    "src/control-plane/publication-recovery-gate.js",
    "src/control-plane/publication-recovery-evidence.js",
    "test/control-plane/publication-recovery-gate.test.js",
    "test/control-plane/publication-recovery-evidence.test.js",
    "work/packages/done-20260518-topology-publication-pressure-stability-runtime.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "modelFit": {
    "packageClass": "pressure-stability-runtime",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "bounded-owner-runtime/pressure-stability",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "representativeResidual": {
    "status": "same-frontier",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "publication_pending",
    "nextAction": "Open a causal-escalation architecture package before any further local publication_convergence runtime patch."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json",
    "routeOwner": "topology_publication_owner",
    "routeBoundary": "publication_convergence",
    "routeDominantReason": "publication_pending",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "same-frontier",
    "nextLane": "causal-escalation",
    "expectedDelta": "Pressure_deferred did not appear in representative routing and no green/reduced/migrated outcome occurred; the next step is an architecture decision gate for the repeated publication_convergence / publication_pending frontier before another local runtime patch.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:current-blocker -- --write",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "topology_publication_owner",
    "fromBoundary": "publication_convergence",
    "toOwner": "topology_publication_owner",
    "toBoundary": "publication_pressure_stability",
    "reason": "The package is a bounded support-role slice for the current publication_convergence frontier: it adds explicit pressure-deferred owner grammar without changing the canonical representative owner.",
    "evidence": "test-output/reports/rolling-restart-after-priority-observation-narrowing-20260518T184535Z.report.json has zero publication ACK and missing-published debt while downstream evidence reports authoritative_control_snapshot_query_pressure; focused proof command: npm test -- test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-recovery-evidence.test.js."
  },
  "causalGovernance": {
    "hypothesis": "Pressure must be a first-class topology publication owner outcome instead of being inferred from stale publication_pending, ACK, or missing-published evidence.",
    "stopConditionCheck": "Focused pressure projection tests plus npm run analyze:causal-model on the fresh artifact must prove pressure_deferred blocks readiness, carries retry/coalescing metadata, and does not reopen publication debt.",
    "expectedCausalModelChange": "Future representative routing can distinguish publication debt from pressure-deferred publication owner state.",
    "representativeOutcome": "same-frontier",
    "causalDebt": "The fresh representative rerun did not expose pressure_deferred in the publication owner route. It returned to topology_publication_owner / publication_convergence / publication_pending with publication OPEN, missingPublished=4, and owner_reconcile_pending; local pressure grammar alone did not move the representative frontier.",
    "crossBoundaryReview": "Do not patch startup active-gate, readiness, admission, or timeout paths in this package; pressure is recorded only in the publication owner/gate evidence grammar."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart publication pressure stability proof",
    "phaseChain": [
      "fresh evidence reduced publication ACK and missing-published debt to zero",
      "focused proof added explicit pressure_deferred publication owner/gate grammar",
      "fresh representative rerun returned to publication_convergence / publication_pending with OPEN publication and missingPublished=4"
    ],
    "currentFirstFrontier": "publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending in test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json.",
    "knownDownstreamBlockers": [
      "startup active-gate snapshot coverage blocked at 2/5",
      "owner_reconcile_pending for four publication nodes",
      "priority residual extractor reports four operation_workflow_owner / rebalancer_handoff retry_scheduled witnesses"
    ],
    "missingCausalEdge": "The representative route keeps oscillating inside publication_convergence; architecture must decide whether OPEN publishing, active-gate owner reconcile, and rebalancer handoff pressure are one cross-boundary loop before another local publication runtime patch.",
    "missingCausalEdgeProbe": "npm test -- test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-recovery-evidence.test.js",
    "boundedProgressProof": "Bounded pressure-defer projection proof only: focused owner/gate tests verify retry/coalescing metadata and no synthetic publication debt; the representative rerun stayed same-frontier.",
    "boundedProgressProofArtifact": "work/packages/done-20260518-topology-publication-pressure-stability-runtime.md",
    "expectedObservableTransition": "Focused pressure_deferred grammar landed, but representative routing did not observe the pressure transition.",
    "maxProgressBound": "one bounded pressure-stability runtime slice before representative rerun or successor routing",
    "sameFrontierFallback": "If a fresh representative rerun still routes as publication_pending with no pressure-specific classification or metric reduction, stop for architecture or human escalation.",
    "expectedNextFrontier": "architecture decision gate before any further local publication_convergence runtime patch",
    "resultClassification": "same-frontier",
    "stopCondition": "architecture-gap-stop",
    "recentFrontierHistory": [
      "work/packages/done-20260518-topology-publication-unknown-no-debt-pending-runtime.md / topology_publication_owner / publication_convergence / same-frontier",
      "work/packages/done-20260518-topology-publication-unknown-missing-published-nodes-runtime.md / topology_publication_owner / publication_convergence / reduced",
      "work/packages/done-20260518-topology-publication-remaining-owner-reconcile-runtime.md / topology_publication_owner / publication_convergence / reduced"
    ],
    "oscillationCheck": "Triggered: focused pressure grammar did not reduce or migrate the representative frontier, so the sprint must stop local patching and record an architecture decision gate.",
    "handoffInvariant": "Pressure evidence may defer or coalesce publication progress, but it must not promote readiness or become stale publication ACK or missing-published debt."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "fresh representative artifact test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json still routes to publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending",
      "pressure_deferred did not appear as a representative owner outcome after focused proof",
      "the run regressed to publication OPEN with missingPublished=4 and owner_reconcile_pending=4"
    ],
    "choices": [
      {
        "id": "architecture-gate-before-local-runtime",
        "summary": "Record a causal architecture decision before another local publication_convergence runtime patch.",
        "route": "architecture-package",
        "proof": [
          "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json",
          "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending"
        ]
      }
    ],
    "selectedChoice": "architecture-gate-before-local-runtime",
    "nextAction": "Open a causal-escalation architecture package before any further local publication runtime patch."
  },
  "closed": "2026-05-19",
  "commitAndPushLedgerRequired": true
}
-->

## Why

Pressure is currently visible as downstream query pressure while publication
debt is zero, but the publication owner/gate grammar has no explicit
pressure-deferred outcome. This package owns the bounded owner grammar and
projection proof so pressure does not masquerade as stale publication debt.

## Scope Basis

Runtime pressure-stability hardening under the active rolling-restart release
gate; no new product surface or edition scope.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: topology_publication_owner / publication_pressure_stability emits one canonical `pressure_deferred` owner/gate outcome.
- Inputs/signals: test-output/reports/rolling-restart-after-priority-observation-narrowing-20260518T184535Z.report.json; npm test -- test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-recovery-evidence.test.js; npm run work:validate -- --pre-impl.
- State model or invariant: pressure evidence is normalized into one state: `none`, `deferred`, or `coalesced`; `deferred` and `coalesced` block readiness through `pressure_deferred`, carry retry/reason metadata, and cannot synthesize `publicationPending`, pending ACK, or missing-published debt.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: src/control-plane/readiness; src/control-plane/startup; test-output.
- Proof mapping: Focused gate/evidence tests prove the pressure invariant; representative success, reduction, or migration still requires fresh representative routing or rerun evidence.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | topology_publication_owner / publication_pressure_stability / pressure_deferred | topology_publication_owner owns this decision before downstream consumers reinterpret it | focused pressure_deferred owner/gate grammar landed; representative routing remains pending | Focused proof shows pressure/deferred publication evidence emits one canonical pressure_deferred owner outcome, blocks readiness, carries retry/coalescing metadata, and projects into priority recovery observation without reopening stale publication debt. | npm test -- test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-recovery-evidence.test.js |
| scope boundary | src/control-plane/readiness; src/control-plane/startup; test-output | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies topology_publication_owner / publication_pressure_stability directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm test -- test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-recovery-evidence.test.js`
- Competing explanations: At minimum compare pressure_deferred against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or architecture/human stop before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or an architecture/human stop before another local patch.

## Decision Experiment Gate

- Decision question: Does topology_publication_owner / publication_pressure_stability still own pressure_deferred, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an architecture/contract gap, or a human route.
- Competing hypotheses: pressure_deferred is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm test -- test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-recovery-evidence.test.js`
- Success metrics: focused proof shows pressure/deferred publication evidence emits one canonical pressure_deferred owner outcome, blocks readiness, carries retry/coalescing metadata, and projects into priority recovery observation without reopening stale publication debt; representative proof must then move at least one concrete metric, count, frontier, migration, or representative-green condition.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-priority-observation-narrowing-20260518T184535Z.report.json --owner topology_publication_owner --boundary publication_pressure_stability --dominant-reason pressure_deferred`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for architecture or human escalation instead of opening another local patch.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-after-priority-observation-narrowing-20260518T184535Z.report.json`
- Expected delta: Focused proof shows pressure/deferred publication evidence emits one canonical pressure_deferred owner outcome, blocks readiness, carries retry/coalescing metadata, and projects into priority recovery observation without reopening stale publication debt.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction triggers architecture or human escalation instead of another local patch.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json`
- Route owner: `topology_publication_owner`
- Route boundary: `publication_convergence`
- Route dominant reason: `publication_pending`
- Route causal outcome: `continue_local_fix`
- Stop mode: `same-frontier`
- Next lane: `causal-escalation`
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
3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or present a human gate.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.

## In Scope

1. src/control-plane/publication-owner-constants.js
2. src/control-plane/publication-owner-evidence.js
3. src/control-plane/publication-owner-decision.js
4. src/control-plane/publication-owner-state.js
5. src/control-plane/publication-recovery-gate.js
6. src/control-plane/publication-recovery-evidence.js
7. test/control-plane/publication-recovery-gate.test.js
8. test/control-plane/publication-recovery-evidence.test.js
9. work/packages/done-20260518-topology-publication-pressure-stability-runtime.md
10. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
11. work/sprints/current-blocker.md
12. work/sprints/current-blocker.json
13. work/model-ledger.jsonl

## Out Of Scope

1. src/control-plane/readiness
2. src/control-plane/startup
3. test-output

## Model Fit

- Package class: `pressure-stability-runtime`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/pressure-stability`
- Output profile: `medium`
- Owned files: `src/control-plane/publication-owner-constants.js`, `src/control-plane/publication-owner-evidence.js`, `src/control-plane/publication-owner-decision.js`, `src/control-plane/publication-owner-state.js`, `src/control-plane/publication-recovery-gate.js`, `src/control-plane/publication-recovery-evidence.js`, `test/control-plane/publication-recovery-gate.test.js`, `test/control-plane/publication-recovery-evidence.test.js`, `work/packages/done-20260518-topology-publication-pressure-stability-runtime.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`
- Forbidden files: `src/control-plane/readiness`, `src/control-plane/startup`, `test-output`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm test -- test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-recovery-evidence.test.js`, `npm run work:validate -- --pre-impl`
- Model ledger advisory: `escalate`

## Subagent Progress And Attempt Ledger

Required when subagent sequencing is required. Each real subagent appends one checked checkpoint after every completed subtask; this combined ledger satisfies both Progress and Attempt proof when the item includes status, last checkpoint, parent action, evidence, and next or blocker.
Review agents may directly fix metadata-only package, sprint, tracker, current-blocker, ledger, or handoff findings and record `review-fixed-metadata-only`; runtime, test, script, report, or non-metadata fixes still require a separate fix subagent.

- [x] Agent Ariadne Reviewer (328b6ff8-4c16-410f-a54a-6536da1b733b) superseded prior policy-placeholder checkpoint; status: `superseded`; last checkpoint: placeholder replaced; parent action: `superseded`; evidence: explicit user authorization plus Agent Ariadne Reviewer and Agent Aster Implementer proof recorded below; next: no action.
- [x] Agent Aster Implementer (a4ca7214-ed55-419f-b8dc-76023e595f12) superseded prior parent-only implementation checkpoint; status: `superseded`; last checkpoint: parent-only proof replaced; parent action: `superseded`; evidence: Agent Aster Implementer completed implementation and parent revalidated focused proof; next: no action.
- [x] Agent Ariadne Reviewer (328b6ff8-4c16-410f-a54a-6536da1b733b) review checkpoint: status: `validated`; last checkpoint: package doctor complete; parent action: `accepted`; evidence: `npm run work:package:doctor -- --suggest work/packages/done-20260518-topology-publication-pressure-stability-runtime.md` passed with validation ok and no deterministic suggestions; next: run route-after-rerun.
- [x] Agent Ariadne Reviewer (328b6ff8-4c16-410f-a54a-6536da1b733b) review falsification checkpoint: status: `validated`; last checkpoint: wrong-slice check complete; parent action: `accepted`; wrong-slice evidence would be owner/boundary/routing change, forbidden scope expansion into startup/readiness/test-output, or unchanged same-frontier without pressure-specific classification; evidence: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-priority-observation-narrowing-20260518T184535Z.report.json --owner topology_publication_owner --boundary publication_pressure_stability --dominant-reason pressure_deferred` passed and preserved the requested pressure route while reporting representative topology evidence still at `topology_publication_owner / publication_convergence`; next: repair metadata-only subagent ledger entries and validate.
- [x] Agent Ariadne Reviewer (328b6ff8-4c16-410f-a54a-6536da1b733b) review checkpoint: status: `validated`; last checkpoint: review-fixed-metadata-only complete; parent action: `accepted`; evidence: metadata-only edits in `work/packages/done-20260518-topology-publication-pressure-stability-runtime.md` and `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`; next: run pre-implementation validation.
- [x] Agent Ariadne Reviewer (328b6ff8-4c16-410f-a54a-6536da1b733b) review checkpoint: status: `validated`; last checkpoint: pre-implementation validation complete; parent action: `revalidated`; evidence: `npm run work:validate -- --pre-impl work/packages/done-20260518-topology-publication-pressure-stability-runtime.md` passed; next: implementation subagent proof recorded below.
- [x] Agent Aster Implementer (a4ca7214-ed55-419f-b8dc-76023e595f12) implementation checkpoint: status: `validated`; last checkpoint: implementation prompt and context loaded; parent action: `accepted`; evidence: `npm run work:subagent-prompt -- --role implementation --package work/packages/done-20260518-topology-publication-pressure-stability-runtime.md`, `npm run work:context`, and `npm run work:package:doctor -- --suggest work/packages/done-20260518-topology-publication-pressure-stability-runtime.md` passed; next: run pre-edit focused probe.
- [x] Agent Aster Implementer (a4ca7214-ed55-419f-b8dc-76023e595f12) implementation falsification checkpoint: status: `validated`; last checkpoint: wrong-slice check complete; parent action: `accepted`; wrong-slice evidence would be pressure proof requiring startup/readiness/test-output edits, pressure still synthesizing publicationPending, pending ACK debt, or missing-published debt, or owner/boundary changing away from topology_publication_owner / publication_pressure_stability; evidence: draft diff is limited to package write scope plus unrelated pre-existing dirty files outside scope; next: run focused proof, inspect failures, edit, validate, split, or blocker handoff.
- [x] Agent Aster Implementer (a4ca7214-ed55-419f-b8dc-76023e595f12) implementation checkpoint: status: `validated`; last checkpoint: pre-edit focused probe complete; parent action: `accepted`; evidence: `npm test -- test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-recovery-evidence.test.js` passed 375/375 against the existing draft patch; next: inspect draft runtime/test implementation and run guardrails.
- [x] Agent Aster Implementer (a4ca7214-ed55-419f-b8dc-76023e595f12) implementation checkpoint: status: `validated`; last checkpoint: scoped static guardrails complete; parent action: `accepted`; evidence: `node scripts/check-guideline-literals.js ...` passed with 0 new violations, `node scripts/check-guideline-decision-boundaries.js ...` passed with 0 violations, and `npm run audit:runtime-grammar:file -- ...` passed with 0 runtime-grammar-contract violations; next: verify pressure-state edge cases and make any scoped runtime/test corrections.
- [x] Agent Aster Implementer (a4ca7214-ed55-419f-b8dc-76023e595f12) implementation checkpoint: status: `validated`; last checkpoint: pressure-state runtime correction complete; parent action: `accepted`; evidence: edited `src/control-plane/publication-recovery-gate.js`, `src/control-plane/publication-recovery-evidence.js`, `test/control-plane/publication-recovery-gate.test.js`, and `test/control-plane/publication-recovery-evidence.test.js`; `npm test -- test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-recovery-evidence.test.js` passed 387/387; next: rerun scoped static guardrails and package validation.
- [x] Agent Aster Implementer (a4ca7214-ed55-419f-b8dc-76023e595f12) implementation checkpoint: status: `validated`; last checkpoint: post-edit scoped static guardrails complete; parent action: `accepted`; evidence: `node scripts/check-guideline-literals.js ...` passed with 0 new violations, `node scripts/check-guideline-decision-boundaries.js ...` passed with 0 violations, and `npm run audit:runtime-grammar:file -- ...` passed with 0 runtime-grammar-contract violations after runtime edits; next: run required package validation and diff checks.
- [x] Agent Aster Implementer (a4ca7214-ed55-419f-b8dc-76023e595f12) implementation checkpoint: status: `validated`; last checkpoint: required implementation validation complete; parent action: `accepted`; evidence: `npm run work:package:doctor -- --suggest work/packages/done-20260518-topology-publication-pressure-stability-runtime.md` passed, `npm run work:validate -- --pre-impl work/packages/done-20260518-topology-publication-pressure-stability-runtime.md` passed, focused pressure tests passed 387/387, scoped literal/decision/runtime-grammar guardrails passed, scoped `git diff --check -- ...` passed, `npm run work:model-ledger -- record ...` recorded, and `npm run test:static` remains blocked by inherited `knip --exclude exports` findings of 86 unused files, unused devDependency `jscpd`, and 3 configuration hints; next: parent focused-proof revalidation and representative route complete before closure.

## Subagent Sequencing Ledger

- [x] Review subagent recorded: Agent Ariadne Reviewer (328b6ff8-4c16-410f-a54a-6536da1b733b) reviewed work/packages/done-20260518-topology-publication-pressure-stability-runtime.md; result fixes-required.
- [x] Fix subagent recorded or explicitly not needed: review-fixed-metadata-only by Agent Ariadne Reviewer (328b6ff8-4c16-410f-a54a-6536da1b733b) for work/packages/done-20260518-topology-publication-pressure-stability-runtime.md; scope: metadata-only package/sprint ledger edits.
- [x] Implementation subagent recorded: Agent Aster Implementer (a4ca7214-ed55-419f-b8dc-76023e595f12) implemented work/packages/done-20260518-topology-publication-pressure-stability-runtime.md; result focused-proof-pass-static-blocked-by-inherited-knip; parent revalidated focused proof: yes.

## Validation

1. `npm run work:package:doctor -- --suggest work/packages/done-20260518-topology-publication-pressure-stability-runtime.md` - pass; validation ok, no deterministic suggestions.
2. `npm run work:validate -- --pre-impl work/packages/done-20260518-topology-publication-pressure-stability-runtime.md` - pass, 1 file.
3. `npm test -- test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-recovery-evidence.test.js` - pass, 387/387.
4. `node scripts/check-guideline-literals.js <package-owned implementation and test files>` - pass, 0 new violations and 0 inherited baseline violations.
5. `node scripts/check-guideline-decision-boundaries.js <package-owned implementation and test files>` - pass, 0 violations.
6. `npm run audit:runtime-grammar:file -- <package-owned runtime files>` - pass, 0 runtime-grammar-contract violations.
7. `git diff --check -- <package-owned implementation and tracking files>` - pass.
8. `npm run test:static` - blocked by inherited `knip --exclude exports` findings: 86 unused files, unused devDependency `jscpd`, and 3 configuration hints; no package-owned pressure files were named.
9. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json --fast-local --verbose` - failed 0/1; same-frontier representative evidence.
10. `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json` - pass; topology frontier remains `publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending`.
11. `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending` - pass; route evidence classifies `continue_local_fix`, but the package kill rule records same-frontier/no-reduction as an architecture stop before another local runtime patch.
12. `npm run work:scenario-route -- test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json --owner topology_publication_owner --boundary publication_pressure_stability --dominant-reason pressure_deferred --explain publication_ack_convergence` - pass; pressure route did not match representative topology truth.
13. `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json` - pass; reports four `operation_workflow_owner / rebalancer_handoff` retry-scheduled witnesses.
14. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json --handoff-probe` - pass; handoff contract exists, active-gate consumer remains deferred with `owner_reconcile_pending`, and runtime promotion is false.

Representative result: `same-frontier`. Focused pressure proof landed, but the
fresh representative route stayed at publication convergence without a pressure
classification or concrete reduction. The package stops local patching and
requires an architecture decision gate before another local publication runtime
package.
