# Agent Reports

This directory stores parallel diagnostic route cards.

Subagents do not own workflow truth. They write one card under the active
package report directory, and the coordinator uses `npm run work:agent:collect`
to compare recommendations before updating package, sprint, current-blocker, or
theory-ledger state.

Canonical card templates:

- `work/templates/agent-route-card.md`
- `work/templates/agent-verifier-card.md`
