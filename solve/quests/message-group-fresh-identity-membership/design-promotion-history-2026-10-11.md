# FreshMG F1/J1: successor-relative promotion fact

Status: **Owner accepted option D for implementation on 2026-10-11. No implementation approval or merge-readiness claim.**

Source: clean `freshmg-integration-20261010`, HEAD
`50a003b86e4d2f0017d6772d11446c027339151e`. The accompanying
`freshmg-f1-proposal-manifest.json` and `freshmg-f1-proposal-source/` preserve the
reviewed files. This report supersedes the suggestion to close F1 by refusing a
successor whose configuration differs from the original learner stamp. That
refusal would preserve safety and permanently defeat the authorized J1 recovery.

## 1. Required distinction and sole owners

The **original learner receipt** is historical provenance: this operation's exact
fresh target was admitted as a learner while the source was a voter. It is never
rewritten when the group changes. The **current durable promotion permit** is the
authority for the one promotion attempt and names the exact configuration in
which that attempt can execute. Those configurations need not be equal after an
ordered successor. The **native committed application owner** determines whether
that exact attempt committed and its before/after configurations. The repository
records that immutable fact by its existing full-row CAS; it does not infer a
new promotion from a current cache, row hint, or a different attempt's answer.

Current ownership/callsite map:

| Seam | Existing owner and relevant entry | Required relationship |
| --- | --- | --- |
| First promotion selection | `replica-operation-message-group-promotion.js:96,309`; `replica-operation-message-group-membership-authorization.js:95,131` | Keep initial selection pinned to the validated original learner fact, original native ADD origin, live holder, current caught-up proof and own-term application. |
| Ordered successor | `replica-operation-message-group-learner-successor.js:76,109,147,174,204` | Keep exact transition/target, sequence +1, strictly newer leader term, same-read positive NONCOMMITTED fence, current canonical boots/lifetime/claim, and exact observed-row CAS changing the permit only. The successor configuration is the native fence observation's configuration. |
| Native proposal | `raft-rs-membership-transition-runtime.js:119,197,268` | Keep exact current term/configuration generation, lifecycle/runtime, target own observation, exact catch-up, pending-conf-change exclusion and final synchronous delivery admission. No refreshed command. |
| Committed application | `raft-rs-runtime-owner.js:866,920`; `raft-rs-application-transaction-owner.js:51`; `raft-rs-operation-port.js:229` | One native apply result and one SQLite transaction own action provenance, configuration and applied position. Currently only ADD_LEARNER provenance is retained. |
| Native action read | `raft-rs-committed-membership-read.js:256` | Currently returns original ADD origin plus **current** membership, not exact PROMOTE history. This is the missing boundary for post-commit drift. |
| Voter fact and recorder | `replica-operation-message-group-promotion.js:110,134,369`; shared `recordMembershipActionOutcome` and `recordObservedAction` | Replace the original-L comparison with exact current-permit before/after evidence. Preserve full-row CAS, three receipt columns, canonical bytes, replay and late-write UNKNOWN semantics. |
| Workflow caller | `operation-workflow-message-group-native-read.js` explicit recovery/successor entries | Retained operation lane and native registered read; no new driver or periodic loop is implied by this proposal. |
| Checkpoint retention | `raft-rs-peer-identity.js`; `snapshot-checkpoint-format.js`; `snapshot-checkpoint-store.js`; `snapshot-install.js` | Existing permanent reservation and actual image payload own retention. Scrubbed images remove native logs, so log-only evidence cannot cover recovery. |

## 2. Existing measured red schedule: F1

The checked-in real native witness at
`test/integration/message-group-learner-promotion-recording-guards.integration.test.js:467`
currently **asserts that recovery stays stuck**, so a passing run of that test is
not positive J1 evidence. Earlier C2 verification measured that schedule; this
proposal has not rerun it or changed its assertions.

1. Record original learner configuration L; select promotion P(n), bound to L.
2. Commit an unrelated learner addition, producing L'. Keep the source voter and
   target learner, and preserve the original learner receipt.
3. Old P(n) is refused STALE_CONFIGURATION without a core proposal. Same-term
   outcome read remains UNKNOWN.
4. Transfer leadership; the newer leader applies its term and positively reports
   target learner. The prior attempt is NONCOMMITTED.
5. Existing successor CAS issues P(n+1), bound to L'. Target catches up under L'.
6. Real native PROMOTE commits: post-state is L' with exactly target promoted.
7. Every voter recorder currently returns CONFLICT because `voterStampFollows`
   compares to L with target promoted. UNKNOWN debt and group lane remain forever.

Required red-first change: retain steps 1–6, require RECORDED in step 7, verify
phase VOTER_COMMITTED and exact committed P(n+1), exactly the three receipt
columns changed, original L bytes/ordinary status/holder/UNKNOWN debt unchanged,
source still voter, unrelated learner retained, exact replay writes zero rows.
Record the native promotion entry index rather than an unrelated later index.
The unchanged current source must fail the RECORDED assertion, not setup or a
missing method. This is the smallest behavioral red for the F1 correction.

## 3. The bounded inverse check (necessary, insufficient alone)

For validated ordinary post-configuration S and exact current row permit P:

- target must be the exact target voter, not a learner; source must remain its
  exact voter; original learner receipt and original native ADD origin remain
  valid for the same transition and fresh identity;
- reverse only that target's learner-to-voter move in S;
- calculate its key using the existing `raftRsConfStateKey` owner, with ordinary
  empty joint-role sets, and compare to P.leaderConfigurationStamp.configurationKey;
- native promotion index must be later than P's configuration generation and
  belong to P's exact managed action tuple and execution term;
- the canonical recorded fact must retain those same relationships on replay.

This admits L' + target only if P actually authorized L'. It still rejects the
existing fabricated-extra-voter/learner negatives against a permit for L. Do not
parse the opaque key in an unrelated repository helper, silently broaden initial
selection, rewrite L, rewrite P in place, accept arbitrary voter presence, or
weaken any row/boot/lease/lifetime CAS guard.

## 4. Further reachable schedules the inverse check does not close

These are source-derived schedules, not newly executed proof:

**F1-H1, post-promotion change.** Let exact P at C commit at index k. Before the
recording read, admit an unrelated member at m > k. The native action read sees
the target voter and matching original ADD origin, but returns C_m. An inverse
check against P cannot match; the exact committed P remains unrecordable even
after restart, although it cannot be retried or abandoned.

**F1-H2, ABA.** After k, add an unrelated learner and then remove it at m > k.
The role sets and configuration key again equal C_k. The current implementation
(or inverse-only correction) accepts the latest stamp and assigns
`proposalIndex = stamp.membershipGenerationIndex = m`, even though the promotion
committed at k. Generation monotonicity alone does not identify the action.

There is an actual generic membership path outside this operation's recorder:
`raft-rs-group-membership-admission.js:122` calls `port.proposeConfChange`, and the
operation port's generic entry at `raft-rs-operation-port.js:330` is not held by
this repository CAS. Native pending-conf-change exclusion only lasts through the
native application; it does not extend until the remote operation receipt CAS.
Consequently a local operation lane is not proof that H1/H2 are impossible.

## 5. Options evaluated and recommendation

### A. Inverse check only — reject as complete closure

Small source correction and correct for F1's original schedule. It leaves H1
unrecoverable and H2 falsely attributed. Suitable only as a separately scoped
component correction, never as merge-readiness/J1 closure.

### B. Retained native-log reconstruction only — reject as sole authority

The managed PROMOTE action context is in the native configuration entry, and
`readDurableRecord` retains entries with types. An exact retained-prefix reader
could reconstruct historical evidence through the native owner. However,
`readCommittedEntriesIn` intentionally reads NORMAL application proposals only;
it is not such a reader. Images scrub native logs, and folded bootstrap entries
must not replay historical ConfState over the current core. Current image
retention therefore cannot guarantee recovery of k or C_k. An unbounded scan or
missing-prefix inference would not close J1. A bounded native history reader may
be a migration/reconstruction tool if its full prefix proof exists; it is not a
substitute for retained checkpoint provenance.

### C. Serialize every group configuration change through receipt recording — not recommended

This would require all existing generic and managed membership entries to obey
one durable group-wide held obligation until the authoritative operation receipt
is recorded, across leader/runtime replacement. A process-local mutex, pending
native index, admission-time read, or old holder lease is insufficient. The Raft
apply owner cannot await the external repository CAS; making committed apply
wait on it risks a control-plane/MG formation cycle. It would also block legitimate
unrelated membership progress for an uncertain external reply. No such durable
all-callers boundary currently exists, and adding a competing barrier is broader
than this fact-retention problem. If chosen, it needs an explicit owner contract,
all callsite audit and restart/native ingress proof, not a blanket issuance guard.

### D. Extend the existing permanent identity fact — recommended for judgment

Retain **one immutable committed PROMOTE fact per fresh target** beside its existing
immutable ADD_LEARNER origin in the **same permanent peer reservation**. This is a
bounded native retained fact, written only by committed application, not a second
operation ledger, retry scheduler or alternative decision owner. There is at most
one committed promotion for this never-reused fresh identity; ordered attempts
before it are not retained as workflow history.

The existing committed-context codec owns the canonical fact. Minimum evidence:

- group, exact managed PROMOTE context (operation/transition/permit sequence/
  stage/target replica/peer), actual entry index k and entry term;
- exact native before-configuration key and generation, and exact ordinary
  after-configuration, sufficient to validate only target learner→voter changed;
- immutable binding to the original ADD origin (same target/transition, prior
  sequence and entry), without replacing or re-encoding that origin's bytes.

The runtime captures the **actual before state in the native apply turn**, takes
its after state from the core's apply result, and sends that data synchronously
through the existing application-transaction callback. Registry persistence,
ConfState, membership generation and applied index commit/rollback together.
Identical replay is idempotent; conflicting overwrite fails and rolls back.
An entry folded into bootstrap may restore authentic retained provenance but
must never manufacture a historical before state from the joiner's current C_j.

The same queued semantic action read returns the exact promotion fact only when
its action tuple matches and k is within its local applied boundary. It also
returns current membership separately when a caller needs it. Original ADD
provenance remains mandatory. Missing/unreadable provenance is typed unresolved/
unavailable, not NONCOMMITTED. The existing strictly newer-term, current-term-
applied, exact-target-learner positive absence fence can remain the narrow
noncommitment rule under its existing no-target-demotion premise.

The repository compares the retained fact's **before** stamp to the exact current
durable P, validates its exact target-only **after** delta and original L
provenance, and records P as COMMITTED at k. H1 then records the genuine C_k fact;
H2 also records k, never m. It need not forbid unrelated configuration changes.

**Do not forge a normal current committed-membership stamp for historical C_k.**
That stamp's existing contract describes the configuration at its same-read
applied boundary. A returned C_m cannot be relabelled C_k. Refine the existing
`message_group_voter_stamp` encoding to a canonical/versioned promotion-fact
shape (or an explicit envelope that distinguishes the retained fact from the
current witness); update its sole validity predicate, recorder, replay/readback
and consumers together. Current source has no external production consumer of
`recordedVoterFactIsValid`; this is the bounded point to make that distinction.
The row still changes only phase, committed permit and that receipt column.

The original learner column remains byte-for-byte unchanged. A historical voter
fact does not authorize source removal under a stale configuration: later
handoff/removal still reads its own current authoritative membership, progress
and exact-generation fences. Those stages are not implemented or certified by
this proposal.

### Checkpoint / compatibility consequence (part of D, not optional)

Extend existing reservation image enumeration, strict descriptor shape, actual
payload comparison, install verification and recovery to preserve and validate
the promotion fact against the image's group/applied boundary and original ADD
origin. The same original-byte retention must survive scrubbed images. Amend the
unreleased image format through its current owner; do not claim that old version
2 images or NULL promotion facts contain this evidence.

For pre-change live states, recover from an authentic retained native prefix or
another witness that owns the fact; never fabricate k from current voter state.
If neither exists, existing bytes cannot prove the exact fact. Explicitly scope
compatibility and prohibit activation/upgrade on those unresolved states until
an owner-approved recovery path exists. Merely returning permanent UNKNOWN is
honest safety behavior but **is not closure** of their J1 liveness obligation.
New native/image proof must demonstrate recovery without relying on old logs.

## 6. Separate J1 FAILED-settlement decision

The F1 fact correction does not repair this existing reachable schedule: an
issued promotion remains uncommitted, ordinary operation settles exactly FAILED,
a newer leader positively fences it, and successor issuance refuses because
`owesAttempt` requires an open ordinary operation. Runtime observation and
recording already accept exactly FAILED status + FAILED workflow step + positive
completedAt (`exactIssuedIntent`, `recordingSettlementAllowed`).

Recommended narrow follow-on owner decision: a **previously authorized PROMOTE**
with UNKNOWN membership debt may issue its ordered forward successor under the
same exact FAILED settlement predicate and existing holder claim; no new initial
promotion after failure, no ADD_LEARNER widening, no ordinary status resurrection,
no abandonment after authorization and no lane release. Keep full settlement
fields in CAS and distinguish DONE/inconsistent terminal projections. Verify
holder recovery/renewal is already able to own that failed row before enabling
this entry; the eventual driver must explicitly revisit this debt. This requires
settlement-owner approval; it is not silently included in D.

## 7. Required bounded proof and mutations after judgment

1. Convert F1's existing real native witness from intentional CONFLICT to exact
   RECORDED, including source retention, unchanged original origin/stamp, current
   successor before-config, catch-up safety **and eventual promotion in one run**.
2. Hold recording after PROMOTE, commit unrelated learner/voter changes, then
   recover after a real native reconstruction. Record exact k and C_k.
3. Real add/remove ABA: current key returns to C_k but current generation m > k;
   exact fact and committed permit remain at k.
4. Crash/throw inside actual apply transaction: origin, promotion fact, applied
   position and configuration roll back together; repeated identical apply has
   one immutable fact; conflicting sequence/context/position cannot overwrite.
5. Real scrubbed image with sender native log absent retains exact ADD and PROMOTE
   bytes; restart/install verifies them. Missing, altered, wrong group/target,
   beyond-image-boundary and unsupported-version cases refuse without success.
6. Exact permit mutation and concurrent successor races during native/read/boot/
   CAS awaits: no old fact settles a different current attempt. Every actual CAS
   submission/retry samples invocation, live holder and canonical local boot;
   final synchronous lease/lifetime guard still runs after boot await. Already
   admitted writes may commit and return UNKNOWN if lifetime lapses. Readback
   after await must not return RECORDED for a retired invocation.
7. No-exact-origin, appended-only, uncommitted, follower absence, same-term
   absence, newer unapplied term, unknown identity and noHandler are not proof.
   Positive absence/retry remains bounded and event driven under the existing
   native/workflow owner; this proposal adds no loop.
8. Preserve fabricated-extra-member negatives against a permit for L, while
   accepting exactly the same member change when genuinely present in the
   durable successor's L'. Strict codecs reject accessor/extra-field/noncanonical
   receipts and wrong action sequence; replay/readback use the same predicate.
9. If FAILED continuation is accepted, exercise real ordinary failure before a
   fenced successor and successful forward recovery, plus DONE/inconsistent
   settlement negatives and concurrent claim takeover. No ordinary history edit.
10. Behavior-red API-preserving mutations: compare against original L; drop exact
    successor before key/generation; replace retained k with current m; ignore
    exact action tuple; omit original ADD binding; overwrite retained fact; drop
    transaction rollback; omit image field/byte comparison; drop final CAS gate
    or stale-read guard. Require named semantic assertion failures, not missing
    methods, timeouts, cancelled tests or vacuous quorum fixtures.

Use the canonical locked/thermal lab placement for native suites; keep component
proof distinct from physical two serial fresh-identity replacements and all eight
Quest receipts. Impact contract and primary/resource/subsystem registries must
name the coupled retention/read/record/image witnesses. Nothing in this proposal
certifies source removal, off-seed seed loss or the whole Quest.

## 8. Complexity observation

Existing candidate full report has 1759 violations against fixed baseline 1755.
A bounded static comparison using the canonical checker's exact ESLint options
on every JS file changed by merge `6e091e82f` → `10c2f0610` finds **three before,
three after, net zero** (`freshmg-complexity-delta.mjs/.json`). The merge changes:

- `selectMessageGroupMembershipBranch`: complexity 29 → 32 (existing violation);
- `decodeMembershipPermit`: 15 → 15 (existing violation);
- old `recordMessageGroupLearnerOutcome` complexity 13 removed;
- selection-guards test arrow at line 385 complexity 13 added.

Thus the aggregate excess of four is real but is not four newly introduced C2
violations. It predates this merge. Do not raise the baseline or invent a fourth
C2 function. The exact earlier crossing still needs a bounded baseline comparison
if attribution is required; reducing the three listed current functions would
lower the aggregate by three, not prove the remaining excess resolved.

## Implementation decision record

Parent owner accepted D and the conditional FAILED continuation. F-SNAP in accepted TX1 v10 section 8.2 and finding F-SNAP concerns partition application rows/generation/outcomes. This continuation changes only authentic MG native permanent reservation metadata and its existing image producer/validator; it does not infer partition application provenance from catalog scrubbing. Existing partition gates remain open.

Planned retained encoding (version 1): groupId, actual decimal index/term, exact managed PROMOTE context, unchanged encoded learnerOrigin, exact before configurationKey/membershipGenerationIndex, ordinary after voters/learners. The codec owns canonical arrays and role-aware key derivation; the exact delta reverses only the target promotion. The registry stores one nullable promotion admission beside its existing learner admission; the operation voter-stamp column stores the canonical immutable promotion fact rather than disguising a historical configuration as a current committed-membership stamp. Native action answers keep current membership separate.
