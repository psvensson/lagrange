---
audience: development
documentClass: current
---

# Recipient invocation and write-submission fencing

## Verdict and exact scope

Local implementation against PR #114's runtime at
`d3d947f2d98ca9ea03f1cae91403ff551ee4d18d`.

**Invocation/submission prerequisites: implemented and tested diagnostically.
Strict commit-authority gate: FAIL. Recurring driver/current CREATE activation:
NOT IMPLEMENTED. Publication: NOT PERFORMED in this session.**

This is an author implementation and self-review, not independent approval.
The correction does not reinterpret the sealed authority contract, refresh a
membership permit, authorize a successor action, release membership debt, or
merge anything to main. The required failing tests are retained as failures.

## Existing-owner changes

1. The message-group handler passes the identity of the callback and router
   actually invoked, as a host-only third argument. The recipient no longer
   reads a successor registration and attributes it to a retired callback.
2. Handler retirement uses the existing exact-identity unregister operation.
   Retiring an old handler cannot erase a successor at the same address;
   an old router cannot clear a replacement registration.
3. The workflow uses its normalized dispatch timeout and existing retained
   operation lane. It snapshots the encoded request and selected recipient
   before waiting, rejecting accessors/proxies through the existing utility.
4. The workflow epoch and shutdown predicate continue beyond transport
   completion into the repository observation and pre-submission boundary.
5. Both existing mutation retry forms reuse one local admission helper. A
   synchronous true check invokes the gateway without an intervening await;
   asynchronous admission retains its previous meaning. The callback does not
   become a query option or a network authority claim.
6. An invalidated invocation cannot begin a new submission or re-arm a later
   attempt. After any submission has begun, invalidation remains UNKNOWN:
   the system cannot honestly claim that a command already at another owner
   did not commit.

These address the schedules described by PR #114 review comments 4232724094,
4232724164, 4232724212, and the pre-submission portion of 4232724252. Review
threads were not resolved remotely. The stronger after-submission authority
requirement is not covered by those corrections.

The six changed production modules remain subordinate to the existing handler,
workflow, repository and mutation-gateway owners. There is no new store,
coordinator, durable authority field, public wire field, retry timer or queue.
The existing impact contract now includes the actual repository authorization
and gateway participants; its import-graph seal still needs the normal producer.

## Tests and exact failure attribution

The existing recipient file retains its original eight leaf cases plus parent,
and adds twelve leaf cases under two parents. All **23 Node test entries** pass
on the final source. Counts include parent entries; they are not individual
assert() calls.

The new schedules exercise retired callbacks queued by actual router dispatch,
exact retirement, configured timeout, owner shutdown/epoch turnover while the
post-delivery boot read is held, retry backoff, retained-lane entry, immutable
inputs while queued, lost authority after submission, and synchronous versus
asynchronous admission semantics.

The initial eight new boundary cases fail on the original runtime: the retained
run reports 9 passed and 9 failed (eight failing leaves and their parent), with
no cancellations, skips or todos. This is separate from the initial diagnostic
adapter's prototype mismatch, which is preserved but is not credited as a
source-failure proof.

Eight isolated mutations are each detected at an exact named test and actual
ERR_ASSERTION message: callback identity, exact unregister, configured timeout,
recorder invocation predicate, per-attempt admission, UNKNOWN after submission,
retained lane, and queued input snapshot. Source is restored after each run.
The restored complete 23-entry file passes. The checker requires the same test
selection, complete summaries, and zero cancellations/skips/todos. An unrelated
error or a test title printed by a passing test cannot earn mutation credit.

The final stable source also passes the native/recording file (54 entries), the
actual SIGKILL fixture file (4 entries), and the ordinary handler file (7 tests
and one suite). The resulting **88 passing Node test entries across four files**
are diagnostic results, not the earlier canonical 313-entry measurement.

## The commit-authority gate is still red

`diagnostic/commit-authority-required.mjs` asks the existing owners to record a
real native learner action, then holds the actual operation-SQL submission.
The native action is genuinely applied before the interruption is introduced.

| Required schedule | Final result |
|---|---|
| Lease expires before the held gateway write executes; operation row otherwise unchanged | FAIL: learner phase advances |
| Canonical boot changes before the held gateway write executes; operation row otherwise unchanged | FAIL: learner phase advances |
| Successor claim changes the authoritative row before old write executes | PASS: old write loses; successor records without reproposal |
| Live unopposed holder records actual native result | PASS |

Both failed cases fail this exact assertion:

`commit-authority gate: revoked authority must not advance the operation row`

Their caller result is UNKNOWN; that correctly preserves uncertainty but does
not reverse the actual write. The action being recorded is real, not forged.
No new membership proposal or physical CREATE is performed by the schedule.

This gate reports **2 pass / 2 fail**, exit 1, with zero cancellations/skips.
It is NOT relabeled as an expected negative and NOT omitted from the canonical
script. An earlier test setup mistake used an incorrect string for PROPOSED;
that first attempt is retained separately and is not the engaged gate result.

## Why the correction stops here

The replica-operations row fences competing row changes. Time expiry and the
canonical nodes row are different inputs. A callback before remote submission
cannot make them atomic with a later replicated write. Nor may replicated SQL
application read each replica's wall clock or an eventually updated cache and
still claim deterministic application of one committed command.

The next authority increment must explicitly define and implement the ordering
between historical recording, durable revocation and takeover at the existing
writer/authority boundary. Under the present strict rule, both failing schedules
must become nonmutating refusals while the live and successor controls remain
positive. Then extend that proof through the real replicated gateway, not only
the local fixture.

A narrower generation-fenced historical-fact contract could instead allow a
late, exact receipt while forbidding every later side effect without new
current authority. That is a possible contract decision, NOT the implemented
rule and NOT permission to delete the two failing tests. It requires an explicit
ruling and complete consumer proof. This package does not adopt it.

The recurring driver remains disconnected. Its next integration must enter
through the existing operation owner, discover/reconstruct the durable action,
call the registered recipient and recorder, and cross current CREATE's own
native descriptor, generation and sole-worker checks. Do not call the public
retained-lane facade recursively while already holding its identical lane;
use the existing owner-internal execution discipline for that future caller.
No new independent reconciliation loop is justified by this patch.

Missing evidence, holder expiry, or a disconnected socket does not prove that a
predecessor never committed. Ordered successor issuance requires definitive
fencing AND noncommitment. J1 forward recovery after promotion authorization
remains unchanged.

## Execution substrate and failed validations

The final local runs use Node v22.16.0 and the explicitly supplied diagnostic
loader. It substitutes real node:sqlite for better-sqlite3, returns ordinary row
objects to match the driver's interface, supplies the fixed fixture config only
after independent schema validation, and adapts logging/uuid/in-process ws setup.
The native Raft implementation, router, repository SQL and tested code are real.
These are not normal locked-dependency, physical-network or power-loss results.

Normal installation failed with npm ENOTCACHED for zod-4.3.6, along with a locked
package Node-version warning. Normal classified execution stops on missing
`tap-parser`. ESLint is absent and import-graph refresh lacks dependency-cruiser.
A broader diagnostic neighbor run also failed on unsupported adapter methods,
missing tap and alternate configurations rejected by the deliberately narrow
config adapter. It is preserved as 114 pass / 52 fail, not attributed wholesale
to the source correction and not reported green.

Syntax checks and the scoped file-size ratchet passed. The file-size output
still names one inherited oversized source file; it is not a universal size or
full-static approval. Existing primary/resource/subsystem classifications pass
all three actual checks (2,326 files), since this extends an existing selected
file. The updated impact registry also passes its actual checker (58 contracts
and 29 coupled pairs). No generated import-graph seal was fabricated or baseline raised.

Probe invocations of both diagnostic runners refuse before mutation/output
creation and leave source unchanged. Worker groups and stdout/stderr are owned
by the retained existing process helper; timeout does not count as proof.

## Provenance and preservation

The workspace was reconstructed from the retained PR111 source archive and the
recording, process-loss and recipient patches. Its local Git HEAD is a synthetic
reconstruction identifier, not an upstream commit. Every changed production
preimage, the changed existing test and the impact-contract preimage were matched
to their live GitHub blob IDs at the exact PR114 head. The patch is against those
bytes; it does not replay the previously attached recipient package.

No remote write, Actions dispatch, merge, or release operation succeeded in
this session. The current connector exposes read actions; the ordinary Git
remote attempt fails DNS. This is a limitation of this execution, not a claim
that the project's established push/Actions route does not exist.

The package contains an apply-checked patch, before/after files, reproduction
scripts, raw evidence and a verified SHA256 manifest. Normal verification is
`diagnostic/verify-canonical.sh <isolated-patched-checkout> <new-absolute-output>`.
It uses normal dependencies and the existing runner, retains nonzero outcomes,
and neither pushes nor provisions infrastructure. The strict authority gate is
expected to remain red on this exact patch; that is an unresolved requirement,
not a passing expected-failure test.

Original full-lab FAIL, timing debt, independent review, complete change-impact
and static proof, physical replacement/restart/off-seed acceptance and final
main/A1-v13 compatibility remain open.
