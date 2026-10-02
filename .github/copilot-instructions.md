# Copilot review instructions — A1 partition-key ordering

This pull request is an ephemeral independent-verification surface for Lagrange Quest
`partition-key-ordering-owner-completion`. Review the five production/test changes
adversarially and enumerate all findings you can reach; do not stop at the first issue.

For every finding or pass claim, cite a concrete file/line or test evidence path.

Required attack categories:

1. **Single partition-key ordering owner**
   - Confirm KeyRange / PartitionResolver / QueryGroup already consume
     `compareRoutingKeys`.
   - Confirm split/merge sorting and adjacency no longer retain a raw
     `comparePartitionKeys` or equivalent second partition-key order.
   - Table-id sorting may stay separate, but must not decide partition-key semantics.

2. **SQLite BINARY text semantics**
   - Check that the candidate's string order matches SQLite's UTF-8 BINARY collation,
     including BMP vs supplementary Unicode where JS UTF-16 relational ordering differs.
   - Reject locale-sensitive ordering, normalization, or host-dependent collation.

3. **Existing contracts preserved**
   - number vs text-encoded numeric boundary remains numeric;
   - finite number/number remains numeric;
   - buffer/buffer remains bytewise;
   - unrelated mixed key spaces remain typed refusals rather than coercion;
   - split routing and ordinary routing do not diverge on text ordering.

4. **Controlled-negative fidelity**
   - Inspect the new SQLite-BINARY routing witness and Unicode merge-adjacency witness.
   - They must exercise production owners, not duplicated test logic.
   - The pre-fix code should genuinely fail each witness for the claimed reason.

5. **Scope / hidden migration**
   - Reject any persisted-boundary format, type-metadata, numeric-precision migration,
     Raft, lifecycle, membership, formation, or index-planner change in this candidate.
   - Those belong to later Quests.

6. **Implementation hazards**
   - Check null/unbounded ordering, equality, Buffer/String conversions, comparator
     transitivity/antisymmetry, sorting callback behavior, Unicode edge cases, and
     accidental ordering changes for unsupported same-runtime-type fallback values.

Return a category-complete review. A clean review should explicitly say which of the
six categories were checked and cite the relevant evidence paths.
