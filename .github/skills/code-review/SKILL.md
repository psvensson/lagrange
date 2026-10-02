---
name: lagrange-code-review
description: Adversarial, content-bound review protocol for Lagrange Quest source changes.
---

# Lagrange code review

When reviewing a pull request that implements or verifies a Lagrange Solver
Quest, review the **exact current PR head** and treat the Quest declaration as
the acceptance contract.

1. Read the active `solve/quests/<id>/quest.json`, its `log.ndjson`, the
   owning epic, and the changed source/tests before reaching a verdict.
2. Identify every applicable category from
   `docs/development/verification-templates/INDEX.md`. Run the full checklist
   for every applicable category in one review round. Do not stop at the first
   defect.
3. Every finding and every claimed pass needs a concrete evidence path:
   source line, test name, Quest log entry, workflow run, or immutable candidate
   hash. Do not accept "tests pass" as semantic proof.
4. For red-before/green-after controls, apply the harness-fidelity checklist.
   Confirm the red reaches the named behavioral assertion for the claimed
   mechanism and that the green uses the same fixture/path.
5. For comparator/guard/contract code handling hostile JavaScript values, apply
   the adversarial-js-intrinsics checklist. Reject accidental coercion,
   locale dependence, prototype/accessor surprises, or a broad "any throw"
   standing in for a typed outcome when those are reachable on the changed
   boundary.
6. Attack semantic ownership: search changed callers for a surviving duplicate
   comparator/decision path, fallback, direct raw comparison, or local escape
   hatch. A helper rename is not owner convergence.
7. Check Quest scope. Reject unrelated architecture changes, hidden migration,
   raft/runtime/formation changes, or broader compatibility changes that the
   Quest did not authorize.
8. A review is content-bound. State the reviewed commit SHA in the summary.
   If the head changes after review, the old verdict is not approval of the
   new candidate.
9. Return all findings grouped by applicable verification category. If there
   are no blocking findings, say so explicitly and list the evidence paths
   supporting the approval.

For `partition-key-ordering-owner-completion-v2`, the mandatory verification
bar is:

- **harness-fidelity**: red source must fail the SQLite-BINARY routing assertion
  and the merge-adjacency assertion for the intended mechanism; the current
  candidate must make both green without changing the pass criterion.
- **adversarial-js-intrinsics / typed-input edge**: string comparison must be
  deterministic UTF-8/SQLite-BINARY (including U+E000 vs U+10000), numeric
  against text-encoded numeric must remain numeric, and unrelated mixed key
  spaces must retain the exact typed split-key mismatch outcome.
- **owner convergence**: KeyRange, PartitionResolver, QueryGroup, split/merge
  ordering and split/merge adjacency must consume the same partition-key order
  owner. Table-id ordering is a distinct identifier concern and must not become
  a second partition-key comparator.
- **scope**: no persisted-boundary format migration, type-metadata migration,
  Raft, consensus transport, formation, membership, or lifecycle change.
