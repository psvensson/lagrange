# Membership-publication-epoch domain inventory

Generated from `membership-epoch-domain-inventory.json` by `test/rebalancer/overflow-budget-audit-render.js`. Do not edit by hand.

- **quest**: critical-spread-overflow-budget-audit
- **measured at head**: 902714be831a8dea3963b0e6cc098932e6b5457b
- **concept**: The membership publication epoch: the monotonic integer that identifies one control-plane membership publication.
- **tokens**: 150
- **sites**: 1207

## Method

- Every identifier in src matching [A-Za-z0-9_$]*(publication|membership|planning)_?[Ee]poch[A-Za-z0-9_$]*, case-sensitive on the epoch stem, plus the SCREAMING_SNAKE spellings. It DOES match observedMembershipEpoch, which the existing E8 inventory's FIELD_TOKEN_PATTERN does not. That seed is then extended by a DATA-FLOW step - any other epoch-ish identifier bound from, or assigned into, a known concept token on the same statement is itself a concept token - iterated to a fixed point, and by the carrier's own named values and reason codes, which spell the concept in words rather than in an identifier. The scan is owned by test/rebalancer/membership-epoch-census.js and the census test re-runs it.
- Two levels. `tokens` carries one entry per distinct identifier with its role, denotation and observed object; `sites` carries one entry per file:line occurrence, naming its token. A site missing from the inventory turns the census receipt red.
- Roles are writer, reader, alias, projection and serialization. Entries with classificationBasis "hand-read" were read in the source at the cited site and are labelled CODE; entries with basis "rule" were classified by the stated naming rule and are labelled INFERRED. The rule is in the generator and in the markdown.

## Limits

- The role of a rule-classified token is INFERRED from its name and is not evidence. Only the hand-read entries are CODE.
- The "what it observes" answers are of three kinds, and they are counted separately in observesAccounting below: hand-read answers, rule-TEMPLATE answers that follow from the token's shape and are NOT a traced observation, and the explicit value unknown_not_traced. A rule-template answer is a generic non-answer about which object this particular site reads; it is not a claim.
- A binding whose value is on the NEXT line is not followed. MEASURED by a separate probe over src: exactly two such sites exist for this concept, and both bind a REASON NAME rather than an epoch value - src/bootstrap/critical-placement-formation-observer.js:146 (ABSENT_REASON) and src/rebalancer/rebalance-coordinator-owner-delegation-methods.js:207 (rebalanceSkipReason, which the census does carry through another site). This is the fifth known blind spot and it is disclosed, not closed.
- The census is data-flow aware only to SAME-LINE binding depth, iterated to a fixed point, plus ONE hop of renaming into a name that does not spell epoch. It cannot see: a bare `epoch` property name (excluded deliberately, because it names half a dozen unrelated concepts); a computed or destructured key; any flow that crosses a function boundary without a same-line binding; and any rename site beyond the first hop. Those are the four known blind spots.
- A renamed-into identifier is inventoried as a SITE, not promoted to a concept token. Names like `value`, `matches` and `owner` would otherwise match most of the tree. That is the stated depth: this inventory knows where the concept is renamed away, and does not claim to follow it afterwards.
- Same-line binding can also pull in an identifier whose meaning ELSEWHERE is a different concept. sourceTopologyEpoch is the worked example: it is in this inventory because one line of the formation-release handoff row assigns it from a captured publication epoch, and everywhere else it denotes a topology epoch that is not this concept. Its entry says so.
- publicationEpoch alone has hundreds of sites across dozens of files; its observed object is per site, not per token, and the inventory does not claim one for all of them.
- The census reads src only. Tests, scripts and examples are out of scope.
- No tolerance is proposed anywhere, and no canonical model is chosen.

## The canonical meaning

- The epoch identifies one membership publication of one publication kind. It is monotonic per kind, and the unique index is (publication_kind, publication_epoch), so the SAME integer names different objects in different kinds.
- An epoch integer alone is not an identity. Two readers comparing integers are comparing identities only if they also agree on the kind, and one of the two readers does not filter by kind.

## The authoritative writer

- allocator: src/control-plane/membership-publication-candidate-derivation.js:556 (deriveMembershipPublicationCandidate): baselineEpoch + 1 when the publication changed, else max(baselineEpoch, 1). This is the only increment of a membership publication epoch in src.
- durable write funnel: src/control-plane/membership-publication-coordinator-persist.js:50 (persistPublicationRow) -> controlPlanePublicationsOwner.upsertPublication
- second durable writer: src/control-plane/formation-release-handoff-publication.js:274 writes a row of publication_kind formation_release_handoff whose publication_epoch is a COPY of a membership epoch, and whose status is PUBLISHED once the handoff is complete. It allocates nothing, but it puts a PUBLISHED row carrying a membership epoch into a different kind - which the partition-side reader counts and the planner-side reader does not.
- the operation column: replica_operations.membership_publication_epoch is never allocated: it is a copy of the planner-side reader's answer, stamped per cycle at src/rebalancer/unified-rebalancer-rebalance-loop.js:350 and re-read as a fallback at src/rebalancer/unified-rebalancer-move-execution.js:68.

## Do the readers observe the same object?

**No.**

- publication_kind: the planner-side reader filters to cluster_membership; the partition-side reader does not filter at all.
- status: the planner-side reader takes the highest-epoch row of ANY status and then requires THAT row to be PUBLISHED; the partition-side reader filters to PUBLISHED first and then takes the maximum.
- node membership: under TARGET_NODE scope the planner-side reader requires the node to appear in the publication; the partition-side reader never does.
- absence: the planner-side reader returns null; the partition-side reader returns 0, which is also a legitimate epoch.
- freshness: the planner-side answer is memoised behind a planning generation and a stale grace; the partition-side reader recomputes on every call.

## Can one reader legitimately lag another?

- **Yes, in both directions, and one direction is structural.**
- planner behind partition: While a newer publication sits in a non-PUBLISHED status, the planner-side reader picks that newer row and reads null, while the partition-side reader still reports the older PUBLISHED epoch. MEASURED. The mint is silent in that whole window, so the direction is fail-closed.
- partition ahead of planner: A PUBLISHED row of another publication kind with a higher epoch makes the partition-side reader report it while the planner-side reader reports the membership epoch. MEASURED over the row set; whether production can produce such a row set is NOT established - the handoff writer copies an epoch rather than allocating one, so a strictly higher other-kind PUBLISHED epoch has no demonstrated producer.
- temporal lag: Independently of reader disagreement, the mint and the fence are separated in time: an authorization minted at epoch N is evaluated after any number of later publications, so a promotion-time fence reads stale after every later join. MEASURED.

## Reader divergence, measured on real owners

| row set | planner | partition | verdict |
| --- | --- | --- | --- |
| no publication row at all | null | 0 | planner-unreadable-no-mint |
| one published membership publication | 7 | 7 | agree |
| two published membership publications | 7 | 7 | agree |
| a newer publication is establishing | null | 7 | planner-unreadable-no-mint |
| the immediately newer publication is establishing | null | 7 | planner-unreadable-no-mint |
| a newer publication excludes the planning node | null | 8 | planner-unreadable-no-mint |
| a newer publication of another kind is published | 7 | 9 | planner-behind-partition |
| a newer publication was abandoned | null | 7 | planner-unreadable-no-mint |
| epoch zero is a real published epoch | 0 | 0 | agree |
| a later join publishes a newer membership epoch | 8 | 8 | agree |

- **no publication row at all** - The two readers disagree about ABSENCE itself: null against 0.
- **a newer publication is establishing** - The planner picks the highest-epoch row of any status and then finds it is not PUBLISHED. Structural: it happens for the whole ack window of every publication.
- **a newer publication excludes the planning node** - A joining or recovering node reads nothing while the cluster-wide PUBLISHED epoch is visible to the partition side.
- **a newer publication of another kind is published** - The ONLY measured row set where a valid authorization would read stale. The partition-side reader has no publication_kind filter. Whether production can produce an other-kind PUBLISHED epoch strictly above the latest PUBLISHED membership epoch is NOT established: the formation-release handoff writer copies an epoch rather than allocating one.
- **epoch zero is a real published epoch** - Zero is a legitimate epoch on both sides, which is why a supplied 0 honours every record rather than refusing it.
- **a later join publishes a newer membership epoch** - The readers agree, and an authorization minted before the join is still stale against it. Reader agreement does not remove temporal lag.

## What makes an authorization stale

- today: Nothing: the landed guard supplies no epoch, so the fence is never applied and the evaluation returns the explicit membership_fence_not_evaluated outcome.
- in the evaluation: authorization.observedMembershipEpoch < context.partitionMembershipEpoch, evaluated only when the supplied value is a non-negative integer. A HIGHER authorization epoch is honoured, and a supplied 0 honours everything.
- The audit does not decide this. It states the consequence: "stale" as written is a comparison of two integers produced by two readers that do not observe the same object, so it can be true when nothing about the membership the mint observed has changed.

## Candidate canonical models (none chosen)

- **one-owner-reader-for-both-sides** - One owner's reader answers both the mint and the validation. The receiving partition asks that owner rather than deriving an epoch from its own cached rows.
  - preserves "the guard reads no epoch tables": false
  - preserves "the evaluation has one reader": true
  - It breaks the carry stage's first invariant: the guard would have to read something it does not read today, even if only through an owner. It satisfies the second: one reader.
- **stable-publication-identity-on-the-authorization** - The authorization names a stable publication OBJECT - the publication id, or the kind and epoch together - and both sides resolve it through the same owner.
  - preserves "the guard reads no epoch tables": false
  - preserves "the evaluation has one reader": true
  - Also requires a resolution at the receiver, so it also reads something new; but it removes the integer-comparison ambiguity, because identity no longer depends on the kind filter.
- **fence-at-dispatch-instead-of-at-promotion** - The dispatch epoch gate already refuses to dispatch at a superseded epoch, using the SAME planner-side reader the mint used. The authorization could rely on that gate and carry no fence of its own.
  - preserves "the guard reads no epoch tables": true
  - preserves "the evaluation has one reader": true
  - The only candidate that preserves BOTH carry-stage invariants. Its cost is that the window between dispatch and promotion is unfenced, which is exactly the window the carry stage measured as up to the learner recheck cadence. The audit does not choose it.

## The alias that escaped the existing inventory

- alias: `observedMembershipEpoch`
- FIELD_TOKEN_PATTERN in test/rebalancer/replica-operation-membership-epoch-binding.test.js matches only membershipPublicationEpoch, membership_publication_epoch and MEMBERSHIP_PUBLICATION_EPOCH.
- src files: src/partition/learner-promotion-count-check-evidence.js, src/partition/partition-service-learner-promotion-wake-methods.js, src/rebalancer/move-planner-move-calculation-methods.js, src/rebalancer/move-planner-priority-spread-cure.js, src/rebalancer/replica-placement-cure-policy.js, src/rebalancer/spread-cure-transition-authorization.js
- predating the carry stage: src/partition/partition-service-learner-promotion-wake-methods.js, src/partition/learner-promotion-count-check-evidence.js
- **finding**: The alias carries TWO different readers' answers under one name: the planner-side reader on the mint path, and the partition-side reader on the learner wake path. That is the exact shape the epoch domain is supposed not to have.

## The domain is NOT closed

- This inventory does NOT close the epoch domain and claims no completeness. Its entries are grouped three ways, and the third group is open by construction.
- `traced-member-of-the-domain` (44): read in the source at a cited site: what it observes is a traced answer.
- `rule-classified-member-of-the-domain` (66): matched the spelling seed and was classified by the stated naming rule; its "what it observes" is a TEMPLATE that follows from the token shape, not a traced observation.
- `alias-reached-through-data-flow` (8): reached only by the same-line data-flow step from a known concept token, iterated to a fixed point.
- `unresolved-version-like-value` (32): a version-like value whose semantic relationship to the publication epoch is UNKNOWN and untraced here.
- what would close it: Reading each unresolved value's owner and deciding whether it denotes this concept. That is the separate close-topology-publication-version-identity quest, not a wider census: the census has already reached its fixed point.

## The tokens

| token | group | role | sites | basis | denotes |
| --- | --- | --- | --- | --- | --- |
| `ADD_MEMBERSHIP_PUBLICATION_EPOCH` | rule-classified-member-of-the-domain | serialization | 2 | rule | a field-name constant for one spelling of the epoch |
| `ADDED_REPLICA_OPERATIONS_MEMBERSHIP_PUBLICATION_EPOCH` | rule-classified-member-of-the-domain | serialization | 2 | rule | a field-name constant for one spelling of the epoch |
| `assertMembershipPublicationEpoch` | unresolved-version-like-value | reader | 2 | rule | a read of the epoch, or a predicate over one |
| `assertMembershipPublicationEpochBinding` | traced-member-of-the-domain | reader | 8 | hand-read | the fail-closed assertion every behaviour-changing reader of the operation column consumes |
| `authorization_membership_fence_not_evaluated` | traced-member-of-the-domain | serialization | 1 | hand-read | the wire and log spelling of that outcome |
| `authorization_membership_generation_stale` | traced-member-of-the-domain | serialization | 1 | hand-read | the wire and log spelling of that reason |
| `buildMembershipEpochFence` | traced-member-of-the-domain | projection | 6 | hand-read | the fence outcome: current, stale, future or unavailable |
| `buildMembershipEpochSnapshot` | traced-member-of-the-domain | projection | 8 | hand-read | the snapshot the fence and the candidate derivation compare against |
| `buildMembershipEpochSnapshotReasonCodes` | rule-classified-member-of-the-domain | projection | 2 | rule | a derived record about the epoch |
| `buildMembershipEpochValue` | traced-member-of-the-domain | projection | 13 | hand-read | the availability-typed value record of one epoch: undefined and the empty string are unavailable, everything else is coerced |
| `candidatePublicationEpoch` | traced-member-of-the-domain | writer | 4 | hand-read | THE allocation of a new membership publication epoch: baselineEpoch + 1 when the publication changed, else max(baseline, 1) |
| `capturedPublicationEpoch` | traced-member-of-the-domain | alias | 18 | hand-read | the membership publication epoch a formation-release handoff contract captured, and the epoch its own PUBLISHED row carries |
| `chooseMembershipEpochPublicationSource` | rule-classified-member-of-the-domain | projection | 2 | rule | a derived record about the epoch |
| `chooseMembershipEpochValue` | rule-classified-member-of-the-domain | projection | 3 | rule | a derived record about the epoch |
| `CONTROL_SNAPSHOT_PUBLICATION_EPOCH_FIELD` | rule-classified-member-of-the-domain | serialization | 2 | rule | a field-name constant for one spelling of the epoch |
| `criticalPlacementMembershipEpoch` | unresolved-version-like-value | alias | 2 | rule | a value-carrying identifier for the epoch under another name |
| `criticalPlacementMembershipEpochState` | rule-classified-member-of-the-domain | projection | 2 | rule | a derived record or named state about an epoch |
| `currentEpoch` | traced-member-of-the-domain | alias | 71 | hand-read | the dispatch epoch gate's local name for the CURRENT published membership epoch it fences an operation against, and the coordinator delegation's name for the same answer |
| `currentEpochNumber` | unresolved-version-like-value | alias | 4 | rule | a value-carrying identifier for the epoch under another name |
| `currentMembershipEpoch` | unresolved-version-like-value | alias | 4 | rule | a value-carrying identifier for the epoch under another name |
| `currentMembershipPublicationEpoch` | unresolved-version-like-value | alias | 2 | rule | a value-carrying identifier for the epoch under another name |
| `currentPublicationEpoch` | unresolved-version-like-value | alias | 6 | rule | a value-carrying identifier for the epoch under another name |
| `decodeMembershipPublicationEpochBinding` | traced-member-of-the-domain | reader | 3 | hand-read | the single decode owner: BOUND, UNBOUND or INVALID |
| `directPublicationEpoch` | unresolved-version-like-value | alias | 13 | rule | a value-carrying identifier for the epoch under another name |
| `ensureDispatchMembershipEpochOrSkip` | traced-member-of-the-domain | reader | 4 | hand-read | the dispatch epoch gate: equal epochs dispatch, an unreadable current epoch defers, and ANY mismatch fails the operation |
| `epochId` | unresolved-version-like-value | alias | 5 | rule | a value-carrying identifier for the epoch under another name |
| `fallbackEpoch` | traced-member-of-the-domain | alias | 4 | hand-read | the publication epoch of the FALLBACK row in a publication merge, compared against the latest row's epoch to decide which row wins |
| `FIELD_OBSERVED_PUBLICATION_EPOCH` | rule-classified-member-of-the-domain | serialization | 2 | rule | a field-name constant for one spelling of the epoch |
| `FIELD_PUBLICATION_EPOCH` | rule-classified-member-of-the-domain | serialization | 2 | rule | a field-name constant for one spelling of the epoch |
| `FIELD_SOURCE_TOPOLOGY_EPOCH` | alias-reached-through-data-flow | serialization | 2 | rule | a field-name constant for one spelling of the epoch |
| `gatePublicationEpoch` | unresolved-version-like-value | alias | 3 | rule | a value-carrying identifier for the epoch under another name |
| `getCurrentPublishedMembershipEpoch` | traced-member-of-the-domain | reader | 8 | hand-read | the coordinator's delegation to the planner-side reader |
| `getCurrentPublishedMembershipEpochSync` | traced-member-of-the-domain | reader | 5 | hand-read | THE planner-side reader: the ACTIVE publication's epoch when its status is PUBLISHED, and null otherwise |
| `getLatestMembershipPublicationEpochStatusForNodeSync` | unresolved-version-like-value | reader | 3 | rule | a read of the epoch, or a predicate over one |
| `getPriorityRecoveryDecisionSnapshotsPublicationEpoch` | unresolved-version-like-value | reader | 2 | rule | a read of the epoch, or a predicate over one |
| `getPriorityRecoveryPlanningPublicationEpoch` | unresolved-version-like-value | reader | 12 | rule | a read of the epoch, or a predicate over one |
| `hasMembershipPublicationEpoch` | rule-classified-member-of-the-domain | projection | 2 | rule | a predicate over an epoch, not an epoch |
| `INVALID_MEMBERSHIP_PUBLICATION_EPOCH_BINDING` | rule-classified-member-of-the-domain | projection | 5 | rule | a declared state, reason or rule name of the epoch domain |
| `isAbsentMembershipPublicationEpoch` | rule-classified-member-of-the-domain | projection | 2 | rule | a predicate over an epoch, not an epoch |
| `isBoundMembershipPublicationEpoch` | traced-member-of-the-domain | reader | 15 | hand-read | THE single predicate of the epoch domain: Number.isInteger and >= 0. The spread-cure authorization validates its own epoch field through this predicate rather than a second one. |
| `isMembershipEpochFenceCurrent` | rule-classified-member-of-the-domain | projection | 3 | rule | a predicate over an epoch, not an epoch |
| `isMembershipEpochValueAvailable` | rule-classified-member-of-the-domain | projection | 12 | rule | an availability boolean about an epoch, not an epoch |
| `isRetainedPublicationEpochAhead` | rule-classified-member-of-the-domain | projection | 1 | rule | a predicate over an epoch, not an epoch |
| `latestEpoch` | traced-member-of-the-domain | alias | 12 | hand-read | the publication epoch of the LATEST row in a publication merge, compared against the fallback row's |
| `leaderMembershipEpoch` | unresolved-version-like-value | alias | 7 | rule | a value-carrying identifier for the epoch under another name |
| `LEARNER_PROMOTION_BOOTSTRAP_MEMBERSHIP_EPOCH` | rule-classified-member-of-the-domain | projection | 2 | rule | the bootstrap value the wake baseline starts from |
| `learnerMembershipEpoch` | unresolved-version-like-value | alias | 4 | rule | a value-carrying identifier for the epoch under another name |
| `LOCAL_STR_PUBLICATION_EPOCH` | rule-classified-member-of-the-domain | serialization | 2 | rule | a field-name constant for one spelling of the epoch |
| `LOCAL_STR_PUBLICATIONEPOCH` | alias-reached-through-data-flow | serialization | 2 | rule | a field-name constant for one spelling of the epoch |
| `LOCAL_STR_SOURCE_TOPOLOGY_EPOCH` | alias-reached-through-data-flow | serialization | 2 | rule | a field-name constant for one spelling of the epoch |
| `LOCAL_STR_SOURCETOPOLOGYEPOCH` | alias-reached-through-data-flow | serialization | 2 | rule | a field-name constant for one spelling of the epoch |
| `membership_epoch` | unresolved-version-like-value | alias | 1 | rule | a value-carrying identifier for the epoch under another name |
| `MEMBERSHIP_EPOCH_BOUNDARY` | rule-classified-member-of-the-domain | projection | 4 | rule | a declared state, reason or rule name of the epoch domain |
| `membership_epoch_changed` | rule-classified-member-of-the-domain | projection | 1 | rule | a named outcome or state of the epoch concept |
| `MEMBERSHIP_EPOCH_CHANGED` | rule-classified-member-of-the-domain | projection | 3 | rule | a declared state, reason or rule name of the epoch domain |
| `MEMBERSHIP_EPOCH_EMPTY_TEXT` | rule-classified-member-of-the-domain | projection | 3 | rule | a declared state, reason or rule name of the epoch domain |
| `MEMBERSHIP_EPOCH_FENCE_STATE` | rule-classified-member-of-the-domain | projection | 9 | rule | a declared state, reason or rule name of the epoch domain |
| `membership_epoch_observed_epoch_current` | rule-classified-member-of-the-domain | projection | 1 | rule | a named outcome or state of the epoch concept |
| `membership_epoch_observed_epoch_future` | rule-classified-member-of-the-domain | projection | 1 | rule | a named outcome or state of the epoch concept |
| `membership_epoch_observed_epoch_stale` | rule-classified-member-of-the-domain | projection | 1 | rule | a named outcome or state of the epoch concept |
| `membership_epoch_observed_epoch_unavailable` | rule-classified-member-of-the-domain | projection | 1 | rule | a named outcome or state of the epoch concept |
| `MEMBERSHIP_EPOCH_OWNER` | rule-classified-member-of-the-domain | projection | 4 | rule | a declared state, reason or rule name of the epoch domain |
| `membership_epoch_publication_epoch_available` | rule-classified-member-of-the-domain | projection | 1 | rule | a named outcome or state of the epoch concept |
| `MEMBERSHIP_EPOCH_REASON_CODE` | rule-classified-member-of-the-domain | projection | 10 | rule | a declared state, reason or rule name of the epoch domain |
| `MEMBERSHIP_EPOCH_ROW_FIELD` | rule-classified-member-of-the-domain | serialization | 9 | rule | a field-name constant for one spelling of the epoch |
| `MEMBERSHIP_EPOCH_SNAPSHOT_AVAILABILITY_STATE` | rule-classified-member-of-the-domain | projection | 5 | rule | a declared state, reason or rule name of the epoch domain |
| `membership_epoch_snapshot_unavailable` | rule-classified-member-of-the-domain | projection | 1 | rule | a named outcome or state of the epoch concept |
| `membership_epoch_source_evidence_available` | rule-classified-member-of-the-domain | projection | 1 | rule | a named outcome or state of the epoch concept |
| `membership_epoch_source_evidence_unavailable` | rule-classified-member-of-the-domain | projection | 1 | rule | a named outcome or state of the epoch concept |
| `MEMBERSHIP_EPOCH_SOURCE_STATE` | rule-classified-member-of-the-domain | projection | 7 | rule | a declared state, reason or rule name of the epoch domain |
| `membership_epoch_unavailable` | rule-classified-member-of-the-domain | projection | 2 | rule | a named outcome or state of the epoch concept |
| `MEMBERSHIP_EPOCH_UNAVAILABLE` | rule-classified-member-of-the-domain | projection | 5 | rule | a declared state, reason or rule name of the epoch domain |
| `MEMBERSHIP_EPOCH_VALUE_STATE` | rule-classified-member-of-the-domain | projection | 10 | rule | a declared state, reason or rule name of the epoch domain |
| `MEMBERSHIP_FENCE_NOT_EVALUATED` | traced-member-of-the-domain | projection | 8 | hand-read | the carrier's named outcome when no partition epoch was supplied, so the fence was never applied |
| `MEMBERSHIP_GENERATION_STALE` | traced-member-of-the-domain | projection | 2 | hand-read | the carrier's refusal reason when the authorization's observed epoch is below the supplied partition epoch |
| `membership_publication_epoch` | traced-member-of-the-domain | serialization | 11 | hand-read | the durable column of replica_operations: the planning epoch the move was stamped with |
| `MEMBERSHIP_PUBLICATION_EPOCH` | unresolved-version-like-value | alias | 7 | rule | a value-carrying identifier for the epoch under another name |
| `MEMBERSHIP_PUBLICATION_EPOCH_BINDING_STATE` | rule-classified-member-of-the-domain | projection | 12 | rule | a declared state, reason or rule name of the epoch domain |
| `MEMBERSHIP_PUBLICATION_EPOCH_DECODE_RULES` | rule-classified-member-of-the-domain | projection | 2 | rule | a declared state, reason or rule name of the epoch domain |
| `membershipEpoch` | traced-member-of-the-domain | alias | 38 | hand-read | the CONTROL-PLANE publication epoch, under its shortest name. There is no distinct raft configuration epoch in this repository: every site traces to selectLatestPublishedMembershipEpoch or to a value threaded from it, and the raft layer versions by term and log index instead. |
| `membershipEpochFence` | rule-classified-member-of-the-domain | projection | 2 | rule | a derived record or named state about an epoch |
| `membershipEpochSnapshot` | rule-classified-member-of-the-domain | projection | 15 | rule | a derived record or named state about an epoch |
| `membershipPublicationEpoch` | traced-member-of-the-domain | alias | 17 | hand-read | the planning epoch as it travels on a move, an operation record and the replica_operations column |
| `membershipPublicationEpochBinding` | traced-member-of-the-domain | projection | 3 | hand-read | the decoded BINDING RECORD - state plus, when bound, the epoch - not the epoch itself |
| `normalizeMembershipEpochSnapshotValue` | rule-classified-member-of-the-domain | projection | 2 | rule | a derived record about the epoch |
| `normalizeMembershipPublicationEpochRow` | rule-classified-member-of-the-domain | projection | 3 | rule | a derived record about the epoch |
| `normalizePublicationEpoch` | rule-classified-member-of-the-domain | projection | 12 | rule | a derived record about the epoch |
| `not_read_by_the_carrier` | traced-member-of-the-domain | serialization | 1 | hand-read | the wire and log spelling of the not-read value |
| `OBSERVED_EPOCH_CURRENT` | unresolved-version-like-value | alias | 2 | rule | a value-carrying identifier for the epoch under another name |
| `OBSERVED_EPOCH_FUTURE` | unresolved-version-like-value | alias | 2 | rule | a value-carrying identifier for the epoch under another name |
| `OBSERVED_EPOCH_STALE` | unresolved-version-like-value | alias | 2 | rule | a value-carrying identifier for the epoch under another name |
| `OBSERVED_EPOCH_UNAVAILABLE` | alias-reached-through-data-flow | projection | 2 | rule | a declared state, reason or rule name of the epoch domain |
| `observedEpoch` | traced-member-of-the-domain | alias | 6 | hand-read | the projection freshness guard's local name for the epoch a projection observed, compared against the epoch it requires |
| `observedMembershipEpoch` | traced-member-of-the-domain | alias | 18 | hand-read | the planning epoch a spread-cure authorization was minted from, and, on the learner wake path, the epoch last observed by this replica. The alias the E8 inventory's token pattern does not match. |
| `observedPublicationEpoch` | traced-member-of-the-domain | alias | 28 | hand-read | the publication epoch a handoff or a fence re-observed, as distinct from the one it captured |
| `observedPublicationEpochAvailable` | rule-classified-member-of-the-domain | projection | 2 | rule | an availability boolean about an epoch, not an epoch |
| `observedPublicationEpochState` | rule-classified-member-of-the-domain | projection | 1 | rule | a derived record or named state about an epoch |
| `PARTITION_LEADER_AUTHORITY_FIELD_PUBLICATION_EPOCH` | rule-classified-member-of-the-domain | serialization | 3 | rule | a field-name constant for one spelling of the epoch |
| `partitionMembershipEpoch` | traced-member-of-the-domain | reader | 10 | hand-read | the epoch the receiving partition fences an authorization against. The landed carrier supplies the named value not_read_by_the_carrier instead of an epoch. |
| `planningEpoch` | unresolved-version-like-value | alias | 4 | rule | a value-carrying identifier for the epoch under another name |
| `planningEpochBinding` | traced-member-of-the-domain | projection | 3 | hand-read | the decoded binding record of the operation's planning epoch at the dispatch gate |
| `planningMembershipPublicationEpoch` | traced-member-of-the-domain | alias | 4 | hand-read | the one epoch a whole rebalance cycle stamps on its moves |
| `providedDecisionSnapshotsPublicationEpoch` | unresolved-version-like-value | alias | 3 | rule | a value-carrying identifier for the epoch under another name |
| `providedPublicationEpoch` | unresolved-version-like-value | alias | 9 | rule | a value-carrying identifier for the epoch under another name |
| `publication_epoch` | traced-member-of-the-domain | serialization | 28 | hand-read | the durable column of control_plane_publications, INTEGER NOT NULL, unique together with publication_kind |
| `PUBLICATION_EPOCH` | unresolved-version-like-value | alias | 22 | rule | a value-carrying identifier for the epoch under another name |
| `PUBLICATION_EPOCH_AVAILABLE` | rule-classified-member-of-the-domain | projection | 2 | rule | a declared state, reason or rule name of the epoch domain |
| `PUBLICATION_EPOCH_CAMEL` | rule-classified-member-of-the-domain | serialization | 3 | rule | a field-name constant for one spelling of the epoch |
| `publication_epoch_pending` | rule-classified-member-of-the-domain | projection | 1 | rule | a named outcome or state of the epoch concept |
| `PUBLICATION_EPOCH_PENDING` | rule-classified-member-of-the-domain | projection | 10 | rule | a declared state, reason or rule name of the epoch domain |
| `PUBLICATION_EPOCH_SNAKE` | rule-classified-member-of-the-domain | serialization | 2 | rule | a field-name constant for one spelling of the epoch |
| `PUBLICATION_EPOCH_STATUS_PROBE_UNAVAILABLE` | rule-classified-member-of-the-domain | projection | 3 | rule | a declared state, reason or rule name of the epoch domain |
| `publication_epoch_unavailable` | rule-classified-member-of-the-domain | projection | 1 | rule | a named outcome or state of the epoch concept |
| `publication_epoch_unobserved` | rule-classified-member-of-the-domain | projection | 1 | rule | a named outcome or state of the epoch concept |
| `PUBLICATION_EPOCH_UNOBSERVED` | rule-classified-member-of-the-domain | projection | 2 | rule | a declared state, reason or rule name of the epoch domain |
| `publication_epochs_disagree` | rule-classified-member-of-the-domain | projection | 3 | rule | a named outcome or state of the epoch concept |
| `publicationEpoch` | traced-member-of-the-domain | alias | 323 | hand-read | the canonical camelCase carrier of the publication epoch on a normalized row, snapshot, evidence record or diagnostic |
| `publicationEpochAvailable` | traced-member-of-the-domain | projection | 4 | hand-read | an availability BOOLEAN about an epoch, not an epoch |
| `publicationEpochDelta` | traced-member-of-the-domain | projection | 12 | hand-read | a DIFFERENCE between two publication epochs. It is not an epoch and must not be read as one. |
| `publicationEpochDescriptor` | rule-classified-member-of-the-domain | projection | 3 | rule | a derived record or named state about an epoch |
| `publicationEpochReasonActive` | unresolved-version-like-value | alias | 6 | rule | a value-carrying identifier for the epoch under another name |
| `publicationEpochState` | rule-classified-member-of-the-domain | projection | 4 | rule | a derived record or named state about an epoch |
| `publishedPlanningEpoch` | traced-member-of-the-domain | alias | 6 | hand-read | the publication epoch ONLY WHEN the publication status is PUBLISHED; null otherwise. Minted in exactly one place. |
| `readLatestMembershipPublicationEpochStatusProbe` | rule-classified-member-of-the-domain | projection | 2 | rule | a derived record or named state about an epoch |
| `readMembershipEpochStamp` | traced-member-of-the-domain | reader | 2 | hand-read | the bootstrap observer's stamp: AVAILABLE with a value, or UNAVAILABLE with 0 |
| `readPublishedMembershipEpoch` | traced-member-of-the-domain | reader | 7 | hand-read | the planner-side scalar contract: a non-negative integer, or null. It never coerces an absent value to 0. |
| `requestedEpoch` | traced-member-of-the-domain | alias | 9 | hand-read | the epoch an epoch-bound placement request was planned for, reported on the error when the current epoch has moved |
| `requestedEpochBinding` | alias-reached-through-data-flow | projection | 3 | rule | a decoded binding record carrying an epoch and its state |
| `requestedMembershipEpoch` | unresolved-version-like-value | alias | 7 | rule | a value-carrying identifier for the epoch under another name |
| `requestedMembershipPublicationEpoch` | unresolved-version-like-value | alias | 3 | rule | a value-carrying identifier for the epoch under another name |
| `resolveControlSnapshotPublicationEpochDescriptor` | rule-classified-member-of-the-domain | projection | 2 | rule | a derived record or named state about an epoch |
| `resolveLearnerPromotionMembershipEpoch` | traced-member-of-the-domain | reader | 6 | hand-read | the partition's own epoch for the promotion proof; 0 at bootstrap |
| `resolveMoveMembershipPublicationEpoch` | traced-member-of-the-domain | reader | 2 | hand-read | the execution-time fallback re-read for a move that carries no stamped epoch |
| `resolveOperationPlanningEpochBinding` | rule-classified-member-of-the-domain | projection | 2 | rule | a decoded binding record carrying an epoch and its state |
| `resolvePublicationActiveGateHandoffPublicationEpoch` | unresolved-version-like-value | reader | 8 | rule | a resolution of the epoch from a holder |
| `resolvePublishedMembershipPlanningEpoch` | traced-member-of-the-domain | reader | 3 | hand-read | the rebalancer's guarded call of the planner-side reader; null when the readiness service or the method is absent |
| `resolvePublishedTopologyEpoch` | unresolved-version-like-value | reader | 2 | rule | a resolution of the epoch from a holder |
| `retainedPublicationEpoch` | unresolved-version-like-value | alias | 3 | rule | a value-carrying identifier for the epoch under another name |
| `selectLatestPublishedMembershipEpoch` | traced-member-of-the-domain | reader | 6 | hand-read | THE partition-side reader: the MAXIMUM epoch among PUBLISHED rows of ANY publication kind, and 0 when there is none |
| `snapshotPublicationEpoch` | unresolved-version-like-value | alias | 6 | rule | a value-carrying identifier for the epoch under another name |
| `snapshotPublicationEpochAvailable` | rule-classified-member-of-the-domain | projection | 2 | rule | an availability boolean about an epoch, not an epoch |
| `snapshotPublicationEpochState` | rule-classified-member-of-the-domain | projection | 1 | rule | a derived record or named state about an epoch |
| `source_topology_epoch` | traced-member-of-the-domain | serialization | 10 | hand-read | the durable column the token above is written to |
| `SOURCE_TOPOLOGY_EPOCH` | unresolved-version-like-value | alias | 2 | rule | a value-carrying identifier for the epoch under another name |
| `SOURCE_TOPOLOGY_EPOCH_CAMEL` | alias-reached-through-data-flow | serialization | 2 | rule | a field-name constant for one spelling of the epoch |
| `sourceTopologyEpoch` | traced-member-of-the-domain | alias | 32 | hand-read | the source TOPOLOGY epoch of a publication. It is in this inventory because the formation-release handoff row assigns it FROM a captured membership publication epoch on one line; everywhere else in src it denotes a topology epoch, which is NOT this concept. The data-flow rule cannot tell the two uses apart, and that is a stated limit rather than a claim about the token. |
| `sourceTopologyEpochState` | alias-reached-through-data-flow | projection | 1 | rule | a derived record or named state about an epoch |
| `SPREAD_CURE_PARTITION_EPOCH_NOT_READ` | traced-member-of-the-domain | projection | 8 | hand-read | the carrier's named value where a partition membership epoch would go. It is neither absent nor zero: the guard did not read one, and the payload says exactly that. |
| `topologyEpoch` | unresolved-version-like-value | alias | 17 | rule | a value-carrying identifier for the epoch under another name |
| `UNBOUND_MEMBERSHIP_PUBLICATION_EPOCH_BINDING` | rule-classified-member-of-the-domain | projection | 2 | rule | a declared state, reason or rule name of the epoch domain |

The per-site file:line census lives in the JSON; it is too long to render and the census test is its consumer.

