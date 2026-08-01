# Live A/B summary — transaction-recovery-poison-row-invariant

## Contract (sealed constraint `live-validation-bound`)

Controlled live A/B proving a poisoned durable transaction row produces the
typed `transaction_recovery_incomplete` outcome and correct owner attribution,
never `nodeAdmissionBlocked` masking the causal fatal. N≥2 fixed vs N≥2
reverted, fixed node count / workload / failure schedule / clean-start protocol
/ source fingerprint.

## Arms

- **fixed**: working tree, src fingerprint `8468ea3fef3edd6b` (diff vs base
  `77b93bfa`, sha256 `3ca5a688…46d3d146`). Carries the typed-outcome +
  attribution implementation.
- **reverted**: base `77b93bfa` src (5 product files checked out from base),
  src fingerprint `0cb2c6720eb41362`. Bare `TRANSACTION_RECOVERY_INCOMPLETE`,
  no typed outcome.

## Vehicle

- Scenario: `test/distributed/scenarios/transaction-recovery-poison-row-live.js`
  (fork of the seven-node transaction-recovery vehicle). Seeds a durable
  transaction row, poisons it (multi-participant `ONE_PHASE_COMMIT`, expected
  decisionDimension `commit_mode`), restarts the seed with a bounded readiness
  wait, then captures `startupRuntimeHandoff.transactionRecoveryOutcome` from
  tight `getReachabilityDiagnostics` polls. Asserts nothing about recovery
  success (a poisoned row must fail replay in both arms); returns the observed
  handoff evidence for arm comparison.
- Config: `test/distributed/config/local-poison-row-ab.json` (7 nodes, from
  `local-benchmark-7node.json` + scenario block + shortened restart-recovery
  hold recheck).
- Runner: `run-sample.sh <sample-id>` — clean containers + root-owned
  reuse-data, fast-local (live `src/` bind-mount + `SRC_FINGERPRINT`
  recreate), stamps exact fingerprint, harvests report.

## Result: BLOCKED by a pre-existing environmental failure

The live cluster cannot reach join-ready **in either arm**, so no poison-row
restart observable could be produced. This is NOT caused by the change under
test — the base src tree fails identically.

Evidence (all runs fail at the same gate, independent of src arm):

| run | src | scenario | result |
| --- | --- | --- | --- |
| fixed-preflight | 8468ea3f | poison-row-live | FAIL: seed bootstrap API not join-ready in 96s (503 BOOTSTRAP_PHASE_INCOMPLETE, SQL_ENGINE_UNAVAILABLE, priority_control_plane_recovery_diagnostics_unavailable) |
| fixed-preflight2 | 8468ea3f | poison-row-live | FAIL: same, 91s |
| diag-admin-discovery (known-good) | 8468ea3f (fast-local) | diag-admin-discovery | FAIL: seed not join-ready in 175s |
| diag-admin-discovery (base) | 0cb2c672 (reverted) | diag-admin-discovery | FAIL: seed not join-ready in 145s |
| admin-query-smoke (3-node local.json) | 8468ea3f | admin-query-smoke | FAIL: seed not join-ready in 32s |

Conclusion: a pre-existing live-environment blocker (seed never reaches
join-ready: bootstrap phase incomplete + SQL engine unavailable + priority
control-plane recovery diagnostics unavailable) prevents ANY live scenario from
passing right now, on both the fixed and reverted source. The deterministic
guard (`run-transaction-recovery-poison-row-invariant-scenarios.js`) is green
4/4 across consecutive runs with the fix intact.

## Disposition

- The typed-outcome mechanism is proven at the deterministic-guard tier
  (test-code binding) and by independent verifier (fingerprint-exact, 4 attack
  templates pass).
- The live A/B required by `live-validation-bound` could not be executed
  because the live environment is currently broken for ALL scenarios
  (including known-good ones) independent of this change. This is recorded as
  an environmental blocker, not a verdict on the change.
- Follow-up: once the live join-ready regression is resolved (separate
  concern; likely a distinct Quest on the control-plane-recovery-diagnostics /
  SQL-engine-unavailable bootstrap stall), re-run `run-sample.sh fixed-N` and
  `run-sample.sh reverted-N` (N≥2 each) and compare
  `details.handoff.typedOutcomeSample` between arms.
