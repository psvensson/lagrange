# Necessity audit: the experiment that tests necessity

Head `b638284d1`. Read-only design. Nothing below was run.
Marking: **VERIFIED** = read in code at the head or computed from repository data. **INFERRED** = reasoned, not executed.

Principle (owner, 2026-11-21): the proof that an alternate arm is unnecessary is an **executed experiment**. That means a trap
run, or the deletion itself, with the affected interaction's witnesses green. Coverage that never saw an arm run only
nominates it. The ratchet (`ratchet.md`) is supplementary: it stops sites from returning, but it proves nothing about
behaviour. Where an arm sits on a producer-to-consumer boundary, the lasting prevention is a witness spanning the real
producer, the publication boundary and the consumer, registered as a coupled pair (section D).

---

## A. Refresh the observation on the head

### A.1 What has to change in the apparatus first (VERIFIED gaps)

1. **No lab route runs the census.** `scripts/lab/lagrange-lab.js` offers `test changed|all --lane L [--on NAME] [--split]` and
   `harness run`. None of them sets `NODE_V8_COVERAGE` or the census preload, and none runs
   `fallback-branch-census.js collect`. The runbook forbids a raw ssh runner invocation (`solver-runbook.md:303-307`).
   **Needed:** a `lab census collect --lane L --share FILE --on NAME` route that takes the host lock and runs `collect`
   in the placement checkout at the head. INFERRED: about 80 lines in `scripts/lab/`, reusing the existing placement checkout
   and host-lock code.
2. **No merge of merged files.** `join` takes one `--merged FILE` that must contain every run (`bindRuns`,
   `fallback-branch-census.js:546`) and all five lanes (`assertCompleteFiveLaneJoin`). `merge` reads only run
   directories that hold `v8/`. Copying `v8/` back is excluded (household Wi-Fi), so we need
   `merge --merged A.json B.json ... --out ALL.json`. It is a union of disjoint run ids: `files[f].runs[runId]`, `processes`,
   `witnesses`, and `unreadable` concatenated. It must refuse duplicate run ids. INFERRED: about 40 lines plus a test.
3. **The convergence-probe class is outside the census.** `test/shards/primary-classes.json` has three convergence-probe files.
   They are the most formation-like tests (`message-group-multi-join-formation`, `node-join-convergence-slo`,
   `user-table-metadata-fanout`), and `CENSUS_LANE` has no such lane. Collect them as an extra integration-labelled run
   through `--command` (VERIFIED that `collect` accepts `--command` JSON and that the classified runner accepts `--stdin` lists).
4. **The census must keep counts, not only booleans.** For the two-source and catch rows, "primary executed" only means the
   expression or the `try` was reached (README section 2). V8 already reports counts. `join` should record, per site and run,
   the enclosing count, the count of each chain term (not only the last), and the catch count. Then "the fallback answered
   every time" becomes visible. That is the true fallback-only case, which is unmeasurable today for 2,020 of the 2,596 sites.
   INFERRED: about 30 lines in `classifySite`/`sidesOf`, with a schema bump to `fallback-census/2`.

### A.2 Invocations per lane

Run each on one lab host through the route of A.1.1, in a placement checkout at the head `$H` (full sha, bound by
`git rev-parse`, never typed by hand). The census sets `LAGRANGE_PLACEMENT=local` itself, so each share runs on its own
host (VERIFIED, `laneEnvironment`). At most two lab hosts at a time (household bandwidth rule), and each heavy share runs
behind the host's thermal gate.

```bash
H=$(git rev-parse b638284d1)            # or the integration head chosen for the refresh
OUT=.tmp/necessity/$H                    # inside the placement checkout on the lab host

# shares: split each lane's file list from test/shards/primary-classes.json at $H, e.g. two shares per lane
node scripts/checks/fallback-branch-census.js collect --lane unit --head $H --out $OUT/unit-A \
  --command '["node","scripts/run-classified-test-files.js","--stdin"]' < $OUT/shares/unit-A.txt
node scripts/checks/fallback-branch-census.js collect --lane integration --head $H --out $OUT/integration-A \
  --command '["node","scripts/run-classified-test-files.js","--stdin"]' < $OUT/shares/integration-A.txt
node scripts/checks/fallback-branch-census.js collect --lane bootstrap  --head $H --out $OUT/bootstrap
node scripts/checks/fallback-branch-census.js collect --lane packaging  --head $H --out $OUT/packaging
node scripts/checks/fallback-branch-census.js collect --lane formation  --head $H --out $OUT/formation
node scripts/checks/fallback-branch-census.js collect --lane integration --head $H --out $OUT/convergence-probes \
  --command '["node","scripts/run-classified-test-files.js","--stdin"]' < $OUT/shares/convergence-probes.txt

# on the same host, after its shares finish: merge locally (reads v8/, never leaves the host)
node scripts/checks/fallback-branch-census.js merge --runs $OUT/unit-A $OUT/integration-A ... --out $OUT/merged-<host>.json
```

Copy back only `merged-<host>.json` and each run's `run.json`, with `rsync --bwlimit=2500`.
`join` reads `run.json` only (VERIFIED, `readRunRecord`).
On the controller:

```bash
node scripts/checks/fallback-branch-census.js merge --merged merged-hostA.json merged-hostB.json --out merged.json  # A.1.2
node scripts/checks/fallback-branch-census.js join --merged merged.json --runs <run dirs holding run.json> --head $H \
  --out data/fallback-census/census.json
```

Join with the detector on the same head (the default `loadSites` path) and never with `--sites`, so no site record is
carried from older text. The 2026-11-14 hand edit (`9c3a10fdb`, then `5bc4d0769`) carried one site's evidence onto text it
was never measured on (VERIFIED). It is excluded from all counts here.

### A.3 Wall time, estimated from the 2026-11-09/10 run metadata

The census keeps only each run's `startedAt`, and `join` drops `finishedAt`, so durations can only be bounded. VERIFIED from the
start times; durations INFERRED:

| Lane | 2026-11 evidence | Estimate on one lab host | With two hosts |
| --- | --- | --- | --- |
| packaging (4 files, 45 processes) | desktop: packaging start to formation start 21 s | under 1 min | - |
| formation (5-process MovieLens formation phase, 18 processes) | next start on the same host 3 min 10 s later; nightly formation window 249-299 s; census stop deadline 300 s | 5-10 min | - |
| bootstrap (222 files) | `f3e9b011c`: 36 min 51 s until the desktop's next run (upper bound) | 35-40 min | about 20 min |
| integration (124 files) | four hosts started together; their ends were not recorded | 40-60 min | 30-40 min |
| unit (2,274 files, 3,673 processes) | six shares on five hosts plus the desktop, all done 26 min 22 s after the first unit start | 2-2.5 h | 60-80 min |
| merge on host | not recorded; reads every `v8/` file once | 5-15 min per host | - |

Total: about 2.5-3 h of wall time on two hosts. The 2026-11-10 re-collection of unit, bootstrap and integration on five hosts
plus the desktop took 26 min 46 s from first start to join (VERIFIED). Host names in the census (`peter-RB102`, `Carinasdator`,
`adam-Aspire-A515-52G`, `peter-All-Series`, `peter-System-Product-Name`) were not mapped to lab inventory names.

### A.4 The physical three-host formation as an additional lane

Command shape: `node scripts/lab.js harness run fresh-formation-user-table-routability --base <three-node config> --nodes a,b,c --nodes-per-host 1`.
It **cannot be collected with the existing preload as it stands.** VERIFIED reasons:

1. The harness runs the Docker image. The `Dockerfile` copies `src/`, `wit/`, `vendor/` and `node_modules` into `/app`,
   but not `scripts/`, so `--import=.../fallback-branch-census-preload.js` and its sibling modules do not exist in the container.
2. The container environment is composed in `test/distributed/harness/cluster-class-lifecycle-base.js` (about lines 520-600).
   There is a precedent for adding `NODE_OPTIONS` there (`memoryLeak.captureHeapArtifacts`), but no census option. The
   container needs `NODE_V8_COVERAGE`, `LAGRANGE_CENSUS_COVERAGE_DIR`, `NODE_OPTIONS=--import=...` and
   `PISCINA_DISABLE_ATOMICS=1`, plus a writable bind mount for uid 10001 (`docker-provider.js` has `hostConfigExtras`).
3. `docker stop` grants 25 s (`STOP_TIMEOUT_SECONDS`, `docker-provider.js:54`). The census formation lane needed a 300 s stop
   deadline for the seed's drain. Without the pre-kill flush (`docker kill --signal SIGURG`, then wait for the
   `-flushed.json` marker), a node is a lost witness. Its final coverage is missing and `collect` records `NODE_LOST`.
4. Coverage URLs inside the container are `file:///app/src/...`. `sourcePathOfUrl` maps URLs only under the run's `root`
   (`rootsOf`), and `collect` records the controller checkout as `root`. A run record with `root: "/app"` and the image's
   `src` digests is needed (a `collect --external` or a `record` subcommand). Without it, every container script maps to
   `null` and is silently dropped.
5. The expected-participant roster is written by the launching process tree. dockerd launches the containers, so no
   roster entry exists for them, and a node whose preload never started would be invisible. The harness must write one
   roster entry per container it starts.
6. `REQUIRED_CENSUS_LANES` has five lanes. A sixth physical lane needs an optional-lane label (it must not be required by
   `join`) or a separate join.

INFERRED cost: about 200 lines across the harness, the census and the Dockerfile, or a census image variant. A cheaper first
step for the physical formation is observe mode (B) plus the dispatch counters (C), written to the bind-mounted log directory
the harness already retains. That needs items 1, 2 and 5, but not 3, 4 or 6.

---

## B. Trap mode: prove which alternates are load-bearing

Goal: in a selected lane, every armed alternate arm **throws a typed marker error** (`NecessityTrapError {siteId, file, line,
bucket}`) instead of running. Its first hit writes a marker file with the first caller's stack, even if some caller swallows
the error. Selection is by environment: `LAGRANGE_NECESSITY_TRAP_PLAN=<plan.json>`, `LAGRANGE_NECESSITY_TRAP_MODE=throw|observe`,
`LAGRANGE_NECESSITY_TRAP_OUT=<dir>`. In the plan, a site is selected by bucket, file prefix or site id.

### B.1 The three mechanisms

| | (i) load-time rewrite in a preload (ESM `load` hook) | (ii) Stryker per-site mutants | (iii) hand-edited deletion branches |
| --- | --- | --- | --- |
| What exists | The census preload already rides every process and worker through `NODE_OPTIONS --import` (VERIFIED). Node 22 is on the lab hosts, so `module.register` with a `load` hook is available | `stryker.config.json`: `mutate: src/**/*.js`, tap runner on `test/**/*.test.js`, `perTest` coverage, concurrency 2, 60 s timeout; `npm run test:mutation` runs `stryker run` (VERIFIED). No repository script narrows it. Mutation evidence in `docs/evidence/*` was made with hand-made mutant commits run as lab jobs, not with Stryker (VERIFIED) | The slice work itself |
| Answers | "Is this arm reached, by whom, and does the lane survive without it?" in any lane: unit, integration, bootstrap, formation, physical | "Does some test distinguish this arm?" Killed means a test asserts on it, not that production needs it | "Does the change cone stay green without these arms?" |
| Lanes | All lanes, including formation, and physical once A.4 items 1, 2 and 5 exist | Only `test/**/*.test.js` in one sandbox copy. No formation, no physical run; child processes are outside the mutant switch (INFERRED) | Any lane, but one slice per run |
| Range drift | None: the plan is built from the detector at the same checkout and binds `(row, file, hash, occurrence)`. The hook checks `sha256(file + "\n" + slice)` before rewriting and records "unarmed: drifted" instead of missing silently | `mutate` accepts `file:line:col-line:col` ranges. Built-in mutators do not express "throw marker"; custom mutators are not a plug-in point (INFERRED) | n/a |
| Arms inside expressions | Two-source: last term to `(__nt(id))`. Conditional arm to `(__nt(id))`. If-else arm to `{__nt(id);}`. Catch body to `{throw __nt(id, <param>)}`, with the parameter name from the plan. All syntactically local. Middle chain terms can be armed too | Mutators change operators (`a || b` to `a && b`), which is a different question | The human rewrites |
| Async attribution | The marker records `new Error().stack` at the trap. V8 async stack traces cover `await` chains, but timer and event callbacks end at the event loop. The plan's enclosing function name and the first frame outside the site file are recorded; timer-driven arms are labelled as such | n/a | Test failure output only |
| Masking | Trapping many arms at once hides arms behind the first throw. Run in rounds: round k disarms (to observe) every arm already hit in rounds 1 to k-1, until no new hit. Expect 2-4 rounds per lane | One mutant per run, no masking, but thousands of runs | One slice per run, so confounded within the slice |
| Cost | INFERRED: about 300 lines (plan builder reusing `detectNavigabilityPatterns`, the hook, marker writer, report) plus a lane run per round. Parse cost is zero at load, because edits are precomputed per file digest | 2,600 sites, each a mutant over its covering tests, on two lab hosts: days, and a sandbox copy of the repository per worker | Implementer sessions; it is the deletion work itself |
| Failure modes | A trap error swallowed by another catch is still recorded by the marker, so it cannot hide. Source maps are not needed (no TypeScript). Offsets change, so trap runs collect no census coverage (run them separately) | Answers the wrong question; heavy; misses the composed lanes | Learns per slice; tempts "fix the test" instead of learning |

### B.2 Recommendation: (i), feeding (iii)

Build the trap as a **separate preload** (`scripts/checks/fallback-necessity-trap-preload.js`), composed with `--import` only in
trap runs. The census preload's digest is part of every run's validity, so it must not change. Use the plan-driven rewrite of
(i) in two modes:

- **observe**: count, and record the first caller of each armed arm. This is safe for formation and physical runs.
- **throw**: the necessity test.

Then use (iii), the deletion slices of `slices.md`, as the product change. Each slice's red-to-green evidence is the trap
result for its sites plus the change cone. Stryker is not recommended for this question. It can later grade whether a
slice's tests would notice a re-introduced arm.

Per-bucket protocol:

| Bucket | Trap run | Reading |
| --- | --- | --- |
| N0, N1, N2 | throw, in all lanes, as a confirmation (the census predicts zero hits) | A hit means the census missed a schedule (for example a lane added since): move the site to N3-N5. No hit plus a green change cone after deletion: delete. Producer-history check first (README section 6) |
| N3 | throw, in the unit lane | Failing tests name the fixtures that depend on the arm. Migrate those fixtures to the real construction, then delete |
| N4 | throw, in integration, bootstrap and packaging; then observe in formation | Composed lanes green under the trap: the arm is replaceable by a typed outcome. Red: the failing test and the first caller name the schedule. Then decide a (competing source: fix the primary) or e (keep, with that test as its witness) |
| N5 | observe in formation first (callers and counts), then throw per directory in formation and in the physical three-host run | Formation still converges with the arm trapped: delete it or replace it with a typed outcome. Formation fails: the first caller names the dependency. Decide a or e; an e needs a registered witness (section D) |

An arm is **kept** only when a throw-mode run in a composed or formation lane fails because of it, and the lead classifies it as e.
The failing test, or the scenario plus the first caller, becomes its named witness. Everything else is deleted, or replaced
by a typed outcome with an owned continuation.

---

## C. Semantic alternates: central dispatch points for arm-usage counters

The syntactic census cannot see read modes. One counter per `(mode inputs, arm that answered, calling function)` at these
points measures arm usage for the corpus and for a physical formation. All lines VERIFIED at `b638284d1`. Counting uses the
observe machinery of B (a load-time wrapper), so no `src` change is needed. That keeps the apparatus outside `src`, and the
counters work in the deferred files without touching them.

1. **CDC authoritative system-table read: the single entry for gateway, view, catch-up and visibility-wait reads.**
   `src/cdc/cdc-integration-service-authoritative-read-delegates.js:260-269` `executeAuthoritativeSystemTableRead`.
   - Callers: `control-plane-system-table-gateway-read-strategies.js:432, 480`, `authoritative-control-plane-view.js:452`,
     `cdc-integration-service-authoritative-catchup.js:252`, `cdc-integration-service-cache-visibility-wait.js:166, 251`,
     `control-plane-system-table-gateway.js:209`.
   - Key: `readAuthority.authoritativeReadMode`, `.leaderMode`, `.replicaFallbackConsistency`, `tableName` → result `source`,
     `localReadHit`, `localReplicaFallbackHit`, `usedSqlFallback`, `success`, plus the caller (`options.owner` or the first stack
     frame outside `src/cdc`).
   - The arms themselves are decided in `src/cdc/cdc-integration-service-authoritative-read-flow.js` (a deferred writer's file):
     `replicaFallbackConsistency` retry at :572-587; local answer at :627-633; transport preflight at :638-659; local at :679 and
     :684; owner RPC at :706; **local after a failed RPC** at :717-723; **SQL fallback** at :726-745; RPC answer at :748; local
     at :751-752; unavailable at :755.
   - Each result already names its arm, so counting at the delegate needs no edit to the deferred file.
2. **Gateway ingress and its implicit defaults.** `src/control-plane/control-plane-system-table-gateway-read-dispatch.js:65`
   `executeRead`.
   - It defaults `replicaFallbackConsistency` at :82-85 and already appends
     `{strategy, authoritativeReadMode, source, usedSqlFallback}` to `controlPlaneOperationLedger` at :179-204
     (`recordControlPlaneOperation`, `control-plane-system-table-gateway-dependency-resolution.js:18`), with
     `getControlPlaneOperationLedgerAggregatedSummaries` at :38.
   - Missing from that record: `leaderMode`, `localReplicaFallbackHit` and the caller. Whether the aggregated summaries reach
     an admin snapshot was not traced.
   - The normalisers that turn absent input into a weaker mode, one counter per "default taken": `read-contracts.js:74`
     `normalizeReadLeaderMode`, :100 `normalizeAuthoritativeReadMode`, :133 `resolveAuthoritativeReadMode`,
     :255 `resolveControlPlaneReadIntent` (its strategy inference at :267-277 is census N2), :407 `resolveReadProfileOptions`.
3. **Leader preference on the owner RPC.**
   - `src/cdc/cdc-integration-service-owner-rpc-read-execution.js:449-451`: `preferLeader` from `leaderMode`.
   - :92-116: required-leader witness enforcement.
   - :164 `shouldRetryOwnerRpcReadViaSqlFallback`, :230 `executeAuthoritativeSqlFallbackRead`, with `usedSqlFallback: true` at :257.
   - Add `servedByLeader` from the answer's witness role, to count follower-served answers under PREFERRED or ANY (W4 SF-3, SF-4).
4. **Repository visibility modes.** `resolveReplicaOperationVisibilityReadMode` (`replica-operation-repository.js:407`) is in a
   deferred file, so count at its consumers:
   - `replica-operation-repository-incomplete-read-methods.js:402` `queryIncompleteOperations`. Answers at :420 (deferred
     fallback), :428 (cache set), :485 (fallback set), :487 (`[]`).
   - `replica-operation-repository-visibility-methods.js:639-640` (default `CACHE_PREFERRED_SQL_FALLBACK`).
   - `replica-operation-repository-entity-read-methods.js:159` `getAllOperations`, :193 `getOperationsByEntity`, :358.
   - `replica-operation-repository-read-methods.js:312` `queryOperationById`, :600 `getOperationByIdVisibilityObservation`,
     :640 `queryExistingInFlightOperation`.
   - Key: method, mode, answered-by ∈ {cache, owner read, last observation, fallback set, empty on failure}, caller.
5. **Role-derived leader discovery.**
   - `src/query/bootstrap-leader-selection.js:17` `resolveBootstrapLeaderSelection`. Arms: single role-leader row at :26-34,
     hinted leader at :44-50, single visible service at :58-63 (`allowSingleReplicaFallback`), none at :73.
   - `src/query/canonical-leader-routing.js:125` `resolveCanonicalLeaderIdentitySnapshot`, :230
     `resolveCanonicalPartitionLeaderObservation`, :83 `isCanonicalLeaderRoleWitness`.
   - W3's reader list (#2-#19, N1-N6) names the remaining role comparisons. Count each one's arm the same way. This is
     where a never-firing arm may be a **broken required path** (README section 6).
6. **Membership-publication read sources.** `src/control-plane/membership-publication-coordinator-reads.js:187` `readTableRows`:
   preloaded at :193, direct owner at :202-208, authoritative view at :213-237 (merging cache rows at :231-234), cache
   `getAll` at :252-253, `[]` at :255. Also :402 `getAcknowledgementCandidateForNode`.

Readout: per physical run, a table of `(dispatch point, mode, arm) → count, first caller`. An arm with a zero count across the
corpus, formation and the physical run is a deletion candidate under B's protocol. A non-zero count names the caller that
must move to the canonical read (W4 S0-S7).

---

## D. Boundary arms: the witness that prevents recurrence

The surrogate lane broke because a producer changed meaning while its consumer and the consumer's fixtures kept the old one.
A deletion or a typed-outcome replacement on a producer-to-consumer boundary is done only when it carries a witness that:

1. runs the **real producer** (the owner that writes the row or value, for example the partition or message-group service-row
   owner, the leader publication, or the operation repository's mutation answer);
2. crosses the **publication boundary** for real (system-table write, then CDC or cache visibility, then read; not a hand-built
   row literal);
3. drives the **real consumer** decision and asserts its outcome, including the typed unavailable outcome;
4. is **registered as a coupled pair** in `test/shards/impact-contracts.json`, following
   `reports/coupled-pairs-conventions.md`:
   - exactly two endpoints (producer owners, consumer owners) that do not cover each other;
   - a matching contract whose `owners` cover both endpoints and whose `tests` include the witness;
   - `witnessTests` listed in `primary-classes.json`;
   - validated with `npm run audit:impact-contracts`, which the pre-commit hook does not run.
   Then the proof cone selects the witness whenever either side changes.

Which census sites are on such a boundary: a site whose arm reads a row field (snake_case column, `COLUMN.*` key or a `row.`
object). A heuristic scan finds 144 of the 2,596 still-valid sites, **120 of them inside the N0-N3 slices**. The most are in
NS-37 index-management (16), NS-45 wasm-service (14), NS-49 admin (7), NS-18 partition (7) and NS-21 bootstrap (6). INFERRED:
regular expressions; each slice confirms its own list. The leader-role and read-mode families (W3, W4) are boundary arms
by definition. Their slices register the pair named in W3 section 5.2 (`leadership-authority-projection`) and W4's S0 contract.
