# W07 / F1 review preservation receipt

The source and all tests remain frozen at `4aa8780cfec6f2718b86b4d1e27ee9711492be59`. The separate test-only checkpoint is `04391697aeabea5ddd504491321546212b95982e`. The archive's exact evidence snapshot is `c3c9154b3a6e56e6cc709edc383d02e1cec24145`; later Git changes record only publication receipts and evidence indexes.

Archive: [runtime-captured-inbound-extent--LAGRANGE_W07_F1_ORDERING_REVIEW_20261015T175613Z.tar.gz](https://github.com/psvensson/lagrange/releases/download/solve-evidence/runtime-captured-inbound-extent--LAGRANGE_W07_F1_ORDERING_REVIEW_20261015T175613Z.tar.gz)

- SHA256: `4ac3fe1a00de994fbfab92212d94da18d519f9a345dc8dd3d8bf0801ac72f8fb`
- Bytes: 2633055
- Payloads: 534, each verified after fresh local extraction.
- Manifest SHA256: `e6c773b5ad33378da75c0b70f90c8f6b26ea7b0e5ef3b832442bbe344285cf1f`.
- Existing `solve evidence add` uploaded without replacement, downloaded again and verified the archive SHA256 before appending its Quest finding. Exact receipt: `evidence-upload.json`.
- Review branch: `review/runtime-captured-inbound-correction-20261015`, normal non-force preservation only. The source head was separately verified remotely before evidence publication.

The Git mirror is not the full archive: external orchestration scripts, comparison Git bundle, large proof plan/initial duplication scan, and large raw log/outcome payloads are archive-only. Some mirrored raw logs use `.log.txt` to retain exact bytes despite `.log` ignore rules. Full archive `SHA256SUMS` binds all payloads. Only unrelated pre-run controller relay copies were omitted, as listed in `IDENTITY.json`; originals remain local. The comparison bundle requires the published source commit.

Scoped native result: 11 files / 56 tests pass; all three unchanged-test negative treatments fail their intended semantic assertions. Same-host F1: predecessor155/155, candidate152/155. Canonical cone:1339 files pass,96 fail,7 incomplete after normal owned cancellation; no blanket inherited classification. TV completed before cancellation, so only Adam's controller was interrupted. Existing static reds and WIP-only source preservation remain disclosed in `REVIEW-REPORT.md`.

`ORDERING-DECISION.md` SHA256 `5d51400fa81cf84aa0b28d817a53a4630111d4a98d2b94beec2c3001a458ce03` received independent approval for document preservation only. It proposes finite service with truthful acceptance, retains the F1 regression, and names Wasm and message-group consumer proof blockers. No supersession, new tests or source work are approved by this receipt.

Whole increment and complete release protocol remain HOLD. Quest probe remains metric2/target0. No merge, terminal landing, successor activation/sealing, historical witness change or ratchet increase. Shared integration head and all18 staged paths remain unchanged.
