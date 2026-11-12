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

## Revision after physical lab 2713 — raw input is not owner evidence

The earlier preload exception above is superseded. Exact candidate
`ebb1b35db214ab456dec52b26667c8a514b91141` (tree
`1a49c8b50b8b2be816903b2a46eaed83b51c8b92`, source tree
`8e413d25ebfb2dea10622bde567908eeb848f1dd`) failed the real acknowledgement
wake witness in physical lab issue 2713. The complete 98,145-byte worker log has
SHA-256 `67173df052add160698d23409f38ef4a846be5e272b0feeec44a8220f822bac1`.
Seven of ten roots passed; the runner reported 1,143 assertions. All requested
scopes closed. The acknowledgement witness observed one write while the
canonical publication list was unavailable; expected zero. The other two
failing roots require separate supplier tracing and are not blanket-classified
as fixture failures.

The first causal divergence is cache publication wake ->
`buildReadyNodePublicationAdvancementOptions` -> async acknowledgement candidate
-> `getLatestPublicationRow` -> `readTableRows`' raw preload return. A nonempty
caller array answered before the canonical owner was asked. Source review also
found direct `latestPublicationRow`/`latestPublishedPublicationRow` shortcuts in
async planning and reconciliation, and `options.planningSnapshot` in async
candidate derivation. This is a shared authority-ingress defect.

Independent reviewer `/root/takeover_checkpoint` withdrew source approval for
`ebb1b35db` and approved the corrected implementation scope: every requested
asynchronous SQL row observation comes from the canonical owner; no raw-array,
latest-row or caller-snapshot override. The same reads owner produces
`{planningSnapshot, candidate}` from one read, and reconciliation consumes its
latest rows and candidate together. The public candidate-only entry delegates
to that producer. No snapshot brand, registry, alternate source, retry timer or
new authority owner is introduced. Synchronous projection/intent surfaces stay
explicit and cannot authorize writes. Active-gate handoffs must retain desired
target/readiness ownership without adding an unrelated startup dependency;
unrequested inputs and unavailable observations must remain distinct.

The original real dispatch/writer red is preserved unchanged. Added controls
cover populated and empty raw preloads, publication arrays with a plausible
newer epoch, caller latest rows and caller planning snapshots. They require the
canonical owner to be attempted, answered-empty to remain absence, and same
owner recovery to succeed. Source and fixture changes remain unexecuted until
fresh physical lab proof. No previous seal, failure, timeout or baseline is
rewritten.

Old tests-only lab issue 2694 closed with infrastructure cancellation during
`npm ci` (exit 130, `CANCELLED_ORPHANED_EXECUTION`); its complete 161-byte stream
contains no test command and is not product-red evidence.

### Declared handoff omission and full-census continuation

The reviewer approved preserving the existing explicit-target plus
`deferNestedPriorityRecoveryPlanning` route after the canonical publication
observation. That route omits unrelated SQL evidence and forces NOT_DERIVED;
raw caller rows and summaries cannot certify it. This preserves the original
formation dependency boundary. Ordinary planning still reads all named owners.
The former fixture that expected a write under unavailable publication history
was an assertion of the removed bypass, not a valid positive. It now preserves
the refusal and same-owner recovery as separate phases. Success fixtures whose
lists stayed frozen while their keyed reads observed writes now use one keyed
durable row store for both observations. No cache-derived authority is added.

A second shared continuation defect was identified while constructing recovery:
an unavailable handoff can retain a pending explicit target with the omission
flag true. A later census request with an empty context inherits that flag
through the existing queue merge and omits census inputs again. The reviewer
approved the existing owed-census producer setting the same flag explicitly
false after caller context. Desired-target/exclusion merging remains owned by
the existing queue. No new mode or timer is needed. The real queue witness now
covers both ordinary handoff and this prior-pending-failure interleaving,
including a held authoritative SQL read, NOT_DERIVED serving refusal, normal
guarded DERIVED refresh, and serving after the same read proceeds.

The guarded-write and held-write cadence witnesses migrate their controlled
candidate seam to the canonical snapshot/candidate producer. Both retain actual
publication-list observation. The cadence test blocks keyed confirming reads,
leaving planning available, so it reaches its intended lost-write-answer
boundary instead of failing before admission. All original write outcome,
revision, cadence and teardown assertions remain. Dispatch tests now assert
that cache/CDC wakes pass no publication array to acknowledgement.

Runtime verification requested for the original ten roots plus the native
publication guarded-write witness, held-write re-ask cadence, and dispatch
node-state update root. Generated metadata and scoped static gates remain
lab-only and pending. The preserved receipt.json describes its historical
source and is not updated to claim this candidate passes.

### Summary authority is part of the same boundary

Final independent review found two remaining routes for donating a census:
`...options` retained raw priority/lifecycle summaries in the async snapshot,
and candidate derivation used an embedded readiness summary whenever current
service/partition rows derived none. Both routes are removed. The readiness
AVAILABLE surface remains planning input; its memoized/retained answer is not
this invocation's SQL census. The publication candidate now states only its
current-row derivation, or explicit NOT_DERIVED. The existing durable refresh
rule still prevents an un-derived candidate from erasing an admitted census.

History `3b5fe7b5e` introduced the embedded-summary alternative as D8 on
2026-10-04; `a6dff7f2f` later introduced explicit NOT_DERIVED. The current
single-census-owner contract and takeover no-fallback instruction supersede
that earlier alternate authority. This is a source/contract finding, not an
unrecorded runtime failure.

New real coordinator/writer controls cover raw satisfied summaries on both
ordinary and deferred target admission with authoritative-empty rows. A
separate retained-owner witness supplies a satisfied summary through the
readiness owner's AVAILABLE port while actual service/partition rows are
empty. It requires NOT_DERIVED admission and serving refusal, retained periodic
reconciliation debt, then a guarded derived census and serving after the same
SQL owners return current rows. It also exercises the real no-downgrade path.
The original no-input pure candidate expectation is explicitly changed from
ABSENT to NOT_DERIVED to state this strengthened candidate contract. All new
runtime controls remain pending physical-lab execution at this writing.

### Physical owner-closure results and fixture reachability

The exact `fcbcb7a6d1f0ac56cc02ca01901ace9db30b860e` source was transported as
`3366553d7d1b097164c38556f2b7a67673463c68`, preserving tree
`73ac91871cfe9627096478b49e50f433d6d30082`. Lab `2801` passed seven caller roots
and 672 assertions. Its complete 2,236-byte log has SHA256
`ac24668120b3847b9b4adbdd13620158c6d01d202f316035f98d2e9e3e546286`.
Lab `2800` passed four of six core roots: authority-read (17), priority census
(28), held-write cadence (3), and dispatch node-state (110). The coordinator
and guarded-write roots failed; all 643 assertions and the complete 84,634-byte
stream remain preserved, SHA256
`588089d3f3d8987fd9f6c809fe20374b82e2d244c5275712f871f3167072aed9`.
Both jobs closed their scopes. Passing controls do not discharge these failures.

Independent review approved the following precise fixture changes, with no
production delta or changed timeout:

- The ABANDONED-row ACK now reaches a real stale-write race: it reads the live
  owner, is held before the guarded update, then another coordinator abandons
  the row through the actual timeout change. The original FINAL_ROW refusals
  remain, with a later terminal observation required to return UNCHANGED and
  issue no write. The former raw stale input no longer grants read authority.
- Visible-handoff cases assert the owed full-census request and absence of raw
  latest rows. The deferred retry retains its desired target; pending-target
  merging and the eventual full owner read remain covered by the real retained
  queue witness that passed `2800`.
- The two ACK-refresh units receive the actual publication-list port and all
  five planning table inputs. The existing explicit acknowledged-node intent
  is retained where the owner is completing ACK debt. Guarded writes and all
  closure assertions remain unchanged.
- The in-flight read unit obtains its two publication observations from the
  list owner and separately verifies the five planning RPC inputs. The trim
  candidate receives current priority partitions and replicas, so its unchanged
  steady-state assertion no longer relies on a retained satisfied summary.

These are reachability corrections on unchanged source, pending exact lab
renewal. Static gates, generated metadata and whole-epic acceptance remain open.
