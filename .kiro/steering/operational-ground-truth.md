# Operational Ground Truth (distributed work — don't get fooled)

This is the **single canonical home** for the distributed-work traps. `AGENTS.md`
points here rather than restating them, and the external auto-memory must link here
rather than duplicate them (see [`memory-boundary.md`](memory-boundary.md)).

These traps repeatedly cost agents large amounts of time. Internalize them before
any distributed-harness or convergence work:

- **Runs can silently execute STALE code.** The fast-local Docker harness reuses
  containers and bind-mounts `src/` read-only; Node imports modules once at boot,
  so a reused container keeps running OLD source. Force fresh containers
  (`docker ps -aq --filter name=ddb-test-reuse- | xargs -r docker rm -f`) and
  confirm the boot `SRC_FINGERPRINT` self-check
  ([`src/diagnostics/source-fingerprint.js`](../../src/diagnostics/source-fingerprint.js))
  matches your commit before trusting any result.
- **Absence proves nothing.** The playback bundle is a sparse curated sample — a
  missing log line does NOT mean the code did not run. Ground truth is the full
  per-node logs under `test-output/reports/.playback/<run>/.full-logs/`.
- **Convergence is non-deterministic.** Never conclude from a single run; use the
  statistical gate `scripts/rolling-restart-stat-gate.sh` from clean containers.
- **Use the analyzers, not raw-log grep.** Read
  [`test/distributed/harness/README.md`](../../test/distributed/harness/README.md) first,
  then `npm run analyze:distributed-failure -- --report <r>` /
  `analyze:causal-model` / `analyze:topology-convergence` /
  `analyze:priority-recovery-residuals`. Open raw ndjson only after an analyzer
  has named the owner/edge.
- **Distributed blockers are tracked one invariant at a time.** Follow
  [`.kiro/specs/membership-lifecycle-placement-hard-cutover/closure-grammar.md`](../specs/membership-lifecycle-placement-hard-cutover/closure-grammar.md):
  record the first violated invariant BEFORE changing code. Records live per-file
  under `closure-ledger/CL-###.md`; `closure-ledger.md` is the index.
- **Two standing defaults:** research existing mechanisms before writing new ones
  (parallel machinery has been built here by accident); and after implementing,
  have a separate subagent independently verify the change before relying on it.
