# Independent design review: complete-vector outcome correction

Date: 2026-10-23. Reviewer: `subagent:/root/retained_effects_review`.
Worktree: `/mnt/data/peter/projects/.worktrees/mg-source-occurrence-delivery-20261023`.
Writable scope: this review only. No source/test edits, runtime execution,
metadata refresh, commit, publication or lab work.

## Decision

**REVISE the exact proposed note
`f569b1c16e8ecb1cdf43d9b5b161c8a4ee120a65d2ef445d2f4a07d9f4676a72`.**
The design direction is suitable: one existing complete-vector digest plus
unchanged durable receipts, with input-to-command reply translation confined
to the actual MG normalization owner. Two concrete corrections remain.
They do not require a second identity scheme, payload history, persistent
receipt or general recovery owner.

This decision is bounded to R4 of
`REVIEW-mg-delivery-root-source-r1-2026-10-23.md`
(SHA256 `b404fadb31060fad56944dbd4c05603f7fa8d0ecc70ff92193ef7a83d235ca7a`).
The governing interaction contract remains
`474182126c3c985feceadb9a1b72d7de9975e1b4c3280af52be884c6c095f383`,
with approved review
`2eb6a5a1243ee5efc72e0c5182e5f919fbc7d058c1404785bb3d4123ba3e597d`.
Other root/F1/F3 repair lanes are moving and are not source-approved here.

## D1 — Proposed digest syntax contradicts the existing identity owner

Category: canonical representation / owner interaction. Proposal lines 23–32.

`cdcCommitWaitIdentity` returns the result of
`utils/canonical-json-data.js:digest`. That existing representation is
`sha256:` followed by 64 lowercase hexadecimal characters, not bare 64-hex
text. The same utility already exports `isSha256Digest`.
See `cdc-delivery-outcome.js:182–184` and
`canonical-json-data.js:28–35,102–124,327–332`.

Literal implementation of both proposal requirements would either reject
every builder-produced digest or create a second bare-hash representation.
Neither is necessary. Require the exact existing digest string, consume its
existing validator, and compare it to the existing complete-vector identity.
Do not strip/re-add a prefix at callers or introduce a new regular-expression
definition at wrappers. The field must be a required **own data property**;
an inherited value must not fill an omitted required field.

Required controls: independently written missing/wrong-format/wrong-value
fields, including bare hex, uppercase, inherited or accessor-backed fields;
a normal existing `sha256:` digest succeeds only with the exact full vector
and all other canonical receipt/transport requirements.

## D2 — The design must carry correspondence through coverage composition

Category: complete-vector identity / aggregation / stale projection.
Proposal lines 18–36 and 77–99 name receipt builders and validators, but omit
the actual intermediate coverage representation and composer.

At the inspected source, `observeCdcCoverage` strips a validated native
outcome to a state and durable-only receipts. Valid provisional coverage becomes
a shared state-only object. `completeCdcPropagation` then builds a provisional
answer from its supplied events, or manually constructs
`{success:true, cdcCommitted:source.receipts}`.
See `cdc-delivery-outcome.js:263–297`, called by
`cdc-propagation-progress.js:78–95`.

This surface matters in two ways:

1. Adding a required vector digest only to the two named builders/validators
   makes the manual committed aggregate invalid, including the real
   zero-target native path.
2. Repairing that by assigning a digest freshly computed from the composer's
   current argument can lose the same R4 correspondence at a different seam.
   Let coverage be observed for `[D,U1]`, with every durable receipt valid.
   If the composer is later supplied `[D,U2]`, its remaining metadata cannot
   distinguish those observations. A freshly computed `[D,U2]` digest plus
   unchanged D receipts would look canonical. State-only provisional coverage
   has the analogous issue. This is a symbolic owner-boundary counterexample,
   not a claim that a particular production call already substituted events
   or that a runtime test demonstrated it.

The existing source lane binds its current cell to
`cdcCommitWaitIdentity([event])`
(`partition-cdc-obligation-progress.js:46–55`), and the topology context
captures its events. Preserve those actual protections; do not claim they
make a newly rebuilt canonical response independently vector-bound.

The correction must explicitly name this consumed surface and keep the
**same existing vector identity** available through validated native and
provisional coverage. A field in the existing bounded coverage metadata,
or an equivalent owner-private binding checked by the semantic composer,
is sufficient. Before composing, every required covered leaf must match the
expected captured vector, current obligation/recipient bindings and required
set. Missing or mismatched identity supplies no coverage. No raw response,
event-body copy, separate registry or new durable state is needed.

The composer may construct its aggregate with the same validated input-vector
identity and the actual source receipts once all required coverage matches.
That is aggregation of already validated correspondence, not permission for
topology to translate a normalized command digest to some different request
digest. Only the MG normalization owner may perform the latter translation.
The new digest cannot promote a provisional tag to native or an incomplete
target population to complete coverage.

Required controls: exact vector through zero-target and nonzero-target
composition; committed and provisional `[D,U1]` coverage composed for
`[D,U2]`, `[D]`, appended, duplicated and reordered ordinary members must
remain UNKNOWN/uncovered. Include one valid native leaf plus one mismatched
provisional leaf. A correct vector with incomplete target/subscriber coverage
must also remain UNKNOWN. These controls belong to the canonical owner and its
real source-consumer path, not merely a test helper that creates digests.

## Why the proposed normalization translation can be accepted after correction

Define I as the immutable captured incoming semantic vector, with an
unassigned ordinary timestamp represented as absence. Define N as the
immutable command vector returned by the existing ordinary normalizer within
the reserved MG admission slot. The proposal preserves every durable event,
every member and its order; only ordinary unassigned stamps acquire their
existing fallback. A native waiter is keyed by N, not by I.

A native afterCommit result must first be canonical for N and the actual
recipient group/index/term. A forwarded result must first be canonical for
the complete N and satisfy the transport consumer. Provisional completion
must likewise be canonical for N after the owned local ingress. Only this
same live admission can replace that result's vector digest with I's digest.
Durable receipts and all contradictory/error/defer fields remain unchanged.

This preserves the two invariants together:

- A remote reply for `[D,U1]` cannot satisfy a waiter or forward consumer for
  `[D,U2]`, even though D's durable receipts match.
- A valid `[D,U]` with an ordinary missing stamp remains admissible without
  reminting D or forcing the external caller to reconstruct the service's HLC.

The current ordinary normalizer at
`message-group-service-cdc-propagation-runtime-methods.js:320–344`
uses a nonempty primitive string on the event, otherwise a nonempty primitive
options timestamp, otherwise one service HLC assignment. The accepted ordinary
timestamp rule is exactly that predicate, not trimming, coercion or a new HLC
syntax policy. Empty/non-string stamps are unassigned; an ordinary nonempty
string, including whitespace if currently accepted, remains bound. Durable
stamp validation is unchanged and occurs before effects.

The envelope owner may project unassigned ordinary timestamps as absence,
but cannot acquire a clock or independently choose the stamp. Keep assignedness
and fallback semantics aligned with the existing normalizer through its owner;
avoid two gradually diverging predicates. Strict whole-event capture still
rejects accessors, exotic records, sparse arrays, invalid payload data and
duplicate durable occurrence identities before any effect. Ignoring an ordinary
unassigned timestamp is not permission to ignore malformed event data.

Normalization must produce exactly one event for each validated input member
and preserve order, data and supported envelope metadata. The existing
normalizer's permissive filtering cannot become a way to shorten a durable
mixed command. Already assigned ordinary timestamps and every durable stamp
must survive forwarding unchanged. The new timestamp is assigned once for
that MG admission; a new public admission retains its existing ordinary
semantics. This is not a claim of one shared ordinary HLC across distinct
recipient-group admissions that each received an unassigned request.

The translation is not a generic digest setter. It consumes only the owner's
captured I and N identities, its exact entry/port/lifetime and remaining
budget. It must validate before changing anything and recheck currentness
before returning. No supplied `cdcVectorDigest`, forged response wrapper,
cache state, native proposal return or CDCAPPLIED notification may authorize
translation. A same-byte new service incarnation, elapsed waiter or rollback
does not become accepted because a digest matches.

The existing `buildLatencyCdcPropagationResult` preserves semantic fields by
spreading the actual result
(`message-group-service-runtime-support.js:348–352`); keep the digest and
all failure fields intact through that wrapper and the real transport. Local
canonical acceptance still requires no invented transport ACK. Remote
acceptance retains its existing processing-ACK requirement.

## Finite proof requirements

These are source/lab requirements, not results already obtained.

- Literal canonical positive/negative vectors for durable-only and mixed
  inputs, including only-ordinary vectors remaining unable to discharge
  durable debt; mutations must keep D's receipts unchanged while changing U,
  its assigned timestamp, order, omission, addition or duplication.
- Real direct RF1/RF3 and forwarded mixed commands: compare the actual retained
  native vector and position, committed application and afterCommit outcome
  with I/N. Both the incomplete-receipt and complete-vector defects must be
  discriminated in the same witness.
- Ordinary absent, undefined, null, empty and non-string timestamp fallback;
  valid options fallback; supplied primitive string preservation; no durable
  fallback. Counterpart tests must prove unsupported payloads/accessors are
  refused before normalization/proposal, without invoking coercion hooks.
- Exact N outcome translated once to I; wrong N, old shape, partial vector,
  wrong group, error/provisional contradiction, ACK-only and malformed fields
  cannot be repaired by translation. Preserve all other result metadata.
- Coverage composition controls in D2, including zero-target source success,
  mixed native/provisional coverage and an undispatched required target.
- Capacity is reserved before capture and normalization. Active duplicate N
  receives retaining backpressure. Raw native/transport work remains charged
  after response expiry, and late completion/rollback/replacement cannot
  settle an expired I caller. The independent R1/R6 repairs remain required.
- Actual source coverage/ACK consumer refuses mismatches. Provisional
  completion can release only the approved scan transition, never source
  CDC_DELIVERED or completion-only hooks. Existing bounded counts, deadlines
  and retry policy remain unchanged.

The response-shape change must be recorded as this explicit bounded correction
and connected to the `cdc-source-native-delivery` contract/pair and its
classified witnesses. Retained native commands, source debt and historical
inspection formats remain unchanged. Old transient canonical results without
the new required field are refused; no compatibility fallback is approved.

## Category-complete disposition

| Category | Design assessment / evidence |
| --- | --- |
| Admission / gating | The reserved MG slot precedes input capture/normalization (proposal 58–67); enforce one-to-one normalization and existing typed refusal. D1 fixes the required canonical field. |
| Recovery / replay | Proposal 39–42 and 69–73 add no durable authority. Assigned N survives retries; a fresh ordinary admission is not replay proof for a durable occurrence. |
| Owner interaction | One envelope/outcome identity owner plus the existing stamp producer is viable. D1 rejects a second hash syntax; D2 closes an omitted composition seam. |
| Harness fidelity | No runtime was executed. Builder vectors alone cannot prove native acceptance; the paired direct/forwarded native witnesses above are required. |
| Transport / delivery | Full-vector outcome validation closes the remote subset collision only if N is checked before translation and wrappers preserve both digest and contradictions (proposal 77–99). D2 prevents a later aggregate from discarding that distinction. |
| Concurrency / lifetime | I is metadata for the exact N waiter; no duplicate active waiter or deadline renewal is allowed. Existing raw-child custody repairs are not re-approved by this note. |
| Formation circularity | Canonical provisional results remain distinct from native receipts; D2 requires exact vector and complete required coverage before scan release. No activation authority appears. |
| Retry / redrive | The normalized N is fixed through one forwarding/retry admission (proposal 64–73); no fallback remint of D, new attempt loop or late-caller revival. |
| Timers / sweeps | Proposal 116–120 adds no timer or deadline extension. Existing deadline and cleanup owners remain authoritative. |
| Adversarial JS input | Existing canonical-data descriptor/array/digest primitives should be consumed. Required own fields, no accessor/coercion execution and the precise ordinary timestamp domain need explicit paired tests; D1 names the existing digest validator. |

This is a category-complete bounded design rejection for D1/D2 only, with the
normalization-owner mechanism accepted in principle. It is not source approval,
a passing runtime claim, a replacement for the other independent repairs, or
Quest/startup/merge acceptance.
