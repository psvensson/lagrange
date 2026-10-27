---
audience: development
documentClass: evidence
---

# Complete-vector outcome correction R2 for independent decision

Status: proposed R2, unimplemented, runtime unexecuted. Root author, 2026-10-23.
This supersedes the R1 proposal without changing that historical document.
R2 addresses the independent D1 digest-format and D2 aggregation-binding findings.
This answers R4 of independent root review
`b404fadb31060fad56944dbd4c05603f7fa8d0ecc70ff92193ef7a83d235ca7a`
under the unchanged interaction contract
`474182126c3c985feceadb9a1b72d7de9975e1b4c3280af52be884c6c095f383`.
The source/outcome owner must decide this response-shape correction before
implementation approval. No historical receipt or recovery authority is added.

## The counterexample and resulting behavior

Today the waiter binds a whole vector, while a returned receipt binds only its
durable members. Consequently `[D, ordinary-A]` can consume a reply for `[D]`
or `[D, ordinary-B]`. Both native and provisional composition must reject those
different requests. Valid mixed vectors remain supported and are never filtered.

Add one required top-level field, `cdcVectorDigest`, to canonical committed and
provisional outcomes. It is the existing `cdcCommitWaitIdentity` digest of the
complete semantic request vector, including its order and every ordinary member.
This reuses the existing identity owner and hash; it is not a second identity
scheme. Keep the existing durable per-occurrence receipts and their exact native
group/index/term unchanged. A valid native receipt and a matching full-vector
digest are both necessary. An ACK or digest alone proves nothing.

Both builders include this field. Both canonical validators consume the existing
`isSha256Digest` owner: the canonical form is `sha256:` followed by 64 lowercase
hex digits, equal to the entire expected request vector. The strict metadata
whitelists admit only this named addition. Missing, changed, duplicated,
appended, reordered or omitted ordinary members therefore change the required
digest even when every durable receipt remains identical. All existing error,
defer, group, count, transport and contradictory-field checks remain binding.
There is no compatibility fallback accepting the old incomplete canonical shape.

The field is transient response metadata. It does not enter CDC event data,
native commands, source debt, a receipt journal or a new durable store. Retained
native history and the read-only inspection checkpoint retain their existing
formats and authority limits.

## Aggregation preserves the same request identity

`observeCdcCoverage` retains the validated `cdcVectorDigest` alongside the native
receipt or provisional coverage tag. `completeCdcPropagation` requires every
covered source and target observation to carry the same digest as its complete
expected input vector before it builds any successful result. It preserves that
same digest in the result. It cannot rebind coverage for `[D, ordinary-A]` by
receiving `[D, ordinary-B]` as a later function argument, and cannot manufacture
a fresh matching digest from that later vector while reusing earlier receipts.

This applies equally to native and provisional coverage, including direct
composition, the topology continuation and the source subscriber continuation.
A covered metadata record lacking its original binding is invalid/UNCOVERED.
This stores one existing identity, no event bodies, second hash scheme, replay
ledger or persistent receipt. Before any final coverage consumption the source
also checks its current event binding, responsible subscriber identities and
owned topology observation. Complete-vector binding and lifetime currentness
are both required; neither substitutes for the other.

## Ordinary timestamp compatibility at the existing normalization owner

A durable event still requires and preserves its original nonempty timestamp.
The existing ordinary normalizer accepts an absent/empty/non-string timestamp,
uses an ordinary options timestamp when valid, otherwise assigns its service HLC.
That accepted ordinary input cannot be rejected merely because it accompanies D.

The envelope/semantic owner represents an unassigned ordinary timestamp as
absence when capturing the incoming request. A supplied nonempty string remains
part of that request binding. This is the existing ordinary fallback rule, not
permission to ignore or replace a durable timestamp. Ordinary event data and all
other supported metadata still receive the approved strict whole-vector capture;
unreadable members, unsupported data and duplicate durable identities refuse.

Within the already reserved MG capacity slot:

1. Capture the whole request and compute its request vector digest.
2. Pass ordinary members through the existing MG normalizer, requiring exactly
   one result for each already validated member. Preserve all other envelope
   fields and shared immutable data. Durable members bypass stamp generation.
3. Capture the resulting command vector and use its existing complete-vector
   identity for the exact native waiter/afterCommit match.
4. Carry this one normalized command unchanged through all forwarding/retries
   of this invocation. An existing ordinary timestamp is never renewed at a hop.

The ordinary normalizer remains the sole producer of missing ordinary stamps;
the envelope and transport owners do not acquire clocks or normalization policy.
A fresh public invocation may perform its existing ordinary stamp assignment;
that does not remint a durable source occurrence or revive an expired invocation.
The actual accepted normalized vector remains the duplicate-wait identity.

## Reply translation belongs only to that normalization owner

Native afterCommit first produces a canonical outcome for the actual normalized
command. A forwarded result must likewise validate against the complete
normalized vector before it can be consumed. Provisional completion requires
the same full normalized-vector correspondence after its actual owned ingress.

Only after this validation may the original MG admission owner return the same
outcome with `cdcVectorDigest` translated to its captured incoming request digest.
It owns the exact input-to-command correspondence and retains only that extra
digest as metadata; no original event-body copy or second registry is needed.
The durable per-occurrence receipts and every other reply field are preserved.
Unknown/contradictory/partial outcomes are never translated into success.

This translation lets a caller validate a legitimate raw mixed request whose
ordinary timestamp was not yet assigned. It also avoids returning event bodies
or timestamp-reconstruction lists in every receipt. A receiver that normalizes
a missing ordinary stamp owns the same finite translation. A sender that has
already normalized its vector sends assigned stamps, so later hops preserve the
same digest. The command's actual native afterCommit remains indispensable.

No translation is allowed by a generic wrapper, transport normalizer, cache
lookup, diagnostic reader or caller-provided digest. The reply can change only
at the MG normalization owner after checking its exact accepted command vector
and current waiter/lifetime. Expired replies remain UNKNOWN and keep source debt.

## Required independent proof and unchanged gates

- Pure canonical positives for durable-only and mixed vectors; negatives that
  omit, append, reorder or change only an ordinary member; independent literal
  missing/wrong digest negatives for both native and provisional forms.
- Direct native and forwarded mixed positives, comparing actual retained native
  command members/order/stamps with the initial request and the unchanged durable
  occurrence. Missing ordinary stamps use the existing normalizer exactly once
  per admission; supplied ordinary and all durable stamps survive forwarding.
- A changed or partial remote vector cannot satisfy source coverage or source
  ACK. An unknown, malformed or contradictory native reply cannot be repaired
  by the normalization translation.
- Coverage aggregation negatives reuse valid native and provisional observations
  for `[D, ordinary-A]` with `[D, ordinary-B]`, reordered, appended or omitted
  ordinary members; every case refuses successful propagation and source ACK.
  Matching mixed-vector coverage still composes.
- Capacity reservation precedes capture/normalization, raw native cleanup stays
  charged, and expired/currentness-replaced admissions cannot translate a late
  afterCommit into old-caller success.

This design adds no input-size/event-count/fanout cap, retry, deadline extension,
background redrive, persistent receipt or recovery architecture. Independent
design decision, source review, measured positive/negative witnesses and full
interaction proof remain required. Protected activation, durable transfer,
classification authorization, composed two-start acceptance and merge remain open.
