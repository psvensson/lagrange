# Agent Verifier Card

<!-- agent-route-card
{
  "schema": "agent-route-card-v1",
  "package": "work/packages/active-YYYYMMDD-package.md",
  "agentRole": "verifier",
  "mode": "verify-only",
  "status": "complete",
  "recommendedRoute": "representative-green",
  "confidence": "medium",
  "ownerBoundary": "release_gate_owner / rolling_restart_fully_green_gate",
  "evidenceUsed": [
    "work/packages/active-YYYYMMDD-package.md"
  ],
  "checkedCommands": [
    "npm run work:agent:validate -- --package work/packages/active-YYYYMMDD-package.md"
  ],
  "findings": [],
  "rationale": "No blocking issues found."
}
-->

## Verification Scope

State the package/tooling surface reviewed.

## Findings

List blocking findings first. Use an empty list in metadata when no findings were
found.

## Checked Commands

List commands actually run or static checks actually performed.
