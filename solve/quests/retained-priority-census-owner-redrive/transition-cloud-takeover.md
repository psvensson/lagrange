# Census continuation and authoritative read closure

Status: revised design independently approved for implementation by
`/root/takeover_checkpoint` on 2026-11-12. Approval is for the contract and
discriminators, not source acceptance. Preserved census source remains WIP.

## Evidence and history

Candidate `da530fe5` repairs retained ABSENT census continuation and the direct
publications owner's success/rows validation. It still inherits three alternate
read paths in `membership-publication-coordinator-reads.js`: a cache publication
list before the owner list, cache rows after a missing/unavailable authoritative
view, and silent empty rows after neither source answered. A successful view
answer with non-array rows is also normalized to empty. These are source-derived
findings. Fresh physical-lab job #2671 on exact `da530fe5` passed six files and
1,016 assertions; baseline #2672 passed six files and 1,004 assertions. The
baseline does not contain the candidate's negative cases. Both completed with
all execution, container and thermal scopes closed; neither result certifies
the newly found authority substitutions below.

Historical `a6dff7f2f` introduced NOT_DERIVED and its periodic continuation but
excluded retained ABSENT. `0d9d6a9a2` removed a swallowed rediscovery exception.
The same distinction between an answered absence and unavailable evidence must
hold throughout this async reader. The existing global fallback Quest's
post-landing review already records that its classification checker did not
establish semantic removal; its historical green cannot approve these branches.

## One proposed read and recovery contract

The async `MembershipPublicationCoordinatorReads.readTableRows` consumes either
explicit caller-supplied planning rows or an explicit successful authoritative
owner observation. The existing synchronous projection readers remain named
projection surfaces; their existence cannot rescue a failed async read.

1. Retain the declared preloaded-row input used by the existing admitted handoff
   and planning entry paths. This is supplied intent/evidence, not a second
   source attempted after a read fails. No arbitrary empty value is accepted as
   an answered observation.
2. For publications, use `ControlPlanePublicationsOwner.listPublications` when
   that canonical owner is present. Validate `success` and array-valued `rows`.
   Do not call `listPublicationsFromCache` or retry another source on refusal.
3. For other tables, use the existing `AuthoritativeControlPlaneView.readRows`.
   An absent/unavailable capability, throw, failed answer, or malformed rows
   produces the existing typed `AUTHORITATIVE_ROW_SOURCE_UNAVAILABLE`. A real
   successful empty array remains answered absence. Do not merge, substitute
   cache rows, or fabricate an empty answer.
4. Keep one table-read result validator and the existing error owner. Delete
   the now-unused cache-first/merge imports and branches from this reader.
5. Planning delivery choices belong to the existing read-authority builder in
   `membership-publication-planning-evidence.js`. A named owner-local request
   remains owner-local; a request requiring remote owner authority uses the
   existing OWNER_RPC_REQUIRED mode. Remove this caller's SQL/replica fallback
   selection rather than hide it behind the stricter result validator.
6. The normal driver catches the typed refusal, leaves the committed publication
   and serve decision unchanged, and re-enters the same queue after availability
   returns. There is no new timer, retry budget, ledger, or forced readiness.
7. The only durable effect remains the publications owner's existing guarded
   revision update after current-row census derivation. Repeated ticks coalesce
   through the existing owner queue and become idle after DERIVED.
8. Validate `success` and array-valued `rows` in the real
   `AuthoritativeControlPlaneView` before freezing or normalizing the supplier's
   answer. A malformed successful result cannot acquire complete-empty authority
   at this producer boundary. Failure carries no successful row-set witness.
9. `getAcknowledgementCandidateForNode` consumes the same required owner read,
   preserving explicit admitted preload input. Remove the caught-null helper,
   cached candidate substitution and obsolete refresh decision. Unavailability
   is typed refusal; a successful empty list is absence. The existing error
   producer marks its typed unavailability `deferRetry: true` while preserving
   the original cause, so the existing dispatch acknowledgement continuation
   can retain debt without depending on the supplier's message text.

This changes the shared async reader rather than adding a census-only exception.
Success-intended caller fixtures must supply the canonical owner/view contract;
unavailable fixtures must assert refusal. Cache projection APIs elsewhere and
broader gateway-mode retirement remain separate inventoried owner work, with no
repository-wide cleanup claim from this bounded repair.

## Review and proof

Approved source scope: coordinator reads, its existing planning read-authority
builder, the real view's supplier-answer validation, obsolete acknowledgement
helpers/contracts and direct callers whose explicit read intent needs migration.
The original census helper change and all original witnesses remain. Add the
interaction to the existing runtime/impact contract rather than a second owner.

Lab proof must pair cached plausible rows with unavailable/malformed authority,
prove zero census writes and held serving, then restore the same authoritative
source and observe normal guarded derivation and serving. Cover missing read
capability, explicit failure, throw, missing success, success with malformed rows,
and successful empty. The newly reached outcomes must use the actual driver,
queue, publications writer and serve owner. Preserve source-bound red and green
controls, affected caller suites and static results. No local tests, timeout
increases, baseline increases or automatic rerun of failed tests.

Independent review required two additions before implementation: the malformed
answer discriminator must pass through the actual view producer, and the
acknowledgement consumer must retain failure/absence rather than reuse its old
cached row. Both are included in the tests-only continuation, including the
real dispatch retry wake and guarded publications writer after availability
returns. A present publications owner missing its method cannot route to an
alternate view. A missing or throwing view capability is typed unavailable.

The Kubernetes controller comparison supports re-entering the ordinary control
loop from current authoritative evidence rather than repairing a projection
locally: https://kubernetes.io/docs/concepts/architecture/controller/ . It is
design inspiration, not evidence of Lagrange behavior.
