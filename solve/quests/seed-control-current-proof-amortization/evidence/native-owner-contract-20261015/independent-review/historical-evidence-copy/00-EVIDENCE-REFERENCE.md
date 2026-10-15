# PR #122 partial-RESUME review — evidence reference for the
# seed-control-current-proof-amortization Quest owner

This package is a reference, not Quest content. The authoritative local
rs-raft owner must append the REJECT finding to the existing Quest; nothing
here appends to it.

## Verified identities

- Decisive partial-RESUME falsifier commit: `1994870bb5dbc21c8d74a5bdf856ef4ca1856be8`
  (test-only parent `9233c9e0edc830fabd7e0f64a7ff1eebfe0ddada`; published to
  origin at exactly that SHA on branch
  `review/glm-pr122-partial-resume-falsifier-20261015`).
- Test blob: `f6becd9588fe4e388339701923040d5826ea8751`
  (git hash-object verified in both preserved worktrees).
- Old falsified source: `47ceb42e4a36757007f0d8006d2014fa1400d9c8`
  (the Quest branch head `continue/rs-raft-seed-control-proof-amortization-20261014`).
- Inherited-race witness branch (test-only, on old source, RED):
  `review/glm-pr122-inherited-race-witness-20261015` = `e15166a62b581481782b6875514b8beb441acd58`.
- Idempotency witness branch (test-only, on candidate, documents RESUMED-over-refusal):
  `review/glm-pr122-resume-idempotency-witness-20261015` = `6a9a522d90fd7bf4e62c7325ba5efbdb2e59046e`.
- Node: v22.23.2. All reruns 2026-10-15T07:2x-07:4xZ.

## Rerun results at the exact preserved bytes

- Candidate (1994870bb tree): exit=1, fail=1 — partial OPEN
  (`assert.notEqual(state,'open')` fired), RESUME delivered to all three
  members while r2 was unavailable; see `glm-pr122-rerun-candidate.log` /
  `.meta`.
- Old (47ceb42e4 tree): exit=0, pass=1 — second INSPECT refused before any
  RESUME; every member closed and later repaired; see
  `glm-pr122-rerun-old.log`.
- Earlier runs with first failures retained:
  `pr122-cand-falsifier-run1.log`, `pr122-cand-falsifier-final.log`,
  `pr122-old-falsifier-run1.log`, `pr122-old-falsifier-final.log`
  (sha256 in `glm-pr122-evidence-hashes.txt`).

## New falsifier of the inherited race (old source)

File (committed at e15166a62):
`test/partition/participant-release-control-late-follower-loss-witness.test.js`
Run: `glm-pr122-late-witness-old-final2.log` (exit=1). Envelope facts
(47ceb42e4, injection after the whole second INSPECT cohort settled, before
RESUME dispatch, victim r2 shut down through its real lifecycle owner):

- RESUME dispatched to all three members (`resumedMembers`: r1, r2, r3).
- Overall outcome: typed refusal
  `release_fact_unavailable` / `missingFact: current_lifecycle_registry`.
- Admissions after the refused release: r1 OPEN, r3 OPEN, r2 shutdown
  (partial OPEN on a refused release).
- Ordinary write from the leader during the failed release: SUCCESS through
  real Raft consensus — durableCommitWitness term 1, logIndex 5, entryId
  late-witness-write-1 — with a durable application row committed on r1
  (durable rows r1=1, r2=0, r3=0 at probe time). Raft-log commitment and
  application commitment are separately observable.
- Repair: victim returned (commitIndex 5, caught up); the following releases
  returned typed `query_transaction_drain_pending` refusals (8 bounded
  attempts, retryAfterMs honored) and kept every member CLOSED — no partial
  OPEN in recovery. The full path could not settle the row committed during
  the failed release in this fixture (no query engine wired).

## Idempotent RESUME while OPEN (candidate source)

File (committed at 6a9a522d):
`test/partition/participant-resume-idempotent-open-witness.test.js`
Run: `glm-pr122-resume-idempotent-final3.log` (exit=0; the witnessed defect
is asserted explicitly).

- Recipient r2 already OPEN under releaseId R; a delayed duplicate RESUME
  with the same releaseId replayed through the production delivery seam.
- Before replay, one valid ACTIVE sql_transactions row was written directly
  at r2's durable store owner: fresh `queryCensus` went clear -> held, new
  `rowGenerationDigest`, `recoverableTransactionIds` gained the new id; every
  Raft-status proof field of the OPEN fast path (term 1, leaderId r1,
  configurationKey, membershipGenerationIndex 3, runtimeGeneration 1,
  lifecycleIncarnation) stayed identical.
- Complete fresh-facts census of the same request: `release_census_refused`.
- Handler path observed: initial facts read in
  `receiveCurrentParticipantRelease`, identity refusal predicate
  (`releaseRequestIdentityRefusal`) passes (identity unchanged), then the
  idempotent OPEN fast path of `resumeParticipantCutoverAdmission`
  (partition-participant-transaction-pause.js:252-264) answers from the
  Raft-status proof + releaseId identity alone — no facts re-read, no
  `releaseCensusDefect`.
- Result: RESUMED reported over refused fresh facts. No incorrect permission
  was granted (state and releaseId unchanged; admission was already OPEN) —
  the defect is limited to the incorrect success response.
