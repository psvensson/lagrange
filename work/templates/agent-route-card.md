# Agent Route Card

<!-- agent-route-card
{
  "schema": "agent-route-card-v1",
  "package": "work/packages/active-YYYYMMDD-package.md",
  "agentRole": "evidence-scout",
  "mode": "read-only",
  "status": "complete",
  "recommendedRoute": "evidence-regeneration",
  "confidence": "medium",
  "ownerBoundary": "workflow_tooling_owner / scenario_router",
  "stalenessRisk": "medium",
  "evidenceUsed": [
    "test-output/reports/example.report.json"
  ],
  "mustNotEdit": [
    "src/",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "work/theory-ledger.md"
  ],
  "writesAllowed": [],
  "rationale": "One concise explanation of why this route is selected."
}
-->

## Finding

State what the scout independently observed.

## Recommended Route

Allowed values:

- `runtime-owner-implementation`
- `contract-model-repair`
- `evidence-regeneration`
- `release-gate-expectation-update`
- `architecture-gap`
- `blocked-contradictory-evidence`
- `representative-green`

## Evidence

List the exact artifacts, commands, contracts, or files used.

## Coordinator Notes

State what the coordinator must compare with other cards before selecting the
next package route.
