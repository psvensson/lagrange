---
audience: evidence
recorded: 2026-11-14
quest: service-lifecycle-reconciliation-row-integrity
---

VERDICT: REJECT

State examined: HEAD 232082669, candidate tree a648c9ec858d. sha256:

- e9ce37c7f9f7c966586fafbeceef7bf9acb08f347d4f6bd205bd32a8885d000e `src/cache/system-table-cache-authoritative-reconciliation.js`
- 981c24dddcfc2bf0305d1912489995b8a7b0503f587f0e4033a3c8224f72e89e `test/cache/fixtures/system-table-cache-lifecycle-reconciliation-golden.json`
- da8348354ae5f30fbc01746fcf86d40906eef12eadd5bd40affdc52c6dcc4dc4 `test/cache/system-table-cache-lifecycle-reconciliation-differential.test.js`
- 17c02e75f5bad9cc321bce4877f91329bc3b5cef959ae217a88f0f3d63715a15 `test/cache/system-table-cache-lifecycle-reconciliation-grid.js`
- 5b92d9583b1a1991ab0fbc614b2ad1d048d6412bdf8e8f898a59b644ddda2b51 `test/cache/system-table-cache-services-lifecycle-merge.test.js`
- 76e265d3e716b8ab9be3bbdeff3b0f212df2e7b756d3590269bcb4b4ee471bb5 `test/rebalancer/operation-workflow-active-cache-handoff.test.js`

## Blocking (not behavioural)

`test/cache/system-table-cache-lifecycle-reconciliation-grid.js:267-269,278` exports `CELL_STATE`, `GRID_COLUMNS`, `bitsToHex` and `summarizeCombo`. Nothing imports them; the golden producer that would is not committed. The unused-export ratchet fails at 1325 against baseline 1321; main alone measures 1321/1321. Reproduce: `node scripts/check-unused-exports.js` on main plus the six files.

The ratchet is a publish-gate stage (`.githooks/pre-push:368`) and runs in CI (`ci.yml:250`), so this state cannot be published. No part of the frozen claim breaks. Repair is test-only: de-export, or commit the producer.

## Behavioural claim holds

- Source equals 5778ba12e after the three-line rename; test files are byte-identical; main and 9a22bf79b agree on the pre-existing files.
- The fixture equals main's own output (134,400 cells regenerated, 0 mismatches). The candidate changes 288 builder cells, all cached `null`. 46 own probes agree with v2/v3.

## Summary versus log (log governs)

- "Absent or undefined" omits `null`; filling a cached `null` is the only builder change.
- The fill applies to columns outside the lifecycle group, not inside it.
- "Owner-local seeds preserved" holds for non-null seeds only: `replica-handler-create-status-methods.js:602` seeds `raft_role = null`, refilled unless a cached version is newer; v2 routes only equal versions.

## Mutants

Lab, three core files; control ae0a5afa green; full ids: `lifecycle-row/verify-land-*/job.json`.

- Builder not filling, e95dbeab: "the null cached role is filled".
- Cached null treated as present, bf5e1199: same assertion.
- Authority null fills, builder only, 7d765b8d: survived; equivalent, 0 of 134,400 outputs differ.
- Authority null fills, shared helper, a5c257f6: "the installed authoritative row is aligned".
- Authority null wipes a present value, 47fbf446: "the seeded voter role is kept".
- Builder overwrites a present value, b206d88a: differential Q2.
- Predicate not refusing, 9b635e4f: differential Q3.
- Incarnation guard dropped, 62658edf: "another incarnation (create_attempt_token) keeps its null".
- Lifecycle guard dropped, 4bf8dbbf: "a strictly newer cached lifecycle keeps its cleared role".
- Row-version guard dropped, 629f9df4: "a non-finite authoritative updated_at fills nothing".
- Half rename, old name undefined, 27bf70a7: ReferenceError in all three files.
- Half rename, predicate on a copy lacking the incarnation guard, aa18c8a5: differential Q3 only; that copy in the builder, 2c7c893c: Q2.

Identical helpers under both names: equivalent, caught by the decision-boundaries check.

## Main versus the line

Main lacks the line's 86 commits. Eleven `src` files differ; none is on the reconciliation, handoff or projection path. Neither earlier report records the unused-export ratchet.

## Evidence and rename

- Green tree a4c29e31 differs from the candidate only under `solve/quests`; red tree 1352b00e is main plus the tests.
- In-git evidence shows host, outcome and tree; assertion counts rest on records outside git, which match.
- The rename is truthful: old name 2 hits, candidate 0; both functions only compare two rows passed in.

## Not checked

The `npm test` change proof; the duplication ratchet (my run timed out); whether any test drives the role-publication guard refresh (`partition-service-core-base.js:501`).
