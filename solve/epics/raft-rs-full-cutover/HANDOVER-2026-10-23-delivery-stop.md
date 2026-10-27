---
audience: agent
status: stopped-wip
---

# Rs-raft delivery work: user-requested stop, 2026-10-23

The user requested: stop everything, commit and push all changes, and provide a
handover. Implementation, test authoring and independent review were stopped at
approximately 13:07 UTC. All three delegated agents were interrupted. Resume
only on a later user instruction. This document and its preservation receipts
are handover work, not a continuation of implementation.

The native-history foundation and verified retained-state observer are intact.
The newer message-group delivery correction is a substantial, source-reviewed
WIP with unexecuted runtime proof and known static failures. Classification is
not complete. Nothing here grants recovery/activation, Quest closure, merge,
certification or publication approval.

## Checkout and preservation identities

| Surface | Identity at stop |
| --- | --- |
| Original integration checkout | `/mnt/data/peter/projects/lagrange`, branch `integrate/rs-raft-2026-09-30`, clean HEAD `48f3eb8c040cdcb4e1354c163243fae1bc4271e0`; untouched by this work |
| Active delivery worktree | `/mnt/data/peter/projects/.worktrees/mg-source-occurrence-delivery-20261023`, branch `work/mg-source-occurrence-delivery-20261023`; pre-preservation base `21cfd917d8ceb2f0c1435cade117c0c44a91a03a` |
| Failed-baseline evidence worktree | `/mnt/data/peter/projects/.worktrees/mg-delivery-fixture-trace-20261023`, branch `work/mg-delivery-fixture-trace-20261023`, clean and remotely verified `8a9b186d7bf4c8709855db95335a44254d0740d2` |
| Verified retained-effects observer | `/mnt/data/peter/projects/.worktrees/retained-effects-replacement-20261023`, branch `work/retained-effects-replacement-20261023`, clean checkpoint `6a7e70674b109ef0e6d17ea33b32a4de16f3c0a9` |
| Earlier handover/inventory | `wip/rs-raft-handover-20261023` at `f5fb317bebc3dc074f3d8d4102122ba4ddb94ecc` |
| Verified native-history/participant-origin foundation | `d7ef793be58af944639e6fae69a2c023c85e9002`; historical 14/14 files and 221 runner-reported assertions |

The separate preservation receipt accompanying this handover identifies the new
source checkpoint and verified remote heads. Do not mistake the pre-preservation
base above for the new WIP commit. The repository remote is
`git@github.com:psvensson/lagrange.git`.

The source checkpoint is **`681da1dc1beb5728a52ee5d223113b71b423156b`**.
Its remote head on `work/mg-source-occurrence-delivery-20261023` was read back
and verified after push. All 269 staged paths were re-hashed from committed
Git blobs. `RECEIPT-mg-delivery-user-stop-preservation-2026-10-23.json` records
that verification, the exact source/test trees, commit/push logs and archive
custody. The final handover/receipt commit adds only preservation records and
has identical source/test trees.

All 58 current production paths still match the frozen source manifest in
`evidence/mg-delivery-candidate-static-2026-10-23/` below. There are 17 changed or
new test files, three test helpers, and a draft impact-contract registration.
No source/test bytes were repaired after the stop request. The initially
captured 268-path stop inventory includes 13 local archive copies; additional
stop records and this handover were written afterward.

## Read first on a future authorized resume

Read this handover, then `AGENTS.md`, `docs/steering/rules.md` and
`docs/steering/router.md`. The active Quest is
`solve/quests/retained-seed-original-handoff`; its probe remains red, historically
eight failed predicates against target zero. Do not land that Quest as a way to
preserve this work.

All evidence paths below, unless otherwise stated, are relative to
`solve/quests/retained-seed-original-handoff/evidence/`.

- `CONTRACT-mg-source-occurrence-delivery-2026-10-23.md`, SHA256
  `474182126c3c985feceadb9a1b72d7de9975e1b4c3280af52be884c6c095f383`.
  Read its superseding appendices; earlier 1-MiB/64-event/64-target proposals
  were rejected and must not be restored.
- `PLAN-mg-delivery-witnesses-2026-10-23.md`, SHA256
  `6c9b8759f5c72e59e833bbb7afff51fbe5f484c232ab5c9221f8e00728a2ee82`.
- `DESIGN-mg-complete-vector-outcome-correction-r2-2026-10-23.md` and its
  independent review. Whole-vector correspondence is part of acceptance,
  including ordinary members alongside durable occurrences.
- `mg-delivery-stop-state-2026-10-23/`: byte inventory, exact failed static
  outputs, completed preflight receipts and the interrupted composition audit.

The missing newer classification draft is still missing. The manifest in the
earlier handover cannot reconstruct it; bounded searches already failed. Do not
repeat the same hash search or restart the verified foundation. Recovery is
useful only if an actual surviving Git object or archive becomes available.

## Verified result versus current draft

The retained-state observer was executed at
`8682037dab235031d85c62321bc7ca97f2a0fd96`: **36/36 selected files, 1,270
runner-reported assertions and 14 static checks passed**. Its remotely preserved
checkpoint is `6a7e70674b109ef0e6d17ea33b32a4de16f3c0a9`. It inspects retained
state without authorizing recovery. These results do not apply to the changed
delivery source in this WIP.

The delivery candidate has **no corrected runtime run**. Independent source and
test reviews exist, but the complete composition review was interrupted. All
green claims below are limited to the named source/test/static scope.

| Piece | Latest recorded state |
| --- | --- |
| Source subscriber selection and topology progress | Root selection/topology R2 source approval; source-owned metadata-only coverage and currentness tests R2 approved |
| Recipient native wait and source cleanup | Native-custody R1/R6 source approval; cleanup-notification tests R2 approved |
| F1 transport lifetime, write callback and encoding | Transport R2 plus owner/static R3 approved; 20 authored transport component/real-ws cases independently approved, runtime unexecuted |
| F3 native follower routing | Forwarding R3 approved, followed by the reviewed owner/static repair R1 and O1/O2 R2; latest R2 source approval |
| Whole-vector outcome and application | Complete-vector design R2; later V1-V4 guard repairs R1/R2 source-approved; native mixed-vector R2, native membership/input guards R1 and pure-vector tests R2 independently approved |
| Native handoff/election fixture | R4 test-source approval; original S2 fixture retained; no corrected run |
| Foreground stop and retry diagnostics | O1/O2 source repair approved; dedicated runtime controls were being authored, but no new test file existed at stop |
| Final source composition | Interrupted; working JSON preserved as non-final evidence, no approval |
| Metadata and full static | Impact registration drafted; metadata refresh/final composed static not completed; known failures listed below |
| W7 composite formation/progress and W9 size/fanout | Not implemented/proved as complete witnesses; planning only |

Important latest review hashes:

- `REVIEW-mg-owner-static-repair-r2-2026-10-23.md`:
  `7acef625b7e8a8a5b868e259d89d11478e45a6380f7ddab94eaafb7df45ce8d4`.
- `REVIEW-mg-transport-owner-static-r3-2026-10-23.md`:
  `7a96c814a42bd43241aa56082b31b3942461c6d2c6a34a362c9c05d5796949e5`.
- `REVIEW-mg-native-fixture-candidate-r4-2026-10-23.md`:
  `c7ee58dcc3bd3c2bad210927b195bd9a5159ac1d73d63b733f69519e18125483`.
- `REVIEW-mg-native-mixed-vector-witness-r2-2026-10-23.md`:
  `e84bb6e9fea10f5cda99ae2f956534e634a1ac6524457843a04f77e8c7aec409`.
- `REVIEW-mg-delivery-invocation-notification-witnesses-r2-2026-10-23.md`:
  `0abf1d3f164898c3345227f3648abb6bc5ee82ffa4f5b561fea18d7171401623`.
- `REVIEW-mg-f1-transport-witnesses-r1-2026-10-23.md`:
  `09285001de0afdf81536a79372fc00c6b7ff8410833967b998fc8b0690f2c280`.
- `REVIEW-mg-vector-owner-guard-witnesses-r1-2026-10-23.md`:
  `f31a720247192aa22bfc893ab4921dba0963056b4ef52d442a38e3db9f6b0897`.
- `REVIEW-mg-delivery-complete-vector-witnesses-r2-2026-10-23.md`:
  `54562f0d75ee0c9539a3407e7f3f4a653ae87c617f5a9fd729ba82096b02bfec`.

Earlier REVISE records remain historical rejections. A later approval applies
only to its exact frozen revision and stated scope, never retroactively to an
earlier rejected draft. The interrupted composition audit must reconcile the
sequential changes, not just find any approval containing a filename.

## Production behavior in the WIP

The source must retain the exact durable SQL occurrence. Only actual recipient
native application afterCommit may produce a committed receipt, and only the
source's applied CDC_DELIVERED command discharges its ledger debt. Canonical
reply validation includes contradictory wrapper fields, group identity and a
digest of the complete ordered semantic vector. Recognizing ENABLE, SQL or CDC
syntax is not sufficient classification authority.

One source-owned invocation budget begins before hydration/selection. It uses
the existing smaller MG/transport duration. A remote hop receives only remaining
duration and starts its own local clock domain. Expired caller response does
not imply raw child, native queue or socket write cleanup. Callback ownership,
same-key admission and shutdown/reinitialize generations stay separate from
response settlement.

One topology wave owns transient payload/copy custody. No durable payload enters
the ordinary immediate-batch/background maps. Existing source scan quantum,
tail, cursor and cadence remain. One metadata-only progress cell retains exact
subscriber/topology/source lifetimes, required leaves and a fair cursor. Partial
coverage remains UNKNOWN. Complete current provisional coverage can release
scanning while keeping debt owed and dropping the entire optimization cell.
Only later fresh native coverage permits source acknowledgment.

F3 asks the actual native leader/peer route before cache hints. Terminal delivery
binds the same group/current native leader with bounded relay depth. A known
native leader without a usable address cannot authorize a contradictory cache
route. Input capture refuses proxy/reflection/coercion attacks before effects;
native batch application iterates actual indexed membership.

The last source repair reuses the single foreground retry owner. It rechecks
stop after the helper await and preserves an already observed STOPPED state.
It distinguishes exhausted attempt count from insufficient remaining duration,
and source-owned durable continuation from ordinary background handoff. Its
finite runtime controls are still required.

## Known static failures at the stop boundary

No failure below was fixed after the stop. No baseline/checker/assertion/timeout
was changed to conceal it.

| Check | Actual result |
| --- | --- |
| Syntax over frozen production source | 58/58 pass |
| Normal scoped ESLint over those 58 files | Pass |
| Literal guideline CLI | Pass, zero new; three inherited baseline findings |
| Actual parser comparison against base HEAD | Literals 10 to 3, decisions 34 to 31, no added identity/count in that comparison |
| Decision guideline CLI against checked-in baseline | FAIL: four findings in `src/partition/partition-cdc-obligation-delivery.js`; inherited from HEAD but not absorbed by the baseline |
| Silent-catch guideline CLI | FAIL: one finding each in `message-router-ack-delivery.js` and `message-router-delivery-lifetime.js` |
| Hot-path diagnostics audit | FAIL: one finding in `src/topology/cdc-group-propagation-delivery-methods.js` |
| File-size ratchet | Pass: source 25/27 over threshold, tests 21/21 |
| Ambient-intrinsic checker earlier in this work | Zero governed CDC files scanned; this is not positive evidence for CDC guards |
| Metadata refresh, final fast-static, full regression | Unexecuted for the stopped candidate |

The raw outputs are in `mg-delivery-stop-state-2026-10-23/`. A zero-new parser
comparison is not equivalent to passing the baseline-enforced CLI. Source review
approval is not a static-gate waiver. The unfinished composition file
`mg-delivery-source-composition-audit-working-2026-10-23.json` has SHA256
`ae5c5f0bf9e1b1d1b549e06f527a3e6b8c4f7dc88c4c79329546a365ff00fad2`
and must not be cited as an approval.

## Failed native baseline and evidence custody

Latest executed diagnostic baseline:
[lab issue 1092](https://github.com/psvensson/lagrange-lab/issues/1092), exact
source `036dc0019a5c4711c1ec9d9f6c591426fcb1e4b2`, on `tv-dator`.
Two files / three runner-reported assertions failed. Request ID
`890bbfaa50ff4ff7867c8defc512040d`; envelope SHA256
`6cd4bbf4c0bfce4bec495380c09ae85f50abe5a0ac864614fbc3bb32faaf401a`;
payload SHA256 `220373924b4a7d7b3745dfbf7015cefb9656503b7b8be55c996394fe1edbd955`.

The RF1 legacy path showed cache-only application without CDC native history.
RF3 retained an uncommitted recipient CDC entry while the source leader had
already applied its acknowledgment. The loss/re-election schedule also failed
its timing precondition. S2 stopped before intended dispatch. These failures
cannot be relabeled as successful recipient or F1/F2 proof.

The complete available worker stream is 230,186 bytes, SHA256
`5a594842a01fe52637e50046cdaf56ea60d347af15017402af417d4ce94010d8`.
All available chunks, failed fetches/retries and read-only collector results
were preserved and independently checked on branch
`work/mg-delivery-fixture-trace-20261023` at `8a9b186d7bf4c8709855db95335a44254d0740d2`.
That evidence commit changes no source or test bytes from the executed baseline.

The worker itself elided 72,546 child TAP bytes. Collector issue 1126 found the
original work/source already removed; it did not rerun tests. Missing TAP remains
missing. Do not repeat that recovery hunt or call the worker stream complete
child TAP. Earlier failed runs 986, 1026 and 1049 remain separately preserved.

The corrected R4 native handoff test is unexecuted. It preserves real election,
rejoin and suffix replacement, observes actual source expiry and retained raw
custody, then advances the captured recipient clock to its actual wait deadline.
If automatic retries prevent the expected idle setup, record a setup failure;
do not manufacture cleanup or increase the timeout.

## Archive storage and WIP preservation policy

The canonical evidence uploader downloaded and re-hashed this archive before
recording it in the Quest log:

[Frozen draft archive](https://github.com/psvensson/lagrange/releases/download/solve-evidence/retained-seed-original-handoff--mg-delivery-candidate-drafts-preservation-20261023-1304.tar.gz)

- Archive SHA256: `c0eb799e1651a8feb0a3f4d349ed5d25d88ca83432ebe38348115167ee0656c6`.
- 732,117 bytes, 123 outer members; includes 13 previously frozen archives and
  supplemental source/test revisions, collector/builder and static artifacts.
- Original member manifest SHA256:
  `0d123850ed400f9d5d1c386986176eadc4b4c00ca3b43c27bd64caeacfa406f6`.
- Git record: `MANIFEST-mg-delivery-candidate-drafts-preservation-2026-10-23.json`.

The earlier manifest's archive paths identify the `previous-archives/` members
inside this remotely verified archive. Local tar copies are retained, but are
not Git content: the repository forbids archives under `solve/`. Raw text logs
remain byte-for-byte, including whitespace and failed/intermediate attempts.
The 13 exact local archive copies were moved outside the checkout to
`/mnt/data/peter/projects/.handover-artifacts/rs-raft-delivery-20261023/archives/`.
Each former path and unchanged hash is recorded in the preservation receipt.

The user explicitly requested a stopped WIP checkpoint. The runbook at
`docs/development/solver-runbook.md` permits `LAGRANGE_SKIP_PRECOMMIT=1` for a WIP
branch only. Preservation uses that documented mode because the draft has the
failures above, metadata is not refreshed, and the user requested no further
implementation. This does not make those gates pass. The binary evidence rule
is checked separately; no archive is committed. Push uses the normal non-main
preservation hook, without force, amend or a main update.

## Lab preparation, no pending corrected job

Only read-only preflight was submitted: ping issue 1161 completed at 12:44 UTC
and fleet issue 1162 completed at 12:45 UTC. Their exact request/response files
are in the stop-state evidence. At that observation `tv-dator` was free at 52 C;
this is historical, not a reservation. No corrected source runtime job was
built/submitted, so there is none from this session to cancel. The shared lab
controller was already running and was not killed; it may serve unrelated work.

Installed controller: version 0.2.2, identity
`b4a2e06c193c44b09f1b67d02e8d80f4`, release source
`53e262450fada3b4e706898201a3c732811ae4d0`. Use canonical exact-SHA locked lab
execution. Do not use local runtime tests or raw SSH runners. Always set
`login:false` for shell tool calls: a login shell previously reset cwd to the
integration checkout.

The reviewed collector R2 has SHA256
`ae248b12797118ec5bbfdb671262337cec22f6599cb92208c93208911f1c1aa1`.
The reviewed offline request builder has SHA256
`4d07e125ebb1bf5db596933fdabc565023a7205fdcb5524c8fa65ea84a330b47`.
Both are recoverable from the archive's `measurement-and-static/` directory.
They run canonical `npm run test:file` once with retry-once explicitly zero,
preserve command status and emit full final TAP/stderr as bounded gzip/base64
parts. Normal completion is covered; hard-kill output custody is not claimed.
Final selected paths, source SHA, request packet and independent packet review
were not completed.

## Exact continuation order if the user resumes

1. Verify new remote preservation SHAs and source/test manifests. Keep all
   stopped drafts and rejections. Complete the interrupted source composition
   audit and repair the explicit static failures through their existing owners.
   Do not raise baselines or revive rejected alternate execution paths.
2. Finish the dedicated foreground-boundary component tests. Use the actual
   retry helper result, actual stop/start and a barrier after the real helper
   returns; cover stop during the await and STOPPED followed by restart. Compare
   ordinary attempt exhaustion with durable attempt and positive-duration
   exhaustion, including equality at the next delay. Require truthful diagnostics
   and no durable immediate/background entry. Independent review remains needed.
3. Regenerate canonical metadata, audit impact registration and all intended
   exact source/test bytes, and run the applicable static gates. Preserve an
   exact source checkpoint before building the reviewed lab packet.
4. Measure the corrected focused candidate on a locked lab machine, preferably
   `tv-dator` for attribution against 1092. Capture full worker stream and embedded
   TAP/stderr, preserving any failure without assuming it is local. A predecessor
   comparison must reach the same named behavioral assertion on the same host.
5. Finish W7 as one actual source-owned A-before-B composite: real responsible
   subscribers, more targets than the dispatch window, partial weak coverage over
   several budgets, final missing-binding hold, provisional scan release, actual
   later formation metadata, native follower routing and eventual source ACK.
   The weak-accumulation-removed case must strand B for the intended reason.
6. Finish W9: actual sessionless 2-MiB CONFIG SQL versus smaller input, 65 distinct
   required native target groups, an over-64 MG vector and real remote encoding.
   The full SQLite TEXT versus 100-MiB wire domain mismatch remains an explicit
   unresolved limitation, not permission to add the rejected fixed caps.
7. Only after delivery proof, complete retained-work classification, protected
   activation, durable transfer and the composed two-start recovery acceptance.
   Integration, full regression, frozen-head certification, independent review,
   owner/publication and exact-main gates remain larger milestones.

Safe parallel work on resume: one agent owns a bounded correction/test path,
another independently reviews it, and separate isolated worktrees own W7/W9
fixtures once a common checkpoint is frozen. Do not let unfinished parallel
test files leak into the candidate's generated metadata. The stopped agents were
`mg_delivery_design`, `retained_effects_review` and `retained_effects_tests`.

The user specifically requires treating bugs as systematic until evidence shows
otherwise. Trace the real owner and one complete source-bound operation; search
project history and primary references for the defect family. Earlier research
used etcd/raft's separation of proposal, committed-entry processing and applied
progress. It informs investigation and does not replace this project's native
receipt and source-ledger proof.
