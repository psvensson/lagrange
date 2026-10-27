---
audience: development
documentClass: evidence
---

# RS-raft handover: verified checkpoint and interrupted effect-classification draft

Recorded: 2026-10-23. Repository: psvensson/lagrange.

## Disposition

The verified retained-native-history and participant-origin checkpoint is preserved on GitHub. The newer retained-command effect-classification draft is NOT confirmed pushed or recovered. This handover must not be described as preservation of all of that draft's source changes.

GitHub write access is working: the connected GitHub tool successfully created `wip/rs-raft-handover-20261023` from the verified checkpoint, and this note is being committed through the GitHub contents API. The unresolved issue is availability of the newer draft's Git objects/source bytes, not a demonstrated permission failure.

This is documentation and recovery-metadata preservation only. It does not change runtime code, tests, acceptance terms, receipt values or main. No new runtime tests, repository gate, independent implementation review, Solver landing or release publisher were executed for this handover.

## 1. Exact identities

| Item | Identity and disposition |
| --- | --- |
| Verified saved checkpoint | `bcba7d2ab8f3987c7a46e50b405bfa07e116ebe9` |
| Verified checkpoint tree | `9cff5337b798fb90ffc8fc1aa3e93dd0874eb214` |
| Continuation branch observed during recovery | `work/original-handoff-boundaries-20261021-cloud` -> `bcba7d2ab8f3987c7a46e50b405bfa07e116ebe9` |
| Existing final-proof branch | `work/original-retained-final-proof-20261022` |
| Exact previously lab-tested candidate | `d7ef793be58af944639e6fae69a2c023c85e9002` |
| Frozen candidate branch | `work/original-retained-rf3-correction-20261022` |
| Separate handover-preservation branch | `wip/rs-raft-handover-20261023`, initially created at bcba7d2a |
| Newer reported local draft commit, NOT recovered | `feefa272898d509a3dd9537b2aac60c6e87a375b` |
| Reported local commit message | `Classify retained original foundation effects without opening startup` |
| Reported local draft tree | `f98e7a21ad4bb6668b650d2517d52965c51293c5` |
| Reported local draft production tree | `108072e93f0365d018475b67cd6da38c07034de5` |
| Reported local draft test tree | `6ddd63c6b12d22f3dfdbdf5c568a91765ac25e43` |
| Reported draft diff | 42 changed files; 2,774 insertions and 148 deletions |

The feefa272 identities and diff statistics come from a recovered historical manifest, not a fresh inspection of that commit. Hashes identify missing bytes; they do not recreate them. Do not associate the earlier passing lab results with feefa272.

The verified checkpoint's production and test trees are identical to its tested candidate. The newer manifest records different production and test trees and therefore represents a different, unverified candidate.

## 2. Completed verification that must not be lost or rerun as pending work

The exact d7ef793b candidate completed these jobs on October 22, 2026:

| Job | Worker | Result |
| --- | --- | --- |
| [Runtime #855](https://github.com/psvensson/lagrange-lab/issues/855#issuecomment-6347034607) | local-workstation | 14 selected, 14 completed, 14 passing files; 221 runner-reported TAP assertions |
| [Metadata/static #856](https://github.com/psvensson/lagrange-lab/issues/856#issuecomment-6347024387) | tv-dator | 2,440 classifications; all 14 fast-static checks; metadata, static and tracked-tree exits zero |

The existing checkpoint records closed execution, thermal and container scopes for both jobs. The successful RF1 case exercises actual committed ENABLE persistence, cold inspection/reopening and replay of the same origin. RF3 exercises locally uncommitted -> committed-pending -> applied progression using an actual held native commit carrier, on one host. It is not cross-host certification. The 221 figure is the project runner's reported assertion total, not an invented aggregate cancellation counter.

The RF3 test was corrected to consume the existing role-aware `raftRsConfStateKey` identity rather than ordered voter-array equality. Production code did not change for that correction. The original failures, diagnostic observations and independent result review remain in the existing evidence directory.

Read these preserved records at bcba7d2a:

- Verified checkpoint (`CHECKPOINT-retained-history-verified-2026-10-22.md`).
- Complete measurement and receipts (`MEASUREMENT-retained-corrected-d7ef793b-2026-10-22.json`).
- Independent review history, Entry 9 (`REVIEW-retained-history-2026-10-22.md`).
- Runtime log (`RUNTIME-retained-corrected-d7ef793b-2026-10-22.txt`).
- Static log (`STATIC-retained-corrected-d7ef793b-2026-10-22.txt`).

Earlier #820/#821 intake trouble is historical, not the current reason the classification draft is unavailable. The later verification above completed. No new lab request was submitted by this recovery/handover action; no background continuation is claimed.

## 3. Recovery findings and limits

The historical workspace was `/workspace/scratch/fb19a647cca6/lagrange`. The reported original manifest was `/workspace/scratch/fb19a647cca6/retained-effect-candidate-manifest.json`.

A current container check found the historical checkout absent and no Git metadata under the inspected workspace/data/tmp roots. It did find two recovery-metadata files under `/mnt/data/rs-raft-handover-2026-10-23/`: `RECOVERY-retained-effects-feefa272-2026-10-23.json` and `manifest-rows.txt`. The JSON explicitly describes itself as a transcription from historical output, not a source archive or fresh byte verification. Its 42 entries retain paths, blob IDs, byte lengths and SHA-256 values.

The recovery attempts recorded in this conversation found:

- GitHub Git-commit lookup for feefa272: 404; ordinary commits lookup: 422, no commit found for SHA.
- GitHub lookup of the reported f98e7a21 tree: 404.
- GitHub lookup of the reported `seed-original-effect-classification.js` blob: 404.
- Branch searches did not identify a newer retained-effect classification publication.
- Library searches for the exact commit, original manifest filename and classifier filename did not recover its source archive.
- A successful branch creation proves write access; none of the missing-object responses establishes a global permission outage or permanent destruction of the original workspace.

Consequently there is no basis to claim a clean original worktree, all changes pushed, complete source recovery, or runtime approval of feefa272. The absence of a reachable archive in these checks is not proof that no other copy exists.

The companion `RECOVERY-retained-effects-feefa272-manifest-2026-10-23.txt` preserves the full transcribed file inventory. Its format is `path|git_blob_sha|byte_count|sha256`, one row per file, all reported as mode 100644 and type blob. This inventory is recovery metadata only.

## 4. What the reported draft covered

The manifest identifies changes in the original allocation declaration/startup/preparation interaction; canonical foundation-effect and SQL construction; participant/committed-statement observations; CDC source obligations; message-group command admission; and unit/native integration witnesses. It also identifies runtime/impact contracts, generated metadata, a draft contract, a review record and the append-only Quest log.

Those filenames are not evidence that their implementations are correct or complete. The source contents and draft review record have not been recovered here. A historical progress report also says MG event-content correspondence could not discharge source CDC obligations because exact source-occurrence identity was not retained. Treat that as an investigation lead to verify against recovered source, not a newly established implementation verdict.

Do not manufacture a replacement with the same claimed hash or present a newly written classifier as recovery of feefa272. A reconstruction is a new candidate with new identities and applicable proof obligations.

## 5. Receiving agent: first actions

1. Re-read current `AGENTS.md`, `docs/steering/rules.md` and `docs/steering/router.md`, then the relevant runtime/authority contracts and the current epic summary. The last main observed during this preservation task was `240dfaaac22402f5ba8f80dbe5df520e8a450644`; re-resolve it rather than assuming the older checkpoint's steering is current.
2. Attempt exact-object recovery in the original cloud checkout/session or another surviving clone/archive. Inspect before changing files, indexes, HEADs or branches. Locate feefa272 with `git cat-file -e feefa272898d509a3dd9537b2aac60c6e87a375b^{commit}` and inspect its parent and tree if present. A freshly cloned bcba7d2a cannot restore an object that was never uploaded.
3. Before using a recovered draft, verify the exact commit/tree, parentage and every changed-file blob, byte count and SHA-256 against the recovery manifest. Preserve any later uncommitted changes separately. Publish recovered work to a non-main preservation branch without force or rewriting another agent's branch, then read back the remote SHA.
4. If no complete source copy can be recovered, record that result and rebuild from bcba7d2a as a new candidate. Do not replace the historical records. Recover or re-establish the draft contract and independent review; do not infer approval from a filename.
5. Run the repository's canonical metadata/static and affected-interaction checks through the authorized lab after a real candidate SHA is preserved. Retain complete receipts and failures. No runtime proof for the effect-classification draft is available in this handover.

## 6. Contract to preserve during continuation

The approved R1/R2 interaction correction (`pre-source-r1-r2-correction-2026-10-21.md`) remains the starting design authority. Classify actual retained commands through their existing producers/application owners. Keep applied, committed-but-unapplied and locally uncommitted ranges distinct. Do not require commit==applied, truncate retained work, install a second replay engine, or accept SQL/MG effects merely because their command type is recognized.

Match SQL statements, parameters, immutable row identities and allowed effects against the canonical original producers and durable publication rights. A valid pending original foundation/ENABLE effect is not equivalent to an unrelated transaction, transition, service publication or arbitrary write. MG CDC/BATCH inspection must preserve exact delivery/acknowledgment obligations; event-content similarity cannot invent source-occurrence authority or clear retained debt. Read-only inspection must not apply, repair, acknowledge or delete work.

Keep startup classification/continuation unavailable until all required consumers and exclusions are connected and proven. Native replay/participant progress must remain possible under the real owners; autonomous role/leader writers, rebalancers, resumers and source-completion sinks need their own original-operation checks. Protected activation, current leader acknowledgment, durable handoff, public-admission exclusions and the real composed two-start proof remain outstanding.

All eight handoff receipts and the original seal remain unchanged by this preservation task. Existing source-audit findings are not cleared by the earlier fast-static pass. Whole-corpus, integrated certification, main merge and release remain separate requirements.

## 7. Preservation scope

This handover branch retains the confirmed bcba7d2a ancestry plus new documentation/recovery metadata only. It neither overwrites the continuation branch nor claims to include the missing feefa272 source tree. The user authorized commit/push preservation, not weakening acceptance. The handover and inventory are saved remotely through the connected GitHub API; that preservation is not canonical publication or main-merge certification.
