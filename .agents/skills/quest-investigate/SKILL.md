---
name: quest-investigate
description: Investigate Lagrange failures systematically before implementation, including prior occurrences, real producer shapes, causal divergence and recovery obligations. Use for bug reports, repeated failing attempts or suspected contract drift.
---

# Investigate before changing the contract

Use the current Quest, or the existing review record for an eligible direct
change, and the routed owner. This skill adds no task ledger or approval stage.
Its selected upstream inputs and instruction adaptations are pinned in
scripts/agent-tooling/profile.json and attributed in that directory's NOTICE.md.

Start from the actual failing artifact and its source/host identity. Distinguish
product failure from unavailable observation. Preserve the first failure.

Treat the problem as systematic until evidence bounds it locally. Search relevant
Git history, earlier Quest findings and the real prior failure/fix. Check that the
earlier explanation still applies to today's producer, decoder and consumer.
Use quest-navigate where available and name dynamic-reference limits.

Apply the workflow's [transition trigger and complete checklist](../../../docs/steering/workflow-guidelines/solver-quests.md#contract-first-owner-work).
Record applicable transition facts in the existing work record; use its owning
design note when design review is required. For an unchanged-contract repair,
cite the transition and record the defect, affected path and discriminating
witness. Resolve missing contract facts before dependent implementation.

State a falsifiable hypothesis, the first causal divergence and a discriminating
observation. Exercise actual producers and consumers before dependent edits.
Handwritten collaborator stubs cannot prove a production boundary. Use primary
sources for related-system inspiration; identify assumptions that differ here.

When evidence repeatedly refutes an assumption, reassess architecture and witness
scope with the existing roles. Do not keep adding local guards, increase deadlines,
add retries, introduce field aliases or select a legacy path to hide the failure.
No fixed attempt count requires a new user approval.

Record observations, ruled-out causes and the next owned action in the existing
Quest's append-only findings or the direct change's review record. Keep source
diagnosis, executed reproduction and acceptance
as separate claims. Only a proven cause proceeds to a bounded implementation.
