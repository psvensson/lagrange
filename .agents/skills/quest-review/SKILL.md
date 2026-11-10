---
name: quest-review
description: Independently verify a Lagrange Quest candidate and its evidence, tracing changed contracts through real callers and recovery paths. Use before landing or when validating another agent's implementation or completion claims.
---

# Review the actual candidate

Read AGENTS and the routed verification owners. Use the existing verification
templates appropriate to the changed interaction. This is a report-only review;
the author owns repairs and the existing Solver owns landing and publication.
Selected upstream provenance is in scripts/agent-tooling/NOTICE.md.

Record author and verifier identities, base/HEAD, worktree, changed-file digests,
relevant dependencies and evidence applicability. A verifier cannot approve its
own authored change. Review all material findings in the bounded surface together.

Trace changed behavior from the real producer through representation, persistence,
decision and cleanup. Inspect production callers and fixture producers. Challenge
absence, stale observations, identity changes, reordering, ambiguous completion,
retained debt and recovery. Do not trust a test merely because its stub agrees
with the implementation. Name which paths were executed and which were read.

Run the smallest discriminating proof first, then the interaction and required
canonical gates. Retain applicable output through the existing evidence owner.
Another message does not invalidate unchanged evidence; changed content requires
an explicit applicability decision. Counts and agreeing reviewers are not proof.

For tooling acceptance, inspect the retained raw observations consumed by
scripts/checks/quest-agent-tooling-acceptance.js. Missing output, wrong versions,
wrong worktree, changed digests, self-review and unresolved material findings
cannot pass. A plugin's prose or manually asserted success flag is insufficient.

Report findings with owner, severity, evidence and consequence. Route unrelated
findings without widening the repair. Append the actual bounded verdict through
`solve.js note --verification ... --verifier subagent:<id> --verdict approve|reject`.
Keep implementation, independent review, landing, publication, formation and
comparative acceptance distinct. Never generate or admit mock, fake or emulated
information during comparative systems measurements; an unrun arm stays unrun.
