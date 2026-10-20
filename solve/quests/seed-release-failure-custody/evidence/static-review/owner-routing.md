---
audience: development
documentClass: evidence
---

# Static findings and owner routing

Date: 2026-10-20.
Author: `subagent:/root/physical_custody_review`.
Source candidate: `e29e46abf6c5daf506d8c0500b5a9a1d16c2bcd6`.
This is a source-bound scope assessment and handover, not an independent
implementation acceptance or a new seal. The author inspected source,
existing seals and the preserved static findings; no tests or audits were
executed for this assessment.

**Current scoped static gate: RED. Neither finding is waived.**
The cleanup implementation and its measured results do not satisfy the
remaining decision-boundary gate. No baseline, allowance, deadline or
historical evidence is changed by this document.

## Evidence and scope

[inherited-decision-findings.json](inherited-decision-findings.json) records
the same two violation identities before and after the cleanup repair,
against its stated base `63420a1a5d6ec3564027275ddf35369edb128983`.
The source diff preserves the flagged constructor and retry blocks.
Inherited attribution does not make either finding resolved.

The current [cleanup Quest](../../quest.json), sealed at
`847c36a31ea3e84880dbf5e16b7e4ffb81cdd3eb`, covers registration resource
accounting, exact failed-cleanup custody and top-level shutdown retry.
Its `existing-owner-boundary` and `restart-authority-separate` constraints
exclude a new controller, ledger, authority token or automatic partial-seed
admission. The two next units below are routing recommendations, not silent
extensions of this cleanup seal.

All source line ranges below refer to the exact candidate above. Repository
paths are relative to its root.

## Constructor finding: audit classification repair

The recorded kind is `mixed_cache_and_sql_decision`, in
`src/bootstrap/owners/seed-runtime-bridge-owner.js`, function
`acquireSqlQueryEngine`, with cache line 51 and SQL/DB line 65.

The actual function at lines 46-66:

- Reuses its already acquired engine when present.
- Passes `systemCache: d.getSystemTableCache()` into a new SQL query engine.
- Publishes that same engine into the bridge, bootstrap delegate and CDC.

Line 65 is `cdcIntegrationService.setSqlQueryEngine(engine)`. This wiring
does not read a database row as an alternate answer to a cached fact.
The engine's cached resource identity is also distinct from a control-plane
cache/SQL truth decision.

The detector at `scripts/check-guideline-decision-boundaries.js:387-418`
walks identifiers throughout a function. Any identifier containing `cache`
plus any containing `sql`, `db`, `query` or `execute` produces the finding.
It does not establish a read, fallback or equivalent semantic decision before
reporting one. This particular attribution is therefore a detector
false-positive, not evidence that product construction should change.
The intended runtime rule remains binding:
`architecture/runtime-lifecycle.md:211-215` forbids mixed cache/SQL fallback
within a single semantic decision.

**Next bounded unit A:** the existing `guideline-audits` owner should repair
classification of dependency construction/publication versus mixed reads.
Use the exact bridge shape as a reproducing fixture, preserve current
mixed-read negatives in
`test/scripts/check-guideline-decision-boundaries.test.js:198-228`, and add
negative cases where actual mixed reads occur within constructor arguments
or other wiring-looking expressions. Reject blanket constructor exclusions.

The owner must approve the classification contract and independently review
its implementation and detector regressions. Do not rename dependencies,
extract product code merely to hide identifiers, exempt this path/function,
or increase a count baseline. This assessment alone does not clear the gate.

## Workflow finding: explicit retry-owner decision

The recorded kind is `local_retry_loop`, now at
`src/bootstrap/bootstrap-service-seed-workflow.js:325`, within the method
factory `createBootstrapServiceSeedWorkflowMethods`.

This is actual retry orchestration. Lines 305-345 compute the shared
absolute deadline, authorize each distinct cohort, issue release requests,
retain diagnostic observations, classify retry delay and sleep before a
bounded reattempt. Lines 346-353 retain terminal failure projection.
`src/node/participant-release-client.js:134-140` performs the actual request
and at most one leader redirect; it does not supply this outer re-drive.

The audit at `scripts/check-guideline-decision-boundaries.js:438-479`
recognizes loop/timer syntax containing retry-named identifiers. It does not
determine whether the containing component is the approved semantic owner.
Thus the loop is real, but the finding alone does not establish that moving
it elsewhere is architecturally correct. Merely relocating the same loop
also does not resolve the current detector's classification.

The existing Quest
`solve/quests/seed-release-once-per-partition-cohort/quest.json`,
sealed at `4431a5e94b4128f91576911a76071b0d03bbf962`, assigns ordering and
initiation to seed bootstrap and per-cohort state, safety, control checks
and OPEN to the existing replica-handler cutover owner. Its
`same-shared-deadline` constraint explicitly preserves request retry
conditions, original clock, shared absolute deadline, projections and
failure classification. Deleting the loop or reducing it to one request
would change those semantics.

**Next bounded unit B:** architecture and the existing participant-release
owners must decide whether this bounded initiation remains seed-owned or
whether re-drive must converge into the existing handler release owner.
Record that decision before implementation. Any changed sealed acceptance
requires explicit supersession; the cleanup seal cannot supply it.

If consolidation is selected, the unit must preserve fresh-seed trigger and
authorization, control-first distinct-cohort order, the one unchanged
absolute deadline for the complete pass, existing retry classification,
diagnostic observations, shutdown behavior and committed-origin safety.
An existing related implementation is
`src/node/replica-handler-release-recovery.js:256-288`, but its fresh-create
authorization, clock and failure contract differ. It cannot be called as a
drop-in fresh-seed substitute. Existing-origin recovery at lines 190-217
also cannot supply fresh-seed authorization.

The unit's proof must engage a retryable release, actual subsequent re-drive,
successful settlement, spent-deadline refusal without deadline renewal,
shutdown and stale/late-answer fencing, and unchanged cohort ordering and
diagnostics. Keep the existing source-only semantic negatives and
exact-candidate owner regressions. If the owner instead retains the present
bounded initiation, the audit needs a principled, independently tested
ownership classification; an assertion that the loop is allowed is not a
gate receipt. No new retry controller or parallel release algorithm is
recommended.

## Separate retained-startup authority frontier

The cleanup Quest explicitly preserves this unresolved frontier. The earlier
read-only allocation trace was pinned at
`847c36a31ea3e84880dbf5e16b7e4ffb81cdd3eb`; the following admission and
durable-fact owners remain unchanged on the current candidate:

- `src/bootstrap/seed-startup-storage-admission.js:8-21` consumes durable
  SERVICES evidence. `rejoin-hints-durable-evidence.js:319-323` does not call
  retained non-SERVICES artifacts fresh storage.
- `src/bootstrap/phases/seed-partitions-phase.js:85-98` requires an exact
  restorable SERVICES row when admission is nonempty; missing identity
  remains `CREATE_OWNER_DEFERRED`.
- `src/raft/raft-rs-replica-lifecycle-owner.js:109-167` owns physical
  incarnation and opening history. These facts do not record an original
  seed-placement grant or a bootstrap-to-SERVICES authority handoff.
- `src/partition/partition-participant-transaction-apply.js:554-578` owns
  immutable committed-origin application. An origin is not placement
  permission.
- `src/bootstrap/seed-recovery-proof.js:37-48` owns the seed recovery proof;
  `src/node/participant-release-authorization-owner.js:16-23` separately
  requires actual fresh-seed membership authority for a fresh release.

The `replica-opening-history` seal at
`316e5fcdab102ddc562433139d73b3df62748590` preserves independent host
prior-existence and participation requirements. The
`seed-restart-recovery-mode-v2` seal at
`23ca84017cfd906269bb81cbf217e791a2785ec5` preserves cluster identity plus
quorum/contact proof; persisted seed role alone cannot authorize serving.

No adequate original allocation grant for the pre-registration partial-seed
case was identified in the inspected startup composition. Existing workflow
checkpoints, volatile desired-state Maps, DB presence, a static founding
list, native opening history and committed origin cannot fill that gap.
Any automatic continuation needs its own bounded authority/handoff decision
through existing topology admission, lifecycle, SERVICES and release owners.
Do not synthesize rows, force fresh seed, introduce a parallel ledger, or
weaken loss/quorum fences. This frontier remains separate from cleanup and
from the two static-owner units above.
