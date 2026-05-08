# Core Topology Legacy Path Deletion And Proof

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-08",
  "scenario": "core-topology-control-plane-rewrite",
  "artifact": "none",
  "playback": "none",
  "owner": "topology_control_plane",
  "boundary": "legacy_path_deletion_and_proof",
  "dominantReason": "legacy_shadow_paths_remain_after_projection_readiness_contract",
  "currentState": "Mutation-readiness published-convergence consumption has been cut over from raw recovery-gate fields to projectionReadinessContract; focused consumer proof, static guards, work validation, and diff checks passed; focused package commit 196e57f3d057a10606e3e2271716306835dc596d is pushed.",
  "nextAction": "Use a new package if the next representative harness rerun exposes a fresh owner-boundary blocker.",
  "proof": [
    "npm run work:context",
    "npm run work:validate",
    "git diff --check"
  ],
  "touchedFiles": [
    "src/control-plane/control-plane-mutation-readiness.js",
    "test/control-plane/control-plane-mutation-readiness.test.js",
    "test/control-plane/control-plane-system-table-gateway.test.js",
    "test/control-plane/control-plane-system-table-gateway-tail-test-cases.js",
    "test/query/sql-query-engine.test-part-3.js",
    "work/packages/done-20260508-core-topology-legacy-path-deletion-and-proof.md",
    "work/model-ledger.jsonl"
  ],
  "predecessor": "work/packages/done-20260508-core-topology-projection-readiness-contract.md",
  "closed": "2026-05-08",
  "commitAndPushLedgerRequired": true
}
-->

## Why

The rewrite is not complete until legacy fallback paths, shadow vocabularies,
and duplicate decision surfaces are deleted or structurally blocked.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, with the Core Topology
Control-Plane Rewrite sprint acting as the representative topology workflow,
failure-simulation, and production-guarantee track.

## In Scope

1. Delete superseded topology decision paths.
2. Add structural guards that prevent consumers from binding to transitional
   paths.
3. Run the representative proof ladder for Phase 0.1 gates.

## Out Of Scope

1. Phase 0.5 deployment or CLI work.
2. Pro or Enterprise control surfaces.

## Shared Boundary Contract

Semantic owner: `topology_control_plane`.

Canonical contract shape / vocabulary: only the membership owner,
placement/operation owners, publication boundary outcome, and
projection/readiness contract may define topology state transitions and
consumer readiness. Legacy consumers may observe those contracts, but must not
rebuild equivalent decisions from raw owner rows, cache freshness, transport,
timers, or duplicated status strings.

Allowed consumers: runtime readers, bootstrap readiness, diagnostics, admin,
harness, and tests that verify topology visibility.

Prohibited reinterpretations: no consumer may infer membership, placement,
operation readiness, publication closure, recovery gate state, serve
eligibility, repair eligibility, or routability outside the canonical owner
contracts.

Primary diagnostics / proof surfaces: focused structural guards for deleted
paths, canonical readiness/publication consumer tests, affected admin/harness
diagnostic tests, file-scoped static guardrails, work validation, and the
representative Phase 0.1 proof ladder.

## Subagent Sequencing Ledger

- [x] Review subagent recorded: Agent Noether
      (`019e08f0-a0a7-7c93-b034-a41108c9c3e7`) reviewed
      `work/packages/done-20260508-core-topology-projection-readiness-contract.md`;
      result `clean`.
- [x] Fix subagent recorded or explicitly not needed: not-needed.
- [x] Implementation subagent recorded: Agent Darwin
      (`019e08f4-be39-79f0-9840-99e68d1d4ed8`) implemented
      `work/packages/done-20260508-core-topology-legacy-path-deletion-and-proof.md`.

## Commit And Push Ledger

- Focused package commit: 196e57f3d057a10606e3e2271716306835dc596d
- Pushed to: origin/codex/pending-ack-eligibility-filter
- Commit contains only package-owned files/package-status/allowed sprint handoff: yes

## Static Drift Ledger

Preflight:

- [x] Review the completed projection/readiness package before implementation
      starts.
- [x] Run fixes if the review finds them.
- [x] Record the implementation subagent before runtime edits are made for this
      package.

Implementation:

- [x] Runtime edits stay within the legacy path deletion/proof boundary.
- [x] Existing unrelated dirty files remain untouched.
- [x] Structural guardrails prove superseded paths cannot be rebound.
- [x] File-scoped literal, decision-boundary, and runtime-grammar guardrails
      pass for touched runtime files.
- [x] LLM-backed file guideline guard is run or recorded as blocked by the
      repository-local API key before closure.

LLM-backed guard status: blocked by local invalid API key. Command attempted:
`npm run guard:guidelines:file -- src/control-plane/control-plane-mutation-readiness.js`.
Failure was `LLM API request failed (401)` / `invalid_api_key`.

## Implementation Notes

- Removed mutation-readiness published-convergence derivation from raw
  `priorityControlPlaneRecovery.publicationRecoveryGate` and `active` fields.
- Mutation readiness now normalizes published-convergence evidence from the
  canonical `projectionReadinessContract` and its publication and priority
  recovery summaries.
- Added focused structural coverage proving the runtime source cannot rebind to
  the transitional raw recovery-gate fields.
- Updated direct query and gateway consumer fixtures to provide canonical
  projection/readiness contract reason evidence.

## Validation Results

- `npm run work:context` passed.
- Pre-edit guard snapshot:
  `npm run audit:guideline:literals -- src/control-plane/control-plane-mutation-readiness.js`
  passed with 0 new violations.
- Pre-edit guard snapshot:
  `npm run audit:guideline:decision-boundaries -- src/control-plane/control-plane-mutation-readiness.js`
  passed with 0 violations.
- Pre-edit guard snapshot:
  `npm run audit:runtime-grammar:file -- src/control-plane/control-plane-mutation-readiness.js`
  passed with 0 violations.
- `node --test test/control-plane/control-plane-mutation-readiness.test.js`
  passed: 32 tests, 8 suites.
- `node --test test/query/sql-query-engine.test-part-3.js` passed: 80 tests,
  15 suites.
- `node --test test/control-plane/control-plane-system-table-gateway.test.js`
  passed: 219 tests, 48 suites.
- `node --test test/query/sql-query-engine.test-part-8.js` passed as part of
  the combined consumer run.
- `node --test test/rebalancer/unified-rebalancer-core-02-test-cases.js`
  passed as an isolated file and as part of the combined consumer run.
- Combined consumer run:
  `node --test test/control-plane/control-plane-mutation-readiness.test.js test/query/sql-query-engine.test-part-8.js test/rebalancer/unified-rebalancer-core-02-test-cases.js`
  passed: 77 tests, 21 suites, plus the rebalancer file test wrapper.
- Post-edit guard:
  `npm run audit:guideline:literals -- src/control-plane/control-plane-mutation-readiness.js`
  passed with 0 new violations.
- Post-edit guard:
  `npm run audit:guideline:decision-boundaries -- src/control-plane/control-plane-mutation-readiness.js`
  passed with 0 violations.
- Post-edit guard:
  `npm run audit:runtime-grammar:file -- src/control-plane/control-plane-mutation-readiness.js`
  passed with 0 violations.
- `npm run guard:guidelines:file -- src/control-plane/control-plane-mutation-readiness.js`
  blocked by local invalid API key (`401 invalid_api_key`).
- `npm run work:model-ledger -- record --package work/packages/done-20260508-core-topology-legacy-path-deletion-and-proof.md --model gpt-5-codex --reasoning-effort high --task-class distributed-runtime --outcome done --validation-status focused-passing-work-validate-pending-llm-guard-blocked --correction-loops 1 --review-findings 0 --notes "Deleted mutation-readiness raw recovery-gate convergence path; focused mutation, query, gateway, and rebalancer tests passed; static guards passed; LLM guideline guard blocked by invalid local API key."`
  recorded model experience.
- `npm run work:current-blocker` passed and regenerated
  `work/sprints/current-blocker.json` and
  `work/sprints/current-blocker.md`.
- `npm run work:validate` passed.
- `git diff --check` passed.
