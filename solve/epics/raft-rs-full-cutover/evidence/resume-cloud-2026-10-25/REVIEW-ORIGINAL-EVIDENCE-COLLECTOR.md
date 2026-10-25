# Original lab artifact collection — independent source addendum

Reviewer: `subagent:/root/metric_review`. Date: 2026-10-25.

**APPROVE the bounded collector and native/metric/cohort wrapper source revision.** No blocker was found in the reviewed source. This is a collection/source verdict; no collector, test, lab submission or remote runtime was executed by this reviewer, and no installed log capacity or final new packet is certified.

Collector SHA-256: `04d8b1994a234cfeff80777d6b8b1dad1feb22acda087326c78eaab3f872c886` (4,689 bytes). `original-evidence-collector-source-binding.json` binds the exact standalone source, the three prepared scripts, their matching jobs.json script bytes, README, and the unchanged canonical launcher observed during review.

## Collection ownership and byte integrity

The collector reads only named already-produced runner files, their original ledger and an explicitly supplied receipt. It does not rerun a test, alter a receipt, remove original evidence, or publish into another store. Its temporary gzip lives in LAB_WORK_DIR, which the actual worker source binds to the same run's disposable work directory. Regular-file checks, pre-open versus opened-inode fingerprints, post-read fingerprints, and byte counts prevent an observed replacement or concurrent file mutation from becoming a complete artifact claim.

Raw input is streamed in 64 KiB pieces; compressed output is framed in 3,072-byte pieces. Each artifact has original and gzip sizes/hashes, contiguous offsets and per-frame hashes, followed by an end record. File-level errors produce explicit unavailable records and collection-end complete false. The caller still has to receive and verify every byte; a digest is not replacement evidence. The collector's bounded working memory does not establish sufficient installed disk or log capacity.

The exact test list equals the collector list in each reviewed wrapper: 19 native files, 7 metric files, and 1 cohort file, with no duplicates. The embedded collector in all three scripts is byte-identical to the standalone file. Each wrapper matches its jobs.json script bytes.

## Command identity, empty stderr and failure semantics

Every wrapper verifies the actual checked-out HEAD equals its fixed source SHA and verifies a clean worktree before invoking tests. That same SHA is passed into collection. Metadata is therefore paired with an actual source check, rather than merely printing a caller's assertion. The normal classified runner remains the test owner; retry is disabled by the existing job environment.

The native discriminator runs first. The second native phase runs only after its zero exit. `test_status` records the final actually executed command: the first failure, or the second phase's result after a successful first phase. Original per-file ledger entries retain the phase outcomes. All wrappers capture command status before collection under `set +e`; a nonzero command exit takes precedence, and otherwise a collection failure becomes the wrapper exit. Collection never converts a failed test into success. Files from an unreached native second phase are explicitly missing, not invented as failed tests.

Independently read `scripts/run-test-files.js` at each exact prepared source commit. The owner opens both `<file>.tap` and `<file>.tap.stderr` with write mode before starting a test. Therefore an executed file has a real empty stderr file when it emits no stderr. Absence before the runner reached that file remains unavailable collection evidence; it is not equivalent to a product assertion failure. The named output paths and ledger match the collector. The cohort runner has a different blob from native/metric; its relevant output path and creation contract was inspected separately rather than assumed identical.

## Existing transport and retention limits

Independently read the worker, log sink, evidence adapter and retention documentation at Lab source `715151f808247d719076be368d6c0491f52511f7`. The current source retains full output when its log limit is unset; a configured limit retains a prefix and marks truncation while still hashing/draining the full stream. Evidence reads use original custody and stream identity, 1–8,000-byte windows, verified offsets/counts/checksums, and complete only after terminal EOF without truncation. The existing redaction boundary remains in force; any changed artifact frame must fail the receiver's byte/hash validation.

README correctly leaves the installed limit and retained capacity unknown. It requires each artifact's complete framing and hashes, collection-end, worker log_truncated false, actual terminal scope closure, and complete final EOF. The documented raw-log policy is seven days and 1 GiB per collector root; this is not an installation attestation. Missing, expired, truncated or interrupted output remains incomplete evidence, with original execution identity retained. A terminal summary or rerun cannot replace it.

The existing canonical launcher approval is unaffected by this collector change. Composition/predecessor job additions, final source SHAs, protocol data and the final ZIP still need their ordinary exact-data/applicability checks; this report makes no claim about additions that were not present in the reviewed packet.
