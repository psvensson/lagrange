# Published/local cleanup reconciliation — additive attempt

Input is actual published 3ea4dd5053c5f60682cfc7bdcabfa32e0472682d,
production tree 972e63c8e342b118d02a7d263dabaa9fdff98bc2. The separately
retained local 336f240c candidate is NOT applied on top of it. Continue this
existing Quest and its current helpers, fields and release owners. No second
cleanup Quest or implementation is created for the same per-instance interaction.

The unchanged retained local 30-case file produces 21 passes and 9 assertion
failures on this input. One failure is vocabulary only: the managed WASM owner
already refuses overwrite with its canonical REPLICA_LIVE code, rather than the
other candidate's proposed cleanup-specific code. Align that assertion with the
existing code; retain the first result and exact source. It is not a reproduced
permission defect. The other eight failures exercise shutdown admission,
concurrent shutdown, ordinary partition-constructor cleanup, and borrowed KV
lifetime. The new baseline after the one named assertion correction is required.

## Complete interaction to retain

* Keep published withRaftOpeningCleanupFailure and startupFailure; do not add
  the alternative candidate's duplicate helper or parallel failure fields.
* Both partition and message-group shutdown close admission synchronously, then
  publish a single per-instance settlement before invoking any callback. Success
  retains the settled terminal promise. Failure releases only the in-flight
  promise so the same shutdown retries still-owned resources; isShutdown never
  reopens the single-use instance. Initialize must consume that admission state.
* The WASM consensus resource owner releases port, borrowed KV wrapper, then DB.
  Clear each exact reference only after its release succeeds. Every existing
  caller goes through that order; no alternate KV cleanup tail remains.
* Ordinary constructor failure stays the same primary error; it still triggers
  the partition's same cleanup path. Secondary cleanup remains visible through
  the existing aggregate. Status and campaign refusal keep their published path.

This does not declare full host custody: failed CREATE dropping the service and
managed STOPPING-predecessor debt remain a higher-level owner interaction. Those
must be repaired/proved without counting these per-instance greens as that proof.
The snapshot receiver, TX1 migration and global static failures remain open.

Measurement: canonical test runner, original/corrected/source-revert on identical
reconciled tests; include both old candidate populations. Exact source and all
failures retained. Current 10x elapsed-cost tolerance never changes protocol or
caller budgets. Independent verification is still required before landing.

## Additional witness and apparatus disclosures

The retained test copy is kept in the input archive. Current tests remove unused
imports and normalize formatting before the final three-arm run; only the named
REPLICA_LIVE expectation changes assertion vocabulary. No assertion is deleted.
The first host CREATE-retry test used a guessed code spelling; that setup
assertion failed and is retained. The final witness imports the canonical
CLEANUP_IN_PROGRESS constant before baseline/candidate/revert measurement.

The local changed-literal collector is asynchronous and returns a report, not an
array. The first smoke invocation did not await it (empty serialized promise);
it is NOT evidence. Current invocation awaits it, checks totalViolationCount and
retains its scanned-file count. The global guideline command remains separate.
