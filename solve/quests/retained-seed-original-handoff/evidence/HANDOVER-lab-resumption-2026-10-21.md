---
audience: development
documentClass: current
---

# Original handoff continuation: lab resumption and verified boundaries

Date: 2026-10-21. This record is appended to the existing retained-seed-original-handoff quest; it changes no seal or acceptance receipt.

## Continue from one branch

Use `work/original-handoff-boundaries-20261021-cloud`. Before this documentation checkpoint its tip is `1def2a5dd2e352ed08d36cd66989f3413e12a111`. The containing documentation commit is a preservation checkpoint, not a newly tested source revision. Main, shared integration and other agents' indexes/checkouts were not modified.

The production implementation remains the shared-birth owner checkpoint `dfbb579b4a2606aec0c21be4376833acfb7ec912`. This continuation changed only witness formatting, verification wrappers and evidence. It did not implement the remaining nonserving startup or R1/R2 production interaction.

Do not resume the superseded partition-only duplicate `47b92170`. Negative-control and metadata-generation branches below are evidence, not merge candidates. Inspect live branch state before writing and use a non-forced expected-SHA update.

## Capacity and lint recovery

The operator reported controller disk capacity restored. Fresh lab request #651 executed at verification head `de6766acd3f4f692556ac06ec96f104f0c4088ed` and completed FAIL on 21 real lint diagnostics, not a storage refusal. Its checked production/test bytes were unchanged from the shared-birth checkpoint. Evidence #653 retains the initial log chunk.

Commit `51fa486bbf4640a45d96ecdb3230cdaff1366917` corrects only braces, wrapping and string-quote spelling in four test files, preserving test values and assertions. It folds the repository-configured scoped ESLint wrapper into the existing continuation and checks that wrapper too. No ESLint override, rule change, timeout increase or baseline ratchet was used.

Capacity finding #650 is closed with completed execution evidence. This is not a claim of permanent free capacity or of any particular cleanup method. Old refusals #647/#649 and their request identities remain preserved. No controller-policy relaxation or filesystem deletion was performed here.

## Exact-candidate positive results

All four batches below ran on `tv-dator`, retry 0, with machine locks and thermal guards, staggered after predecessor execution settled. Every row is measured at the SAME exact commit `51fa486bbf4640a45d96ecdb3230cdaff1366917`.

| Lab issue | Scope | Files | Runner-reported assertions | Result |
| --- | --- | --- | --- | --- |
| #656 | Scoped repository ESLint, partition exact-birth, MG exact-birth | 3 | 31 | PASS |
| #658 | Lifecycle runtime-generation, owner-aware retirement census, partition readback controls and both existing row-owner suites | 5 | 126 | PASS |
| #659 | Original allocation store, preparation, cold inspection and resource custody | 4 | 72 | PASS |
| #660 | Identity-record window, durable-rejoin refusals, initialization/shutdown serialization and durable commit synchronization | 4 | 20 | PASS |

Total: 16 distinct files and 249 runner-reported assertions, INCLUDING the scoped-lint assertion. The row-owner fault-injection tests are not full native consensus or public-startup witnesses. This is executor evidence, not independent review, corpus proof or merge certification. The accompanying JSON records request IDs and complete-log hashes; controller issue receipts retain the actual execution reports.

## Matched source-negative results

Both controls are one-line source regressions of the positive `51fa486b` candidate. The partition and MG exact-birth witness files are byte-identical to that candidate, as verified by commit comparison. They must never be merged.

- #661, `237718ad24cc9cbca0cc0d6a64e01b10e2d819b2`, branch `negative/original-birth-created-at-51fa486b-20261021`: removes only `COLUMN.CREATED_AT` from the shared birth fields. Five intended cases fail: older/newer incarnation for partition and MG, plus MG lost-answer adoption of a successor. Positive exact-birth and token controls still execute. #663 retains the initial log chunk.
- #662, `36fb07c7b38f6f431e74e530cc34c23f81aac5d1`, branch `negative/original-birth-token-51fa486b-20261021`: removes only creation-token equality. Four intended cases fail: foreign/missing token in both registration owners. Incarnation controls remain green. #665 retains the initial log chunk.

These are assertion failures at the relevant owner, not setup, thermal or timeout failures. The original predecessor RED and the earlier failed lint attempts remain intact.

## Static gates: what passed and what did not

Commit `1def2a5dd2e352ed08d36cd66989f3413e12a111` adds only a CLI integration wrapper invoking existing package commands sequentially, its scoped-lint inclusion and scope documentation. Production and behavioral witness bytes remain unchanged from `51fa486b`.

Lab #664 completed at that exact head:

- Scoped ESLint: PASS, including both wrappers.
- Canonical `test:deps`: PASS, 5,435 modules and 23,266 dependencies, no dependency violations.
- Canonical `audit:impact-contracts`: FAIL.
- Canonical `audit:shards`: FAIL. Curated shards are current; primary classification identifies ten unclassified paths. Later resource/subsystem checks are not established by this failed run.

Evidence #666 retains the beginning of the log and actual per-command outcomes. The many coupled-witness messages follow an invalid primary manifest; do not automatically classify them as independent behavioral defects.

The ten missing primary classifications are the two closure wrappers, MG exact-birth, partition exact-birth/readback-controls, lifecycle-retirement-census, and the four original-allocation suites. No generated manifest has been hand-edited or committed during this continuation.

## Regeneration correspondence: successful, but not committed

Verification-only branch `verify/original-metadata-generation-20261021`, head `2a2e2059c81cd92c38fdfaa73109f911723a1c3f`, adds an isolated producer-correspondence test. Lab #667 completed PASS at 17:03:32Z.

The test requires an isolated Git worktree and checkout-local regular manifest files. It retains the three exact original buffers and registers restoration before writing. It then runs the existing primary/resource/subsystem CLI generators, followed by canonical impact-contract and shard checks. Teardown attempts and verifies restoration of all three inputs, including after a failure. Its PASS establishes that those canonical producers and checks succeed in that generated temporary tree and that restoration succeeds.

IMPORTANT LIMITS:

- The committed continuation manifests are STILL stale. #664 remains a valid RED.
- The verification branch adds one extra test path, so its generated census is not automatically the production continuation's census.
- The test prints generated hashes/diff, but the canonical runner suppresses passing test stdout. The controller's #667 receipt exposes the passing execution, NOT those generated bytes. Do not invent a patch or infer manifest hashes from the receipt.
- No generated-worktree PASS closes committed-candidate gates. Regenerate the actual continuation checkout, commit the real producer outputs, and rerun the exact resulting head.

## Remaining implementation boundary

First finish committed metadata and applicable review/static gates. Do not rerun already green source tests solely to inflate counts; remeasure after relevant changes and keep source identity explicit.

Then implement the approved R1/R2 interaction as a coherent owner boundary. Existing registration and lifecycle owners remain authoritative; add no parallel grant store, mutex or bootstrap controller. The original attempt must install nonserving ingress and autonomous-writer exclusions BEFORE native opening, classify complete retained history read-only, and preserve legitimate pending original application through its existing owner.

The inspected activation seam is still incomplete: registered activation holds its effect section for ACTIVE CAS/readback, while the partition row owner's leader publication occurs afterwards with a partition-ID-only predicate. The approved original interaction must retain the existing replica lane, exact-runtime participation claim and activation-effect section through exact source resolution, ACTIVE, foundation-bound leader publication/readback and durable SUBMITTED-to-TRANSFERRED recording. The ordinary lifecycle CAS already includes created_at and create_attempt_token; do not duplicate or falsely report that check as absent.

Current leader role, valid native term and the identical captured tenure token must be checked together at the required effect boundaries and after waits. Original-mode exclusion belongs at actual mutation/retry/resumer/sink owners, not only the leader callback. Shutdown revokes first, joins admitted activation effects rather than unrelated queued lane work, and retains exact resource debt on cleanup failure. Public admission remains closed. The genuine cold public-entry witness is a later composed gate, not replaced by owner-level tests.

All eight sealed acceptance rows remain false; receipt blob `a47b98ab36a8eff61a88cea5153466645c0e380c` is unchanged. No independent source approval, Solver landing, publisher run, full corpus proof, public serving, RF3 multi-host, U1/TX1/FreshMG or release acceptance is claimed. There is no pending lab execution from this continuation at this checkpoint.
