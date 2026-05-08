# Rolling Restart Startup Readiness Snapshot Gating

April 28 closure: focused startup-readiness classification and join-authority
precedence fixes are implemented, and the representative rerun moved beyond
this owner boundary.

Closure evidence:

1. `node --test test/control-plane/publication-recovery-evidence.test.js test/distributed/harness/__tests__/failure-bundle.test.js test/bootstrap/node-joining-service.test-part-5.js`
   passed with `166/166` tests.
2. `npm run audit:guideline:decision-boundaries` passed with `0` violations.
3. `npm run audit:runtime-grammar` passed, including state-machine pressure
   preflight.
4. `npm run audit:guideline:literals` passed with `0` new violations.
5. `npm run test:metadata-gateway:audit` passed.
6. `git diff --check` passed.
7. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --fast-local --verbose`
   moved past startup-readiness snapshot gating and failed later at
   post-rebalance closure after `462.7s`.

April 29 review repair:

1. Count-only publication ACK evidence now remains count-only across repeated
   canonical publication-recovery evidence passes. A canonicalized
   `count_only` projection no longer re-enters as an explicit empty required
   ACK list and falsely clears pending ACK debt.
2. Join readiness now returns available startup authority before reading
   readiness-derived active cohorts. A partial or failing readiness cohort can
   no longer preempt the declared startup authority path.
3. The package tracking gap found during review is closed below with an
   explicit progress grammar and static drift ledger for this lifecycle
   boundary.

Representative migration result:

1. failover, convergence, and restart-recovery stability gates are closed.
2. publication epoch `7` is `PUBLISHED` with pending ACK count `0`, blocked
   publication node count `0`, and missing published count `0`.
3. priority recovery blocked and unresolved counts are `0`.
4. the new terminal owner boundary is post-rebalance closure:
   `membership_trim_open`, `cdc_projection_visible_open`, and
   `no_over_target_open`.

April 27 activation: this package owns the blocker that appeared after
priority follow-up under transport pressure moved beyond load readiness.

## Why

The latest representative `rolling-restart --fast-local` rerun no longer fails
on unresolved priority recovery progress. It fails during startup/readiness
snapshot gating:

1. report:
   `test-output/reports/runtime-stability-rolling-restart-20260427-codex-priority-followup-next.report.json`
2. terminal reason:
   `readiness_probe_timeout_fallback`
3. node readiness probe timed out for
   `7493b0ab-a054-5fad-a91b-5e331db29304`
4. active-gate last progress was `active=4/5`, `coverage=0/5`,
   `snapshot_error`
5. priority recovery unresolved class count was `0`
6. priority recovery partition summary was empty

The current blocker is therefore no longer priority follow-up operation
creation. The owner boundary is startup-readiness snapshot coverage and the
active-node authority used while a restarted node is still moving through
startup.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence` maintenance/refactoring scope under:

1. `Topology workflow stabilization`
2. `Failure simulations`
3. `Production guarantees`

## In Scope

1. Define the canonical startup-readiness snapshot outcome for `snapshot_error`
   and `coverage=0/5`.
2. Ensure join/startup readiness consumes startup authority before partial
   readiness-derived active cohorts when that authority is available.
3. Preserve fail-closed behavior for unavailable snapshot authority.
4. Add focused coverage for the startup authority and readiness snapshot
   classification path.
5. Rerun `rolling-restart --fast-local` and record whether the blocker moves
   back to post-active trim or to another named owner boundary.

## Out Of Scope

1. Increasing readiness, load-readiness, or convergence timeouts.
2. Harness-only readiness exemptions.
3. Reopening the closed priority follow-up operation-creation boundary.
4. Pro or Enterprise features.

## Shared Boundary Contract

Semantic owner: startup authority and join/startup readiness snapshot
evaluation.

Canonical contract shape:

1. startup authority provides the authoritative startup cohort when available
2. readiness snapshots report named coverage and probe outcomes
3. active-gate classification uses terminal barrier evidence over stale
   reconstructed publication or priority-recovery summaries

Allowed consumers:

1. join readiness evaluator
2. startup recovery coordinator
3. active-gate and failure-bundle classifiers
4. the rolling-restart representative harness gate

Prohibited reinterpretations:

1. partial readiness cohorts must not override available startup authority
2. `snapshot_error` must not be collapsed into generic active-node timeout
3. priority recovery green evidence must not hide startup snapshot failure
4. timeout increases must not stand in for deterministic startup-owner closure

## Progress Grammar

Canonical state and outcome vocabulary:

1. `startup_authority_available` means the readiness-owned startup authority
   snapshot names the startup cohort and owns required-node diagnostics.
2. `startup_authority_unavailable` means no readiness-owned startup authority
   snapshot is available; join readiness may only use readiness-service
   eligibility and must fail closed when no owner cohort exists.
3. `startup_snapshot_error` means startup-mode active-gate snapshot coverage is
   incomplete with a named snapshot probe error.
4. `startup_snapshot_timeout` means the snapshot error is timeout-shaped and
   carries reachability/admin probe context.
5. `startup_publication_closed` means the best startup progress has complete
   coverage, published publication state, no pending ACK debt, no missing
   published membership, and satisfied priority spread.
6. `post_rebalance_handoff` means startup/readiness ownership is closed and the
   representative failure has moved to the post-rebalance owner boundary.

Blocked, deferred, retryable, terminal, and ready meanings:

1. blocked: `startup_snapshot_error`, `startup_snapshot_timeout`, or
   unavailable startup authority with no readiness-owned eligible cohort.
2. deferred: transient snapshot/admin probe failures that retain startup
   authority but do not establish complete coverage yet.
3. retryable: snapshot probe errors with reachable control-plane/admin evidence
   and no publication or priority-recovery debt.
4. terminal for this package: a startup snapshot failure that remains the
   representative blocker after focused owner proof.
5. ready: `startup_publication_closed` or `post_rebalance_handoff`.

Evidence precedence:

1. Readiness-owned startup authority wins over partial readiness-derived active
   cohorts when authority is available.
2. Terminal active-gate snapshot evidence wins over stale playback publication
   or priority-recovery reconstruction.
3. Best closed startup progress suppresses later degraded terminal probe
   samples for publication-closure classification.
4. Explicit required ACK node-list evidence wins over count-only ACK evidence;
   count-only evidence remains count-only unless an owner explicitly provides
   a required ACK list.

## Static Drift Ledger

Review repair ledger:

1. Relevant guardrails: decision-boundary audit, runtime-grammar audit,
   metadata-gateway audit, literal audit, and `git diff --check`.
2. Inherited repo-wide debt outside this package: not reclassified in this
   repair; the package relies on the existing repo-wide audit baselines.
3. Inherited in-scope gap: the closed package lacked an explicit progress
   grammar and static drift ledger for a startup/join/readiness lifecycle
   boundary.
4. New in-scope debt introduced by the repair: none expected.
5. Debt removed by the repair: count-only ACK reentry drift, startup authority
   precedence drift, and missing package grammar/ledger tracking.
6. Required proof after review repair: focused publication evidence and
   join-readiness regressions, package focused tests, relevant static
   guardrails, and `git diff --check`.

Executed after April 29 review repair:

1. `node --test test/control-plane/publication-recovery-evidence.test.js test/bootstrap/join-readiness-startup-authority.test.js`
   passed with `75/75`.
2. `node --test test/control-plane/publication-recovery-evidence.test.js test/distributed/harness/__tests__/failure-bundle.test.js test/bootstrap/node-joining-service.test-part-5.js test/bootstrap/join-readiness-startup-authority.test.js`
   passed with `181/181`.
3. `node --check src/control-plane/publication-recovery-evidence.js`,
   `node --check src/bootstrap/join-readiness-evaluator.js`,
   `node --check test/control-plane/publication-recovery-evidence.test.js`,
   and `node --check test/bootstrap/join-readiness-startup-authority.test.js`
   passed.
4. `npm run audit:guideline:decision-boundaries` passed with `0`
   violations.
5. `npm run audit:runtime-grammar` passed with `0` runtime-grammar
   violations and state-machine pressure preflight `issues=0`.
6. `npm run audit:guideline:literals` passed with `0` new literal-guideline
   violations.
7. `npm run test:metadata-gateway:audit` passed.
8. `git diff --check` passed.

## Residual Closure Inventory

1. Owner paths: join readiness active-node authority, startup recovery
   readiness, and active-gate snapshot classification.
2. Tail consumers: failure bundles, active sprint status, roadmap Phase 0.1
   blocker table, and paused post-active trim/quiescence packages.
3. Superseded paths: priority-follow-up blocker ownership for the current
   representative run.
4. Required proof: focused startup authority/readiness tests, relevant static
   guardrails, and one representative `rolling-restart --fast-local` rerun.

## Done When

1. Startup/readiness snapshot failure has one canonical owner outcome and
   reason set.
2. Focused tests cover startup authority precedence and snapshot failure
   classification.
3. Static guardrails show no new drift.
4. `rolling-restart --fast-local` either moves beyond startup-readiness
   snapshot gating or the next blocker is recorded as a separate named owner
   boundary.
