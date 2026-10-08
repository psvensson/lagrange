# Initial learner authorization increment

Existing sealed Quest: message-group-fresh-identity-membership. Base:
02e2070cc2d4d92acfb2128c6337c3e05bb79ddf (includes the shared-seed test correction).
This is a bounded repository source increment, not a new Quest or an activation
of the planner, transport, Raft admission, physical CREATE, or membership driver.
Parent increments and C0 retain independent review and full-acceptance gates.

## Complete transition and authority

Trigger: the existing OperationWorkflowOwner is ready to record its first
ADD_LEARNER intent for an already-admitted REPLACE operation. The repository
method authorizeMessageGroupLearner receives the exact encoded operation
identity and initial permit. Its only durable authority is replica_operations.

Facts: exact O/group/S/T/source-generation identity and retained membership
lane; a current local live membership holder obtained by the existing claim
CAS; current canonical node boot; nonterminal ordinary operation with NULL
completed_at; learner_requested / intent_recorded; NULL action and all three
stamps. A copied permit without the actual claim is insufficient. Initial
permit is sequence 1, ADD_LEARNER, IN_FLIGHT, NULL proposal index and exact T.
Its proposer/owner/boot/fence/expiry bind to the current membership holder.

Action: one exact operation-row conditional UPDATE changes only phase to
learner_proposal_in_flight, permit to the encoded intent, and obligation to
unknown. It matches the same complete observed row predicate already used by
claim/T0, including terminal fields and holder. No new SQL table, state store,
lease, queue or authority is introduced; shared predicates remain subordinate
to ReplicaOperationRepository.

Commit: the actual operation-table SQL/Raft application of that conditional
UPDATE, not a local progress write, successful transport reply, or cache hint.
RECORDED means exact durable intent exists. It is NOT a proposal/CREATE grant.
The runtime consumer still must verify destination boot, permanent target,
current execution holder, runtime incarnation/generation, term/configuration
and operation context before any configuration proposal. Physical CREATE
still requires committed learner proof and the separate exact CREATE CAS.
Those downstream consumers are not wired by this increment.

## Terminal and lost-answer behavior

If terminal settlement/T0 wins first, a stale nonterminal authorization CAS
cannot write; definitive non-admission may release the lane. If authorization
wins first, ordinary settlement cannot erase its unknown membership obligation
or allow T0. A delayed or unavailable answer never proves cancellation. Only
exact authoritative readback of the same identity/permit and current holder
resolves the outcome; an old or different row remains UNKNOWN after a write.

Replay of an already recorded intent is observational, including after
ordinary settlement or holder takeover. It preserves the original action
context rather than mutating it to match the new holder. Resuming an actual
runtime effect requires the separately verified runtime-consumer interaction.
Conflicting permits cannot overwrite each other. Claim renewal, terminal
settlement and source/identity changes defeat stale exact predicates.

## Test and proof scope

Use the existing real-repository/canonical-schema/file-backed SQLite fixture
for positive record/reopen, no-holder and copied-payload refusal, source/stage
substitution, both terminal/authorization orderings, renewal, same-row
competitors, lost/refused writes, unavailable reads and changed boot. Tests
are added before source. Controlled mutations must break terminal exclusion,
exact holder fencing and target binding at their named assertions.

The fixture supplies encoded runtime observations and substitutes distributed
SQL with SQLite; it proves the repository transition, not real ADD_LEARNER,
late proposal exclusion across the runtime, or physical membership. Retain
all failed and passed attempts. Generate test metadata from its owners. Push
only the new WIP branch; no Solver landing, self-issued independent approval,
parent merge, cutover completion or A1-v13 compatibility approval.
