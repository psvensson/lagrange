# Independent composed native-fixture preservation review

Reviewer: `subagent:/root/retained_effects_review`.
Date: 2026-10-23.

Verdict: **APPROVE the exact R2 77-path manifest for a non-main preservation
checkpoint and subsequently commissioned exact-source baseline measurement.**
The one R1 preservation finding below is resolved. No additional blocking
finding remains in this scope. This is source/artifact eligibility, not
runtime acceptance, MG production approval, Quest closure, publication or merge.

## Immutable scope

Base HEAD: `86fd86137cdbd3944f6eddcd34d7df04ab9b81e8`.
Production reference: `21cfd917d8ceb2f0c1435cade117c0c44a91a03a`.

Approved R2 manifest:
`MANIFEST-mg-delivery-native-fixture-followup-r2-2026-10-23.json`, byte-identical
to `/tmp/mg-delivery-native-fixture-followup-manifest-r2-2026-10-23.json`,
SHA256 `cca588b15750651e206967f1312164abec834057e5fe419f675cfcd568953b2e`.
All 77 listed working-tree bytes match their recorded hashes. The maximum
individual artifact size is 134,953 bytes.

The composed code is exactly:

| Test | SHA256 | Prior independent disposition |
| --- | --- | --- |
| `message-group-native-custody-handoff.test.js` | `7f4cf6984aadb9724b012bd1f32be53e3eda28d065a07a76a7cc5ff2f44cacb7` | RF3 R2 schedule/diagnostic correction approved in `REVIEW-mg-delivery-rf3-election-fixture-2026-10-23.md`, review SHA256 `ac1f34e0e57416ab014a7cc222034ddc24e5fb167a4062aaf05d3f65ab3c01e0`. |
| `message-group-native-provisional-route.test.js` | `929c7514e785e8a25713d89a7c6e49bfabd6d8e7ccd0910f50a70700cab4d744` | Failure-only passive cut approved in `REVIEW-mg-delivery-s2-passive-route-cut-2026-10-23.md`, review SHA256 `4853119da1323180a5822e29cf95dc0ad3940bf3ecca38b7c9fecd5f75dee889`. |

Both approved hashes were rechecked. No new test-source delta is hidden in the
composition. The `src/` diff is empty against both immutable references.
No dependency, baseline, command, runtime configuration or acceptance-seal
change is introduced.

The nine-category source judgments and their stated limitations in those exact
reviews remain applicable: admission, recovery, owner interaction, harness
fidelity, transport, concurrency/time, formation, retry and lifetime. RF3
retains its original bounded election assertion and subsequent loss/rejoin/
suffix/debt acceptance; the actual survivor status observations select the
winner. S2 retains every original assertion and bound and adds only its
synchronous missing-return diagnostic. Existing status reads in the witness
remain schedule operations, not generally passive probes.

## R1 preservation finding and R2 correction

The initial 74-path manifest, SHA256
`0913a8a967e7f13ecb32c0a57d5456179095e3af6b408758cfb249da20c8c41f`,
matched all listed bytes. However, it omitted the two original
`*-worker.log` files that the per-run preservation manifests expressly listed.
Those files existed and matched the authoritative streams but were ignored by
the generic `*.log` pattern. The complete encoded chunks were present, so no
original bytes were lost, but the promised raw-log commit scope was incomplete.
The reviewer required explicit inclusion before approving that preservation
claim.

R2 adds exactly three paths to the unchanged 74-path map:

1. The original 74-path manifest itself, preserved with its original hash.
2. The #1026 raw worker log, unchanged.
3. The #1049 raw worker log, unchanged.

Root explicitly staged the two raw-log paths using scoped `git add -f`.
This overrides a file-discovery ignore only; it changes no test, gate or
evidence content. I independently compared the staged blobs to the original
local worker bytes and the reconstructed chunk streams. All are exact.
The two original runtime preservation manifests and prior review history are
unchanged. R1 is preserved as an incomplete scope artifact; R2 resolves its
one finding without rewriting history.

## Original evidence and authored-proposal provenance

Every copied runtime artifact was compared byte-for-byte with its corresponding
previously reconciled `/tmp` artifact. Every file listed by the two per-run
preservation manifests has its exact byte count and hash. The RF3 R1 and R2
README, patch and proposal-manifest copies match their originally reviewed
author directories exactly. Rejected R1 and approved R2 remain distinct.

I also reassembled both complete original streams from the repository's
preserved evidence chunks, checked each chunk/raw digest, offset/next offset
and decoded text, and compared the final streams to the raw logs:

| Prior run | Executed source | Original bytes | SHA256 |
| --- | --- | --- | --- |
| #1026 | `4ce8fbd31b7c44129a3431752313b2e9c0ae19ab` | 79,861 | `ebd6c7de17da2592ee8683f1e1cc1c5c65655fe0132a8790854d41c4f45a6142` |
| #1049 | `86fd86137cdbd3944f6eddcd34d7df04ab9b81e8` | 59,196 | `2826f710e7a1e3a3b22ccdc4ebeb8896c13011e62aa45e7eb8a8b06ef3a88884` |

The raw logs retain their original whitespace. Decoded diagnostics, partial
views and first-chunk copies are analysis artifacts; none substitutes for the
complete original stream or changes the terminal result.

The exact independent lab reviews are preserved:

- #1026 review SHA256
  `cf2991f3d8d84cdb90077999aa7ab8bdaef537d5ce1a2962e4db7ad84405deb4`.
  Overall FAIL. RF1's native-afterCommit semantic red engaged; RF3's source
  debt/uncommitted recipient cut engaged but its survivor election prerequisite
  failed before suffix replacement/redrive. Do not claim the later RF3 cut.
- #1049 review SHA256
  `7956488ddaa2975eb90cff87c9fac6fd321cdc74f0eb4833831910639d08d01f`.
  Overall FAIL. Actual source release/native formation/retained reopen/query
  debt setup engaged; no matching F2 return was recorded at the first
  prerequisite. The intended S2 semantic result and later F3 release remain
  unengaged. The batching explanation is a static candidate, not a measured
  cause.

All prior requests, receipts, full stream custody and pre/post-fleet
observations retain those exact run/source identities. Preserving them in the
new checkpoint does not transfer their runtime applicability to the changed
tests.

## Generated metadata and static evidence

Only two derived metadata files change:

- `test/shards/impact-graph-seal.json`: source/producer/snapshot digests reflect
  the two reviewed test changes; resolver-state digest is unchanged.
- `solve/changes/global-owner-debt-inventory/inventory.json`: import-graph and
  logical test-duplication input identities/digests refresh. The underlying
  debt counts do not increase.

I compared the full generated diffs with the base and confirmed
`signalCounts` is unchanged: cognitive 152, complexity 1,811, duplication 511,
fileSize 45 and lintExclusion 39. Source duplication remains 47 clone groups /
1,462 duplicated lines; test duplication remains 701 / 26,618.
These are inherited debt inventories, **not blanket static clearance**.
No baseline was raised.

Root reports the normal pre-commit invocation completed successfully.
The inspected preserved local output shows its ordinary inventory refresh and
generated-test-metadata refresh, including explicit inherited complexity and
duplication ratchet messages. I did not rerun that hook or reinterpret those
messages as zero debt. Its log is
`/tmp/mg-delivery-native-fixture-followup-precommit-2026-10-23.log`,
3,310 bytes, SHA256
`b68720f950334723199b0a875a06236ce94b715ec6dfdec0fc979da3398609a0`.

The independent static results supplied by that invocation's follow-up are:

- Impact-contract audit PASS: 71 contracts, 44 coupled pairs.
  Log SHA256 `9675a5af43e01f87229912f9483a4d209b9c2d73eeabe2466a893ba001800ff8`.
- Shards/classifications current: 2,445 tests, 22 subsystems; unit 2,116,
  integration 109, bootstrap 213, convergence-probe 3, packaging 4.
  Log SHA256 `4876c8a64ae59340af695c0fbf9110042f908b8390caf478e17558ad189c8304`.

The exact tests retain their prior independent syntax/scoped ESLint checks.
I additionally checked staged whitespace for the authored tests and two
generated metadata files. Raw captured worker logs were not edited to satisfy
formatting rules. There is no runtime measurement of this composed candidate.

## Remaining gate and scope

This approval binds the R2 77-path map. Its self-manifest, this new review and
the root's append-only Quest record may be added as bookkeeping without
changing reviewed source or evidence bytes. Root must verify the preserved
commit's manifest blobs and remote source identity before commissioning a new
baseline. No source workload is authorized merely by this review; root owns
the explicit request.

The next exact-source two-file baseline must distinguish real native RF3
election/loss/suffix behavior from setup failure and use S2's new failure cut
to identify actual dispatch/queue state. No baseline result is predicted or
claimed here. The complete MG interaction, broad W7 provisional progress,
activation/custody, transfer, composed two-start acceptance and full Quest/
merge gates remain separate.

The reviewer wrote only this new evidence review. No source/test/metadata
edit, runtime test, lab workload submission, commit or push was performed.
