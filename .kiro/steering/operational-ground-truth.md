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
- **Deterministic-first, gate-last.** Reproduce a convergence failure
  deterministically in-process BEFORE changing code — build a targeted or
  fault-injected repro at the layer where the invariant is produced (see the
  reproduced-before-fix rule in
  [`closure-grammar.md`](../specs/membership-lifecycle-placement-hard-cutover/closure-grammar.md)
  and the substrate map in
  [`docs/deterministic-directed-testing-plan.md`](../../docs/deterministic-directed-testing-plan.md)).
  The docker statistical gate (`scripts/rolling-restart-stat-gate.sh`) is
  non-deterministic and expensive: it is last-resort certification of a landed
  fix, NOT the iteration loop. Never conclude from a single gate run, but do not
  over-sample either — match the sample size to the question. Default to N=3-4
  for latency/mechanistic gates and stop early once the answer is conclusive
  (e.g. a hard breach or a clean mechanistic confirmation needs no more runs);
  escalate to N≥8 ONLY for a convergence-rate promotion verdict where the
  statistic itself is the claim. Do not default to N=8 every iteration.
  BEFORE queuing a gate, run `npm run analyze:latent-blockers`: the gate is a
  serial max-frequency oracle that shows only the single dominant reason and masks
  the rest, so do not spend a ~40-min gate to learn the next layer the corpus
  already reveals.
- **Use the analyzers, not raw-log grep.** Read
  [`test/distributed/harness/README.md`](../../test/distributed/harness/README.md) first,
  then `npm run analyze:distributed-failure -- --report <r>` /
  `analyze:causal-model` / `analyze:topology-convergence` /
  `analyze:priority-recovery-residuals`. For the cross-gate picture — which
  blockers are MASKED behind today's dominant reason, the peel-order, and emerging
  candidates — run `npm run analyze:latent-blockers` over the whole report corpus
  (the deterministic backbone of the latent-blocker census;
  [`.kiro/epics/latent-convergence-blocker-census.md`](../epics/latent-convergence-blocker-census.md)).
  Open raw ndjson only after an analyzer has named the owner/edge.
- **Distributed blockers are tracked one invariant at a time.** Follow
  [`.kiro/specs/membership-lifecycle-placement-hard-cutover/closure-grammar.md`](../specs/membership-lifecycle-placement-hard-cutover/closure-grammar.md):
  record the first violated invariant BEFORE changing code. Records live per-file
  under `closure-ledger/CL-###.md`; `closure-ledger.md` is the index.
- **Research existing mechanisms first.** Before writing new machinery, search for
  an existing owner-boundary solution — parallel machinery has been built here by
  accident.
- **Independently verify after implementing.** After a change, have a separate
  subagent independently verify it before relying on or reporting it.
