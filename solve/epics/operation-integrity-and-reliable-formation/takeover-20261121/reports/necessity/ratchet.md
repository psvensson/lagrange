# Necessity audit: the one-way ratchet (supplementary)

Head `b638284d1`. This corrects and extends W4 section D. It does not design a second ratchet.
Lead ruling (2026-11-21): one checker holds the leader-authority rows (W3 section 5.2), the fallback-read rows (W4 D.2) and
the census buckets. Its writer starts when this audit reports.

**What it is for.** The ratchet stops counted sites from coming back and stops the evidence file from being doctored.
**What it is not:** proof that any behaviour works or that any arm is unnecessary. That proof is the executed experiment
(`experiment.md` B: a trap or deletion run with the interaction's witnesses green). For boundary arms, the lasting prevention
is a coupled-pair witness spanning the real producer, the publication boundary and the consumer (`experiment.md` D).
A quest's `doneWhen` must therefore never be the ratchet alone (see "Probes" below).

## 1. Cells

One baseline file (W4: under `data/`, beside the checker `scripts/checks/fallback-read-closure.js`). Cells are keyed
`row × top-level src directory`, plus the `bucket` dimension for the evidence family. Every cell may only decrease. The
checker replays the baseline's own git history, as `scripts/checks/no-legacy-consensus-reference-ratchet.js` does, and
refuses a missing baseline. It prints the standard tightening hint when the tree is below baseline. There are no
dispositions, no labels and no free-text reasons. A site leaves a cell only by ceasing to match.

### 1.1 Static syntactic cells (deterministic, every commit, in `test:static`)

`fallback_sites/<row>/<dir>` for the three census rows, from `detectNavigabilityPatterns` at the tree.
**Correction to W4 D.2:** its table has no cell for `two_source_fallback_reads` or `catch_returns_default`, and
`owner_port_feature_detection` covers the typeof row only. Without these rows, 2,034 of the head's 2,621 sites (1,660 two-source
plus 374 catch) are outside the ratchet. Baseline at the head (VERIFIED, computed with the repository's own detector; this replaces
W4 D.1's f580579a5 figure of 2,622):

| Directory | two-source | typeof | catch | Total |
| --- | --- | --- | --- | --- |
| control-plane | 345 | 124 | 48 | 517 |
| rebalancer | 246 | 77 | 54 | 377 |
| bootstrap | 121 | 116 | 34 | 271 |
| query | 140 | 38 | 28 | 206 |
| partition | 120 | 29 | 30 | 179 |
| admin | 78 | 28 | 20 | 126 |
| node | 66 | 26 | 19 | 111 |
| runtime | 74 | 9 | 26 | 109 |
| service | 67 | 12 | 16 | 95 |
| wasm-service | 67 | 0 | 13 | 80 |
| transport | 45 | 14 | 10 | 69 |
| raft | 22 | 13 | 29 | 64 |
| diagnostics | 51 | 2 | 3 | 56 |
| cdc | 24 | 18 | 3 | 45 |
| 24 other directories | 194 | 81 | 41 | 316 |
| **Total** | **1,660** | **587** | **374** | **2,621** |

### 1.2 Uncensused cells (deterministic: tree compared with the committed census)

`fallback_sites_uncensused/<row>/<dir>` counts sites whose identity `(row, file, hash, occurrence)` has no record in the
committed census. Target 0; one-way down.
- Baseline at the head: **24** new sites (rebalancer 9, query 8, partition 3, node 3, bootstrap 1), plus the one site whose
  record was hand-edited (`partition-cdc-delivery.js`), for 25.
- Consequence: **adding a fallback site anywhere fails**, and so does editing a site's own text. Both need a census refresh
  or deletion. Edits elsewhere in the file keep the identity, as the census defines it.

### 1.3 Evidence cells (deterministic: committed census compared with the tree, never coverage at check time)

`fallback_sites_bucket/<row>/<dir>/<bucket>`, with bucket ∈ {N0, N1, N2, N3, N4b, N4c, N5} as defined in `README.md`.
- **Between census refreshes**, every cell may only decrease.
- **At a refresh commit** (the census file's `head` changes), a site may move only toward *less* exercised buckets:
  N5 → N4c → N4b → N3 → N1/N2 → N0, or out by deletion. A move toward *more* exercised buckets fails. Production now relying
  on an arm the census said was unused is exactly the regression this program exists to catch, and it needs a lead decision.
  The checker prints each moved site.
- The family's target is 0 in N0-N3 (delete or type them). N4c and N5 reach zero by deletion or by moving into
  `fallback_sites_kept`.

### 1.4 Kept arms (the only exit other than deletion)

`fallback_sites_kept/<row>/<dir>` counts entries in a committed data file `data/fallback-census/kept.json`. An entry has
`{row, file, hash, occurrence, trapRun, witnessTest}` and **no prose**. The checker refuses an entry unless all of these hold:
- the site is in N4c or N5 in the committed census;
- `trapRun` names a committed trap result (`data/fallback-census/traps/<run>.json`, produced by the trap preload, bound to a
  head) in which this site's arm was armed in **throw** mode and the lane was red because of it;
- `witnessTest` is a `.test.js` file in `test/shards/primary-classes.json`;
- for a site whose arm reads a row field produced by another owner, `witnessTest` is also the `witnessTests` of a coupled pair
  in `test/shards/impact-contracts.json` whose two endpoints cover the site's file and the producer.

This replaces W4 D.2's allow-list rule (`{row, file, symbol, test}` with a passing receipt). A test name alone can be
satisfied by any test that mentions the symbol; a red trap run cannot be satisfied that way. Kind f (detector false positive,
for example a catch that returns a typed failure object) is fixed in the detector, with a test, not allow-listed.
`fallback_sites_kept` may grow only by moves out of N4c and N5.

### 1.5 The other families in the same checker

Same baseline file, same one-way rules: W4 D.2's rows (`fallback_read_mode_members`, `non_required_leader_mode`,
`repository_read_source_modes`, `fallback_contract_flags`, `fallback_identifiers`, `sequential_dual_read`,
`unavailable_collapsed_to_value`, `owner_port_feature_detection`, `legacy_term_identifiers`, `implicit_mode_defaults`,
`reduced_owner_fixtures`) and W3 section 5.2's families R (role-derived leader reads, target 0), W (non-conforming writers, target 0)
and F (fixtures, per-file identity ratchet).

## 2. Integrity of the evidence file

The census was hand-edited after its join: `9c3a10fdb` moved one site's range and hash, `5bc4d0769` moved the range back and
kept the new hash, and the site's coverage evidence came from text it was never measured on (VERIFIED). So the checker must
refuse a census that a join did not produce:
- `census.head` is an ancestor of `HEAD`;
- every site's `hash` reproduces from `git show <census.head>:<file>` at its `range`;
- every site's `runs` name runs listed in `census.runs`, with the five lanes present;
- the census file changes only together with its `head` and `generatedAt` (a whole re-join, never a partial edit).

Pure reads, about 2 s for 2,600 sites (VERIFIED: the detector parse of all of `src` took 1.9 s here).

## 3. What each cell proves and does not prove

| Cell | Proves | Does not prove |
| --- | --- | --- |
| `fallback_sites` falling | fewer syntactic fallback shapes in the tree | that the behaviour moved to a typed outcome rather than to a shape the detectors do not see (a comparison, a `switch`, a helper). The W4 rows and W3's family R cover the known semantic shapes; others stay possible |
| `fallback_sites_uncensused` = 0 | every counted site has evidence measured on its own text | that the evidence is recent: it is as old as the census head |
| N0-N3 = 0 in a directory | no counted site there has an arm unexercised by composed lanes | that the remaining N4c and N5 arms are needed: only a throw-mode trap says that |
| `fallback_sites_kept` entries | a red trap run and a named witness exist for each | that the witness still passes today: the change cone does that |
| any cell | a property of the tree and of a committed file | runtime behaviour. Each deletion slice needs its executed evidence |

## 4. Probes

- **Per deletion slice:** a `test-receipt` probe (W4 D.3's recommendation for safety slices). Required receipts:
  - `trap-run`: the slice's sites armed in throw mode in the lanes of `experiment.md` B, with zero hits for N0-N2, or the
    fixture migration done for N3;
  - `change-cone-green`;
  - `boundary-witness-registered`, where the slice has boundary arms;
  - `ratchet-cells-zero`: `node scripts/checks/fallback-read-closure.js --metric --rows fallback_sites_bucket --buckets N0,N1,N2,N3 --scope <slice files>` printing 0.

  The ratchet is one receipt among four, never the `doneWhen` on its own.
- **Epic closure:** the same checker over all rows and directories, plus wiring into `test:static`, `STATIC_AUDIT_SCRIPTS`
  and `test/manifests/proof-obligations.json` (W3 section 5.2 lists these).
- **Retire** `scripts/checks/check-repository-legacy-fallback-closure.js`, its exact-equality constants and
  `scripts/checks/code-navigability-fallback-classification.json` (1.9 MB of templated labels) in the same change (lead ruling H7).
  The census join's `fallback_sites_uncensused` budget row in `code-navigability-budget.js` becomes cell 1.2.
