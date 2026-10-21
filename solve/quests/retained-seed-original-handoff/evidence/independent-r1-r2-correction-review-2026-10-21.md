---
audience: development
documentClass: current
---

# Independent R1/R2 correction review

Date: 2026-10-21. Reviewer: `subagent:/root/control_source_review`.

Verdict: **APPROVE the bounded contract for implementation**, incorporating
[the frozen correction](pre-source-r1-r2-correction-2026-10-21.md) into the full
previously reviewed correspondence. R1 and R2 are resolved at the design level.
This is not approval of production bytes, an implemented classifier, a future
witness, a native result, a receipt, Quest completion, serving or publication.
The previous [complete review](independent-complete-pre-source-review-2026-10-21.md)
and its REVISE decision remain preserved. This additive record supersedes only
those two design findings for the corrected composition. No further design
rejection is identified in the affected interactions examined here.

## Exact inputs and verification

Product: `393f411ca09449898465cc3cb7320c03fba2aba8`.
Evidence input HEAD: `e69db481f37ab5633d64de7b6e7345426d9286b3`.

- Correction SHA256:
  `d6da7d1647d1e726b1128603f058aeb0a8a7dcda3d727d30b3324bc88a8570e2`.
- Input manifest `pre-source-r1-r2-inputs-2026-10-21.json` SHA256:
  `505e52bdeaedc0bf15ad8892a6b855ba2970eaf552b80a5b0a09d9488ead1865`.
- Previous complete review SHA256:
  `46b10ad0b5d1c522f693550befe7fb1d2c7803851ca67f3e7f15e7d2d423d9b5`.
- Physical source note `native-callback-cut-input-2026-10-21.md` SHA256:
  `826e1bb1af104ea4ec5e3c07f99b59f232b1054a674e11de68b5c702767873d3`.

Independently checked every one of the manifest's 30 source files and six
supporting files for exact byte length and SHA256. Each source also matches
its declared Git blob and product393 bytes. There were zero mismatches.
The two original package manifests remain bound as supporting inputs; their
full verification is preserved in the previous review. This round read the
correction and affected source, not a replacement broad research exercise.
No repository test, native run, production edit or receipt change was made.

## R1 disposition: one existing operation through exact handoff

Correction lines29-65 define the actual order: one existing replica mutation
lane; resolve exact source/foundation; synchronously acquire the current
runtime lifecycle claim and handler effect section; perform exact ACTIVE CAS
and uncertain-answer readback; publish only the reserved foundation's leader;
then authorize the member's durable TRANSFERRED fact inside that span.

The source gap is real: current
`src/node/replica-state-machine-registered-activation.js:281-315` ends the effect
section/lane before the separate leader publication in
`src/partition/partition-service-row-owner.js:352-365`. The current publication
predicate at `:259-277` is insufficient for the new extent. The correction
requires the existing row owner to bind partition/table identity, original
created_at, partition version/state and observed update version. This protects
the original foundation without creating a second registration or routing owner.

The proposed participation claim corresponds to the actual active-count
protocol in `src/raft/raft-rs-replica-lifecycle-owner.js:240-296`: execute retains
an asynchronous claim; retirement closes new admission and waits for existing
claims before durable retirement. It is not a mutex. It does not freeze native
terms, prevent committed application, or cancel already accepted SQL. Those
facts still require current admission/tenure checks and exact result handling.
The proposed wrapper must resolve the exact captured runtime internally and
must not expose an owner/core or look up a successor by logical name.

The handler effect section is an existing narrow join
(`src/node/replica-state-machine-serialization.js:129-183,256-264`). Extending
its original invocation through the named handoff effects is coherent. Factoring
the in-lane implementation, rather than invoking the lane-acquiring wrapper
from inside itself, avoids the identified self-deadlock. Ordinary activation
retains its original wrapper. A shutdown join covers the active effect only,
not unrelated queued lifecycle work.

Correction lines75-92 explicitly fixes the ordering that current partition
shutdown lacks (`src/partition/partition-service-lifecycle-methods.js:184-211`):
revoke original admission synchronously, join the active section before closing
its consensus/dependencies, then use actual physical cleanup. Revocation can
make further readback unavailable; it cannot turn uncertainty into absence or
release a submitted birth. Accepted effects, pending rights and failed exact
resources retain their obligations. Joining a bounded response settlement is
not evidence that native work was cancelled.

The tenure wording is read with the earlier route contract's current-role,
term and endpoint checks. `src/raft/replica-leadership-state.js:29-46` mints a
frozen token containing term, possibly null; the token does not itself contain
a role field. Thus a token alone is insufficient: current leader role, available
valid native term and unchanged token must all hold at the named checks. A term
change during an accepted effect may leave an uncertain original-generation
publication; it cannot authorize TRANSFERRED or successor publication.

Required future evidence remains the correction's actual ACTIVE/publication
hold, retirement/shutdown, replacement/term/foundation change, lost-answer
readback and ordinary-wrapper controls (lines94-99). These must exercise the
real join and physical ordering, not merely check a final boolean.

## R2 disposition: actual callback sinks and permitted replay

The correction begins at the earliest actual mutation producers, not at the
later activation callback: shared leadership application immediately queues
role and leader updates (`src/raft/replica-leadership-state.js:62-79,94-102`).
Both MG and partition helper submission/retry boundaries consume the original
mode. Native role/tenure events, committed application and participant recovery
continue. The existing original row/activation owners perform the permitted
exact publication; ordinary helpers cannot acquire a competing effect in this
extent. This is a finite owner interaction, not a second lifecycle controller.

Rebalancer absence is supported by its actual required coordinator dependency,
but absence alone would not exclude an installed instance or secondary sink.
Correction lines123-130 explicitly covers construction, rebind and sink entry,
including unexpected injected owners. It neither relies on cache emptiness nor
calls ControlPlaneSetup to satisfy a circular readiness requirement.

Real MG CDC replay can repopulate TABLES before a later callback
(`src/message-group/message-group-service-raft-timing.js:35-80`). The correction
therefore covers delayed split/merge resumers, source start and retiring-source
ACK sinks, including post-await and after-revocation entry (lines181-193).
Contrary work is retained as a typed existing-owner obligation and blocks final
handoff; zero allocated workers or swallowed log errors cannot stand in for
that outcome. Ordinary recovery outside the original extent remains unchanged.

There is no additional committed-equals-applied admission condition.
ESTABLISHED opening history is not progress equality
(`src/raft/raft-rs-replica-lifecycle-owner.js:194-230`). The existing DDL-free
`readDurableRecordIn` returns exact durable records, including all ordered log
entries (`src/raft/raft-rs-durable-store.js:207-247,586-587`). That provides a
finite inspection input without formatting or constructing a native node.
Applied, committed-pending and uncommitted ranges remain distinct; malformed,
missing or contradictory native records retain the existing owner's refusal.
No truncation or second log replay is approved.

The existing proposal codec is strict UTF-8/JSON decoding, not a semantic allow
list (`src/raft/raft-rs-proposal-codec.js:53-59`). Correction lines149-179 properly
requires additional existing-command/producer correspondence: exact original
ENABLE, membership/no-op, SQL statement/parameters/identity/right and MG CDC
row effects. Recognized command type or syntactically valid JSON alone is not
permission. Valid pending original work is replayed by the existing application
transaction owner (`src/raft/raft-rs-application-transaction-owner.js:36-94`),
with its original atomicity and post-commit duties. It is not executed by the
inspector or excluded because it is inconvenient to classify. Unknown or
contrary commands remain named HOLD with their bytes and obligations retained.

Likewise, an expected not-yet-created original foundation row is different
from an unavailable required observation. The complete package already owns
its canonical absence/one-submit prefix interaction. The correction's
missing-observation wording does not add a requirement that all intended prefix
rows exist before original admission. Implemented correspondence must preserve
that distinction and the positive complete-intact/all-UNUSED extent.

Future controls at lines201-206 must include actual pending legitimate original
replay, contrary durable/pending work before entry, MG-replayed transition input
and delayed callbacks after closure, plus ordinary-mode continuation. Merely
refusing every pending tail would fail the approved positive and literal seal.

## Affected checklist correspondence

The full nine-category checklist remains in the previous review. This round
checks each affected category; unaffected numbered items retain that review's
disposition and all declared future evidence requirements.

1. **Admission/gating:** R1 binds source, native/handler claim, publication and
   transfer to the same current operation. R2 binds actual helper/start/ACK sinks.
   No new deadline or public opening is added. Changed/unknown facts retain the
   earlier typed HOLD and primary-plus-cleanup result paths; no public retry
   capability is invented. Diagnostic identity remains the actual examined member.
2. **Retry/re-drive:** ordinary helper submissions are excluded in the original
   extent, while native/participant continuation remains operational. Bounded
   lost-answer readback cannot remint a spent INSERT. Shutdown/uncertain readback
   retains debt. Outside-extent timers and fresh late reassertion retain their
   existing owner. A registered retry that never executes is not proof of progress.
3. **Transport:** no changed ACK interpretation, wire privilege or alternate
   SELECT is proposed. The previously reviewed captured local route remains
   mandatory for exact readback. Late results are checked against current
   operation/member/tenure; revoked contexts cannot certify transfer.
4. **Sweep/timer:** synchronous revocation and sink checks cover callbacks queued
   before closure. Native role and determinism self-check remain real; no blanket
   callback disable or expiry-based cancellation of facts. Existing request
   budgets and retry cadence remain literal.
5. **Recovery/replay:** complete all-UNUSED cold admission is preserved, including
   legitimate pending original commands. Cold SUBMITTED/TRANSFERRED restrictions,
   no grant backfill, exact immutable births and no cross-DB atomicity assumption
   remain. Empty cache/applied prefix alone is insufficient negative evidence.
6. **Concurrency:** one lane, one exact-runtime participation claim and the
   existing handler effect section cover the complete R1 operation. The native
   count is not a mutex. No nested lane call, successor-name targeting or joining
   unrelated queued work is allowed. Post-await checks plus foundation CAS protect
   accepted effects; abort preserves uncertainty and resource custody.
7. **Formation circularity:** original row/leader publication and private genuine
   local reads remain the explicit dependency cut. Ordinary publishers,
   coordinator/sinks and transition resumers cannot become prerequisites or
   hidden writers. Catalog accounting now names 46 partitions/138 partition
   replicas plus three MG replicas, 142 one-submit rights and the original
   foundation. This is finite logical work accounting, not a measured 30-second
   performance guarantee or a transport-attempt bound.
8. **Harness fidelity (all six items retained):** preserve the actual public c6
   RED, use real native/owner entry, retain issued 30000ms and handler-only fault
   distinction, derive identities from actual producers, require nonzero pending
   replay/effect/retirement engagement, and bind later frozen tests/results to
   exact source/host/retry0 with known output-elision limits. Proposed controls
   are not yet executable-witness approval or measured semantic kills.
9. **Owner interaction (all ten items retained):** semantic owners remain the
   existing allocation/lifecycle/row/native/route/cleanup owners; the operation
   narrows their typed interaction rather than copying authority. Paired safe
   refusal and permitted continuation, fresh re-entry without cached veto,
   unchanged backpressure and owned wakes, projection limits, frozen separate
   negatives, caller/sink census and impact metadata remain required. The new
   R1/R2 operations and sink consumers must be in that same Quest's actual source
   and proof mapping before implementation acceptance.

Adversarial-input applicability remains unchanged: exact index arithmetic,
malformed/corrupt records, exact command/row identity, genuine provenance and
bounded cohort inputs apply. This review does not add arbitrary trusted-host JS
or intrinsic replacement as a new threat, and does not weaken existing guards.

## Implementation and acceptance boundary

The corrected contract is sufficiently explicit to begin its bounded source and
witness implementation. That permission does not waive independent review of the
actual owner API, precise CAS predicate, claim release on all exits, callback
consumer census, canonical command classifier or ordinary-mode regressions.
If implementation cannot classify a legitimate original command, it must resolve
that finite existing-owner correspondence, not silently strengthen admission.
The sealed ACTIVE requirement, complete original extent, v2 fences, same public
entry, original budgets and typed nonserving cleanup result remain unchanged.

No current receipt is proved by this design approval. Full frozen source review,
actual native positive and targeted negatives, owner regressions, applicable
gates, landing and publication remain separate work.
