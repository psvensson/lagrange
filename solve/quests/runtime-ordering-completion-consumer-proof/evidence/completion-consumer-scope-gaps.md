# Completion-consumer scope and uncovered native branches

Source base 96985eb2ba0720b7f5e3b36c63ce10e3a2ff71b3; frozen production 4aa8780cfec6f2718b86b4d1e27ee9711492be59. Test-only packet. No production corrections authorized.

## Participant cutover transfer branch remains unexercised

src/node/replica-handler-participant-cutover.js:217-244 owns reopenCohort. It reopens dirty followers and returns STALE; if own.connection.servedLegacy is true, then a clean retained voter is selected, requestLeadershipTransfer(NAMED) executes, and the attempt unconditionally returns STALE with the actual transfer answer (:228-237). A later cutover attempt must re-observe authority.

The reused native fixture starts fresh native connections. It exercises actual PAUSE, native transfer, retained local CLOSED admission, actual election and later release. It cannot enter servedLegacy=true without a legitimately retained legacy-open connection. Setting that flag or fabricating a census would introduce the authority this test is meant to examine. Therefore this test is an admission-control companion, not proof of the legacy cutover consumer branch. Exact missing composition: an existing supported retained legacy connection provenance/open path paired with a current native clean successor, both handled by real release recipients. Do not infer that branch from the ordinary transfer response or source comment alone.

## REPLACE owner boundary

The initial draft fed readReplaceCompletionAuthority (terminal removal owner, majority-corroborated) into decideReplaceNamedHandoff. The actual leadership handoff interaction is PriorityPublicationHandoff.evaluateReplaceNamedHandoffSafety, src/rebalancer/priority-publication-handoff.js:171-217: readReplaceWitnessMembership → decideReplaceNamedHandoff → actual SAFE/DEFER/FAIL builder. These observations are not interchangeable. Cross-review found this before first native execution; the initial draft is preserved in the first test checkpoint and the planned correction will call the actual evaluator and dispatch owners.

The bounded corrected composition still supplies in-memory operation intent rather than creating/persisting a full REPLACE workflow. It can prove the actual leadership removal-safety decision waits on native target observation, not that the entire workflow's eventual source removal is safe. A separate full-workflow witness remains needed. Existing test/rebalancer/replace-real-group-harness.js is useful prior art but uses a mock repository/SQL composition and a manual answerStepDown adapter; it is not silently promoted to actual production durable workflow proof.

## D2 placement cure

The test calls actual applyUserTableLeaderPlacementCure, real registered handlers and native operation ports. It explicitly supplies the caller's planning/stabilization precondition and cache projections made from actual formed native state. It therefore exercises the D2 consumer's dispatch-versus-spread decision, not production CDC provenance or startup/planning gate closure. The returned DISPATCH_HANDOFF result is not completed spread. After declared post-measurement heal, a fresh native-derived projection is passed to the real evaluator.

## Partition writes

Both tests use actual PartitionService.applyWrite, native RF3 responses, durable committed-statement outcome rows and user rows. First checks response remains pending after actual proposal dispatch while quorum responses are retained; then same-entry replay uses exact outcome. Second invokes real shutdown after possible proposal and relies on existing released-write UNKNOWN semantics, then real surviving-quorum election/commit and same-identity replay. It does not test query delivery/redirect, client ingress transport or every epoch-conflict schedule. No fabricated application result is supplied.

## Pre-run correction completed

The two transfer files are now frozen at SHA256 d8ef1beaaecb6f532fc96dea088789bb52df8fc1dff34f4023f596ffb071becb (fixture) and b0744aa40989929ba5e8e5ca92ade2e92d2ccf59002b1ca56cfad219b6e5bf19 (test), pending independent cross-review and first execution. The fixture uses actual inherited PriorityRecoverySupersededTarget evaluator/dispatch/result builders and an actual ReplicaOperationRepository. It supplies explicit in-memory ACTIVE REPLACE intent, not a durable workflow claim. The test invokes evaluateReplaceNamedHandoffSafety → dispatchRemoveSafetyHandoffRequest → evaluateReplaceNamedHandoffSafety across held source send, then invokes the same evaluator after real native transfer. The previous readReplaceCompletionAuthority substitution and null-witness synthetic decision are removed. No production file or original witness changed.
