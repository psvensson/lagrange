---
audience: development
documentClass: current
---

# Cloud GitHub publication

Measured 2026-10-08 on psvensson/lagrange. This is an execution note under
[the Solver runbook](solver-runbook.md), not a new publication authority.

## Working route

The connected GitHub publisher supports repository reads, file/Git-data
writes and expected-head ref updates. Discover the actual available actions
rather than assuming a prior session's read-only surface is permanent.

For ordinary multi-file work, a narrowly scoped GitHub Actions job can check
out the exact authorized work-branch SHA with contents:write and retained
checkout credentials, validate the intended change, commit, and run normal
`git push origin HEAD:refs/heads/<authorized-work-branch>`. The ephemeral
GITHUB_TOKEN stays in Actions. It is never copied into chat, artifacts or the
chat container. Do not search unrelated credentials or request broader access.

Before push compare git ls-remote with the expected prior SHA; after push
compare it with the actual local HEAD. Do not force, merge preservation refs,
or substitute a successful command exit for the independent remote check.
The repository's documented non-main preservation path is not source landing,
Quest closure or release approval.

Actual successful example: Actions run 37750464523 restored all 19 saved C0
files by exact hashes and pushed commit
09387f447a99bfe5a5e3c71f0b48d3f61d7b79eb. The original packets were preserved
rather than applied over a newer conflicting diagnostic.

## Workflow-file changes use their authorized publisher

The Actions token above cannot create/update .github/workflows: run
37751756675 reached ordinary git push but the GitHub server rejected its
workflow-containing commit for missing workflows permission. Do not retry
with a hook bypass or expand token privileges. The failure is not a runtime
test failure.

The already-authorized connected publisher can publish workflow changes. In
this case the rejected ref update had transferred commit object
 ae20b6601ca27bcab7758840bc4830945558b524
but had NOT moved the branch. That object was fetched, its exact five-file
diff and expected parent checked, then the connected publisher performed a
non-force expected-head update from
490b01962de55cd108be5b59ed0b389141e99dee. No object/ref availability is assumed
on another failure: inspect first. Direct create_tree/create_commit/update_ref
or a checked file update is also available through that authorized publisher.

Use the Actions route for ordinary code/evidence and the authorized workflow
publisher for workflow files. Do not make another broad permissions or
credential framework to solve this distinction.

## Proof boundaries

A GCP runner is a remote execution machine; a unit test there is not a
multi-host cluster proof. Distributed acceptance still uses the existing
GCP harness, exact source fingerprint, distinct host/storage provenance,
resource authority, archived evidence and bounded cleanup. A successful push
or Action does not replace independent review or exact-head certification.
