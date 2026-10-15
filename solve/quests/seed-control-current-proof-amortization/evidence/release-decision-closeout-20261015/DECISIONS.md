# Release-fencing implementation gate: exact decisions for review

Status: proposal for content-bound owner review; production remains HOLD.
Source baseline: `108282c80318fbc9e7094f2e7a99ba37430374fd`.
The accepted evidence packet, rejected predecessor `bde70cec...`, old Quest,
models and native failures are unchanged. This document selects an extension
of existing owners, and names the missing contracts that prevent implementation.
It does not declare their implementations present or their proof complete.

## Single ownership and consumed surfaces

Paths below are relative to the repository at the source baseline.

| Fact / interaction | Sole semantic owner and actual source | New work required |
| --- | --- | --- |
| D0 release attempt and external evidence collection | `src/node/replica-handler-participant-cutover.js:247` (`runCutoverAttempt`); recipient `replica-handler-participant-release.js` | Build fixed release commands; no inspection loop decides atomic admission. |
| D1 ordered position, suffix custody, membership history | `src/raft/raft-rs-runtime-owner.js:956`, `:1191`; durable store `raft-rs-durable-store.js:404` | Supply actual application-prefix facts and reconstruct outstanding release reservations. |
| D2 release-state transition and admission comparison | Existing partition committed application: `src/partition/partition-service-entry-apply-base.js:568`; atomic boundary `src/raft/raft-rs-application-transaction-owner.js:51` | New fixed command family and release-state row within this owner, not a second service/ledger deciding release. |
| TX1 session, immutable PREPARE, participant outcome | `partition-participant-transaction-request.js:291`, `:347`, `:390`; bytes `partition-participant-transaction-bytes.js`; apply/store owners | Add binding custody and exact immutable epoch validation; preserve local staging and first terminal result. |
| Global transaction decision and discharge | Query decision/recovery/settlement owners: `distributed-transaction-decision.js:146`, `distributed-transaction-release-settlement.js:184`, `sql-query-engine-transaction-set-methods.js:65` | Persist a verifiable discharge binding if D2 needs cross-partition discharge. Release cannot choose COMMIT/ROLLBACK. |
| D3 local serving eligibility | `src/partition/partition-participant-transaction-pause.js:190` | Conjoin current applied authorization with current local runtime/connection/build/lifecycle proof. |
| D4 exact request result | `partition-committed-statement-outcome.js:109`, `:136`; fixed typed adapter precedent `partition-coordinator-settlement.js:35`, `:73` | Release-specific typed result adapter, canonical-content match and retirement protection. |
| Request custody across routing | `query-executor-partition-request-builders.js:80`; delivery `query-executor-partition-delivery.js:42`, `:366`, `:452`; TX wire `sql-query-engine-participant-wire.js:104` | Capture once before first effect-capable delivery; retain bytes through redirect/retry/unknown. |
| Application image and accepted import | Existing snapshot/application/runtime interaction, exact preserved refs in `SNAPSHOT-DECISION.md` | Owner-fed content inventory, versioned image and native accepted atomic import. No parallel installer. |

## A. Command and admission-binding decision

### Canonical representation and identities

Select fixed-order canonical JSON arrays, UTF-8, no optional/unknown fields,
no floats or implicit defaults. Integers are canonical nonnegative decimal
strings (no leading zeros except `0`), bounded to the native position range.
Hashes are lowercase 64-hex SHA256. Identifiers have an explicit encoded-byte
limit; initial proposal is 256 UTF-8 bytes per partition/group identifier.
This new limit requires a retained-identity compatibility check before adoption.
New releaseVersion/historyGeneration fields use exact decimal TEXT with maximum
18446744073709551615; no conversion through JavaScript Number and no wrap.

Canonical request, in this exact order:

```text
["partition-release-request/1", kind, partitionId,
 [originIndex, originTerm], nonceHex32, historyGeneration,
 expectedState, transitionInputs]

expectedState = [releaseVersion, status, authorizationIdOrNull,
                 lastTransitionIndex, lastTransitionTerm]
requestId = SHA256("lagrange/partition-release-request/1\n" + canonicalBytes)
entryId = "release:" + requestId
```

`kind` is INIT, HOLD or APPROVE. INIT alone uses expectedState `null`.
`nonceHex32` is 32 hex characters generated once outside every retry loop.
Changing contents creates a different requestId; reusing a supplied requestId
with different bytes is invalid. Transport address, session routing context,
proposal term/time, D3 observations and guessed log position are excluded.
The requestId is also its content digest; a second independently meaningful
request-id field is unnecessary. Hash collision resistance is an explicit
assumption, consistent with existing TX1 digest identity.

Three unrelated identities remain distinct: immutable transaction identity
(`transactionId`, `participantId`, `transactionEpoch`); release authority
(origin, releaseVersion, authorizationId); exact release request identity.
History generation is only an anti-replay fence, never admission authority.

Proposed release-state row, owned by partition application:

```text
_partition_release_state:
 singleton=1, format=1, origin_index, origin_term,
 release_version, status={HELD,APPROVED}, authorization_id NULL|hash,
 last_transition_index, last_transition_term,
 approved_inputs NULL|canonical value
```

All positions come from actual committed application. The result owner owns
history-generation metadata separately, initialized to 0 with INIT; it does not
increment releaseVersion. INIT carries historyGeneration 0.
These are new persistent records and a new command family, not unchanged behavior.

### Initialization and transition table

INIT installs version 0 HELD at its actual application position. It is an
explicit ordered activation barrier, not an open-time default. Fresh storage
must use existing founding/CREATE authority; retained storage must use the
existing operator/cutover authorization and exact retained origin. D2 checks
the origin and absent release row. Missing rows on retained storage never mean
fresh or APPROVED. New ordinary admission stays locally closed until INIT and
APPROVE are applied. Commands before INIT retain their historical semantics;
unbound new-work commands ordered after INIT are refused. Existing durable TX1
replay and authoritative settlement remain available across that boundary.

This requires a reviewed activation marker in committed-command admission and
local-open recovery. There is no automatic migration of existing OPEN permission.
The initial control partition must be able to initialize while empty by extending
its current fresh-storage/operator path; this new INIT composition is not present
or proved. It must not require an already OPEN QueryEngine or a CONFIG read
through the control state it is forming.

| Request at actual prefix | Deterministic result | Release-state effect |
| --- | --- | --- |
| Retained exact request, exact bytes | Return original result/position | None; no annotation allocation |
| Known ID with different bytes | ID_CONTENT_CONFLICT | None; original result untouched |
| Missing result, retired history generation | HISTORY_RETIRED | None; never NOT_COMMITTED |
| Future history generation at request admission | HISTORY_GENERATION_AHEAD, not admitted; retry original bytes under existing budget | None; may be an applied-state lag, not terminal invalidity |
| INIT, absent row, exact existing origin | INITIALIZED | version 0 HELD |
| INIT after initialization | ALREADY_INITIALIZED or exact retained replay | None |
| HOLD, exact APPROVED tuple | HELD | version + 1, authorization NULL |
| Distinct HOLD, exact HELD tuple | ALREADY_HELD (no-change result) | None; does not consume version |
| HOLD or APPROVE, expected tuple differs | EXPECTED_STATE_CONFLICT, retaining winner seen here | None |
| APPROVE, exact HELD tuple and all replicated predicates satisfied | APPROVED | version + 1, authorizationId=requestId |
| APPROVE, exact APPROVED tuple | EXPECTED_HELD_REQUIRED | None |
| APPROVE, replicated predicate fails | PRECONDITION_REFUSED with fixed reason | None |
| APPROVE at version greater than maximum - 2 | VERSION_EXHAUSTED | None; keep HELD and reserve a final closing increment |
| Invalid/oversize command before proposal | INVALID_REQUEST / REQUEST_TOO_LARGE, not admitted | None; no durable result promised |
| Local I/O/full/busy or unavailable authoritative state | Existing host failure / RESULT_UNAVAILABLE | Atomic apply rolls back; no deterministic refusal fabricated |

Only the current history generation is eligible for a new proposal. A later
retirement can make such an in-flight command older, never future. A future
generation appearing in committed bytes violates that trusted admission
contract: fail closed with PROTOCOL_INVALID_COMMITTED_COMMAND rather than
create a future-tagged refusal that could be retired and then regain authority.
This containment and its native negative witness are part of the missing
runtime/result contract, not a claim about a current code path. It requires
protocol/operator diagnosis, not repeated retry to green. APPROVE never creates
APPROVED at the maximum version; its succeeding HOLD can always increment once.
HELD at maximum remains closed with VERSION_EXHAUSTED. At maximum history
generation, retirement returns HISTORY_GENERATION_EXHAUSTED; do not wrap or
discard anti-replay state. Safe closure/settlement stay owned; further admission
may require an explicitly reviewed identity migration. No indefinite-progress
claim is made beyond exhaustion.

HOLD deliberately has no transaction-drain predicate: closing new admission
must be possible with PREPARED obligations. It still requires exact state,
origin, command grammar and request identity. Refusals may advance the Raft
log/applied position and outcome history; they do not consume releaseVersion.

### D0 inputs, D2 checks and D3 observations

HOLD transitionInputs is `[reasonCode]`, exactly one of OPERATOR, RECOVERY,
COHORT_CHANGE, BUILD_CHANGE, TOPOLOGY_CHANGE or CAPACITY, without free text.
INIT inputs is `["activate-fence/1"]`; privileged-origin admission is required.
APPROVE inputs is:

```text
["approve-inputs/1", targetBuildDigest, configurationDigest,
 membershipGenerationIndex, writeGeneration, applicationContractDigest,
 queryDischargeDigestOrNull, d0TranscriptDigest]
```

D0 retains its complete measured transcript as evidence and carries its hash.
The transcript digest identifies supplied evidence; it proves neither freshness
nor sufficient permission. D2 must not accept it in place of any predicate.

D2 checks the exact expected release row; the origin; stable committed
configuration and generation **at this entry's application prefix**; the
replicated write generation; the application/schema contract; and absence of
durable PREPARED reservations in this partition. It uses no wall clock, local
queue length, local session map, transport success, build measurement, local
SQLite-open flag, cache topology, or another replica's serving state.

For `sql_transactions`, a durable global decision and terminal status alone
are insufficient discharge proof. Select an extension of the existing query
settlement owner: an immutable discharge record bound to the frozen manifest,
transactionEpoch, recorded decision digest and each actual participant's
matching terminal reply (participantId, preparedDigest, decisionDigest,
terminal outcome and actual decision index/term). Only query settlement may
produce this record, after normal delivery/readback; release only consumes it.
D2 compares the record to the current replicated coordinator rows/manifest and
canonical decision. Existing legitimate terminal rows without this record must
be re-driven by query settlement, not assumed clear. This introduces new bytes,
durable state and recovery obligations; current invocation-only queryDrainProof
does not already provide it. It uses TX1's existing trusted-coordinator boundary,
not the claim that a digest authenticates a remote outcome.

D3 alone evaluates measured build against **this applied APPROVE's**
targetBuildDigest/approved_inputs, current service object/lifecycle/connection,
local staging/drain, current cohort observations and local topology/readiness.
It may keep one replica closed after replicated APPROVED. A later local change
closes D3 and triggers the existing release continuation. It cannot alter the
effect of a command already committed with a valid binding. Prior committed
effects are never rolled back by PAUSE. D4 reports separately: committed entry,
applied request result, observed current release state and local eligibility.

**A blockers requiring content-bound owner agreement:** the runtime does not
yet expose exact application-prefix membership facts to this new predicate;
applicationContractDigest has no owner-fed application provenance producer;
query discharge is currently invocation-only and lacks the proposed durable
record/encoding. Local cached topology is not a D2 substitute. INIT's bootstrap
and retained-log activation matrix must be included in the complete unit, not
improvised while adding columns. These are specific missing owner contracts.

### Binding capture and custody

Select one partition admission token:

```text
["partition-admission/1", partitionId, originIndex, originTerm,
 releaseVersion, authorizationId]
```

The existing query delivery owner captures this once **before the first
effect-capable delivery**, from a new typed state observation on the existing
partition request/result surface. This is an observation of applied release
state, not a second grant authority; stale observations only cause D2 refusal.
Only APPROVED can supply a token. D3 and leadership must also admit the local
proposal. Direct internal partition callers use the same capture owner before
their first proposal. A request that has already been sent without retaining
its binding cannot be safely retagged and must remain UNKNOWN/refused.

Ordinary writes carry the token in the immutable request, built entry, pending
handoff and replay-content identity. Redirect rebuilds routing only. Unknown
outcome retains the original token and entryId; observing a newer APPROVED
never mutates them. A definitively refused operation may be resubmitted only
as explicitly new work under a new identity.

TX1 BEGIN carries the captured token. `beginParticipantSession` validates it
and stores it in volatile local session state; BEGIN and staging remain local
and create no replicated staging obligation. The coordinator retains the token
per participant alongside BEGIN identity for retry; PREPARE sealing copies the
same token into canonical validation/command bytes and their prepared digest.
If the session is lost, the transaction owner follows its existing failure /
decision path; release cannot reconstruct or rebind staging. A delayed first
PREPARE after HOLD or after a later APPROVE fails the exact token comparison.

Coordinator/request-owner restart must recover the original token with its
existing durable transaction/write intent or from the matching durable
participant PREPARE. That requires explicit custody fields in those existing
owners; a process-local option is insufficient. If the token cannot be recovered,
ADMISSION_BINDING_UNAVAILABLE keeps the ordinary request UNKNOWN under its
existing outcome owner; TX1 follows its existing authoritative decision/recovery
path. It may settle an existing obligation but cannot issue newly bound PREPARE.
This is a required new recovery contract and acceptance row, not a claim that
current query persistence already retains the token.

Replay ordering is: validate immutable transaction identity (including epoch),
then any durable PREPARED/terminal row and phase-specific canonical binding,
then apply the new-admission fence only if no obligation/outcome exists.
`sessionId` remains routing context. NOT_SELECTED at BEGIN/staging and
TWO_PHASE_COMMIT at PREPARE/settlement remain legitimate phase semantics;
do not compare every request field indiscriminately. Authoritative DECISION
for an existing obligation bypasses new-admission closure through TX1's current
settlement path, without transferring COMMIT/ROLLBACK authority to release.

The new observation operation, query custody fields, session field, sealed
bytes/digest, entry builder, replay comparison and apply predicate must be
reviewed together. None exists merely because the chosen token is specified.

## B. Durable results and finite capacity

Select the existing committed-result owner with a strict `release-result/1`
adapter over `owner_result_text`. The coordinator-settlement adapter already
stores typed non-SQL results there; this is a justified use of that owner.

```text
["release-result/1", canonicalRequest, requestId, disposition, reasonCode,
 expectedState, resultingState, originalConflictWinnerOrUnavailable]
```

Winner encoding is `["KNOWN", requestId, resultingVersion, logIndex, term]`,
`["UNAVAILABLE"]` or `["NOT_APPLICABLE"]`. KNOWN must name the retained accepted
transition that consumed the conflicting request's expected state. If that
transition has retired, use UNAVAILABLE, never today's authority as a substitute.
This bounded lookup belongs to the result adapter. ReasonCode is the fixed
transition-table reason or NONE; APPROVE precondition reasons are ORIGIN,
CONFIGURATION, WRITE_GENERATION, APPLICATION_CONTRACT, PREPARED_OBLIGATION or
QUERY_DISCHARGE. Canonical matching/grammar errors are request admission errors.

The canonical request is nested as a value, not JSON text escaped inside JSON.
The existing row stores actual log index/term. A narrow exact-position read
must preserve native u64 values; the current generic reader converts them to
Number (`partition-committed-statement-outcome.js:119`). The adapter must run
before generic SQL replay and compare canonical bytes. A losing request keeps
its own result and the winner seen at its original application. A later state
observation never overwrites either. Exact replay adds no authoritative row,
annotation or release transition.

Select a result-owner retirement generation, separate from releaseVersion,
carried in canonical request bytes and restored in the application image.
Retirement must be an explicit deterministic owner operation that advances
this frontier without changing release authority. It may retire current-version
refusals; old-generation missing outcomes return HISTORY_RETIRED without effects.
This prevents a rejected request becoming fresh after deletion. Retained rows
still answer exactly; unavailable storage answers RESULT_UNAVAILABLE. Neither
response proves the request never committed. D0 must resolve/reconcile its
remaining obligations before voluntary retirement; forced capacity retirement
has an explicit unavailable-history result rather than invented noncommitment.

**B remains blocked on a complete finite accounting mechanism.** Existing
ProposalQueue's 1000 live waiters do not bound commands still in consensus:
proposal -> timeout/leader loss -> waiter removed -> another proposal, while
the first may still commit (`proposal-queue.js:96`, `:202`). Runtime serialization
does not account for output history or restore reservations after leadership.

The required extension stays with the runtime/result interaction: before core
admission, reserve maximum result space; include core-held, Ready-held and
durable unapplied suffix commands; reconstruct before admitting after a leader
change; exchange reservation for result atomically at apply; release it only
after application/retirement or runtime-proven suffix discard. A timeout drops
the waiter, not that credit. Exact pending duplicates share credit. No current
operation-port API supplies this contract. A process-local Map is insufficient.

### Concrete sizing candidate, not a production limit

| Incremental release resource | Proposed ceiling |
| --- | ---: |
| Canonical request, actual UTF-8 encoding | 16,384 bytes |
| Result fields excluding nested request | 8,192 bytes |
| Complete result | 24,576 bytes |
| Logical row key/scalars/metadata allowance | 1,024 bytes per result |
| Normal / critical retained results | 128 / 16 |
| Normal / critical unresolved requests | 32 / 8 |
| Current release row / retirement metadata / participant token | 16 / 4 / 2 KiB |

The 40 pending requests reserve their maximum **future result** as well as
their request bytes. Conservative logical incremental envelope:

```text
(144 retained + 40 reserved) * (24,576 + 1,024)
    + 40 * 16,384 + 22 * 1,024 = 5,388,288 bytes
```

All encoders must check actual encoded bytes. A 256-byte identifier can expand
to 1,536 JSON bytes through escapes; the fixed request has one such identifier,
at most twenty 20-digit counters and six 64-character digests, leaving ample
space inside 16 KiB for fixed vocabulary/punctuation. Detailed discharge
records remain query-owned inputs referenced by digest, not an unbounded list
hidden inside this request. This arithmetic is a proposed release-only logical
allocation envelope, **not** a physical SQLite/log/snapshot/memory bound.
Pages, B-tree overhead, WAL, retained TX1/ordinary results and pinned images
remain separately owned. The historical 7,304-byte sample sets no limit here.

Critical retained slots are provisionally 4 HOLD, 8 APPROVE and 4 retirement;
unresolved slots are 2/4/2 respectively. Ordinary requests cannot borrow them.
These numbers are reviewable policy choices, not workload measurements or proof.
Settlement must have separately reserved admission under TX1/query, never borrow
ordinary release history capacity. Existing acknowledged obligations cannot
be rejected because a newly selected byte limit is too small.

Three irreducible capacity blockers are now explicit:

1. **Unapplied custody:** no current runtime API reconstructs the above durable
   outstanding credit. Its bounded admission/discard/recovery contract is new.
2. **Critical refusal saturation:** HELD(v) -> eight failed APPROVEs -> reserve
   full -> prerequisite becomes valid -> reopening cannot record a result.
   The retirement operation itself needs nonstarvable bounded metadata/command
   custody, exact replay semantics and a snapshot-preserved frontier. Reserving
   slots alone does not solve this; its precise protocol is not approved here.
3. **Settlement encoding:** one PREPARED row does not bound its decision bytes.
   The canonical decision and manifest readers bound neither participant count
   nor identity bytes (`partition-participant-transaction-bytes.js:140`,
   `distributed-transaction-participant-manifest.js:5`). Query/TX1 must select
   admission bounds before creating new obligations and a settlement path for
   retained larger obligations. Rejecting their DECISION would strand work.

Consequently this packet does not declare Q bounded, adopt these numbers as
production capacity, or authorize an isolated result-table implementation.

## C. Snapshot and restore decision

Select the already-owned v2 application-image and coupled native-install
direction documented in `SNAPSHOT-DECISION.md`. Preserve the exact draft refs.
Current v1 scrubs application state and validates the peer-only payload; adding
columns to the live DB or removing the scrub is not sufficient.

One immutable boundary B must bind application schema/data/indexes/sequence/HLC,
TX1 obligations and terminal outcomes, query-owned discharge records and their
schema/provenance, origin/write generation, release state, exact request results,
committed accounting and retirement protection, plus exact
group/configuration provenance. Receiver-local vote, runtime/connection identity,
volatile sessions and D3 OPEN permission are not imported. Actual native accepted
Ready plus matching image/target binding authorizes one atomic import with
durable consensus/application state. Replay begins strictly after B; D3 starts
CLOSED and re-enters its existing owner after replay. No active snapshot lease
was established by the fresh inventory; preservation refs are not leases.
Source core/Ready-held and uncommitted pending credit is not copied into the
application image. The receiver's runtime reconstructs its own suffix/custody
accounting before admission. Discharge records remain pinned while an unresolved
query obligation depends on them; their retirement must be owned by query and
bound to the same restored anti-replay contract.
The INIT activation marker and protocol version also belong to B. A pre-INIT
image requires the retained INIT suffix before new admission. A post-INIT image
missing its release row or marker is unavailable/corrupt, never permission to
perform fresh initialization.

Explicit blockers: owner-fed application provenance, v2 validation/creator
wiring, intact-receiver native admission and atomic import, and the native
install/crash/suffix-replay witness. These belong to the existing snapshot and
application owners; this packet takes over none of their production work.

## Cache audit and typed re-entry

Routing cache is disposable: stale routes may redirect, never rebind intent.
Local staging is lost with its leader; it grants no durable permission. Pending
waiter Maps are disposable and cannot free outstanding consensus reservations.
D0 transcripts identify observations only. D3 proof is invalidated by local
lifecycle/build/cohort change. Outcome rows, authority and retirement metadata
are replicated and restored together; absence after unsupported recovery is
UNAVAILABLE, not an empty history. Every retry returns through the same owner.

PRECONDITION_REFUSED is the final result of that exact request. A changed
prerequisite enables a new request, never mutation of the old result.
CAPACITY_DEFERRED is a preproposal transient under existing request budgets;
runtime-proven credit release/retirement wakes that same admission path.
UNKNOWN retains bytes and identity. HISTORY_RETIRED forbids renewed effects.
Host/application failures hold recovery without fabricating committed results.
No timeout is increased, no new inspection/retry authority is introduced.

## Complete implementation unit and acceptance matrix

The proposed future unit remains one partition's release/HOLD -> ordinary
write/first PREPARE -> durable outcome/replay, including query custody, D3/D4,
finite accounting and supported recovery. Implementation is **not approved**.

| Required witness | Current evidence / remaining bar |
| --- | --- |
| Durable PREPARE + recorded ROLLBACK while closed + real later reauthorization | This packet's whole-file native test; see NATIVE-RESULT.md. Local PAUSE, not committed HOLD. |
| Same positive control with recorded COMMIT and application effect | Separate query-coordinator COMMIT path required; never manufacture COMMIT through fixed settlement. |
| Local BEGIN/staging -> sealed first PREPARE delayed across HOLD and later APPROVE | Preserve prior native admission RED; extend with actual immutable bytes after reviewed command exists. |
| Ordinary write crosses same boundary, lost reply/redirect/leader change | Exact token/request bytes; applied effect or exact refusal at actual committed prefix. |
| Durable PREPARE/terminal replay with epoch mismatch and valid phase semantics | Preserve epoch RED, then exact identity refusal without changing existing outcome; session routing remains legitimate. |
| Racing HOLD/APPROVE, invalid/stale commands, distinct HELD request | Exact CAS, no version spent on refusal, loser result/winner immutable, no submission-index oracle. |
| Normal and critical history saturation including HELD refusal saturation | Close B's three blockers; observe pending suffix, credits, closure, settlement AND reopening through leader change. |
| Retirement, exact retry, changed contents, history unavailable | No duplicate allocation or resurrection; never infer NOT_COMMITTED from absence. |
| Native snapshot/install/crash/replay and retained/fresh initialization | Same boundary for all replicated authority, receiver-local CLOSED; see snapshot decision. |
| D3 eligibility differs across replicas at committed application | Same deterministic effects/outcomes everywhere; only local serving differs. |

Components may be developed in reviewed increments after approval, but no
fragment is accepted as a working protocol or landed on focused greens.
Retain inherited lint/complexity and RC1/RC2 F-MIR separately. Successor remains
unsealed/unactivated, shared-control-wave HELD, Runner/TAP PARKED, PR122 rejected.

## Comparable-system guidance

The accepted packet's `COMPARATIVE-PRECEDENTS.md` contains pinned primary sources:
etcd atomic comparisons/results, Raft/LogCabin response retention/frontiers, and
FoundationDB stable intent across unknown results. They support locating CAS
with application, keeping history retirement distinct from noncommitment, and
retaining request identity outside retry loops. LogCabin's acknowledged frontier
is a useful design hint, not permission to import sessions into local TX1 BEGIN.
None supplies the missing Lagrange runtime credit, query bound or image contract.
