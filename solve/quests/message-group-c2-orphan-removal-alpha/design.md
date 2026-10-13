# Message-group C2 orphan removal alpha

## Decision and authority

This child removes an unreachable partial execution island. It does not resume
or reinterpret the sealed `message-group-fresh-identity-membership` Quest.
That Quest and its physical acceptance remain open validation constraints.

The current owner contract is explicit:

- `architecture/contracts/message-group-registered-learner-read.md:96-109`
  assigns recovery only the initial `ADD_LEARNER` action and reports promotion
  or removal debt without touching it.
- The same contract at lines 127-136 says this owner dispatches no promotion or
  successor and that no successor attempt is issued.
- `architecture/contracts/message-group-learner-outcome-recording.md:97-100`
  keeps promotion authorization, J1 forward recovery and physical proof open.
- `solve/quests/message-group-fresh-identity-membership/quest.json` retains the
  full replacement, promotion, handoff, cleanup and off-seed acceptance bar.

No owner contract or impact contract advertises either retired module. Current
impact contracts name the initial learner recorder/recovery owners and their
witnesses. The generic durable branch CAS remains registered and tested.

## Baseline defect and provenance

Exact base: `e6d43bc1acb128a2b83ac89c77a3ec400e7edb1f`.

The unreviewed ephemeral snapshot commit
`4151a3ab4cf3859651507d2f575a49754deb8f61` introduced both current-lineage
files together:

- `src/rebalancer/replica-operation-message-group-promotion.js`, 457 lines;
- `src/rebalancer/replica-operation-message-group-learner-successor.js`, 227
  lines.

No production or test module outside the two-module island imports either file.
Promotion imports learner-successor; no composition root binds the island's
exports. `ReplicaOperationRepository` binds initial learner observation,
claim, authorization, recording/recovery and generic branch selection only.
The promotion file is the learner-successor file's sole consumer.

The promotion file imports nonexistent
`src/raft/learner-catch-up-acknowledgement.js` and a nonexistent acknowledgement
export from the current progress owner. A focused dependency-cruiser run is red
only on the unresolved file edge. Restoring one historical helper would leave
the matching historical progress-owner surface absent and would create a second
unintegrated promotion algorithm; that is excluded.

## Selected transition

Trigger: the dependency/source graph includes an unreachable rebalancer
successor/promotion island whose required decision owner is absent.

Authoritative facts: the current import/caller census; current repository
composition; the registered learner-read and learner-outcome contracts; the
open FreshMG Quest; the existing native/partition promotion owners.

Permitted action: delete the two unreachable modules and remove only code that
becomes exclusive residue of that island from the existing permit and
authorization owners.

Commit point: source deletion and removal of its import/export edges. There is
no runtime or durable commit because the island has no caller or registration.

Restart and lost-answer behavior: unchanged. Current initial learner recording,
readback and reentry retain their existing row CAS and recovery owner. Generic
branch rows and later-phase debt remain decodable and recognized.

Remaining obligations: the open FreshMG owner still owes ordinary CREATE,
promotion orchestration, J1 recovery, handoff, source absence/removal,
exact-generation cleanup/restart and physical off-seed proof.

## Complete implementation inventory

Delete:

- `src/rebalancer/replica-operation-message-group-promotion.js`;
- `src/rebalancer/replica-operation-message-group-learner-successor.js`.

In `replica-operation-message-group-membership-authorization.js`:

- delete pair-only `observeLearnerActionAbsence`;
- delete pair-only `recordedLearnerCreateBasis`, `recordedLearnerOrigin` and
  `RECORDED_LEARNER_FACT_COLUMNS`;
- remove the pair's stale comments;
- de-export, but keep the existing internal implementations of
  `noteUncertainMembershipWrite`, `actionRecordingInput`,
  `recordMembershipActionOutcome`, `recordingInvocation`,
  `recordingSettlementAllowed`, `learnerObservationRefusal`,
  `learnerWitnessUnavailable` and `learnerOutcomeQuery`.

In `replica-operation-message-group-membership-permit.js`:

- delete pair-only `encodeMembershipPermit` and its key-order encoder helper;
- delete pair-only `membershipActionPhases` and its stage map;
- delete pair-only return outcomes `NOT_CAUGHT_UP`, `ORIGIN_UNRECORDED` and
  `SUCCESSOR_ISSUED` plus claims that an active owner produces them;
- preserve the permit decoder, identity/claim codecs, action matcher,
  `MEMBERSHIP_BRANCH.PROMOTE`, `PROMOTION_IN_FLIGHT`, `VOTER_COMMITTED`, generic
  branch specifications and every currently persisted field shape.

Update owner comments only where they name the deleted island. Do not change
the architecture contracts' acceptance or the open FreshMG Quest.

Preserve `NONCOMMITTED`, `canonicalAbsenceObservation`,
`absenceFencesLearnerAction`, `learnerActionAbsence`, `notRecorded` and
`learnerObservationRefusal`: the current initial learner recorder still uses
them. Removing the unused wrapper does not remove its live classifiers.

The two deleted modules remove 684 lines. The touched current owners start at
701 and 192 lines and only shrink. No new production file, ownership extraction,
decision algorithm or literal is required.

## Interfaces that must survive

- Repository initial-learner authorization, outcome recording/recovery and
  branch selection methods.
- Exact identity, permit and owner-claim decoding and fencing.
- Historical learner origin and committed membership validation used by the
  current recorder.
- Initial learner discovery/reentry and later-phase debt classification.
- Generic PROMOTE/ABORT authorization behavior, including lost answers,
  competing CAS, terminal interleavings and reopen.
- Native and partition promotion proof/effect owners, including malformed
  observation refusal, exact target identity, term/configuration binding,
  leader commit and learner match requirements, and atomic native proposal.

## Sealed receipt groups

1. `orphan-import-graph-closed`: the exact focused dependency command changes
   from the archived unresolved-import red to zero errors; the final no-reference
   census finds no executable pair exports or stale imports. This receipt does
   not stand alone.
2. `initial-learner-owner-preserved`: current real repository/native learner
   authorization, recording/readback, process-loss and registered discovery
   witnesses pass on exact candidate bytes.
3. `durable-branch-and-later-phase-preserved`: generic PROMOTE/ABORT branch
   selection and later-phase discovery refusal pass, including reopen,
   concurrency, lost-answer and terminal controls.
4. `live-promotion-owner-preserved`: current native message-group promotion,
   progress-proof contract and partition promotion/wake controls pass without
   importing or replacing the retired island.
5. `scope-static-and-metadata-clean`: exact-source no-reference/unused-export,
   dependency, lint, file-size, strict complexity/cognitive, guideline,
   impact-contract/shard and diff checks pass or match separately classified
   unchanged baseline debt; independent source verification approves the delta.

Candidate behavioral witnesses include:

- `test/integration/message-group-learner-runtime-authorization.integration.test.js`;
- `test/integration/message-group-membership-claim-cache.integration.test.js`;
- `test/integration/message-group-learner-process-loss.integration.test.js`;
- `test/integration/message-group-learner-recipient.integration.test.js`;
- `test/integration/message-group-learner-discovery.integration.test.js`;
- `test/rebalancer/message-group-membership-branch-authorization.test.js`;
- `test/message-group/message-group-fresh-learner-promotion.test.js`;
- `test/raft/learner-promotion-progress-proof-contract.test.js`;
- `test/partition/partition-service-learner-promotion.test.js`;
- `test/partition/partition-service-learner-promotion-wake.test.js`;
- `test/convergence/dt6-learner-promotion-progress-proof.test.js`.

The parent selects bounded focused and lab placement. A fully spent healthy
timeout is a red system finding and cannot be retried into proof.

## Current attempt baseline

The worktree now starts from the reviewed TX1 preservation checkpoint
`d35d8828c630d1b9675b47f511c477b3cc9ee991`. The four C2 source paths, the two
named contracts, live native promotion owners and eleven listed witnesses are
unchanged from seal-time e6. Shared repository/query retry dependencies inherit
the reviewed TX1 correction; the complete transitive source graph is not claimed
identical. The original seal and baseline history remain unchanged. The same
focused unresolved-import red is remeasured on d35 before the source attempt.

## Exclusions

- No historical C2 cherry-pick, missing-helper stub, alternate evaluator or
  compatibility adapter.
- No change to `learner-promotion-progress.js`, native membership transition,
  partition promotion, configuration generation or peer identity semantics.
- No removal of generic branch authorization or durable later-phase vocabulary.
- No planner/handler activation, physical CREATE, startup/recovery repair,
  source retirement, cleanup or reservation release.
- No FreshMG receipt rewrite or closure claim.
- No unrelated dependency-cycle repair or static-baseline increase.
