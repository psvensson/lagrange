# Revert Recent Timeout Doubling

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-25",
    "lane": "runtime-owner-boundary",
    "scenario": "none",
    "artifact": "none",
    "playback": "none",
    "owner": "timeout-budget-normalization",
    "boundary": "recent-doubled-timeout-values",
    "dominantReason": "backpressure-and-harness-timeouts-were-doubled",
    "currentState": "Recent commits doubled bootstrap readiness retry delays under backpressure and doubled distributed harness default probe budgets.",
    "nextAction": "Restore configured timeout budgets without removing readiness pressure observation.",
    "closed": "2026-05-26"
  },
  "scope": {
    "writeScope": [
      "src/bootstrap/node-joining-ready-signal-readiness.js",
      "src/bootstrap/traffic-readiness-utils.js",
      "test/bootstrap/traffic-readiness-utils.test.js",
      "test/distributed/harness/cluster-segment-1.js",
      "work/packages/active-20260525-ready-signal-timeout-doubling-revert.md",
      "scripts/list-commands.js",
      "test/distributed/README.local.md",
      "scripts/stop-distributed-harness-containers.js",
      "test/scripts/stop-distributed-harness-containers.test.js"
    ],
    "handoffFiles": [],
    "generatedFiles": [
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md"
    ],
    "candidateRuntimeFiles": [
      "src/bootstrap/node-joining-ready-signal-readiness.js",
      "src/bootstrap/traffic-readiness-utils.js",
      "test/distributed/harness/cluster-segment-1.js"
    ],
    "commitScope": [
      "src/bootstrap/node-joining-ready-signal-readiness.js",
      "src/bootstrap/traffic-readiness-utils.js",
      "test/bootstrap/traffic-readiness-utils.test.js",
      "test/distributed/harness/cluster-segment-1.js",
      "work/packages/active-20260525-ready-signal-timeout-doubling-revert.md",
      "work/sprints/current-blocker.json",
      "work/sprints/current-blocker.md",
      "scripts/list-commands.js",
      "test/distributed/README.local.md",
      "scripts/stop-distributed-harness-containers.js",
      "test/scripts/stop-distributed-harness-containers.test.js"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "This package advances the active sprint goal with focused proof.",
    "representativeRerunCadence": "scheduled-rerun-command"
  },
  "modelFit": {
    "packageClass": "runtime-owner-boundary",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "bounded-owner-runtime/current-frontier",
    "outputProfile": "medium",
    "ambiguityScore": 1,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [],
    "proof": {
      "commands": [
        "falsifier: npm test -- test/bootstrap/traffic-readiness-utils.test.js # focused contract fixture and affected consumer proof",
        "regression: npm run audit:runtime-grammar:file -- src/bootstrap/node-joining-ready-signal-readiness.js src/bootstrap/traffic-readiness-utils.js test/distributed/harness/cluster-segment-1.js # focused contract fixture and affected consumer proof",
        "supporting: git diff --check -- src/bootstrap/node-joining-ready-signal-readiness.js src/bootstrap/traffic-readiness-utils.js test/bootstrap/traffic-readiness-utils.test.js test/distributed/harness/cluster-segment-1.js work/packages/active-20260525-ready-signal-timeout-doubling-revert.md"
      ]
    }
  },
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex",
    "allowedDecisionDepth": "single owner-boundary execution after higher-model route selection",
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
      "Split mechanical cleanup into mechanical-maintenance / gpt-5.3-codex-spark.",
      "Split focused tests or fixtures into test-only-proof / gpt-5.3-codex-spark.",
      "Split one same-owner hypothesis into bounded-experiment / gpt-5.3-codex-spark.",
      "Keep cross-file owner runtime integration in this package unless it contracts to one runtime file."
    ]
  },
  "commitAndPushLedgerRequired": true
}
-->

## Why

Recent commits doubled several timeout budgets as a pressure response. This
package restores the configured budgets and keeps pressure state as observation
only, so overload does not silently expand retry windows.

## Scope Basis

User request to revert every recently doubled timeout value. The bounded scope
is the bootstrap readiness retry path and distributed harness defaults that were
identified in recent history as doubled values.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: timeout-budget-normalization / recent-doubled-timeout-values emits configured timeout budgets without pressure-based doubling.
- Inputs/signals: configured ready-signal attempts/delays, lifecycle readiness retry hints, distributed harness default probe budgets, and router pressure snapshots.
- State model or invariant: Pressure may annotate readiness state, but it must not multiply timeout budgets. Harness defaults must reset to their base named budgets rather than doubled fallback values.
- Non-goals and forbidden interpretations: Do not remove backpressure detection, change readiness ownership, or alter convergence timeout propagation that was not itself a doubled value.
- Proof mapping: Implementation and tests must prove the timeout-budget invariant before closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | timeout-budget-normalization / recent-doubled-timeout-values / backpressure-and-harness-timeouts-were-doubled | timeout-budget-normalization owns the revert of recent timeout multiplication before downstream consumers reinterpret it | restore configured timeout budgets | bootstrap readiness and harness probes no longer double timeout budgets | npm test -- test/bootstrap/traffic-readiness-utils.test.js |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package removes the budget inflation itself; it does not tune downstream symptoms with larger waits.
- Falsifying focused probe: `npm test -- test/bootstrap/traffic-readiness-utils.test.js`
- Competing explanations: At minimum compare doubled timeout budgets against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Which recently doubled timeout values should be restored to configured/base budgets without removing pressure observation?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: doubled timeout budgets are real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm run work:validate -- --pre-impl work/packages/active-20260525-ready-signal-timeout-doubling-revert.md`
- Success metrics: reduce scoped doubled-timeout count from four doubled sites to 0, reset harness fallback defaults to base budgets, and keep focused contract fixture green.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact none --owner bootstrap-readiness --boundary ready-signal-timeout-budget --dominant-reason doubled-timeout-budgets`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.



## Expected Representative Delta

- Baseline artifact: `none`
- Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `none`
- Route owner: `timeout-budget-normalization`
- Route boundary: `recent-doubled-timeout-values`
- Route dominant reason: `backpressure-and-harness-timeouts-were-doubled`
- Route causal outcome: `pending-before-rerun`
- Stop mode: `pending-before-rerun`
- Next lane: `runtime-owner-boundary`
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

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `src/bootstrap/node-joining-ready-signal-readiness.js`, `src/bootstrap/traffic-readiness-utils.js`, `test/bootstrap/traffic-readiness-utils.test.js`, `test/distributed/harness/cluster-segment-1.js`, `work/packages/active-20260525-ready-signal-timeout-doubling-revert.md`
- Forbidden files: runtime ownership outside the scoped timeout-budget paths.
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm test -- test/bootstrap/traffic-readiness-utils.test.js`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex`
- Allowed decision depth: single owner-boundary execution after higher-model route selection
- Safe to execute when:
1. owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared
2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
3. the first focused proof gives a clear pass, fail, or escalate signal
- Split or escalate when:
1. write scope expands beyond the declared lower-model lane
2. proof requires forbidden scope, cross-owner reasoning, or architecture route selection
3. the implementation needs to decide system behavior instead of executing a named local mechanism
- Candidate lower-model child packages:
1. Split mechanical cleanup into mechanical-maintenance / gpt-5.3-codex-spark.
2. Split focused tests or fixtures into test-only-proof / gpt-5.3-codex-spark.
3. Split one same-owner hypothesis into bounded-experiment / gpt-5.3-codex-spark.
4. Keep cross-file owner runtime integration in this package unless it contracts to one runtime file.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use the compact five-field shape for new evidence lines.

- [x] action: implementation; owner: timeout-budget-normalization; files-changed: src/bootstrap/node-joining-ready-signal-readiness.js, src/bootstrap/traffic-readiness-utils.js, test/bootstrap/traffic-readiness-utils.test.js, test/distributed/harness/cluster-segment-1.js; validation: `npm test -- test/bootstrap/traffic-readiness-utils.test.js`, `npm run audit:runtime-grammar:file -- src/bootstrap/node-joining-ready-signal-readiness.js src/bootstrap/traffic-readiness-utils.js test/distributed/harness/cluster-segment-1.js`, `git diff --check -- src/bootstrap/node-joining-ready-signal-readiness.js src/bootstrap/traffic-readiness-utils.js test/bootstrap/traffic-readiness-utils.test.js test/distributed/harness/cluster-segment-1.js work/packages/active-20260525-ready-signal-timeout-doubling-revert.md`, `npm run audit:file-size -- src/bootstrap/node-joining-ready-signal-readiness.js src/bootstrap/traffic-readiness-utils.js test/bootstrap/traffic-readiness-utils.test.js test/distributed/harness/cluster-segment-1.js`; parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: timeout-budget-normalization; files-changed: none; validation: `! rg -n "readySignal.*\\* \\(.*NUM\\.TWO|delayScale|baseDelay \\* NUM\\.TWO|sleepBackpressuredDelay, 200|CONTROL_SNAPSHOT_PROBE_TIMEOUT_MS = 30000|FETCH_TIMEOUT_MS = 30000|CLUSTER_ACTIVE_NODE_PROBE_TIMEOUT_MS = 30000|CONTROL_SNAPSHOT_REACHABILITY_PROBE_TIMEOUT_MS = 10000" src test`; parent revalidated focused proof: yes; outcome: validated.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: work/sprints/current-blocker.json, work/sprints/current-blocker.md; validation: `npm run work:repair`; outcome: validated.

Theory ledger: no ledger update; this package restores configured timeout
budgets and does not add representative evidence or durable causal theory.

## Commit And Push Ledger

1. Focused package commit: 907d0bac
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes

## Validation

1. `git diff --check -- <files>`
