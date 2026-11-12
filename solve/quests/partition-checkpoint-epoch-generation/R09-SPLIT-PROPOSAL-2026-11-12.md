# R09 split proposal — format validation and install ownership

Status: PROPOSAL ONLY, 2026-11-12. No supersession, source repair, narrowed success declaration, new Quest seal, or shipping authorization is effected by this document. The existing Quest remains incomplete. This is a product/scope decision proposal, not a fifth implementation approval.

## Decision requested

Approve either (A) a separately sealed format/self-validation repair delivered only with proven temporary user-partition cadence **and receiver/recovery containment**, deferring install ownership to a separate Quest, or (B) defer the entire delivery until ownership is proved. Recommend A only if its availability and storage costs are acceptable and containment can be proved without introducing another incomplete ownership mechanism. Otherwise choose B. Do not ship snapshot 402253be1, or ship it with only its cadence disabled: the reproduced destructive mechanism remains in that source.

Holding new leader cadence alone does not prevent existing generations, remote offers, direct follower installation, or pending on-disk install recovery from entering installation. A format fix can also make previously refused images usable. Consequently, a cadence-only split is not a safe shipping boundary. Disabling unsafe recovery may leave a follower unavailable; holding compaction grows logs. These are explicit product consequences, not conditions to hide behind retries, timeout increases, alternate readers, or fallback behavior.

## Authority and preserved evidence

The governing source is rule-set revision 5 and the owners loaded through AGENTS → rules → router at snapshot `402253be1e371fd1090432d8e6117c5101c15efb`. Worktree: `/mnt/data/peter/projects/lagrange-codex-checkpoint-20261112`; branch `wip/codex-checkpoint-evidence-20261112`. The original checkpoint checkout is not a delivery branch and is untouched.

Recorded revisions:

| Boundary | Exact identity |
| --- | --- |
| Original checkpoint HEAD / Quest source seal | `da5eb99bdc2893d1dd245d25a68d789490571c91` |
| Original HEAD tree | `d1aa7f5a98bc9bc652c5e705075e7a3dd889913c` |
| Original preserved index tree | `7689e8691353b8516bfae21c8b0baaeef35f6ea3` |
| Preserved original index SHA-256 | `1a2da8996b910c5e72d682b940f74ed37bcb685a0f1e8824d2cd4f19ba12fb6c` |
| Snapshot commit | `402253be1e371fd1090432d8e6117c5101c15efb` |
| Snapshot tree | `f2bb00c442cbabcaefd449ba32cfe2a8f569c9f2` |
| Recorded red-first export tree | `979f8a931f32a78aabb34d53bcd2827f519e51e9` |

The executable investigation manifest records no production-source diff from the snapshot, no original tracked/untracked byte/mode differences against it, and no source/witness changes during any run. Ignored build/dependency artifacts are not covered by the preservation comparison. The isolated continuation adds four investigation witness/fixture files and external output symlinks; the user appended the Quest log. This proposal adds only this file. Original seals, receipt failures, earlier rejected designs, and marker supersession history remain intact.

The prior log terms matter:

- `2026-11-11T22:50:20.195Z`, log entry 34: “The split (hold the cadence for user partitions and land install behind a later ownership quest) defeats the sealed statement and needs a supersession: it is the agreed exit, subject to the owner, if round 5 is rejected on this root again.” This was a conditional exit; the adopted immediate plan was the narrow episode design.
- `2026-11-11T22:59:26.741Z`: conditional design approval C1–C7, not implementation acceptance. Its then-current conclusion that no split was needed predates the executed counterexample.
- `2026-11-11T23:43:28.438Z`: an already recorded R09 marker-contract change from retained rejection to consumption/cleanup ownership. Preserve that record; this proposal neither retroactively approves its implementation nor silently reverses it.
- `2026-11-12T05:03:41.957Z`: the user-recorded executed failed-release counterexample and incomplete CREATE continuation. This supplies the new evidence supporting the proposed exit, rather than a new approval round.

## Exact extraction and commit boundary

No future commit hashes exist. The following is a precise proposed patch boundary, not a claim that patches have been built or tested. Create a future extraction branch from the sealed baseline above; compare its prospective integration target separately before landing. Do not reset the investigation worktree, cherry-pick the entire snapshot, or treat the baseline itself as certified safe.

Commit H, temporary containment: newly implement and independently prove the HOLD contract below against the extraction target. This is new work, not a claim that an existing snapshot hunk implements safe containment. Its reviewed scope is cadence admission, all user-partition follower-install admissions, and pre-open pending-install recovery, with typed diagnostics and containment tests. Determine every actual caller before choosing final files. If it requires an episode rewrite to be safe, stop extraction and choose B. H must be effective before F can become deployable.

Commit F, format/self-validation: extract only the following semantic hunks from `git diff da5eb99bdc2893d1dd245d25a68d789490571c91 402253be1e371fd1090432d8e6117c5101c15efb`:

| File | Included change | Excluded change |
| --- | --- | --- |
| `src/raft/snapshot-checkpoint-constants.js` | Closed entity-kind rules and imports; ENTITY_KIND rejection and IMAGE_REJECTED creation result | SEALER_HELD, SEALER_BUSY, SEALER_FAILED and cadence mechanism vocabulary |
| `src/raft/snapshot-checkpoint-format.js` | Partition membership epoch opaque to format validation; message-group epoch equality retained; unknown kind rejected; existing group/index/term checks retained | Any install authority or custody inference |
| `src/raft/snapshot-application-content.js` | Same closed entity-kind classification for scrub/validation; partition content agreement and message-group-specific rule | Alternate reader or permissive unknown-kind fallback |
| `src/raft/snapshot-checkpoint-store.js` | Reject unknown kind before scrub; validate staged descriptor/image using the reader before publication; typed image rejection with staging cleanup and existing generation preserved | Cadence admission, install, or runtime ownership |
| `src/message-group/message-group-learner-join.js` | Translate creation IMAGE_REJECTED to DESCRIPTOR_MOVED with validation outcome; preserve subsequent read | Any install lifecycle change |

F's test scope is independently runnable format/content/creation witnesses and the affected message-group regression: partition production epoch cases, message-group rule, unsupported entity kind, self-reader rejection before publication, unchanged prior generation after refusal. Extract these assertions without importing the cadence/install harness as a prerequisite. Fixture corrections must preserve production membership census semantics and be reviewed as test changes, not runtime fixes. This does not satisfy the original cadence/follower receipts.

Commit O and later, deferred ownership: every other production-source hunk in that snapshot diff is excluded from H/F extraction, including all episode/registry/claim/recreation changes; snapshot catchup wiring, routing, transfer and receiver admission; install/marker changes; cadence sealer, coverage, refusal and retry machinery. Exclude the snapshot's broad receipt-harness changes, architecture claims and ratchet baseline changes from F. Any necessary H edits are new explicit reviewed containment patches, never wholesale adoption of those excluded hunks. Marker contract reconciliation belongs to O; H may refuse unsafe recovery but must not consume/delete markers to evade that obligation.

Deployment boundary is **H + F together after their evidence**, with no release of F alone, no activation of O, and no claim that cherry-picking only five whole files suffices. Seal proposed successor Quests only after the actual scope decision. Do not rewrite the current Quest statement, doneWhen, red-first record, or historical receipts. A later explicit R09 record must map every original obligation to a successor or a named deferred product capability; it must not label the original full statement green.

## Temporary HOLD contract and its actual owners

Proposed public diagnostic name: `USER_PARTITION_SNAPSHOT_OWNERSHIP_UNPROVEN`. This name and contract do not yet exist in code. It is a temporary capability prohibition, not a transient failure backoff or a runtime feature toggle with a legacy branch.

| Concern | Actual source owner / ingress | Trigger and required effect | Clearing owner / exit |
| --- | --- | --- | --- |
| Automatic cadence and requested sealing | `partition-snapshot-cadence.js`: `createPartitionSnapshotCadence`, `tick`, `sealForCatchup`; `partition-service-participant-transaction-cadence-methods.js` delegates to it | On any user-partition cadence/seal request under the contained release, return typed HOLD before creating a generation or compacting. Audit the separate `evaluatePartitionSnapshotCadence` path and direct compaction callers so none bypasses the prohibition | Only the release implementing and proving successor ownership, with explicit capability restoration decision |
| Live follower install | `snapshot-offer-router.js`, `snapshot-catchup-install.js`, receiver admission, and the public installer `snapshot-install.js` | Existing image or incoming/direct install request must not reach shutdown/swap/replacement creation. One authoritative prohibition must cover all reachable entry paths; no caller-only switch | Same release boundary; elapsed time, restart, new epoch, or lower load never clears it |
| Pending install at boot | `partition-service-raft-init-base.js` → `resolvePendingSnapshotInstall` | Inspect pending install state before opening user-partition storage. Refuse states requiring unproved mutation/custody; preserve artifacts and expose the exact pending state. Prove safe no-pending open separately. Do not guess that every marker can be ignored | Same owner decision after production-opener evidence |

The responsible implementation authority is the existing PartitionService cadence owner together with the ReplicaHandler/install/recovery owners, not the coordinator timer. The user retains the product decision and names the successor Quest assignee; no human assignee is invented here. The ownership Quest must name one accountable implementer spanning these seams. Message-group fresh-create has a distinct contract and must remain separately evidenced; do not bypass containment by calling a user-partition follower a fresh create.

Binary H proof: automatic tick, explicit seal, compatibility/evaluate path, direct compaction caller, existing-generation offer, direct installer call, and boot pending state each either cannot reach a destructive operation or fail the gate. Assert zero mutation/open/compaction at the forbidden boundaries, artifact retention, visible typed HOLD and no retry churn. Include positive controls for intended unaffected behavior. Merely observing a disabled timer fails H. If complete coverage cannot be demonstrated, nothing ships.

## Proposed separate ownership Quest

Proposed id: `partition-snapshot-install-custody-and-continuation` (not created).

Proposed statement: For every user-partition snapshot install, one authoritative owner accounts for all original and replacement runtime/storage handles until they are closed or transferred to an identified successor. Shutdown failure cannot make cleanup or swap effective. Removal, create failure, replay, stop, restart and group retirement transfer ownership without stale writers or stranded work. A deferred CREATE has a real retained or scheduled continuation to a terminal outcome. Marker producers, validation, cleanup and recovery share one explicit canonical authority contract. Restore cadence only after these properties and the original production cadence/catchup requirements are proved together.

Binary evidence obligations, all required; absence, cancellation or stubbed success is FAIL/UNPROVED:

| Gate | Required witness / rejection condition |
| --- | --- |
| O1: retained replacement custody | Failed-release witness must forbid unlink while replacement remains live, retain exact cleanup debt, and expose the responsible owner. Successful shutdown control must complete cleanup. Fail if claim completion alone licenses deletion |
| O2: every claim boundary | Real accepted REMOVE and durable REMOVING, cleanup with current token, failed CREATE with deferred FAILED, replay/RESTART_CREATE, handler stop and group retirement across receive/shutdown/open/registration awaits. No stale registry writes; all opened products accounted for. Extend reconciliation proof to real ingress and consensus-exit ordering |
| O3: continuation | Join actual coordinator delivery/retention/timer with actual handler episode refusal and durable lifecycle. Observe real redispatch or an explicitly justified terminal outcome, eventual one authorized opener and activation; no manually injected success, no fake retained=true. Include terminal operation and restart ownership |
| O4: recovery and markers | Enumerate every producer/consumer; canonical kind and authority required, no inferred legacy kind. Prove STAGED, REJECTED with staging, interrupted swap, conflict and staging-lost behavior through production open and cleanup. Retain history; independently approve any changed recovery semantics |
| O5: episode and caller coverage | Every coverage-model cell, receiver ambiguity, two REMOVE operations, acceptance refusal after hold, all C3 writer sites, real open conflict/backoff and owner clearing events. Mutation checks must kill removed custody/owner fences, not just extra-count assertions |
| O6: restored product capability | Original format/MG/creation, production epoch genesis and membership-change compaction, follower current-identity install, reask/stall and typed no-rebuild-loop receipts; related static/mutation gates and independent verification on exact candidate. H cannot be removed based only on focused green |

The historical receipt set remains twelve obligations: format-epoch-is-opaque-for-partitions; message-group-epoch-rule-kept-where-defined; creation-refuses-reader-rejected-image; cadence-compacts-genesis-group-publication-epoch-one; cadence-compacts-after-membership-change-epoch-zero; cadence-compacts-after-membership-change-epoch-one; epoch-moved-follower-installs-current-identity-generation; refused-follower-is-re-asked-and-stall-visible; cadence-refusal-is-typed-logged-and-not-a-rebuild-loop; message-group-descriptor-moved-regression; sn1-fixture-exercises-nonzero-publication-epoch; independent-verification. A split routes these obligations; it does not erase them.

## Measured counterexample and limits

Evidence root: `/tmp/lagrange-codex-checkpoint-20261112/`. `evidence-index.json` binds exact HEAD, witness hashes and individual run outcomes; `SHA256SUMS` preserves the external evidence files. Each run retains `run.json`, `hashes.json`, `result.json`, `run.log` and raw TAP. The hash manifests cover source/test JavaScript, lockfile, runner and thermal script. These are bounded local witnesses, not lab or full acceptance.

Every file was run individually after thermal check, under `flock /tmp/lagrange-local-test.lock nice -n 15 node scripts/run-test-files.js --jobs 1 FILE`.

`failed-release-03` exited 1 at the intended no-unlink assertion. A real replacement PartitionService opens during a durable removal claim. Its shutdown is injected to throw before closing the handle. Real episode release retains that exact product in `pendingRuntimeShutdowns`, yet the claim settles and real removal reconciliation/cleanup returns true and unlinks the canonical database. The replacement still executes `SELECT 1`. No cleanup-success or cleanup-token stub creates this result. `release-control-01`, using successful real shutdown, exits 0 and closes the handle before cleanup.

The causal seam is `replica-snapshot-install-owner.js`: `releaseProduct` records failed shutdown but resolves; `claimRecord` can finish after step/attempt settlement. `replica-handler-runtime-methods.js:cleanupReplicaResources` then proceeds after the claim/token checks without discharging that replacement debt. Cleanup acts on the tracked predecessor. This is a runtime custody defect, not merely an assertion-count defect. It demonstrates unlink under a live handle; it does not measure lost votes, a crash/restart outcome, or the entire REMOVE ingress/consensus-exit chain.

Runs `failed-release-01` and `-02` exited 0 but did not establish safety: first lacked authoritative PARTITIONS evidence, second used the wrong founder database path. The final investigation fixture changes the founder path to the real handler path and supplies the required row. Preserve all first runs and these limitations.

Witness SHA-256:

- failed release: `e22cdf9e37cd04847111236dfe0a5ec931cc9ca611cc9e9ea27431575461c088`
- successful-release control: `860c6520fb73b38d5454b5b6fe993dccf15d51233b520a47d787ac94c2e84eab`
- investigation fixture: `30d972fb6293500e2e7a9c22a0800757148dad8864d6db4fed7f59ee4405a75b`
- CREATE continuation: `9f5aa753e011e974f8327f8f6c99d6e80d32dd670ad8b776feef140862a1e7e4`

The three unfinished original witnesses were run unchanged, separately: await matrix 4 pass/3 fail (attempt-count mismatches, safety observations not themselves contradicted); claim sites 3 pass/3 fail (two missing PARTITIONS authority failures and one unresolved retry wait); create failure 0 pass/2 cancelled (pending promise, second case never executes). These are incomplete test evidence, not three additional proved runtime defects. Preserve their first failures before correcting fixtures.

## CREATE liveness gap

In `create-continuation-03`, real partition retention returns false: retained delivery is limited to runtime services. Actual `resolveAmbiguousCreateDeliveryFailure` sees matching nonterminal admission, synthesizes IN_PROGRESS, and schedules `scheduleUnretainedCreateDelivery`. Its real observed-progress timer fires through the exclusive lane, observation and owner adapter. Fixture lifecycle SYNCING causes `updateStep(SYNCING)`, with no redispatch or timer rearm. Two actual timeout checks at +1s/+2s do not redispatch. `operation-workflow-dispatch-rearm-evidence.js` excludes NON_PRIORITY_RECOVERY_PARTITION from its closed state table and also blocks SYNCING.

This is an engaged bounded caller-path gap, not proof of permanent production stranding. Transport/data/step-persistence seams remain fixture implementations; there is not yet a fully joined coordinator/real-handler/durable integration witness. Runs 01/02 exposed missing lifecycle evidence and an incorrect clock seam. The older witness's stubbed retention success cannot establish production continuation. O3 must resolve who owns progress after the real refusal, including deferred FAILED and RESTART_CREATE, without treating status advancement as successful redelivery.

## Marker contract inventory and proposed owner change

Current source has live legacy production, not just old files on disk:

| Surface | Verified role |
| --- | --- |
| `snapshot-install-marker.js:readMarker` | Accepts canonical and legacy field sets |
| `markerValue` / `markerKind` | Missing kind defaults to LEGACY_PARTITION; missing authority/digest admitted through defaults |
| `snapshot-install.js:buildFreshCreateMarker` | Explicit fresh-create kind and create authority |
| `buildFollowerCatchupMarker` | Explicit follower kind and receiver identity |
| `rejectInvalidCheckpoint` | Produces rejected marker without explicit kind |
| `prepareInstallAdmissionAndMarker` non-raftRsImage branch | Produces STAGING marker without explicit kind |
| `rejectInstall`, STAGED/INSTALLED writers | Propagate marker detail; require provenance audit |
| `markerOwnedByCleanup` | Follower replica ownership, legacy rejection ownership, distinct fresh-generation authority |
| `resolvePendingSnapshotInstall` | Production recovery consumer; rejected follower/legacy consumption and staged-state handling |
| `partition-service-raft-init-base.js` | Production boot resolver caller |
| `snapshot-catchup-install.js`, `message-group-learner-join.js` | Follower and fresh-create request callers respectively |
| `replica-handler-runtime-methods.js` | Cleanup inspection/removal consumers |

The exported `recoverPendingSnapshotInstall` helper had no source import in the inspected tree; do not count it as exercised production recovery.

Proposed owner change: make canonical marker authority an explicit install/recovery owner contract, coordinated with ReplicaHandler cleanup authority. Classify every producer, including pre-admission invalid-image rejection: do not fabricate legacy install authority merely to record a validation error. Unknown/unsupported records must have an explicit typed disposition that preserves evidence, never a permissive alternate reader. Reconcile the historical atomic-install retained-rejection seal and the later R09 consumption record with fresh-create consumers before any deletion or semantic change. No legacy path is deleted by this proposal; its eventual removal requires complete producer/consumer replacement and recovery evidence, not another fallback.

## Bounded execution after the product decision

Use a `gpt-6-luna` worker for bounded implementation wherever feasible. Keep architecture, scope interpretation, evidence adjudication and independent approval separate from the worker's implementation report. No worker starts source changes merely because this proposal exists. User model policy: any failed verification requires reimplementation of the affected work by a stronger model before verification is repeated. Escalation is not satisfied by stronger-model review alone or by another lower-model patch cycle. Preserve the first failure and its exact source/witness hashes; do not weaken the obligation to obtain a pass.

1. After A is chosen, assign a read-only caller-inventory task: enumerate cadence/compaction, live installer and boot recovery entry points on the exact extraction target; deliver file/symbol/caller tables and uncovered paths. Reviewer fixes the H boundary before coding.
2. Assign H as a bounded containment task with the explicit forbidden-effects matrix above. No episode repair, marker deletion, fallback, or timeout alteration. Stop and return if safe refusal itself needs new ownership machinery.
3. Assign F as the five-file semantic extraction plus narrow tests. Reject any diff outside that allowlist/test scope unless separately adjudicated. Compare against both baseline and exact snapshot; retain before/after hashes.
4. Assign test-fixture correction separately: fix the documented missing authoritative row/path/clock issues; keep first-run evidence and never turn observed unsafe behavior into expected success. Each file individually uses thermal/flock/nice and external `/tmp` logs; no broad local suite.
5. Independently review H/F and their exact evidence; schedule appropriate broader acceptance separately under lab availability. No commit/push or release authority follows from this document. Only the accepted scope and later explicit execution authority govern landing.
6. Under separately sealed O, give the worker one custody/continuation seam at a time with red witness, binary obligation and allowed files. Failed shutdown custody first; then full claim ingress, CREATE continuation, and marker/recovery obligations. A larger model/reviewer adjudicates owner-boundary changes and unexplained failures. Do not iterate a fifth approval of the current snapshot under a different name.

Keep checkpoint continuation evidence/log ownership in this isolated Quest; formation remains in primary. The user can append this proposal's conclusions to the log without altering original seals. No source edits, test runs, supersession actions, Quest status changes or commits were performed to prepare this document.
