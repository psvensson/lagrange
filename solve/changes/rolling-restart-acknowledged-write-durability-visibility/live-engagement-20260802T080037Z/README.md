# Bounded live engagement 20260802T080037Z

This is the one live engagement authorized by the child Quest. It is not an
N=15 certification sample and must not be promoted into the parent window.

- Command: `bash scripts/rolling-restart-stat-gate.sh 1`
- Source commit: `cc4c8093803786e2d9a5b8f98f5d338762bb6620`
- Source fingerprint: `40abce69f264a830`
- Measurement input tree: clean
- Hardware/node count: `calibrated-local-container-v1`, five nodes, two CPUs
- Run wall time: 361 seconds
- Gate result: `SAFETY_VIOLATED`, fail-closed because the final
  acknowledged-write visibility oracle was not reached

The sample recorded zero corruption, stale-source executions, oracle-blind
results, unexpected node exits, and observed acknowledged-write loss. It
recorded `ACKNOWLEDGED_WRITE_UNVERIFIED=1` because node
`4a641c2e-7069-4d05-8d41-9848587ee351` did not become recovery-ready within
the existing 120-second guard. The canonical classifier identified
`restart_infrastructure_join` / `startup_recovery_blocked`; publication was
converged with `missingPublishedCount=0`.

The existing distributed-failure analyzer recovered playback load evidence
with 533 successful operations and 41 hard load failures. The topology analyzer
reported no topology frontier, and the priority-recovery analyzer reported zero
residual partition witnesses. The final write-receipt ledger and every-node
visibility matrix were not serialized because the scenario stopped at the
earlier recovery barrier, so this sample neither proves nor disproves live
post-recovery visibility. It does prove that the clean candidate engages the
live rolling-restart workload and that an upstream liveness failure remains
fail-closed instead of being misreported as verified safety.

Per the Quest constraint, `restart_infrastructure_join` remains deferred behind
this safety invariant. Do not tune liveness, extend the recovery timeout, spend
a second engagement sample, or run N=15 from this child. Return this immutable
result to `rolling-restart-representative-certification` after deterministic
closure.

## SHA-256

- `stat-gate-20260802T080037Z-run1.report.json`: `0740f4df452a62f991f8b46c1f9898285ef9a5a4b16507bd93ca3dc40fb7d1c8`
- `stat-gate-20260802T080037Z.json`: `4a1032e196e3bd56888a077a90b1e159cd0e324f96fddeef9eeb4588841f3151`
- `stat-gate-20260802T080037Z.md`: `9002f308385b4e14203c51dc9c353439ee70a3036e0761dfffe4e7033c2e7c4f`
- `triage-summary.json`: `e34fe2ce3efd0214e14cbf08b26ccef314183b9a59d15b23b089e097bba95501`
- `triage-summary.md`: `37a9b6a11c0e955b8454b6336144c95c4fe4e9a954a88ac68b733b86224b1901`
