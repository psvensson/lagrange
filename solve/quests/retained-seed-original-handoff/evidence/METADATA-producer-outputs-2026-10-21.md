---
audience: development
documentClass: current
---

# Committed canonical metadata: producer correspondence

Base: d2d7c7504bc0b5134828e41243078fb004588ae8.
The operator requested completion of the remaining metadata step and merging anything eligible to main. This checkpoint changes generated test metadata and this evidence record only. No production source, behavioral witness, generator, acceptance receipt or gate is changed.

## Exact producer execution

GitHub Actions run 39645041972, job 119378254122, used workflow commit 484a90af7e5105d7c5a24d59641440f850fdc3e3 but checked out the base SHA above, with locked dependencies. The diagnostic metadata-generation test is NOT in this input census.

The existing `npm run -s test:metadata:refresh` generated all four tracked outputs. A second invocation reproduced every output byte. Canonical `audit:impact-contracts`, `audit:shards`, `test:deps` and `git diff --check` passed. The census is 2432 tests: 2108 unit, 108 integration, 209 bootstrap, 3 convergence-probe, 4 packaging; there are 22 subsystems, 68 impact contracts and 40 coupled pairs. Dependency analysis reported 5435 modules and 23266 dependencies with no violations.

The run uploaded only the four generated Git blobs, then read each back and compared its full bytes to the producer output. It did not update a ref or merge anything. The connected publisher assembles these existing content-addressed objects into the continuation using a non-forced expected-head update.

| Output | Git blob | SHA-256 |
| --- | --- | --- |
| test/shards/primary-classes.json | aec52e9a02eb44bcea9dabbcb94017b96968558c | 8a9e5332eed0e02f63030556b485f479bf7c311ccf96e815fe99e0635dbac8ac |
| test/shards/resource-classes.json | de988e70fc602ce87e21191c6bc507fa0c86b66b | 3184d7e40ebdbb4f306ff64f7df0f2c9a24d8dab91a4ad05fedb01f376df87a9 |
| test/shards/subsystem-classes.json | f00ce961d615fe8a77139d3d025434d7839f9967 | 162fcffb1533c83976cbc4f57f3e9040c2ce5ff859856d642081df97f4ba0ae2 |
| test/shards/impact-graph-seal.json | 35c427f6ee90c94a70ceb43864223261881ab313 | 7106e66d7f5156769bf4f7586fd9790a4312e6226718c184b6772c217e87554c |

Run artifact 12367216775 retains logs, full patch, output bytes and object manifest; archive SHA-256 is 34ddd7df84ccab1a044e0909a99558a07932e4e9fca49070ad4dd64c388da766. The committed objects, not the artifact retention period, preserve the actual metadata.

## Earlier failed attempt retained

Run 39644629585 passed generation and repository audits but failed before upload because its explicit export allowlist named only the three classification manifests. The canonical refresh also owns test/shards/impact-graph-seal.json. The corrected workflow explicitly includes and checks that fourth output. No unrelated generated content, handwritten manifest edits, lowered thresholds or discarded producer output were used. The impact graph digest is not a Quest acceptance seal; all eight handoff acceptance rows remain unchanged.

## Proof and main-merge boundary

Hosted producer/audit results do not claim native lab acceptance. The containing commit must be submitted to the existing lab for the unchanged scoped-lint/static wrapper and focused regression checks; only terminal receipts for that exact SHA establish those results.

Main was inspected at b1c8dddad5b77e990c3b00b2ab3514b894d3b80e. The base continuation diverges by 1187 commits ahead and 17 behind. These manifests describe the continuation's source and tests, not main's census; cherry-picking them alone would be incorrect. A full merge would include unfinished cutover work and is not justified by these scoped checks. A separately extracted production correction needs its own exact-main candidate gates and required source review; no independent approval, Solver landing, publisher/corpus proof or main merge is claimed here.

Next boundary after committed metadata verification remains the approved nonserving startup and R1/R2 interaction. Public cold-start handoff, activation-through-publication custody, joint current leader/native term/exact tenure checks, callback exclusions and composed cleanup remain unimplemented by this metadata increment.
