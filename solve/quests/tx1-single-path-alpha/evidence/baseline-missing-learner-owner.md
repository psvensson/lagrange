# Missing learner owner dependency, 2026-10-13

Read-only bounded investigation at HEAD
`e6d43bc1acb128a2b83ac89c77a3ec400e7edb1f`. Parent reproduced the missing-file
dependency red on a pristine baseline tree. No source/test/Quest/Git mutations,
test executions, restoration or other-worktree filesystem reads occurred here.
Git objects were read to recover provenance. Release/reopen cycles and the TX1
implementation are outside this investigation.

## Finding and safest next action

The baseline contains an **orphaned partial FreshMG C2 promotion module**, not a
production caller whose semantic owner needs to be invented. Its missing helper
is real historical source with recorded component approval, but its matching
progress-owner exports are also absent. No equivalent current helper export can
simply be imported instead.

Shortest legitimate repair under the alpha simplification direction: remove the
orphan `src/rebalancer/replica-operation-message-group-promotion.js` from this
candidate after a current no-reference check, leaving the current native and
partition promotion owners intact. Record that FreshMG C2 integration remains
open; this dependency cleanup does not implement FreshMG promotion or satisfy its
physical acceptance. Do not add a stub, locally duplicate its predicate, or
restore only the missing file to make the checker pass.

If the parent explicitly chooses to retain/reintegrate C2 instead, the minimum
closed dependency pair is the historical helper plus its matching additions in
the existing `src/raft/learner-promotion-progress.js` owner. That is a separate
current-source review/proof unit; do not cherry-pick the full34-file C2 commit
casually, do not overwrite the later promotion recorder, and do not attach
historical component approval to the integrated candidate.

## Exact provenance

| Source | Commit / Git blob | Status |
| --- | --- | --- |
| current missing-helper importer | HEAD file blob `e7e8838a61a59e94bfb1de9f3bf936dc71dbf2d7` |457-line promotion module; imports missing helper at55-56 and missing ACK constant at54 |
| importer introduced on this lineage | `4151a3ab4cf3859651507d2f575a49754deb8f61`, parent `e7c89f4b5114c0238312d3831b65889a4622f4e9` | commit explicitly titled `Ephemeral exact-byte proof snapshot only; not reviewed or landed`; adds this promotion file, omits helper and progress-owner changes |
| current progress owner | blob `c86bdb0598bb7d709df34ce7be9e643acc6ba04f` at both4151 and HEAD | existing proof owner exports raw evaluator, response validator and refusal vocabulary; no `LEARNER_CATCH_UP_ACKNOWLEDGEMENT` or `evaluateExactLearnerPromotionProof` |
| historical helper | `50a003b86e4d2f0017d6772d11446c027339151e`, blob `9bae3f80859c609f1f190fb5005a98c7898f0c46` |101 lines; only commit found by all-ref path history; historical component source |
| matching historical progress owner | same50a003, blob `9c6d855269a13132d63c8e60650d9ab12b9fe246` |58 added lines: exact entry, ACK states, PROGRESS_UNOBSERVED and two exports |
| historical promotion consumer | same50a003, blob `fbeef0ba775923d78eae287dfd18b87c5d6dfcc0` |426-line independently reviewed C2 consumer; current457-line consumer differs in apply-owned voter-fact recording |

50a003's parent is `f4eaf37b006772454d6d9aca040be3b4f5f4d799`.
`git merge-base --is-ancestor 50a003 HEAD` returned1: it is not an ancestor of
this cloud baseline. The first broken import on the baseline lineage is4151,
not a later deletion of a helper. This supports a partial snapshot omission;
it does not establish who selected the snapshot files or why.

## Scoped caller and owner census

Current `src/test/scripts` search found no import of the promotion module and no
outside calls to its exports `selectMessageGroupPromotion`,
`recordMessageGroupVoterOutcome`, `recoverMessageGroupVoterOutcome`, or
`recordedVoterFactIsValid`. Related authorization/successor files only refer to it
in comments. Current `replica-operation-repository-message-group-membership-
methods.js:7-14,82-85` has initial learner/branch bindings, no C2 promotion
bindings. Thus the dependency checker sees a broken source module that is not
currently in the production import/call chain established by this census.

In the historical50a003 component, repository membership methods imported and
bound the C2 functions; `message-group-learner-join.js:35-36,342` used the same
helper for B2 RUNNING. That B2 module, C2 architecture contract/design, and the
three C2 integration witness files are absent from the current baseline. This
is not a request to bring them back inside TX1 removal.

The current importer calls the missing exports in exactly these places:

- `namesExactLearner` at promotion`:103` validates a recorded learner stamp;
- `namesExactLearner` at`:241` admits the target's own committed learner view;
- `learnerCatchUpAcknowledgement` at`:240-242` judges the leader observation
  against the target's own stamp and recorded learner applied boundary.

Historical helper ownership is explicit: subordinate to `learner-promotion-
progress.js`, shared by B2 RUNNING and C2 repository selection, pure observation
only, never a grant. `namesExactLearner` requires target peer in learners, absent
from voters and exact peer-to-replica mapping. The acknowledgement requires
leader committed answer/status agreement on group, identity, leader role and
term; leader's own exact commit/match progress, target's own matching committed
configuration generation and the recorded boundary. It calls
`evaluateExactLearnerPromotionProof`, which validates exact safe integer indexes
and positive commit before delegating to the existing raw evaluator. Missing
indexes never become a0/0 grant. No row/port/clock read belongs in this helper.

Current native `raft-rs-membership-transition-runtime.js:140-160` already rejects
missing/zero/noncanonical leader commit or missing match before calling the
existing evaluator. Partition proof methods consume that same existing owner.
Those current guards, exact identity/configuration/term fences and atomic native
proposal turn must remain intact whichever dependency repair is selected.
Redirecting the orphan importer straight to the raw evaluator would duplicate
binding decisions and could reintroduce synthetic0/0 acceptance; it is not a
legitimate import-only fix.

## Recoverable approval and proof limits

50a003's commit message records independent verifier
`subagent:/root/review_freshmg_c2`,162 baseline checks and ten behavioral mutation
controls, with the Quest still open. Its retained Quest log records:

- initial draft rejected at `f4eaf37b...` for five late-submission admission
  failures and a missing-method control wrongly counted as behavioral proof;
- correction followed by round2 **APPROVE C2 only**,162/162 baseline and final
  selection witness22/22;
- ten API-preserving mutations killed by behavioral assertions;
- source manifest SHA256
  `10f1bfa101135b25440fd359b1cc443d638c69623d48a12ccf09f035656ce559`;
- report SHA256
  `182e842b014080a5186f2b2c490402024ea2d33c1fd55e79ee195908e7e360d3`;
- F1/J1 configuration drift, production C3 driver, physical two-replacement /
  seed-loss and all whole-Quest receipts remain open.

These statements were recovered from Git source/log/design records; the full
external report asset and its source manifest were not downloaded or reverified.
No fresh approval or runtime proof is claimed. Current promotion blob differs
from the approved historical blob, so old approval cannot certify it.

Historical contract `architecture/contracts/message-group-learner-promotion.md`
at50a003 says the helper is the shared exact progress decision and lists
production dispatch/remote join/caught-up routes and physical proof as excluded.
Current FreshMG Quest retains the single-existing-owner-chain and atomic-current-
leader-promotion constraints. The alpha closeout preserves current FreshMG proof
obligations while permitting deletion of unsupported paths; deleting this orphan
must be reported as candidate cleanup, never FreshMG closure.

## Required proof after an actual repair

For orphan deletion: verify zero current executable consumers, run `test:deps`
and appropriate source/no-reference/static guards, independently review the
deletion, and retain focused current promotion proof/native membership negative
controls at exact repaired bytes. The separately observed two release cycles
remain reds owned outside this task; a missing-file repair alone cannot certify
`test:deps` fully green or the candidate releasable.

For deliberately retained C2: restore the closed helper/progress-owner dependency
without a second inference path, prove byte identity and unchanged raw partition
semantics, and independently verify current-consumer compatibility. Required
behavioral controls include absent/string/zero/unsafe commit and match, behind
learner, wrong exact identity/role/address mapping, mismatched leader/status term,
unobserved target own view, configuration-generation drift and unavailable
observation; the native turn must re-prove/propose atomically. Component proof
must remain distinguished from production C3/F1/J1 and physical FreshMG closure.
