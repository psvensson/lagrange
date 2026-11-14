---
audience: evidence
recorded: 2026-11-14
quest: service-lifecycle-reconciliation-row-integrity
---

VERDICT: APPROVE

(Second report of the fresh independent verifier for the landing candidate, after the test-only repair of its first rejection. Saved by the lead from the verifier's hand-back. Text unchanged.)

State examined: HEAD 232082669, candidate tree b7fd5429432f. sha256:

- e9ce37c7f9f7c966586fafbeceef7bf9acb08f347d4f6bd205bd32a8885d000e `src/cache/system-table-cache-authoritative-reconciliation.js`
- 981c24dddcfc2bf0305d1912489995b8a7b0503f587f0e4033a3c8224f72e89e `test/cache/fixtures/system-table-cache-lifecycle-reconciliation-golden.json`
- f9398ee8ba80ffc943ca0b8bfbc701fd984cd9c55ad369aedffffd1d9745b866 `test/cache/system-table-cache-lifecycle-reconciliation-differential.test.js`
- 0c030fac0684e370e3fddccdade9258e6ff0eff2bcb6c6b242a85060c3578395 `test/cache/system-table-cache-lifecycle-reconciliation-grid.js`
- 5b92d9583b1a1991ab0fbc614b2ad1d048d6412bdf8e8f898a59b644ddda2b51 `test/cache/system-table-cache-services-lifecycle-merge.test.js`
- 76e265d3e716b8ab9be3bbdeff3b0f212df2e7b756d3590269bcb4b4ee471bb5 `test/rebalancer/operation-workflow-active-cache-handoff.test.js`

No blocking finding.

1. **Diff from a648c9ec.** Outside `solve/quests`, only the grid helper and the differential test differ. Its code lines are identical; only the header comment grew.
2. **Differential not weakened.** Old and new grid enumerate the same 400 combos and 134,400 cells (identical digest over every cell). The test keeps 7 explicit assertions (8 in TAP) and imported neither removed function. The fixture still equals main's output, 0 mismatches.
3. **Gates.** Unused exports 1321/1321. Unused files, eslint, cycles, file-size and the pre-commit hook pass on the full tree. Shard and impact-contract audits pass after the metadata refresh.
4. **Evidence.** The producer copy minus its two header lines is blob c7a6e9a82. Receipt wording, not blocking, outside the approval digest: "the landing tree differs from the measured tree only under solve/quests" is now false for a4c29e31, and `source.landingCandidate` and the golden item still cite the pre-repair runs. The current bytes were measured by 952fadbb (tree 04b6e854).
5. **Records.**
   - Cached `null` filled: v2 Q1 states it verbatim.
   - Columns outside the lifecycle group: v2 Q1 states it verbatim.
   - `raft_role = null` seed refilled: covered. Q1 fills any cached `null`, the transition record calls it "absent evidence, never newer evidence", and v2 routes the equal-version case by name.

## Mutants (lab; assertions as before)

- Control, cc60f473: 3/3, 241 assertions.
- Predicate not refusing, 5ff00838: differential Q3.
- Builder overwrites a present value, e3bf3910: differential Q2.
- Half rename, predicate copy without the incarnation guard, 2f105b05: differential Q3 only.

## Unchecked

The `npm test` change proof; the duplication ratchet (not re-measured); the red-main guard; the four generated `test/shards` files land will add.

Lab evidence is under `lagrange-foundation-coordination-20261114/lifecycle-row/verify-land2-*` (coordination records, not in git).
