# Distributed Harness Local README

## Purpose

This README documents local usage of the distributed test harness in `test/distributed/`.

It is also the home for distributed-harness local procedures that do not belong
in repo-wide steering policy.

## Prerequisites

1. Docker daemon running locally.
2. Node.js 22+.
3. Dependencies installed with `npm ci`.

## Main Entry Point

Run harness scenarios with:

```bash
node test/distributed/run.js --config <config-path> [--scenario <scenario-name>] [--output <report-path>] [--verbose]
```

## Live Monitoring Dashboard

To simplify running and triaging local distributed scenarios, Lagrange provides a browser-based UI dashboard.

### Standalone Local Mode (Recommended)

Launch the userland test control dashboard on port `8181`:

```bash
npm run start:test-dashboard
```

Then open `http://127.0.0.1:8181/` in your browser.

### Key Dashboard Features:
1. **Interactive Controls**: Select any scenario-config combination and launch runs dynamically.
2. **Real-time Log Streaming**: Uses Server-Sent Events (SSE) to stream combined stdout/stderr logs from all active container nodes.
3. **Historical Run List**: View past executions complete with git commit hashes, execution durations, and final outcomes.
4. **Examples Visualizer**: For scenarios reporting discrete data assertions (like `examples-catalog`), the dashboard lists individual passed/failed criteria with details.

## Failure Triage

After a distributed harness failure, artifact-first triage is mandatory. Start
from the auto-generated triage summary before sampling logs by hand. These
files are written under the run artifact directory (typically
`test-output/reports/.playback/<report-basename>/<scenario>/`):

1. `triage-summary.md`
2. `triage-summary.json`

Required order after a failure:

1. Read `triage-summary.md`.
2. Read `triage-summary.json`.
3. Run the consolidated diagnostics script if you need deeper cross-scenario
   analysis.
4. Only then sample raw node logs.

For deeper cross-scenario analysis, use the consolidated diagnostics script:

```bash
npm run analyze:distributed-failure -- --report test-output/reports/<report>.report.json
```

### Canonical Convergence Diagnostics

Recent harness artifacts now emit canonical convergence state directly instead
of only symptom counters.

Useful partitioning fields in `triage-summary.json`, `triage-summary.md`, and
the scenario `failure-bundle.json`:

1. `localPrimaryNodeIds`
2. `routedSupportNodeIds`
3. `dispatchContributionHistogram`
4. `degradationStateHistogram`
5. `criticalControlPlaneStability`
6. `convergenceEvaluations`

Read them in this order:

1. `selectedNodeIds` and `readyReplicaNodeIds` tell you what the harness could
   actually drive.
2. `localPrimaryNodeIds` versus `routedSupportNodeIds` tells you whether
   usable spread exists or whether the system only has routed support.
3. `criticalControlPlaneStability` tells you whether the harness is
   intentionally holding benchmark growth on a shared control-plane gate and
   why.
4. `convergenceEvaluations` gives the per-node canonical state:
   `ready_replica`, `replica_blocked`, `routed_admission_only`, or `absent`,
   plus dispatch contribution, blocker reasons, and `retryAfterMs`.

This should be your first stop before sampling raw node logs.

### Stability Gates

Recent triage artifacts also emit explicit stability gates under
`summary.stabilityGates` in `triage-summary.json`, `triage-summary.md`, and
the scenario `failure-bundle.json`.

Read them as the top-level bar check for this workstream:

1. `failover`
2. `convergence`
3. `restart_recovery`

Interpretation:

1. `closed` means repo-owned evidence currently satisfies that bar.
2. `open` means typed blockers are still present; read the `blockers` list
   before sampling logs.
3. `not_applicable` means the scenario did not exercise that lane.

Current AGPL-scoped production bars for this sprint:

1. `failover` should close once the cluster can route/repair without
   publication or readiness blockers.
2. `convergence` should close only after publication, pending-ack, blocked-node,
   and priority-spread blockers are gone.
3. `restart_recovery` should close for rolling-restart and seed-restart
   scenarios before a checkpoint rerun counts as acceptance evidence.

## Validation Ladder

For control-plane and topology work, use this order by default:

1. targeted owner-path tests
2. boundary-transition scenarios
3. shared unit-only gate when the shared TAP boundary or broad cross-cutting
   package surface is involved
4. one full `7node` checkpoint rerun

Do not use repeated full distributed reruns as the normal debugging loop.
Checkpoint reruns should happen only after the earlier surfaces are green.

The reusable local helper is:

`node scripts/run-distributed-validation-ladder.js`

Example:

`node scripts/run-distributed-validation-ladder.js --owner "node test/control-plane/control-plane-system-table-gateway.test.js" --owner "node test/admin/admin-websocket-api.test.js" --boundary "npm run test:distributed:boundary:transition" --checkpoint "npm run test:distributed:checkpoint:7node:transaction-recovery"`

## Boundary-Transition Scenario Layer

Use the middle-layer boundary-transition scenarios when a bug is too coupled
for a tiny unit test but not yet ready for another full `7node` rerun.

Run the focused scenario layer with:

```bash
node test/distributed/harness/__tests__/boundary-transition-scenarios.test.js
```

The first scenarios cover:

1. usable spread versus raw spread
2. authority-establishment deferred outcomes during benchmark table
   preparation
3. dispatch contribution under sustained slot pressure

Prefer this layer before another full distributed rerun when the active work
package names one of those boundaries.

## Scenario Policy SQL Ownership Guard

Distributed scenario code routes `tables.table_policies` mutations through the
canonical helper in `test/distributed/scenarios/table-distribution-helpers.js`.

When changing distributed scenarios, run:

```bash
npm run guard:scenario-policy:file
```

Examples:

```bash
node test/distributed/run.js --config test/distributed/config/local-three-node.json --verbose
node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart.report.json --verbose
```

## Fast Local Defaults

For local Docker configs (no `docker.hosts`), fast-local mode is enabled by default.

Fast-local mode does all of the following:

1. Mounts host `src/` into node containers as `/app/src` (read-only).
2. Reuses deterministic local containers and network across runs.
3. Skips dirty-workspace image rebuilds when the image already exists.
4. Resets each reusable node's `/data` through a host-managed
   `.tmp/reuse-data/<container>` bind before startup; it does not require a
   shell in the runtime image.

Opt-out:

```bash
node test/distributed/run.js --config test/distributed/config/local-three-node.json --no-fast-local --verbose
```

Explicit opt-in (same behavior as default local mode):

```bash
node test/distributed/run.js --config test/distributed/config/local-three-node.json --fast-local --verbose
```

Stop all local Docker containers and local Node.js processes created by the
distributed harness:

```bash
npm run distributed:stop-containers
```

Preview without stopping, or also remove the containers:

```bash
npm run distributed:stop-containers -- --dry-run
npm run distributed:stop-containers -- --remove
```

Scope the cleanup to only containers or only local processes:

```bash
npm run distributed:stop-containers -- --containers-only
npm run distributed:stop-containers -- --processes-only
```

Fast-local runs may start the reusable containers again. Use `--no-fast-local`
on the scenario runner when you want a run to avoid reusable containers.
The rolling-restart statistical gate passes `--no-fast-local` automatically so
gate evidence exercises the built runtime image entrypoint and command directly.

## Config Files

Common configs:

1. `test/distributed/config/local-three-node.json`
2. `test/distributed/config/local.json`
3. `test/distributed/config/local-memory-soak.json`
4. `test/distributed/config/local-benchmark.json`
5. `test/distributed/config/local-benchmark-3node.json`
6. `test/distributed/config/local-benchmark-5node.json`
7. `test/distributed/config/local-benchmark-7node.json`
8. `test/distributed/config/local-benchmark-7node-partition-split.json`
9. `test/distributed/config/local-benchmark-3node-timeout180.json`
10. `test/distributed/config/local-benchmark-3node-timeout600.json`
11. `test/distributed/config/gcp-small.json`
12. `test/distributed/config/gcp-large.json`

## Scenario Names

Only modules exporting `run(cluster)` are runnable scenarios. Helper files under
`test/distributed/scenarios/` are not scheduled by the runner.

When you omit `--scenario`, `node test/distributed/run.js` now runs the
canonical scenarios registered for the selected config instead of every `.js`
file under `test/distributed/scenarios/`.

Use these values with `--scenario`:

### Canonical 3-node matrix (`local-three-node.json`)

1. `admin-query-smoke`
2. `examples-catalog`
3. `network-partition-split-brain`
4. `node-failure-rebalance`
5. `public-path-multinode-baseline` — REFUSED (not run) on this single-host
   config: `refused_insufficient_host_topology` (see below)
6. `public-seam-durability` (zero-cutover validation scenario; see below)
7. `rolling-restart`
8. `three-node-seed-rebalance`
9. `user-table-leader-placement-spread` (certifies distinct-NODE leader spread;
   see below)
10. `wasm-service-failover`
11. `write-ack-visibility`

**Host topology and the spread unit (owner ruling 2026-10-04).** A spread
claim states its unit. `public-path-multinode-baseline` claims child leaders on
distinct HOSTS (`spreadUnit: 'host'`) and declares
`SCENARIO_TOPOLOGY_REQUIREMENT = {minDistinctHosts: 2}`. The runner compares
that with the config's host authority BEFORE starting anything
(`test/distributed/harness/scenario-host-topology.js`): a host is a machine
named only by declared topology (`docker.hostInfo[i].machineId`, else
`docker.hostInfo[i].internalIp`), never a node id, a provider index, a Docker
endpoint or the local socket. Every single-host local config
(`local-three-node.json`, `public-path-baseline-three-node.json`,
`user-table-leader-spread-three-node.json`) declares no host topology, so the
scenario is REFUSED / NOT-RUN there: the report entry carries
`outcome: 'refused'` and a named `refusal` (required vs available), the verdict
is `REFUSED_NOT_RUN`, no cluster starts and no failure bundle is written, the
run exits `3` (never `0`, never `1`), and the matrix, summary table, triage and
quest probes show it as REFUSED — never PASS and never certification evidence.
Physical host spread is proven only on the lab (`npm run distributed:lab`; the
lab harness declares each node's observed boot id as `machineId`, so two
providers on one machine count once) and on GCP (`npm run distributed:gcp`;
one VM per provider, by internal address).

What one "host" is: a kernel instance, identified by its boot id
(`/proc/sys/kernel/random/boot_id`). Containers on one machine share the
kernel's boot id and are ONE host (the controller and main-linux are one
host); a VM has its own kernel, so VMs — including two VMs on one
hypervisor — are SEPARATE hosts. A declared `internalIp` is trusted as one
machine per address: a hand-written config that declares one machine under
two internal addresses is counted as two hosts. Only hand-written configs can
do that; the lab harness declares boot ids, and no repository config declares
`hostInfo`.

Earlier runs' evidence: when a scenario's cluster starts, the previous run's
artifacts under `<output>/<scenario>/` (and `.full-logs/<scenario>`) move into
`<output>/<scenario>/.previous-<run start>/` with an `archive.json`. Only the
newest 3 archives per scenario and output directory are kept; the archive
step logs every prune, the new `archive.json` names the pruned archives
(`prunedArchives`), and an archive left without `archive.json` by a crash
mid-archive is named as partial (`partialArchives`, and in the log) — it
still counts toward the bound of 3.

Local logical coverage of the gate
is the synthetic 5-node/4-host regression test
`test/distributed/harness/__tests__/scenario-host-topology.test.js` (unsplit →
splitting → under-replicated children → leaders on one host, including two
leaders on the shared host → truthful pass).

`user-table-leader-placement-spread` certifies distinct-NODE leader spread
(`spreadUnit: 'node'`), which is what the production cure
(`src/rebalancer/user-table-leader-placement-cure.js`) promises; it runs on the
local configs and claims nothing about hosts or failure domains. Host-aware
user-table leader placement is a separate placement-owner quest.

**Certification (owner rulings 5 and 6, 2026-10-05).** Startup readiness
admits nodes while saying `publication_convergence_not_claimed_startup`: that
is enough to RUN the system and never enough to CERTIFY it. A run is
certification evidence only when it requests it (`--certify <40-hex sha>` on
`test/distributed/run.js`, or `lab harness run ... --certify <sha>`) and its
report entry's `certification` block says `certified: true`. Every other
run's entry carries the explicit `certification_not_requested` record (not
certification evidence; publication convergence not claimed at startup), and
consumers that are not certification say so (`health:formation`,
`check:formation`, ship readiness, the distributed matrix, a quest pass
streak without `certification: true`). The one owner is
`test/distributed/harness/scenario-certification.js`; each condition is
recorded with the evidence observed in that run, and absent evidence is a
named failure, never a pass:

| Condition | Observed from | Named failure |
| --- | --- | --- |
| `scenario_passed` | the scenario's own outcome | `certification_scenario_not_passed` |
| `no_refusal` | the outcome is not `refused` | `certification_refused_outcome` |
| `topology` (unit host) | the scenario's `SCENARIO_CERTIFICATION_REQUIREMENT` (`maxNodesPerHost: 1`, `minNodes: 5` for the formation acceptance) on the config, AND every placed node's declared machine identity | `certification_topology_not_one_node_per_machine`; on the config this REFUSES the scenario before it runs (`refused_certification_topology`) |
| `publication_convergence` | after the scenario and before teardown, a WINDOW of load-mode probes (`_probeClusterActiveState` in mode `load`): `CERTIFICATION_PUBLICATION_WAIT.CONSECUTIVE_READY` (3) polls in a row, each with every node active, complete snapshot coverage and the publication gate `ready === true` with `claimState: publication_convergence_claimed_load`, held for at least the harness's load-readiness stable window (`_resolveLoadReadinessStableWindowMs`, 5 s by default) and never less than the certification floor `CERTIFICATION_PUBLICATION_WAIT.MIN_STABLE_WINDOW_MS` (5 s, whatever `timeouts.loadReadinessStableWindowMs` says; the configured and the effective window are both recorded); any other poll restarts the window; the startup admission never counts; bounded by `CERTIFICATION_PUBLICATION_WAIT` (120 s), an expiry is recorded as a spent wait with what was awaited, the last observed gate and the window | `certification_publication_convergence_not_observed` |
| `voters_at_target` | every `cluster.waitForConvergence` of the run (the scenario's and the certification stage's own strict wait) ended `voters_at_target` with no under-replication tolerance declared, over a claimed set equal to every partition its authoritative `partitions` read returned (system, priority and user-table partitions, split children included); each wait records `expectedPartitionIds`, `claimedPartitionIds` and `unclaimedPartitionIds`. The stage's strict wait ends only on an observation with voters at target AND nothing unclaimed (a split parent whose dissolution is still pending is unclaimed), re-checked within ONE budget, `CERTIFICATION_CONVERGENCE_WAIT` = the single wait's own settle bound (`CONVERGENCE_DEFAULTS.settleTimeoutMs`, 30 s, never lengthened); only its last observation decides (earlier ones are recorded `supersededByStage`), and an expiry is recorded as a spent wait. The expected set is cross-checked against every live node's own `partitions` read: at least 2 nodes must answer and each must name the same set (the tables catalog is not read) | `certification_convergence_not_voters_at_target` (also when a partition is unclaimed, the expected set is empty, the stage wait expired, or a node's partitions read disagrees, naming the extra and missing ids) |
| `host_spread` (unit host) | the scenario's named spread gate (`split-leader-host-spread`) passed with `spreadUnit: 'host'` on declared machine facts | `certification_host_spread_not_observed` |
| `spent_waits` | every `event: 'wait_bound_spent'` line of every node's full log (`.full-logs/<scenario>/<node>.log.gz`; both reporter sinks, the logger's error and `logConsoleOnly`, write through the node's one pino destination, its stdout, which the streaming capture writes there), grouped by `wait` and classified by the census `solve/epics/raft-rs-full-cutover/census-bounded-waits-2026-10-04.md` | `certification_unexpected_spent_wait` (any wait outside its "Known findings (owner)" table); `certification_known_finding_spent_wait` (any known finding, reported with its owner: the one constant `CERTIFICATION_KNOWN_FINDING_SPENT_WAIT_POLICY` is FAIL, because a fully spent timeout always hides a bug; today a run in which SWIM declared a node DEAD (`swimSuspicionTimeoutMs`) or the 60 s voter-ready wait expired (`REPLICA_HANDLER_DEFAULT.SYNC_TIMEOUT_MS`) cannot certify; only the owner relaxes it); `certification_spent_wait_evidence_incomplete` (a node log missing, unreadable, empty or without the node's boot provenance line; any line naming `wait_bound_spent` that is not the reporter's JSON record (pretty-printed, prefixed, inspect-style); an incomplete capture; file-logging capture, which does not hold the node's stdout; or the census unreadable) |
| `commit_identity` | OBSERVED, never inferred (`test/distributed/harness/certification-image-identity.js`): the checkout is clean (`git status --porcelain`, plus `--ignored` over the Dockerfile's context roots, so an ignored file the build would send cannot hide) with `HEAD` equal to the requested sha; the image is built FRESH on every docker host (never reused by label) with the labels `ddb.certify.sha` (full sha), `ddb.certify.clean`, `ddb.certify.context-digest` (SHA-256 of every file the build context sends), `ddb.certify.src-fingerprint` and a per-run `ddb.certify.build-id`, read back from each host; the context is re-observed after the build; every node's container runs an image carrying those labels (docker inspect through the node's provider), and every node's full log carries its boot provenance line with the certified src fingerprint (the node fingerprints `/app/src` only; vendor/, package*.json and the Dockerfile are attested by the container's image labels); after the build every host's base images (each `FROM` image of the Dockerfile) are read back by image id (`docker image inspect`) and must be present and identical on every host, recorded in the evidence (the Dockerfile does not pin them by digest) | `certification_commit_identity_not_exact` |

The scenario's outcome and the report verdict are unchanged by
certification; a run that requested certification and is not certified exits
`4` (`NOT_CERTIFIED`). `--certify` without a full 40-hex sha is an error
(exit 1), never an ordinary run, and a certification run never uses
fast-local (live source bind, container reuse). The block repeats the spread
unit on each spread claim and lists what a certified run still does not
certify (committed raft-rs ConfState is not observed; the node attests
`/app/src` only).

**Durable evidence.** A certification run's directory
`test-output/certification/<requested sha>/<run start>/` is created, with
`started.json` (scenario, sha, run start, host set, run identity, controller
pid and host), BEFORE the formation starts: by `lab harness run` before any
machine is held, or by `run.js --certify` before anything is built (passed
between them as `--certify-run-dir`); a run that cannot create it aborts.
`run.js --certify` names exactly one `--scenario`. After the scenario the
runner adds `report-entry.json`, `certification.json`, `gates.json`,
`logs/<node>.log.gz` and `manifest.json` (scenario, sha, certified, outcome,
run start, host set, run identity, and the SHA-256 of every file including
`started.json`), plus `manifest.json.sha256`; every file is created
exclusively, never overwritten, and no harness archive or prune touches the
tree. The runner prints `certification evidence: <dir> manifest sha256
<digest>`; a run whose evidence could not be archived exits `4`.

Every certification run's outcome, certified or not, refused, aborted or
interrupted, is printed as a ready-to-run record line (the lab harness
prints it whatever happened; a direct `run.js --certify` prints it on exit):

```bash
node scripts/solve.js note --id <quest> --kind evidence --finding "certification-run scenario=<s> sha=<sha> start=<run start> outcome=<certified|not-certified|refused|interrupted|unverifiable> manifest=<digest|none (no manifest: interrupted)>"
```

**What the streak counts.** The quest probe counts a certification streak
only with `certification: true` in its args, only from these directories
(never from report files), newest first by run start, and only with
`recordedLog: solve/quests/<id>/log.ndjson` (without it the probe is never
done):

- a directory whose manifest verifies is its entry: certified at ONE sha
  counts; an uncertified certification run or a FAIL resets; a refused run
  is not a sample; a certified run at another sha ends the streak; one run
  (run start + sha + host set) counts once;
- a directory that does NOT verify, whatever the reason (no manifest because
  the run was interrupted, killed mid-archive or crashed; only
  `started.json`; a file that does not match its digest; a partial copy), is
  a FAILED sample at its directory name (the run start): it RESETS the streak
  and is listed by name in `invalidSamples`;
- against the recorded lines: a recorded run whose directory is gone, or
  whose manifest digest differs from the recorded one, is a FAILED sample at
  its recorded run start (`missingRecordedRuns`,
  `recordedDigestMismatches`); a certified run whose digest is not recorded
  is `unrecorded` and not counted.

What stays undetectable: a run directory deleted before anyone recorded its
line. The operating rule is therefore: **record the printed line after EVERY
certification run**, before anything else.

**Retention (owner decision 2026-10-05, option 1).** The small verdict files
of EVERY run (`started.json`, `report-entry.json`, `certification.json`,
`gates.json`, `manifest.json`, `manifest.json.sha256`) are committed;
the node logs stay outside git, bound by their digests in the manifest:

```bash
node scripts/lab.js harness keep-evidence test-output/certification/<sha>/<run start>
# -> solve/epics/raft-rs-full-cutover/evidence/certification/<sha>/<run start>/ (commit it)
#    and prints where the node logs are and their sha256 digests
```

The probe re-derives the streak from the committed copies with
`evidenceDir: solve/epics/raft-rs-full-cutover/evidence/certification` and
`logsByDigest: true` (a listed log absent from the copy is bound by its
digest; every verdict file must still match).

Witnesses: `test/distributed/harness/__tests__/scenario-certification.test.js`,
`certification-image-identity.test.js`, `certification-evidence-archive.test.js`
and `test/scripts/scenario-certification-consumers.test.js`.

`public-seam-durability` is the provider-neutral durability scenario at the
public seam: it writes an image-like object (`objects` BYTEA row plus an
`object_history` row, one transaction) through a node's PostgreSQL-wire
client, reads it from the other nodes, stops a joiner (chosen by harness
role), keeps writing through a survivor, starts the joiner, and requires
identical, exactly-once state on every node plus no topology-bearing key in
any public result. It never reads consensus state. It first scales
`sys-postgres-wire` to one password-mode replica per node (the documented
operator scale path; disable with
`scenarios.publicSeamDurability.publicClient.provisionListener: false`). The
binding step is off by default (`scenarios.publicSeamDurability.binding.enabled:
true` deploys account-summary through the shared service pipeline and calls it
before the stop and after the restart). The scenario carries no consensus
provider selector or fallback: on the cutover tree it exercises the single
raft-rs runtime. Certification is an external exact-SHA proof decision, not a
runtime-provider comparison. Known binding-result finding: the
account-summary call result carries `contributingShards` (a placement count),
which the leak check catches, so with the binding enabled both binding steps
FAIL on it; that is a finding for the call owner's result shape
(CallCellInvoker), not a scenario defect. Unit test:
`test/distributed/harness/__tests__/public-seam-durability-scenario.test.js`.

### Canonical 5-node matrix

1. `node-join-under-load` (`local.json`)
2. `partition-kill-heal-under-load` (`local.json`)
3. `rolling-restart` (`local.json`)
4. `seed-restart-under-load` (`local.json`)
5. `sustained-write-throughput` (`local.json`)
6. `postgres-baseline-comparison` (`local-benchmark-5node.json`)

### Canonical 7-node matrix

1. `diag-admin-discovery` (`local-benchmark-7node.json`)
2. `seven-node-load-during-partitioning` (`local-benchmark-7node.json`)
3. `seven-node-read-write-load-distribution` (`local-benchmark-7node.json`)
4. `seven-node-read-write-load-transaction-recovery` (`local-benchmark-7node.json`)
5. `seven-node-table-partition-distribution` (`local-benchmark-7node.json`)
6. `seven-node-postgres-baseline-partition-split` (`local-benchmark-7node-partition-split.json`)

## Benchmark Tuning

Benchmark tuning notes (in `benchmark` config block):

1. `loadOpsPerSec`: target request rate for system-under-test load.
2. `loadMaxInFlight`: in-flight cap for harness load generation. Keep this
   high enough to avoid client-side throttling when latency increases.

## Canonical Benchmark Mode (Strict)

`postgres-baseline-comparison` now uses one canonical benchmark path in strict
mode:

1. Pre-load gating reads canonical discovery readiness (`benchmarkReady`,
   `routingReady`, `schemaReady`, `topologyReady`) and fails closed on missing
   data.
2. Strict profile fanout defaults to full cluster candidate count when
   `requiredSutLoadNodeCount` is not explicitly set.
3. Explicit strict fanout opt-out is still supported by setting
   `requiredSutLoadNodeCount` lower than cluster size; this is reported in
   benchmark details as `strictFanoutOptOut=true` with
   `strictFanoutOptOutReason`.
4. Sustained critical rebalancing in strict mode now fails verification via
   `internal_signal_threshold_breach` (`critical_rebalancing_state`).

Useful benchmark detail fields in each report:

1. `details.benchmark.strictMode`
2. `details.benchmark.clusterCandidateLoadNodeCount`
3. `details.benchmark.requestedSutLoadNodeCount`
4. `details.benchmark.requiredSutLoadNodeCount`
5. `details.benchmark.explicitRequiredSutLoadNodeCount`
6. `details.benchmark.strictFanoutOptOut`
7. `details.benchmark.strictFanoutOptOutReason`
8. `details.failure` (machine-readable failure envelope with `rootCauseClass`,
   `phase`, `affectedNodeIds`, `reasonCounts`)

## Versioned CDC Readiness Contract

In strict mode, benchmark load admission now requires schema-version
convergence across required load nodes:

1. Capture one `requiredSchemaVersion` at benchmark table creation time.
2. Require each node to report `appliedSchemaVersion >= requiredSchemaVersion`.
3. Require admin queryability and routing readiness on the same node snapshot.
4. Block load start until all required nodes satisfy the predicate over the
   stable window.

Canonical strict unmet reason codes:

1. `admin_not_queryable`
2. `routing_not_ready`
3. `schema_version_unknown`
4. `schema_version_lag`

When strict pre-load fails, use:

1. `scenarios[0].details.diagnostics.failure.versionConvergence`
2. `scenarios[0].details.diagnostics.failure.versionLagSummary`
3. `scenarios[0].details.diagnostics.failure.nodeReasonsByNodeId`

If strict pre-load fails, load is expected to remain blocked (no benchmark load
metrics).

## Join Readiness And Assignment Hardening

Joiners now enforce canonical join-readiness convergence before transitioning to
READY (when normal join hydration runs):

1. `routingReady=true`
2. `topologyReady=true`
3. `appliedSchemaVersion >= requiredSchemaVersion`

Useful join config knobs in `NodeJoiningService` config:

1. `joinReadinessTimeoutMs`
2. `joinReadinessPollIntervalMs`
3. `joinReadinessTableName` (defaults to `services`)

`MOVE_REPLICA` joins also use assignment-token handoff:

1. `/bootstrap` returns `assignmentId` and `assignmentLeaseExpiresAt`.
2. Joiner sends `assignment_id` to `/register-service`.
3. Seed rejects missing/unknown/expired/mismatched tokens
   (`ASSIGNMENT_TOKEN_REQUIRED`, `ASSIGNMENT_TOKEN_UNKNOWN`,
   `ASSIGNMENT_TOKEN_EXPIRED`, `ASSIGNMENT_TOKEN_MISMATCH`).
4. Replica ownership conflicts fail closed with `REPLICA_OWNER_CONFLICT`.

## Postgres Baseline Workflow

Treat any timeout, long stall, or discovery delay as a correctness bug. Do not
start a `3node` or `7node` strict baseline until the targeted checks below are
green.

### Required Before Any Strict Baseline

1. Shared readiness and guarded-mutation regressions:

```bash
npm test -- \
  test/admin/admin-websocket-api.test.js \
  test/control-plane/lease-sweep-serialization.test.js \
  test/raft/authoritative-row-mutation-helper.test.js
```

2. Deterministic convergence regressions:

```bash
npm test -- \
  test/convergence/deterministic-convergence-harness.test.js \
  test/convergence/baseline-discovered-regressions.test.js
```

3. Benchmark report and gate contract:

```bash
npm test -- \
  test/distributed/harness/__tests__/report-writer.test.js \
  test/distributed/harness/__tests__/run.test.js \
  test/scripts/compare-latest-baseline-runs.test.js
```

4. `postgres-baseline-comparison` control-path specs:

```bash
npm test -- \
  test/distributed/harness/__tests__/postgres-baseline-comparison-benchmark-provisioning-and-schema-watermark.test.js \
  test/distributed/harness/__tests__/postgres-baseline-comparison-discovery-fanout-and-strict-parity.test.js \
  test/distributed/harness/__tests__/postgres-baseline-comparison-preload-readiness.test.js \
  test/distributed/harness/__tests__/postgres-baseline-comparison-strict-diagnostics.test.js \
  test/distributed/harness/__tests__/postgres-baseline-comparison-post-load.test.js
```

### Additional Gate Before `7node`

1. Run a strict `3node` baseline first and require a passing report before
   spending time on `7node`.
2. Re-run the targeted integration checks that have caught recent multi-node
   correctness bugs:

```bash
npm test -- \
  test/integration/convergence-control-snapshot.integration.test.js \
  test/integration/node-joining-rebalance.integration.test.js \
  test/integration/three-node-seed-rebalance.integration.test.js
```

3. Only after the checks above pass should you launch the strict `7node`
   baseline.

### Baseline Closure Rule

If a distributed baseline run finds a correctness bug, do not close that bug on
the strength of a later passing baseline alone.

Required closure steps:

1. Capture the failure in a targeted regression first.
2. Prefer the deterministic integration layer under `test/integration/` for
   replica instability, degraded admission, strict readiness, or fallback-path
   bugs.
3. Keep the bug open if it is still reproducible only in the full baseline
   harness.
4. Treat the next passing baseline as confirmation, not as the primary proof of
   closure.

If a strict baseline fails correctness, its observed `loadMetrics` remain
diagnostic only. Report summaries and the compare script now label those runs
as `invalid_for_performance`, and they must not be used as throughput
baselines.

Run baseline-comparison scenario on local benchmark profiles:

```bash
TS="$(date -u +%Y%m%dT%H%M%SZ)"
node test/distributed/run.js \
  --config test/distributed/config/local-benchmark-3node.json \
  --scenario postgres-baseline-comparison \
  --output "test-output/reports/postgres-baseline-3node-${TS}.report.json" \
  --verbose

TS="$(date -u +%Y%m%dT%H%M%SZ)"
node test/distributed/run.js \
  --config test/distributed/config/local-benchmark-7node.json \
  --scenario postgres-baseline-comparison \
  --output "test-output/reports/postgres-baseline-7node-${TS}.report.json" \
  --verbose

TS="$(date -u +%Y%m%dT%H%M%SZ)"
node test/distributed/run.js \
  --config test/distributed/config/local-benchmark-7node-partition-split.json \
  --scenario seven-node-postgres-baseline-partition-split \
  --output "test-output/reports/postgres-baseline-7node-partition-split-${TS}.report.json" \
  --verbose
```

Compare latest run against prior run for both `3node` and `7node` profiles:

```bash
scripts/compare-latest-baseline-runs.sh --report-dir test-output/reports
```

To keep local artifact growth under control, prune stale local generated
artifacts after debugging sessions:

```bash
npm run test-output:prune:dry
npm run test-output:prune
```

Default retention policy:
- keep pinned names such as `current`, `latest`, `acceptance`, `summary`, and
  `validation`
- scope includes `test-output/`, `.tmp/`, `.playback/`, `.tap/test-results/`,
  `data/partitions/logs-p1`, `data3/partitions/logs-p1`, and
  `data/examples/movielens-lagrange-node/partitions/logs-p1`
- defaults are count-based; `--keep-days` defaults to `0`
- keep at least the latest `4` report JSON files
- keep at least the latest `4` report playback bundles
- keep at least the latest `4` legacy playback bundles under
  `test-output/.playback`, `.tmp/.playback`, and `.playback/.playback`
- keep at least the latest `4` other run-like entries in each scoped artifact
  directory, or the latest `4` replica file sets in each `logs-p1` directory
```

The comparison output includes:

1. Run-to-run deltas (pass/fail, duration, throughput, total ops, latency, queue delay).
2. Load execution details (`attempt_errors`, `dispatched_ops`,
   `undispatched_ops`, channel error counts).
3. Per-run SUT-vs-Postgres baseline comparison from the same report when
   available (`sut_vs_pg[...]`, throughput ratio, latency ratios).
4. Load parity and discovery summaries (`load_parity[...]`,
   `sut_discovery[...]`) and truncated error strings for fast triage.
5. Strict/non-strict fanout contract summaries (`fanout_contract[...]`,
   `fanout_delta`) including opt-out state.
6. Root-cause summaries (`root_cause[...]`, `root_cause_delta`) from the
   unified failure artifact.
7. Convergence summaries (`convergence[...]`, `convergence_delta`) including
   required schema version, lagging-node count, and per-node reason snippets.
8. Dominant strict reason summaries (`dominant_reason[...]`) and deltas.
9. Saturation summaries (`saturation[...]`, `saturation_delta`) for CDC forward
   timeout, system-table query timeout, and snapshot-collection errors.

The compare script requires report names matching:

1. `postgres-baseline-3node-*.report.json`
2. `postgres-baseline-7node-*.report.json`

Optional deep-dive analysis for one report:

```bash
npm run analyze:pg-baseline -- --report test-output/reports/<report>.report.json
```

Required triage summary after any harness failure:

```bash
npm run analyze:distributed-failure -- --report test-output/reports/<report>.report.json
```

When to use it:

1. Immediately after a failing harness run, before making code changes.
2. When comparing repeated failing runs to confirm whether the dominant failure
   signature changed.
3. During closure checks to verify that timeout/error counts and mismatch
   classes actually moved in the expected direction.

## Artifacts

By default, harness artifacts go under:

`test-output/.playback/<report-basename>/`

Per-scenario artifacts include:

1. `<scenario>/_timeline.log`
2. `<scenario>/_analysis.json`
3. `<scenario>/playback-manifest.json`
4. `<scenario>/playback-viewer.html`
5. `<scenario>/events.ndjson`
6. `<scenario>/samples.ndjson`
7. `<scenario>/snapshots.ndjson`

## Local Reuse Resource Names

When fast-local container reuse is enabled:

1. Network name: `ddb-test-net-reuse-local-<cluster-size>`
2. Container names: `ddb-test-reuse-<cluster-size>-<node-index>`

## Reset Reused Local Resources

If you want a completely fresh local state:

```bash
docker ps -aq --filter "name=ddb-test-reuse-" | xargs -r docker rm -f
docker network ls --format '{{.Name}}' | rg '^ddb-test-net-reuse-local-' | xargs -r docker network rm
rm -rf .tmp/reuse-data
```

## Running All Distributed Scenarios

Run every distributed Docker scenario sequentially (3-node, 5-node, 7-node):

```bash
bash scripts/run-all-distributed-scenarios.sh --verbose
```

Reports are written to `test-output/reports/<scenario>-<timestamp>.report.json`.
The script prints a pass/fail summary and exits with the number of failures.

Extra flags are forwarded to `run.js`:

```bash
bash scripts/run-all-distributed-scenarios.sh --fast-local --verbose
bash scripts/run-all-distributed-scenarios.sh --no-fast-local
```

## Re-running Only Failed Scenarios

After a full run (or any run that produced reports), re-run only the scenarios
whose latest report shows a failure:

```bash
bash scripts/rerun-failed-distributed-scenarios.sh --verbose
```

The script scans `test-output/reports/` for `*.report.json` files, finds the
most recent report per scenario, and re-runs those that failed. Rerun reports
are written with a `rerun-` prefix.

Options:

```bash
# Preview which scenarios would be re-run without executing them
bash scripts/rerun-failed-distributed-scenarios.sh --dry-run

# Use a different report directory
bash scripts/rerun-failed-distributed-scenarios.sh --report-dir path/to/reports --verbose
```

## Harness Test Commands

Run harness unit tests:

```bash
npx tap test/distributed/harness/__tests__/run.test.js test/distributed/harness/__tests__/config-parser.test.js test/distributed/harness/__tests__/cluster.test.js test/distributed/harness/__tests__/docker-provider.test.js
```

Run all non-integration fast tests:

```bash
npm run test:fast
```

## Memory Leak Detection

The harness includes a memory leak analyzer that samples process RSS from each
node's runtime resource-diagnostics owner during scenario execution. Raw Docker
cgroup usage cannot satisfy this gate. Container capacity displays use the
separate reclaimable-cache-adjusted working set produced by the canonical
container-memory accounting module. Configuration lives in the `memoryLeak`
block of each config file.

Key settings:

1. `enabled` — collect memory samples (default `true`).
2. `failOnDetection` — fail the scenario when a leak is detected (default
   `true`).
3. `requireSamples` — fail when insufficient samples are collected (default
   `false`).
4. `maxRssSlopeBytesPerMin` and `minRssGrowthBytes` — explicit process-RSS
   trend thresholds. The former ambiguous threshold names are rejected.

### Local Profile Enforcement

`local.json` (5-node) and `local-three-node.json` (3-node) collect leak
diagnostics but set `failOnDetection: false` and `requireSamples: false`.
Results from those profiles do not certify leak freedom. The report summarizer
prints a `!` warning when a non-enforcing run detects growth.

Use `local-memory-soak.json` for leak certification. That profile sets both
`failOnDetection: true` and `requireSamples: true`, so a detection or an
insufficient sample set fails the run.
