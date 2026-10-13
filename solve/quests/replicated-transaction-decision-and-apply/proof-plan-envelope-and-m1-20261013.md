# TX1 envelope admission and real seed M1 — bounded continuation

Status: WIP; source correction and proof repair. Not independent approval, Quest
landing, historical legacy migration or main integration. The eight sealed TX1
receipts and their acceptance criteria remain unchanged.

Remote input `4c8f02e8e6d9da3520fa909885b9391ba6a442a0`; recovered local ancestor
`bcb299c777258ac680b2fa686d06b503a6647387`. Their input source and test trees are
identical (`34af50ee2245c8bd99b0f87e484beb6871d11c3c` and
`759638a94e5ed9a0dcac89eba03ae9c68403361d`). These commit identities are not
interchangeable. All publication stays on the existing PR117 work branch.

## Existing owner contract, not a second compatibility algorithm

`partition-transaction-execution-envelope.js` already owns the four-field envelope
shape predicate and documents that admission consumes it. The existing inc3
admission witness rejects a missing envelope and an empty SQLite-version field.
However `isPinnedParticipantCommand` no longer called this owner predicate. A
malformed PREPARE/DECISION therefore passed preproposal admission. Restore that
one call through the existing command-byte validator. Generation-origin commands
remain separate. Complete but foreign build values are not rejected by this
shape check: release/deployment owns live build compatibility.

Authoritative interaction: request -> canonical command admission -> byte shape
predicate -> existing envelope predicate -> bounded refusal or proposal. The
outcome for missing/invalid shape is the existing participant BYTES_INVALID code.
No new state, persistence, timeout, retry or permission owner is introduced.

Already-committed apply remains distinct: an old malformed/different envelope is
a diagnostic, not permission to change ordered history or strand application.
The new two-case file checks the full PREPARE/DECISION field-shape matrix and
real SQLite committed application/replay through the existing controllable log
fixture. This is controlled delivery, not native quorum proof. Original/candidate/
source-only-revert use identical final test bytes. A restore must reproduce the
admission assertion, while the committed diagnostic/replay case keeps passing.

## Origin is necessary, not sufficient application admission

The existing controlled participant fixture already calls
`resumeFixtureParticipantAdmission` through the real release-fact/resume functions
for normal leaders. Export that existing helper for tests that explicitly append
the origin later. They must now assert CUTOVER_PAUSED before and after origin,
then request resume against their current controlled-port observation. They do
not hand-set OPEN, insert a private participant session or fabricate native proof.
The classifier runs only after admission. Existing rowid, nullable-outcome,
rollback and exactly-once assertions remain.

The inverse legacy-session and three old statement cases remain unresolved: they
ignore the refusal of a fresh legacy BEGIN and assume a session was admitted.
Do not populate private session maps, change the legacy fence, or substitute
current post-cutover refusal for genuinely admitted historical-work migration.
The prior native L6 and explicit producer/consumer retirement map remain required.

## Real seed M1 prerequisite and persistent state

The real executable bootstrap entry obtains its seed-mode decision from the
existing disk startup owner. The standalone M1 fixture omitted that decision;
authorization correctly refused before release. Supply the actual
`resolveAutoRejoinStartupDecision` result from the fixture's fresh data directory.
The generic virgin-seed helper is unchanged. The next failure exposed a test-only
1-second leadership setting also used as release budget; consume the existing
production BOOTSTRAP_DEFAULT (30 seconds), not a larger new production deadline.
Other accelerated fixture scheduling stays explicit.

M1 uses BootstrapService, seed hydration, actual CDC integration, SQLQueryEngine
and its production mutation gateway over native system-table partitions. Its
schema-migration transaction has two participants and must record COMMITTED,
TWO_PHASE_COMMIT and the frozen participant list while applying both updates.
This is not the in-memory coordinator gateway double used by the smaller recovery
fixture. The strengthened M1 observes all three replicas of each of four relevant
system-table groups, requires actual convergence, performs strict shutdown, and
checks the same rows in a separate read-only process over twelve unique files.

That additional process is a disk reader, not a restarted coordinator. This
proves normal persisted-state readback after orderly close on one physical host;
it does not prove coordinator process-loss recovery, power failure, split/merge,
downstream CDC delivery or full lab certification. The seed run may emit
provisioning `wait_bound_spent` diagnostics; retain them and report them separately
from the migration assertion instead of calling the whole startup path green.

## Evidence, static gates and independent review

Retain initial failure of all four source fixture files, intermediate M1 refusal
and budget failures, exact new-envelope baseline/candidate/revert, full chosen
TX1/recovery regressions, all requested file counts, test identities, and elapsed
10x tolerance. Source-only controls must restore exact production bytes even on
failure. Register the new witness in the existing runtime/application contract
and coupled pair; metadata comes from the existing generator.

No unchanged red fixture is waived; no full-guideline baseline is increased.
The previous literal/formatting failures and incomplete later checks remain until
remeasured. Review admission-gating, recovery-replay, owner-interaction, concurrency
and fixture fidelity against the exact candidate before accepting this increment.
Recent PR117 findings 4251495789/4251495885 (concurrent startup/shutdown) and
4251078406 (physical-worker claim after shutdown refusal) stay with the existing
lifecycle/host owners and are not repaired by this TX1 proof change.
