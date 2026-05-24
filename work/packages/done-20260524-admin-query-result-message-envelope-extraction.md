# Extract admin query result message envelope

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-24",
    "closed": "2026-05-24",
    "lane": "lightweight-maintenance",
    "scenario": "none",
    "artifact": "none",
    "playback": "none",
    "owner": "admin_websocket_api_owner",
    "boundary": "query_result_message_envelope",
    "currentState": "Implementation and independent verifier-fixer pass are complete; src/admin/admin-websocket-api-segment-3.js is reduced from 1814 lines to 1668 lines while preserving sendQueryResult behavior.",
    "nextAction": "Close the package, run closure validation, then commit only the package-scoped files.",
    "dominantReason": "oversized_file_ratchet"
  },
  "scope": {
    "writeScope": [
      "src/admin/admin-websocket-api-segment-3.js",
      "src/admin/admin-query-result-message-envelope.js",
      "test/admin/admin-query-result-message-envelope.test.js",
      "work/packages/done-20260524-admin-query-result-message-envelope-extraction.md"
    ],
    "handoffFiles": [],
    "generatedFiles": [],
    "candidateRuntimeFiles": [
      "src/admin/admin-websocket-api-segment-3.js"
    ],
    "commitScope": [
      "src/admin/admin-websocket-api-segment-3.js",
      "src/admin/admin-query-result-message-envelope.js",
      "test/admin/admin-query-result-message-envelope.test.js",
      "work/packages/done-20260524-admin-query-result-message-envelope-extraction.md"
    ]
  },
  "gates": {
    "whyHighestLeverageNow": "This advances the active rolling-restart stability hardening sprint goal by preserving admin query response behavior while reducing the largest clean oversized-file ratchet candidate; the extraction does not reopen representative rolling-restart behavior.",
    "stabilityCredit": "local-proof-only",
    "codeQualityAdmission": {
      "reason": "preserves-owner-outcomes",
      "evidence": "The package only moves query result message envelope construction behind a semantic admin helper and keeps AdminWebSocketAPISegment3.sendQueryResult as the stable entrypoint."
    }
  },
  "modelFit": {
    "packageClass": "bounded-implementation",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "outputProfile": "medium",
    "ambiguityScore": 2,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [],
    "proof": {
      "commands": [
        "npm run audit:owner-boundary-segments -- src/admin/admin-websocket-api-segment-3.js",
        "npm test -- test/admin/admin-query-result-message-envelope.test.js test/admin/admin-websocket-api.test.js",
        "npm run audit:guideline:decision-boundaries -- src/admin/admin-query-result-message-envelope.js",
        "npm run test:metrics:scoped -- src/admin/admin-query-result-message-envelope.js",
        "npm run audit:guideline:literals -- src/admin/admin-websocket-api-segment-3.js src/admin/admin-query-result-message-envelope.js test/admin/admin-query-result-message-envelope.test.js",
        "npm run guard:guideline:constant-names:file -- src/admin/admin-websocket-api-segment-3.js src/admin/admin-query-result-message-envelope.js test/admin/admin-query-result-message-envelope.test.js",
        "npm run audit:runtime-grammar:file -- src/admin/admin-websocket-api-segment-3.js src/admin/admin-query-result-message-envelope.js",
        "node --check src/admin/admin-query-result-message-envelope.js && node --check src/admin/admin-websocket-api-segment-3.js && node --check test/admin/admin-query-result-message-envelope.test.js",
        "git diff --check -- src/admin/admin-websocket-api-segment-3.js src/admin/admin-query-result-message-envelope.js test/admin/admin-query-result-message-envelope.test.js work/packages/done-20260524-admin-query-result-message-envelope-extraction.md"
      ]
    }
  }
}
-->

## Why

The admin websocket segment remains the largest clean oversized owner-boundary candidate. Query result message envelope construction is a contained payload-formatting concern with direct tests and no need to alter dispatch, SQL execution, or control snapshot ownership.

## Scope Basis

`npm run work:oversized-next -- --markdown` still selects `src/admin/admin-websocket-api-segment-3.js` as the first owner-boundary extraction candidate. This package extracts one semantic helper behind the existing `sendQueryResult` entrypoint.

## Workflow Lane

- Selected lane: `lightweight-maintenance`
- Why this lane is sufficient: bounded workflow/tooling scope unless changed.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Status: `not-needed` - no runtime, scenario, or shared contract decision changes.





## Expected Representative Delta

- Baseline artifact: `none`
- Expected delta: Classify whether fresh representative evidence is green, reduced, migrated, same-frontier, architecture-gap, contradictory, or needs an autonomous architecture experiment before runtime promotion.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `none`
- Route owner: `admin_websocket_api_owner`
- Route boundary: `query_result_message_envelope`
- Route dominant reason: `oversized_file_ratchet`
- Route causal outcome: `pending-before-rerun`
- Stop mode: `pending-before-rerun`
- Next lane: `lightweight-maintenance`
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

1. src/admin/admin-websocket-api-segment-3.js
2. src/admin/admin-query-result-message-envelope.js
3. test/admin/admin-query-result-message-envelope.test.js
4. work/packages/done-20260524-admin-query-result-message-envelope-extraction.md

## Out Of Scope

1. src/cdc/cdc-integration-service-segment-3.js
2. src/rebalancer/operation-workflow-owner-segment-6.js

## Model Fit

- Package class: `bounded-implementation`
- Intended minimum model: `gpt-5.3-codex-spark`
- Scope shape: `leaf-slice`
- Output profile: `medium`
- Owned files: `src/admin/admin-websocket-api-segment-3.js`, `src/admin/admin-query-result-message-envelope.js`, `test/admin/admin-query-result-message-envelope.test.js`, `work/packages/done-20260524-admin-query-result-message-envelope-extraction.md`
- Forbidden files: `src/cdc/cdc-integration-service-segment-3.js`, `src/rebalancer/operation-workflow-owner-segment-6.js`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run audit:owner-boundary-segments -- src/admin/admin-websocket-api-segment-3.js`, `npm test -- test/admin/admin-query-result-message-envelope.test.js test/admin/admin-websocket-api.test.js`, `npm run audit:guideline:literals -- src/admin/admin-websocket-api-segment-3.js src/admin/admin-query-result-message-envelope.js test/admin/admin-query-result-message-envelope.test.js`, `npm run guard:guideline:constant-names:file -- src/admin/admin-websocket-api-segment-3.js src/admin/admin-query-result-message-envelope.js test/admin/admin-query-result-message-envelope.test.js`, `npm run audit:runtime-grammar:file -- src/admin/admin-websocket-api-segment-3.js src/admin/admin-query-result-message-envelope.js`, `node --check src/admin/admin-query-result-message-envelope.js && node --check src/admin/admin-websocket-api-segment-3.js && node --check test/admin/admin-query-result-message-envelope.test.js`, `git diff --check -- src/admin/admin-websocket-api-segment-3.js src/admin/admin-query-result-message-envelope.js test/admin/admin-query-result-message-envelope.test.js work/packages/done-20260524-admin-query-result-message-envelope-extraction.md`
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

- [x] action: implementation; owner: admin_websocket_api_owner; files-changed: src/admin/admin-websocket-api-segment-3.js, src/admin/admin-query-result-message-envelope.js, test/admin/admin-query-result-message-envelope.test.js, work/packages/done-20260524-admin-query-result-message-envelope-extraction.md; validation: `npm test -- test/admin/admin-query-result-message-envelope.test.js test/admin/admin-websocket-api.test.js`, `npm run audit:guideline:decision-boundaries -- src/admin/admin-query-result-message-envelope.js`, `npm run test:metrics:scoped -- src/admin/admin-query-result-message-envelope.js`, `npm run audit:guideline:literals -- src/admin/admin-websocket-api-segment-3.js src/admin/admin-query-result-message-envelope.js test/admin/admin-query-result-message-envelope.test.js`, `npm run guard:guideline:constant-names:file -- src/admin/admin-websocket-api-segment-3.js src/admin/admin-query-result-message-envelope.js test/admin/admin-query-result-message-envelope.test.js`, `npm run audit:runtime-grammar:file -- src/admin/admin-websocket-api-segment-3.js src/admin/admin-query-result-message-envelope.js`, `node --check src/admin/admin-query-result-message-envelope.js && node --check src/admin/admin-websocket-api-segment-3.js && node --check test/admin/admin-query-result-message-envelope.test.js`, `git diff --check -- src/admin/admin-websocket-api-segment-3.js src/admin/admin-query-result-message-envelope.js test/admin/admin-query-result-message-envelope.test.js work/packages/done-20260524-admin-query-result-message-envelope-extraction.md`, parent revalidated focused proof: yes; outcome: validated.
- [x] action: verification-fix; owner: admin_websocket_api_owner; files-changed: none; validation: `node --check src/admin/admin-query-result-message-envelope.js && node --check src/admin/admin-websocket-api-segment-3.js && node --check test/admin/admin-query-result-message-envelope.test.js`, `npm test -- test/admin/admin-query-result-message-envelope.test.js`, `npm run audit:guideline:literals -- src/admin/admin-websocket-api-segment-3.js src/admin/admin-query-result-message-envelope.js test/admin/admin-query-result-message-envelope.test.js`, `npm run guard:guideline:constant-names:file -- src/admin/admin-websocket-api-segment-3.js src/admin/admin-query-result-message-envelope.js test/admin/admin-query-result-message-envelope.test.js`, `npm run audit:runtime-grammar:file -- src/admin/admin-websocket-api-segment-3.js src/admin/admin-query-result-message-envelope.js`, `npm run audit:guideline:decision-boundaries -- src/admin/admin-query-result-message-envelope.js`, `npm run test:metrics:scoped -- src/admin/admin-query-result-message-envelope.js`, `npm run audit:owner-boundary-segments -- src/admin/admin-websocket-api-segment-3.js`, `npm test -- test/admin/admin-query-result-message-envelope.test.js test/admin/admin-websocket-api.test.js`, `git diff --check -- src/admin/admin-websocket-api-segment-3.js src/admin/admin-query-result-message-envelope.js test/admin/admin-query-result-message-envelope.test.js work/packages/done-20260524-admin-query-result-message-envelope-extraction.md`, `npm run work:validate -- --pre-impl work/packages/done-20260524-admin-query-result-message-envelope-extraction.md`, parent revalidated focused proof: yes; outcome: validated with expected oversized segment residual noted.
- [x] action: repair; owner: workflow_tooling_owner; files-changed: none; validation: not run; outcome: not-needed.

## Validation

1. npm run audit:owner-boundary-segments -- src/admin/admin-websocket-api-segment-3.js
2. npm test -- test/admin/admin-query-result-message-envelope.test.js test/admin/admin-websocket-api.test.js
3. npm run audit:guideline:decision-boundaries -- src/admin/admin-query-result-message-envelope.js
4. npm run test:metrics:scoped -- src/admin/admin-query-result-message-envelope.js
5. npm run audit:guideline:literals -- src/admin/admin-websocket-api-segment-3.js src/admin/admin-query-result-message-envelope.js test/admin/admin-query-result-message-envelope.test.js
6. npm run guard:guideline:constant-names:file -- src/admin/admin-websocket-api-segment-3.js src/admin/admin-query-result-message-envelope.js test/admin/admin-query-result-message-envelope.test.js
7. npm run audit:runtime-grammar:file -- src/admin/admin-websocket-api-segment-3.js src/admin/admin-query-result-message-envelope.js
8. node --check src/admin/admin-query-result-message-envelope.js && node --check src/admin/admin-websocket-api-segment-3.js && node --check test/admin/admin-query-result-message-envelope.test.js
9. git diff --check -- src/admin/admin-websocket-api-segment-3.js src/admin/admin-query-result-message-envelope.js test/admin/admin-query-result-message-envelope.test.js work/packages/done-20260524-admin-query-result-message-envelope-extraction.md

## Validation Notes

- `src/admin/admin-websocket-api-segment-3.js` is reduced from 1814 lines to 1668 lines by moving query-result message envelope construction into `src/admin/admin-query-result-message-envelope.js`.
- `npm run audit:owner-boundary-segments -- src/admin/admin-websocket-api-segment-3.js` still reports the segment as oversized at 1669/800, which is the expected residual after this single owner-boundary extraction.
- `npm run audit:guideline:decision-boundaries -- src/admin/admin-query-result-message-envelope.js` passes with zero findings for the extracted helper.
- `npm run test:metrics:scoped -- src/admin/admin-query-result-message-envelope.js` reports zero scoped cyclomatic or cognitive complexity violations for the extracted helper.

no ledger update
