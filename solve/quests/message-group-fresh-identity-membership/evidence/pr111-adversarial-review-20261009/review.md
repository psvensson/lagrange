# PR111: adversarial review of the review request and implementation

Reviewed head: `f5a06f643a8f389ea545e5673758cca249674fa9`.
Measured implementation: `6255634c71fa6c6c116e8e70252ef11f927f564f`.
Request: comment 6079283488. Returned independent review: 5469017424.
Date: 2026-10-09.

This is requested author self-review, NOT independent approval. Production source,
ordinary tests, sealed acceptance and completion receipts were not changed. No Actions,
GCP, physical lab run or implementation-branch movement was performed by this review.

## Verdict

**Request targeted changes; preserve the architecture and the useful measured results.**
The request correctly separates historical outcome from CREATE eligibility and successor
execution permission. It identifies exact source/evidence heads and expressly admits the
missing origin-bearing installation/reopen proof. Keep these distinctions.

One input-normalization defect reproduces. A separate internally impossible live origin
is returned as committed although the checkpoint predicate rejects that same origin.
The latter is a corruption-boundary result with supplied native status, not a claim that
normal committed application generates such a row. Missing regressions are not by
themselves additional demonstrated runtime defects.

## Basis, integrity and proof ceiling

Read current PR metadata/request, all returned review comments, the twelve changed
production files, related native/operation-port/application and checkpoint callers,
contract, integration tests and retained mutation output.

Reconstructed source from the exact ca1cb138 archive and the retained delivery/origin
patches. All twelve origin-change production blobs match the patch. The context codec,
committed read and checkpoint-format blobs also match current GitHub file reads.

The source archive hashes to
`249e90f438c71b4344fc383105e4bb085de503b48785fb00521137d7a190f093`;
its embedded tar matches
`93e87414ef59fd34c2e76ac133ce3e851699ec3d5f51c8d5252321908a2cebaa`.
All 163 delivery-archive members and all 145 PR111 origin-archive members were rehashed.
The latter archive hash is
`ff384eda35b9902c4363f7192b7459bc4538116e5bff6e9c527de56b7a8c599c`.
This is archive verification, not a rerun of the seven-file/263-reported-assertion suite.

The new local diagnostic completed thirteen observations on Node v22.16.0, using the
actual codec, read normalizer/answer shaper, permanent registry, checkpoint validator
and disk checkpoint reader. Registry controls use actual SQLite WAL/FULL through the
disclosed node:sqlite diagnostic adapter. Native status is supplied, not read from a
running native port. No production queue/core, physical crash/install or distributed
SQL/CDC proof follows. A loader-only reversion of checkpoint-format completed separately;
no checkout source bytes were changed. All twelve source hashes were checked afterward.

Full raw review archive attached in the conversation:
`pr111-adversarial-review-20261009.zip`, SHA256
`941ddcfa7ea211ad8f11c67586d03a4f4ff7b94e5aaa44d353c32f3ac7fe296c`.
All 17 named review-manifest entries were checked. The archive contains the executable
probe, disclosed adapter/loader, both completed outputs, source hashes, fuller written
review and both failed diagnostic-apparatus attempts. This note does not claim that ZIP
was uploaded to the canonical GitHub release store.

## A. Confirmed input-snapshot defect

Independent comment 4229278838 is correct. canonicalLearnerContext first invokes the
existing encoder, which rereads action properties during validation/serialization, and
then reads stage again. Freezing the JSON clone afterward does not repair those reads.

An own enumerable stage getter returns, over five reads:
`add-learner, add-learner, add-learner, promote, add-learner`.
normalizeCommittedLearnerRead accepts the resulting frozen query with stage `promote`.
The ordinary plain-data ADD control succeeds normally.

This violates the new snapshot/validate requirement. It is a JavaScript-boundary
counterexample, NOT a reproduced wire exploit or unauthorized proposal: ordinary parsed
JSON cannot carry the accessor, and the probe performs no native write.

Fix in the existing context/input owner: snapshot an exact own-data record once, refuse
accessors/proxies/incompatible shapes, and validate/encode only captured values. Reuse
existing exact-data boundary discipline rather than introducing an authorization layer.
Add the negative to the actual semantic-read test, plus a normal positive and source-
revert assertion. Do not alter historical-term recovery to fix input snapshotting.

## B. New live-origin coherence finding

learnerOriginRefusal checks group/action identity and the origin index against applied,
commit and membership-generation progress. It does not bound origin.term against the
observed native term. The checkpoint context predicate already has an applied-term bound.

The probe stores a canonical exact-action origin at index `2`, term `999`, in a real
registry DB. Supplied native status is applied=2, commit=2, generation=2, term=1.
The actual live answer is `committed-action`, carrying term `999`. The existing checkpoint
predicate rejects that same origin at applied index 2 / term 1. A normal term-1 row passes.

This is deliberate local-row corruption with supplied native status, not evidence that
the production application transaction creates impossible origins or a driver consumed
one. Resolve it before using the historical response as repository transition proof.
At the existing coherent native read boundary, reject an origin term beyond the observed
authoritative bound; at minimum a term greater than the current native term is impossible.
Do NOT require equality: earlier terms remain valid history after leader advancement.
Keep index/group/action checks and typed refusals. A scalar bound is not authentication
of arbitrary malicious DB rewrites.

## C. Disposition of the other returned findings

**4229278903, malformed live origin:** the direct registry/read-shaper control returns
`refused-action` / `learner-action-corrupt-origin` for malformed non-null bytes without
throwing. This bounded path works. The requested permanent queued-read regression is
still needed and should also include B's syntactically valid impossible origin.

**4229278953, replay/conflict:** the actual registry on file-backed SQLite performs no
SQL update for identical replay (total_changes stays 2). A different encoded origin
throws and the prior bytes remain. Recording outside a transaction is refused, and a
reservation without origin remains unresolved. Keep this implementation; add permanent
normal-driver/application replay and rollback coverage rather than inventing a fix for
an unobserved defect. These direct controls do not replace process-loss proof.

**4229278994, target install/reopen:** correctly identified and accurately disclosed.
The new tests create/validate a real scrubbed origin-bearing payload. Neighbor transfer
tests do not contain that actual native-origin history. Their separate green results do
not compose into successful target installation and native reconstruction.

Required witness: real ADD application -> actual origin-bearing scrubbed checkpoint ->
fresh target admission/install -> native reopen -> exact original historical read.
Check group/action/index/term, absence of sender log, and wrong/missing origin refusal.
Also preserve historical ADD after REMOVE without granting obsolete current CREATE.

## D. Suspected null-checkpoint bypass was ruled out at the disk boundary

The new reservation-shape predicate reads reservation.learnerAdmission before checking
that the item is a record. Direct peerReservations=[null] throws TypeError; reverting
only checkpoint-format restores typed corrupt-descriptor for that direct call.

However, the canonical writer rejects null, and the real on-disk reader rejects
intentionally written null bytes as corrupt-descriptor / descriptor_bytes BEFORE that
predicate. Both disk controls refuse. This is not a demonstrated on-disk recovery bypass.
A small shape-first robustness correction is reasonable, but lower priority than A/B.

The initial review diagnostic stopped at the writer's correct null refusal. A second
attempt stopped on my wrong expected refusal string; the corrected diagnostic imports
the actual constant. Both apparatus failures are preserved, not counted as product
failures or completed runs. The final thirteen-observation and loader-reversion runs pass.

## E. Review-request wording and proof discipline

Keep exact current and measured heads, historical-vs-current permission distinctions,
normal-driver/physical proof ceilings, independent approval gates and one retained origin
per fresh identity in the existing application/registry ownership.

Change snapshot/validate from an asserted achievement to an open requirement until A
is fixed. Expand corrupt-origin coverage beyond JSON syntax to B's coherence control.
Removing origin recording proves it is necessary; the rollback test, not that mutation
alone, supports transactional coupling. Do not cite native-only results as proof of
commit-before-operation-receipt or ordinary-terminal repository recovery.

Respond to the four independent findings with actual evidence and add B with its limits.
Do not override the independent reviewer or turn the request into an unlimited native-
Raft audit. GitHub mergeable, a preservation push and a bounded passing measurement do
not supply complete change-impact, physical baseline or cutover proof.

## Recommended next work

1. One finite corrective increment: exact data snapshotting, existing-owner live term
   bound, and permanent queued malformed/impossible-origin plus registry replay/conflict
   controls. Optional shape-first null robustness. Normal dependencies, applicable static
   producers, source-revert/mutations; preserve old-term historical positives.
2. Complete actual origin-bearing target install/reopen as one owner-path witness,
   not separate source/target test results assembled afterward.
3. Connect exact recovered native evidence to the existing operation repository's
   conditional learner stamp/phase update. Interrupt after membership commits but before
   operation recording, then reopen/recover without reproposal. Preserve current holder
   checks and terminal membership debt; reject wrong receipts and resolve lost writes.
4. Only then continue the registered driver/current CREATE and explicitly ordered
   successor-attempt path. Missing origin stays unresolved, and J1 forward recovery after
   promotion authorization is unchanged.

The complete change-impact/static checks, timing debt, original full-lab FAIL, physical
two-replacement/restart/seed-loss proof and exact-main/A1-v13 gates remain separate final
requirements. No new epic, receipt ledger or authority is recommended. No source fix,
Solver landing, approval or main merge was performed by this review.
