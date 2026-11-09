# Fallback-branch census: coverage collection notes (append-only)

Quest `fallback-branch-coverage-census`. Agent `claude:nav-census`, controller
`peter-System-Product-Name`. Lab host tv-dator (peter@192.168.86.32, node
/home/peter/.nvm/versions/node/v22.23.2/bin/node).

## 2026-11-08T10:23Z setup

- Worktree HEAD 1ad04d21a34ca425767d81508e3afad4a7728cc2; uncommitted census
  scripts snapshotted as `refs/wip/nav-census-collect` =
  b632c00d66c5d2dde4cc519608e1c05cd1c8b294 (parent 1ad04d21a, no src/ change:
  `git diff --stat HEAD b632c00d6 -- src` empty). Run records name this snap
  as `commit` (collect reads the host worktree's HEAD).
- Census unit tests 11/11 green on the controller; a tiny local collect
  (`--command` importing one src file) + merge succeeded (sanity only, no lane).
- `lab fleet` 10:20Z: tv-dator ready, lock free, lock graph 33a94aec85a1
  matches the controller's.

## 2026-11-08T10:25Z host preparation (tv-dator)

- Host lacked 1ad04d21a and e29e295a6; its checkout HEAD b3b366573 is an
  ancestor, so the bundle is `b3b366573..refs/wip/nav-census-collect`
  (289 KB), scp'd to ~/nav-census.bundle, verified, fetched into the host repo
  as refs/wip/nav-census-collect.
- Detached worktree ~/projects/lagrange-census at b632c00d6 (host main
  checkout untouched). Links mirroring placement: node_modules,
  data/examples, data/partitions, tools/alloy-6.2.0,
  tools/alloy-6.2.0-linux-amd64.tar.gz, tools/tla2tools.jar.
- Import graph generated (placement's PROOF_CHECKOUT_GENERATORS step). FINDING:
  it rewrote tracked test/shards/impact-graph-seal.json (sourceDigest,
  producerInputDigest, snapshotDigest) - the snapshot's seal is stale because
  the new census scripts were not sealed. Placement would refuse this commit
  ("generated metadata is stale"). Left regenerated in the host worktree for
  the census runs; the controller worktree is NOT changed - the quest must
  regenerate and commit the seal before landing.
- Launcher ~/census-lane.sh LANE EXPECTED_MIN LOCK_WAIT_S (copy in the
  controller scratchpad): home-lab.md lock recipe (fd 9, flock -w, holder
  record project lagrange / agent claude:nav-census / purpose census:LANE /
  sha b632c00d6), LAGRANGE_TEST_MACHINE_FACTOR=2.0 (placement would give 1.6
  for speed x1.51; raised for V8 coverage overhead, since a test killed on
  timeout loses its coverage), LAGRANGE_LANE_JOBS_CAP=cores-1=11, collect
  run with fd 9 closed. Log ~/census/LANE.log; run dir
  ~/census/b632c00d6/LANE.

## unit lane

- submitted 2026-11-08T10:25:41Z: `setsid nohup sh ~/census-lane.sh unit 45 1800 > ~/census/unit.log`
  (fleet just before: tv-dator ready, free).
- admitted 10:25:41Z (lock taken immediately; holder record observed).
- running 10:25:41Z, collect pid 3289194, launcher shell 3289183,
  "test-files planned=2213".
- terminal: collect finished 11:19:29.579Z (exit 1, signal null, incomplete
  false); digest computed and launcher terminal 11:19:56Z; lock released
  (holder record gone, only machine.lock remains). Duration 53m48s.
  Run id unit-peter-RB102-20261108T102541Z, host peter-RB102 (tv-dator's
  hostname), commit b632c00d6, coverageDigest
  0838ca853d85714b97e44b2ca35ea23e6c98d26890ad0d28688a661d2371d8a1,
  5705 coverage files, 13G.
  2213 files planned; failing files (exit 1 is from these, not from collect):
  - test/scripts/git-invocation-owner.test.js: DEFECT in the census script -
    `scripts/checks/fallback-branch-census.js:141: the git executable named
    outside the owner` (gitHead spawns git directly instead of
    scripts/checks/git-invocation.js). Must be fixed before landing; it does
    not affect collection.
  - test/scripts/change-selection-taxonomy.test.js: `tools/alloy-6.2.0: no
    owning subsystem` - an artifact of my tools/ link (placement declares its
    links in LAGRANGE_WORKSPACE_INJECTIONS; my launcher did not). Launcher
    now exports LAGRANGE_WORKSPACE_INJECTIONS for later lanes.
  - test/query/write-identity-instance.test.js: SIGABRT, exited without status
    (its process's coverage is lost).
  - test/message-group/message-group-native-provisional-route.test.js and
    test/raft/raft-rs-backend/single-path-partition-cutover.test.js: test
    failures (not diagnosed; not census scope).
- collected: rsync to controller scratchpad census-runs/unit started 11:21Z.

## packaging lane

- submitted/admitted/running 2026-11-08T11:20:43Z (fleet: free), shell 3352934,
  collect pid 3352945, 4 files planned.
- terminal: collect 11:20:43.252Z .. 11:21:03.805Z, exit 0, incomplete false,
  4/4 files pass; launcher terminal 11:21:04Z. Run id
  packaging-peter-RB102-20261108T112043Z, coverageDigest
  3122ee547ce2d6c7d7d86998c358a351bb184ca711c7731ec260f0631dee3b98,
  73 coverage files, 227M.

## integration lane
- submitted/admitted/running 2026-11-08T11:22:33Z (fleet: free), shell 3353962,
  collect pid 3353973, 119 files planned, exclusive lane jobs=1.
- collected (packaging): rsync -az to controller scratchpad census-runs/packaging,
  coverage digest recomputed on the controller: MATCH.

## unit lane, collected
- First plain rsync timed out at 30 min (6.6 GB, ~3.7 MB/s link); resumed with
  `rsync -az --partial` (6m35s). Controller copy census-runs/unit: 5705 files,
  13G, coverage digest recomputed on the controller: MATCH (11:57Z).
- terminal (integration): collect 11:22:33.637Z .. 12:28:31.820Z (65m58s), exit 1,
  signal null, incomplete false; launcher terminal 12:28:33Z. Run id
  integration-peter-RB102-20261108T112233Z, coverageDigest
  00ee7c5179288b9137cdd01c21980ea434f87dcc0c85d7189b2ef593aafcb003,
  845 coverage files, 1.6G. 112/119 files pass; failing:
  leader-metadata-validation, managed-split-admission-reliability,
  raft-leader-election, three-node-seed-rebalance,
  lagrange-server-npm-package, multi-node-raft-replication,
  critical-replica-placement-causal-trace (all test/integration/; several are
  on tv-dator's placement avoid list; not diagnosed - census scope is
  coverage, and a failing test still contributes the coverage of processes
  that exited normally).
- 12:29:19Z another agent's placement (lagrange:peter-System-Product-Name:395365,
  test:ordinary, expected 1 min) took tv-dator's lock right after mine was
  released.

## bootstrap lane
- submitted 2026-11-08T12:29:46Z (lock held by the other placement), admitted
  12:31:16Z (waited 90s on flock), running 12:31:16Z: shell 3375041, collect
  pid 3375327, 218 files planned.
- collected (integration): rsync -az to census-runs/integration; digest MATCH
  on the controller.
- terminal (bootstrap): collect 12:31:16.199Z .. 12:42:12.895Z (10m57s), exit 1,
  incomplete false; launcher terminal 12:42:14Z. Run id
  bootstrap-peter-RB102-20261108T123116Z, coverageDigest
  ff48767189de9f26400b065e95dff8a9d64d598f8fe8c82b3888ffc5b0a858c8, 690
  coverage files, 1.9G. 215/218 pass; failing test/bootstrap/:
  cdc-source-occurrence-delivery.integration, fresh-join-registration-runtime-replacement.integration,
  seed-release-failure-custody (not diagnosed).

## formation lane
- prerequisites: `lab doctor` ok (tv-dator docker reachable); the lane is
  formation-health.js -> wait-for-thermal-headroom.js gate -> run-affinity-demo.js
  --formation-only, five LOCAL node processes spawned with {...process.env}
  (so NODE_V8_COVERAGE reaches them; Docker not used). Its CLUSTER_DATA_ROOT
  data/examples/service-data-affinity-demo resolves through the data/examples
  link into the host main checkout's ignored data dir (as placement's links do).
  Nodes are stopped with SIGTERM then SIGKILL after a deadline: a node killed by
  SIGKILL writes no coverage.
- collected (bootstrap): census-runs/bootstrap, digest MATCH on the controller.
- submitted/admitted/running 2026-11-08T12:44:14Z (fleet: free), shell 3381505,
  collect pid 3381516; thermal gate ok (cpu 73C, nvme 55C). The demo archived
  the previous run state of data/examples/service-data-affinity-demo (host
  main checkout's data, through the link) to
  ...-archive/run-2026-11-08T12-44-15-538Z.tar.gz (the demo's own retention).
- terminal: collect 12:44:14.947Z .. 12:48:34.206Z (4m19s), exit 1, signal
  null, incomplete false. Run id formation-peter-RB102-20261108T124414Z,
  coverageDigest a3ce99a6fc236395a429e03bdece0e84474b5beae8d5ce92c431fedc3b0f15de,
  15 coverage files, 29M. Formation verdict FAIL node_ready_lease_incomplete
  (schema admission timed out: snapshot_query_error stale_usable /
  stale_replica_operations_in_flight; windowMs 63461, leaseWaits 270, spreadGap 6),
  trend record in the run dir only (formation-trend.ndjson), report
  test-output/reports/movielens-lagrange-formation-only-live-2026-11-08T12-48-34-123Z.report.json
  in the host census worktree.
- FINDING: the SEED's coverage is missing. Coverage files exist for
  formation-health, the thermal gate, the demo driver and the four joiners
  (pids 3381597-3381600, each with src/index.js); the seed node-0 (pid 3381556)
  wrote none. Its log shows shutdownLogsTablePersistence timedOut at 12:48:22.6Z
  and logging until 12:48:33.9Z, i.e. it was still draining when the demo's
  stop deadline SIGKILLed it. No orphan node remains on the host. collect does
  not mark this run incomplete (the lane itself was not signalled), so a
  seed-only side will read as not executed in this run. Owner decision needed:
  accept, rerun, or mark the run (marking it `incomplete` would turn every
  non-`both` site it contributes to into `unloaded`).
- collected (formation): census-runs/formation, digest MATCH on the controller.

## host cleanup (2026-11-08T12:52Z)
- Host logs and the formation report copied to the controller scratchpad
  census-host-logs/. Then on tv-dator: detached worktree ~/projects/lagrange-census
  removed (+ prune), host ref refs/wip/nav-census-collect deleted,
  ~/nav-census.bundle, ~/census-lane.sh and ~/census (all coverage) removed
  after every controller copy's digest matched. Host main checkout still at
  b3b366573, untouched. ~/.lab holds only machine.lock (no holder record).

## merge (controller, 2026-11-08T12:51Z)
- Local thermal gate ok first (cpu 45C, nvme 68C). Command:
  `node scripts/checks/fallback-branch-census.js merge --runs SCRATCH/census-runs/{unit,packaging,integration,bootstrap,formation} --out SCRATCH/census-merged.json`
  where SCRATCH = /tmp/claude-1000/-mnt-data-peter-projects-lagrange/b57bdb9b-ebd1-4b81-aa6b-3edafb0a0148/scratchpad
- Exit 0, 52.4 s, max RSS 305 MB. Coverage files per run: unit 5705,
  packaging 73, integration 845, bootstrap 690, formation 15. 2034 src files
  loaded (= all 2034 tracked src JS files), 2283960 bytes, sha256
  fb57790e5145653d049f1a09551cf5440ad97916ba3085babffe43c94de76c97.
  Unreadable coverage files: none. No run is marked incomplete.
  Per-lane loaded src files: unit 2030, packaging 1848, integration 1833,
  bootstrap 1801, formation 1800.
- The run dirs (17G) stay in SCRATCH/census-runs for the join, which reads
  each run.json and re-binds it to the merged digests.

## next step (join) - blocked on the detector module
After quest code-navigability-budget-check's scripts/checks/code-navigability-detectors.js
is merged into this branch (and src/ still equals 1ad04d21a's src):
`node scripts/checks/fallback-branch-census.js join --merged SCRATCH/census-merged.json --runs SCRATCH/census-runs/unit SCRATCH/census-runs/packaging SCRATCH/census-runs/integration SCRATCH/census-runs/bootstrap SCRATCH/census-runs/formation`
(writes data/fallback-census/census.json), then the budget probe
`node scripts/checks/code-navigability-budget.js --metric --rows fallback_sites_uncensused`.
Open items before landing: the git-invocation-owner defect in
fallback-branch-census.js:141, the stale test/shards/impact-graph-seal.json,
and the owner decision on the formation run's missing seed coverage.

## 2026-11-08T12:58Z lead decision: formation rerun with a coverage-flush preload
- Worktree fast-forwarded by the lead to 67e0bba0e (stream head 6521d5027 +
  seal); src differs from 1ad04d21a only by 57 added INDEX.md files.
- Demo stop path (run-affinity-demo.js stopNodes): SIGTERM to every node, then
  SIGKILL after ADMIN_QUERY_TIMEOUT_MS; the seed's log shows its shutdown began
  (publishNodeShutdownStatus 12:48:19Z), so it received SIGTERM before SIGKILL.
- New scripts/checks/fallback-branch-census-preload.js, composed by collect into
  NODE_OPTIONS as `--import=file://...` (ESM: the package is type module, so
  --import rather than the --require the lead named). On SIGTERM/SIGINT it
  calls v8.takeCoverage() once; if it is the signal's only listener it removes
  itself and re-raises the signal (default termination preserved), otherwise
  the process's own handler runs as before. beforeExit also flushes. Each
  flush busy-waits past its wall-clock millisecond: measured locally, Node
  names coverage files pid-<epoch ms>-<thread>, a later write (exit write, or
  the one Node makes when the re-raised signal ends the process) holds only
  post-reset counts, and a same-millisecond write REPLACED the full file -
  the first test run lost the SIGTERMed child's main script that way.
  run.json now records coveragePreload {active, option, module, sha256}.
- Defect 1 fixed: gitHead goes through scripts/checks/git-invocation.js execGit.
- Tests: census test 13/13 (new: NODE_OPTIONS composition; a child that ignores
  SIGTERM then is SIGKILLed, and a child with no listener that must still die
  by SIGTERM, both leave coverage of their script), git-invocation-owner green
  (19/19 across both files; the signal test 5/5 repeats).
- test:metadata:refresh regenerated test/shards/{primary,resource,subsystem}-classes.json
  and impact-graph-seal.json.
- Snapshot 2: refs/wip/nav-census-collect-2 = fc29e950688e8f4dc3ed1c2796a932c565fd71b3
  (parent 67e0bba0e), bundle b3b366573..that (482 KB), host worktree
  ~/projects/lagrange-census at fc29e9506, same links; host import graph
  regeneration left the tree clean this time.
- formation rerun: submitted/admitted/running 2026-11-08T12:58:21Z (fleet free),
  shell 3384526, collect pid 3384537, thermal ok (cpu 65C), run dir
  ~/census/fc29e9506/formation.
- terminal (formation rerun): collect 12:58:21.850Z .. 13:02:41.179Z (4m19s),
  exit 1, incomplete false, coveragePreload active (sha256
  9de02c42484f09a1efd89d95553281ffdb9a4c4779dc61830e1c568164645bb0). Run id
  formation-peter-RB102-20261108T125821Z, coverageDigest
  3f2edd12a70bb845061afe63c6cbca5243cf473b9c62e028434ee5726508515c, 23
  coverage files, 40M. Verdict FAIL node_ready_lease_incomplete again
  (windowMs 63623, leaseWaits 326, spreadGap 4).
  SEED FLUSHED: seed pid 3384576 (node-0) has coverage-3384576-1794142946406-0.json
  (6.37 MB, src/index.js), written at SIGTERM; it then wrote no exit file
  (still draining - shutdownLogsTablePersistence - when SIGKILLed). The four
  joiners each have a SIGTERM flush file plus their normal exit files.
- collected: census-runs/formation-2 on the controller, digest MATCH; log
  census-host-logs/formation-2.log and the live report copied. Host cleaned
  again (worktree, refs/wip/nav-census-collect-2, bundle, launcher, ~/census);
  ~/.lab holds only machine.lock; host checkout still b3b366573.
- The first formation run (formation-peter-RB102-20261108T124414Z, no seed
  coverage) is superseded and NOT in the merge; its copy stays in the
  scratchpad census-runs/formation.

## merge 2 (controller, 13:09Z)
- runs unit, packaging, integration, bootstrap, formation-2; exit 0, 52.5 s;
  coverage files 5705/73/845/690/23; 2034 src files loaded; 2292754 bytes;
  sha256 765f22f84f715adf223014c22527c6d38b94b989ae06e64e4656437e135dda48;
  no unreadable files.

## join (controller, 13:10Z, worktree HEAD 67e0bba0e)
- `join --merged SCRATCH/census-merged.json --runs SCRATCH/census-runs/{unit,packaging,integration,bootstrap,formation-2}`
  exit 0 -> data/fallback-census/census.json (1818162 bytes, sha256
  7311b26c53ee49183cf5e91670ea5420d0f8624c95e21886a10bcd88cb82387b).
- 2803 sites: never 158, primary-only 1201, fallback-only 41, both 1403,
  unloaded 0. Per row: catch_returns_default never 14 / primary-only 232 /
  both 141; two_source_fallback_reads never 122 / primary-only 769 / both 898;
  typeof_dual_paths never 22 / primary-only 200 / fallback-only 41 / both 364.
- `code-navigability-budget.js --metric --rows fallback_sites_uncensused` -> 0.
- `solve.js probe --id fallback-branch-coverage-census` -> metric 0 target 0
  done=true measuring=true (seal-time metric 1).
- data/ is gitignored except listed evidence; .gitignore gains the
  data/fallback-census/census.json exception (same shape as data/storage-load).
- After the formation rerun, collectRun was split (freshRunDirectory,
  runLaneProcess) to clear the scoped complexity ratchet (13 > 12). Behaviour
  is unchanged (same env, argv, record); the preload module is byte-identical
  to the one the rerun recorded (sha256 9de02c42...).

## 2026-11-08T13:50Z verification REJECT (B1 lost witnesses, B2 per-run sides) -> pipeline fix + full re-collection
- Lead decision: fix the pipeline, re-collect all five lanes. Implemented:
  - preload (scripts/checks/fallback-branch-census-preload.js): start marker
    witness-<pid>-<threadId>.json per thread at load, coverage flush every
    FLUSH_INTERVAL_MS = 10 s (constants module; test override
    LAGRANGE_CENSUS_FLUSH_INTERVAL_MS), end marker witness-<pid>-<tid>-exit.json
    on `exit` or right before a re-raised signal. Experiment (node 22.23.2):
    NODE_OPTIONS --import runs in file-backed worker threads (argv[1] = the
    worker script) but NOT in `new Worker(code, {eval: true})` threads (gap,
    documented). A worker torn down by its process's orderly exit, or by
    terminate(), writes its coverage but runs no `exit` listener; so a worker
    without its own end marker counts complete only when its main thread ended
    by `exit` (a worker terminated earlier in a process that later died is
    over-counted as lost - never an acquittal).
  - scripts/checks/fallback-branch-census-witnesses.js: accounting
    (started/complete/lost with pid, thread, ppid, entry, cwd, startedAt,
    isMainThread, lastFlushAt, cause unknown). run.json gains `witnesses`;
    `incomplete` keeps meaning the lane process was signalled.
  - merge: markers are digested, not folded; merged.witnesses[run] lists lost
    witnesses with `seenFiles` (repository paths their surviving coverage names).
  - join: closure of each lost witness = sealed import graph
    (helper-import-closure.js loadSealedImporters) forward closure of its entry
    path + seenFiles; a never/primary-only/fallback-only site whose file is in
    a closure, in a run whose tree held the file at its current digest, becomes
    `unobserved` with `lostWitnesses: [run:pid:thread]`; records gain
    `sidesByRun`; census.runs gain witness counts.
  - CENSUS_SCHEMA NOT bumped: the landed budget accepts only
    'fallback-census/1' (readCensus `schema === CENSUS_SCHEMA`); a bump would
    make the budget read no census at all. The new fields and the new class are
    additive and the budget already treats any non-executed class as
    uncensused (budget test 'unloaded, unknown and empty classes census
    nothing', 17/17). A test pins census schema == the budget's constant.
  - tests: census 21 + git-invocation-owner -> 25/25 (new: witness accounting
    rules, per-thread markers with a worker, periodic flush union == single
    write, merge lost seenFiles, closure voiding / unobserved / both stands /
    drifted run cannot void, schema pin, sidesByRun).
- Snapshot 3: refs/wip/nav-census-collect-3 = 47b8bffa99a8175cec595d176637588b38a6d9dd
  (parent 67e0bba0e; includes the lead's staged epic/log changes), bundle from
  b3b366573, host worktree ~/projects/lagrange-census, links as before,
  import graph regeneration clean, host pid_max 4194304.
- Chain ~/census-chain.sh runs ~/census-lane.sh for unit(60) packaging(5)
  integration(75) bootstrap(20) formation(10) in sequence, each taking and
  releasing the lock itself, lock wait 3600 s, logs ~/census/<lane>.log, chain
  log ~/census/chain.log, run dirs ~/census/47b8bffa9/<lane>.
- 13:53Z: tv-dator was BUSY (claude:nav-readiness, test:..., since 13:51:04Z,
  expected 49 min). First chain (1800 s wait) killed while still waiting on
  flock (nothing ran); restarted 13:53:48Z with a 3600 s wait: unit submitted,
  queued on the lock.

## collection 3 (snapshot 47b8bffa9) - SUPERSEDED: the preload perturbed exit semantics
- Chain ran 14:53:36Z (lock admitted after the other agent's run) .. 17:01:31Z.
  Runs (exit, coverage digest, witnesses started/complete/lost, files, size):
  unit-peter-RB102-20261108T145336Z 1 d9dbf82f...616d 3352/3340/12 15867 21G;
  packaging-...T154553Z 0 39418e9b...96cd 32/32/0 125 236M;
  integration-...T154614Z 1 d212f7a3...b514 555/536/19 2814 4.0G;
  bootstrap-...T164725Z 1 4ff0849c...192f35 373/370/3 1743 3.1G;
  formation-...T165718Z 1 f876d318...31e5 18/15/3 176 180M.
  Their run.json and logs are kept on tv-dator in ~/census/superseded-47b8bffa9/;
  the coverage was deleted (never merged).
- DEFECT found in the unit lane: new failures test/scripts/proof-checkout-preparation.test.js
  ("a producer killed by a signal is named as killed": exit 0), test-placement
  ("an aborted lab shard cleans up before it is cut"), the census test's own
  NODE_OPTIONS assertion, admin-websocket-api-control-snapshot-query.
  Reproduced: `process.kill(process.pid, 'SIGTERM')` then return exits 0 under
  the preload (143 without) - ANY signal listener replaces the default action
  and Node drops a signal still pending when the loop empties. The preload's
  unconditional SIGTERM/SIGINT listener changed exit semantics.
- Fix (snapshot 4): the preload listens for SIGTERM/SIGINT only while the
  process itself has a listener for it (newListener/removeListener follow);
  a process the default action ends is a lost witness (periodic flushes
  survive). The signal re-raise path and its end marker are gone. Tests: census
  21, + git-invocation-owner + proof-checkout-preparation 31/31 x4; under the
  preload locally test-placement 26/26, admin-websocket-api-control-snapshot-query
  56/56, proof-checkout-preparation 5/5.

## collection 4 (snapshot 1968c3e5e47b464a48cdde48668463c7652ee474)
- refs/wip/nav-census-collect-4 (parent 67e0bba0e), bundle from b3b366573;
  host worktree re-created at it (old worktree + refs/wip/nav-census-collect-3
  + bundle 3 removed), import graph regeneration clean, fleet free.
- Chain started; run dirs ~/census/1968c3e5e/<lane>.
- Collection 4 results (all lanes admitted at once except as noted; signal null,
  incomplete false everywhere; digests re-verified on the controller: MATCH):
  unit-peter-RB102-20261108T171118Z 17:11:18Z..18:02:26Z exit 1, 56ebf092173cd272d9a2b64c9d5c5abeaac4506dd5a5f8d6a12abb1a969d55a5,
    witnesses 3349/3334/15, 15836 files, 21G; failing files back to the
    baseline three (message-group-native-provisional-route, write-identity-instance
    SIGABRT, single-path-partition-cutover): no preload perturbation left.
  packaging-...T180310Z 18:03:10Z..18:03:31Z exit 0, bbb5a5613a12a12ffb3393b55a86046fd83980e6f983442132605613369fc548, 32/32/0, 125, 244M.
  integration-...T180332Z 18:03:32Z..19:01:58Z exit 1, 59ff1ebda1d0a58e38b69accce34eec81eb16669286fe8a7ab9a5d8577b294e8, 554/532/22, 2773, 3.9G.
  bootstrap-...T190207Z 19:02:07Z..19:12:05Z exit 1, 9d1d4513cd5614ea97f8eb21573f4b52f85422fbbde71f0724a1c3547fa40f8c, 377/377/0, 1754, 3.0G.
  formation-...T191208Z 19:12:08Z..19:16:27Z exit 1, 31dac71d9b7fc2504cc7776b5f6cd2b471a31e2fa27b6e569b3da9d7d03d805c, 18/15/3, 181, 181M.
- Host cleaned (worktree, refs/wip/nav-census-collect-4, bundle, launcher, chain,
  ~/census incl. superseded run.jsons, after copying logs to the controller
  scratchpad census-host-logs4/); ~/.lab holds only machine.lock; host checkout b3b366573.
- CONCURRENT CHANGE: while collection 4 ran, the 17:45Z quest attempt
  (roster-reconciled-witnesses) rewrote the preload, witnesses module, census
  script, run-test-files.js and formation-health.js in this worktree. Collection
  4 carries snapshot-4 markers only (no rosters). A merge with the current tree's
  code over collection 4 counted 2430 marker-less thread-1 coverage writers in
  unit as lost (scratchpad census-merged-current-code-mixed.json, NOT used).
  The consistent numbers below come from snapshot 4's own code (git archive of
  refs/wip/nav-census-collect-4 into the scratchpad, import graph regenerated,
  joined through the module API at head 1968c3e5e). data/fallback-census/census.json
  was NOT rewritten (it would not be the product of this tree's code).
- Merge (snapshot-4 code): exit 0, coverage files 9405/87/1919/1096/156, 2034 src
  files, 2976226 bytes, sha256 e180d8aa9e1ddf2cf140888ff5e403fde35736b58ef4dfbaadfd453cf0088e98.
- Join (snapshot-4 code): 2803 sites: never 15, primary-only 78, fallback-only 2,
  both 1401, unobserved 1307, unloaded 0. Rows: catch_returns_default never 3 /
  primary-only 16 / both 139 / unobserved 229; two_source_fallback_reads never 10
  / primary-only 58 / both 899 / unobserved 822; typeof_dual_paths never 2 /
  primary-only 4 / fallback-only 2 / both 363 / unobserved 256. File
  census-snap4.json 4170219 bytes sha256 0fa2be66777c1793eec1aacebe3b6e6aec885d2cdf1d33924d00c8a230b87e15.
- Lost witnesses by cause (40): sigabrt-test 1 (unit write-identity-instance,
  closure seeds 1078 files); deliberate-kill-test 12 mains in integration
  (learner-process-loss-worker x3, embedded-node-worker x3, seed-migration-cutover-persisted
  x2, opening-history-process-child x2, service-consensus-creation-recovery-child x2);
  formation-seed 1 (src/index.js, SIGKILLed after its drain overran); worker
  threads 12 (piscina workers of those killed processes; entry in node_modules,
  no coverage: empty closures); other 14 (unit test fixtures running copies of
  scripts under /tmp or `--local-corpus` argv: entries outside the root, no
  repo coverage: empty closures).
- Unobserved by cause: every one of the 1307 sites is voided by BOTH a
  deliberate-kill test witness AND the formation seed (both load ~1797 repo
  files); 730 also by the SIGABRT test. No site has a single cause: removing one
  cause alone acquits nothing. Surviving sides of the 1307: primary-only 1124,
  never 144, fallback-only 39.
- Budget (by its rule: only never/primary-only/fallback-only/both census a site)
  fallback_sites_uncensused would read 1307 for this census; never 15,
  only-fallback 2, both 1401 (unclassified). Not measured with the committed
  census, which is unchanged.

## routing (R17)
- test/query/write-identity-instance.test.js dies by SIGABRT ("process received
  SIGABRT; exited without a status") in every unit collection on tv-dator:
  query owner.
- The deliberate process-loss tests (learner-process-loss, seed-migration
  process-loss / interrupted-decision via seed-migration-cutover-persisted,
  the embedded-node-worker kills, raft-rs opening-history process child,
  service-consensus-creation-recovery) cannot be observed past their kill by
  design: distributed-harness owner; a targeted witness is the only way to
  prove their closures' sides.
- The formation seed is SIGKILLed when its shutdown drain (shutdownLogsTablePersistence
  timedOut) overruns the demo's stop deadline: formation/demo owner.

## 2026-11-08 round 3: eliminating the losses

Owner decision (quest log `finding` kind `decision`, 19:35Z): eliminate the
coverage losses and re-collect; `unobserved` stays the honest accounting of a
residual and is never a licence to delete. The concurrent roster /
hasUnboundedClosure attempts are not part of this candidate; their patch
(scratchpad other-system-roster-unstaged.patch) was neither applied nor used.
No foreign edits appeared in the worktree during round 3.

### Causes and mechanisms (collection 4's 40 lost witnesses)

1. Deliberately killed integration processes (12 mains + their piscina
   workers). Mechanism: the pre-kill flush.
   - Preload (scripts/checks/fallback-branch-census-preload.js): the main
     thread listens for SIGURG (default action: ignore, so a child without
     the preload is untouched; grep finds no SIGURG/SIGWINCH use in src,
     test or scripts; SIGUSR2 was rejected: src/diagnostics/formation-attribution-window.js
     uses it as its "formed" signal). On SIGURG it reads
     `witness-<pid>-0-flush-request.json` {id, signal}, takes coverage, posts
     {id, final} on the BroadcastChannel `lagrange-census-flush` every
     preloaded thread opens (unref'd), waits up to 1.5 s for the live workers
     it created (tracked through process 'worker' events; threadId captured
     at creation, it reads -1 after exit) to write
     `witness-<pid>-<tid>-flushed.json` {id}, then writes its own
     acknowledgement {id, final, ackedThreads, unackedThreads}. The flush is
     FINAL when the coming signal ends the process without running its JS
     (SIGKILL, or SIGTERM/SIGINT/SIGHUP/SIGQUIT with no listener of the
     process's own); then each acknowledging thread freezes in Atomics.wait
     until the kill lands (bound 30 s, after which it deletes its
     acknowledgement and runs on). A flush before a signal the process
     handles itself is not final: nothing freezes, its handler runs.
     A self-kill emits the in-process event `lagrange:census-flush-before-kill`
     (workers freeze, the caller's kill follows in the same stack).
   - Harness (test/test-helpers/census-pre-kill-flush.js,
     `flushCoverageBeforeKill(pid, signal)`): returns false at once unless
     `LAGRANGE_CENSUS_COVERAGE_DIR` (set only by `collect`) is set; never
     signals a pid without a start marker (waits up to 1 s for a starting
     child's preload to write it); waits synchronously (no test event runs in
     between) up to 5 s for the acknowledgement; the caller then kills exactly
     as before.
   - Kill sites (test/ only): message-group-learner-process-loss
     (killOwnedGroup), embedded-cluster-harness stopNode (before SIGTERM and
     before SIGKILL), seed-migration-process-loss and
     seed-migration-interrupted-decision (main and cleanup kills),
     opening-history-process-child (self-kill, in-process),
     service-consensus-creation-recovery (main and teardown kills),
     local-corpus / publish-head (`node -e` sleepers: teardown kills and the
     two supersede kills done by the code under test).
   - Found while proving it: (a) piscina's idle workers block in
     Atomics.wait between tasks (its default useAtomics), so no flush
     interval or flush request ever reached them (collection 4: their
     coverage files never existed). `collect` now sets piscina's own switch
     `PISCINA_DISABLE_ATOMICS=1`: idle workers wait on their event loop.
     (b) service-consensus-creation-recovery-child held its "interrupted"
     state with a bare pending Promise and an unref'd IPC channel, so the
     child exits 13 by itself unless the SIGKILL lands first: a latent race
     any delay before the kill loses (it lost to the flush on the first
     try). The child now holds itself with an interval timer (the learner
     worker already does the same for the same reason). Test-side fix.
   - Accounting (witnesses module): a thread is complete by its end marker,
     by its main thread's orderly exit (workers), or by a standing FINAL
     flush acknowledgement (a worker's only together with its main's
     acknowledgement of the same request). The predecessor's rule "a process
     ended by the default action is lost" is now "lost unless it acknowledged
     a final pre-kill flush". A lost witness asked to flush is cause
     `pre-kill-flush-unanswered`. run.json/merged/census.runs carry
     `flushed` (complete by flush) counts.
2. Formation seed SIGKILLed by run-affinity-demo stopNodes after its 15 s
   deadline. The demo's deadline is now configurable
   (`LAGRANGE_AFFINITY_DEMO_STOP_DEADLINE_MS`, default unchanged 15000; epic
   `authorizes` widened to that one file, R16 recorded); `collect` sets it to
   300000 for the formation lane; a node still SIGKILLed prints
   `FORCED STOP: node-N ...` on stderr, and `collect` writes a run.json
   `problems` entry and exits 1 for any lost formation main whose entry is
   src/index.js.
3. SIGABRT in test/query/write-identity-instance.test.js: NOT a src defect.
   It is V8 heap OOM inside the coverage write itself (host stack:
   node::profiler::V8CoverageConnection::WriteProfile -> JSON::Parse ->
   FatalProcessOutOfMemory at ~490 MB): scripts/run-test-files.js runs every
   test process with --max-old-space-size=512, and coverage parsing adds to
   the heap. Reproduced locally (runner + coverage + preload: SIGABRT at
   116 s); the same runner without coverage passes (17/17, 267 s); with
   coverage and the heap raised it passes (17/17, 276 s, both witnesses
   complete). Fix (apparatus): the runner honours
   `LAGRANGE_TEST_MAX_OLD_SPACE_MB` (testNodeArgs; only the heap flag
   changes) and `collect` sets 2048. No fix-quest needed; nothing routed.
4. Unit fixture processes outside the root (14): `external` class. A lost
   witness whose entry script and cwd are absolute paths outside every run
   root and whose surviving coverage names no repository file is moved to
   `external` (counted, voids nothing). The `--local-corpus` sleepers are
   `node -e` processes inside the root (argv[1] is not a file): they are not
   external; they are now flushed before every kill instead. A lost worker
   thread's closure now also starts from its process's main entry (a
   piscina worker's own entry is node_modules, its closure was empty).
   - Later in round 3 (before collection 5 data were joined, after the
     snapshot ran): the external rule ignores the census preload's own two
     files in `seenFiles` (collect loads the preload into every process from
     the root, so a /tmp copy "sees" it). The merge, which is the
     authoritative accounting, applies it; unit's run.json (written by the
     snapshot) still counts that proof-checkout process as lost (2 lost / 7
     external there, 1 / 8 in the merge).
5. Found during round 3 and eliminated (see 1): piscina Atomics idling;
   the service-consensus child's hold race; `node -e` sleepers killed by the
   supersede path of scripts/publish-head.js (the tests now flush the child
   right before calling the code that SIGTERMs it); a child killed before its
   preload wrote the start marker (the helper waits up to 1 s for it).
   Remaining, voiding nothing: test/scripts/__fixtures__/run-test-files/hangs.fixture.mjs,
   killed by scripts/run-test-files.js's timeout in that runner's own test
   (it imports only node:test; its static closure holds no src file).
   Unmarked threads: every pre-kill acknowledgement lists the live threads
   that did not answer; the only ones in collection 5 (6, one per learner
   writer and embedded node process) are Node's module-customization hooks
   thread (`InternalWorker`), started by the runner's
   `--import=@tapjs/mock/import` that fork() passes on through execArgv: it
   runs only the loader hooks under node_modules, never repository code, runs
   no `--import` preload, and is not a witness. It costs each such kill the
   1.5 s worker-ack bound while the child is frozen (semantics unchanged).

### Witness tests (test/scripts/fallback-branch-census.test.js, 29/29)
- `a pre-kill flush completes a killed child and its worker; the kill is
  unchanged`: SIGKILL, SIGTERM without a handler (both final, main + worker
  acknowledged, both scripts in the coverage), SIGTERM with a handler (not
  final, handler runs, exit 0); 7 started / 7 complete / 4 flushed.
- `a child that cannot answer is killed anyway and stays lost; no preload, no
  signal`: a blocked child times out (400 ms bound), dies by SIGKILL, both its
  threads lost with `pre-kill-flush-unanswered`, the worker names its
  process entry; an uninstrumented child gets no request file, no signal.
- `outside a census collection the pre-kill flush sends nothing and waits for
  nothing`; `a process that kills itself flushes in-process first and is
  complete`.
- `witness accounting: only a standing final flush acknowledgement completes a
  killed thread` (same-request rule, non-final, withdrawn/unanswered).
- `a lost witness outside the repository is external and voids nothing`
  (/tmp copy, a copy that sees only the preload: external; a copy whose
  coverage names src: lost; `node -e` in the root: lost, voids nothing).
- `a lost worker is bounded from its process entry as well as its own`.
- `the formation lane gets the demo stop deadline and fails loudly on a lost
  node` (laneEnvironment, laneProblems, env names pinned to the demo's and
  the runner's exports); `the demo waits its configured stop deadline, then
  SIGKILLs and says so` (stopNodes with fake nodes).
- run-test-files.test.js: `raises only the heap bound, and only for a
  positive integer census value`.
- Local census-mode runs of the touched integration tests (controller,
  thermal-gated): learner process-loss, runtime-opening-history,
  service-consensus-creation-recovery, seed-migration process-loss and
  interrupted-decision, public-application-database-multinode (one
  180 s timeout failure under local load, passed on rerun 47 s; passes
  without census in 36 s), local-corpus, publish-head: all pass, 0 lost.

### Collection 5 (snapshot refs/wip/nav-census-collect-5 = 75e049e5f754da399e4b09987761ffa3eadd8b1e)
- Parent 67e0bba0e; `git diff 75e049e5f -- src` empty. Bundle from
  b3b366573 (683 KB), host worktree ~/projects/lagrange-census, links as
  before, import graph regenerated on the host. Chain ~/census-chain.sh
  (lock wait 3600 s, formation expected 15 min), lane launcher as before with
  the new snapshot. Fleet 20:11Z: tv-dator free. Preload sha256 prefix
  aef5af2c17b4 in every run.json (= the staged preload).
- Runs (all signal null, incomplete false, problems [], digests recomputed on
  the controller: MATCH; witnesses started/complete/flushed/lost/external as
  run.json records them):
  - unit-peter-RB102-20261108T201220Z 20:12:20Z..21:06:05Z exit 1,
    e15778b895161b7a1cc4e4fbf4c10dda69fc988705770ead245b55e60eb50fa1,
    3346/3337/7/2/7, 15852 files, 21G. Failing files (not census scope):
    public-path-scale-and-failure-certification (Q11 RT2),
    message-group-native-provisional-route, check-operation-dispatch-completion-owner
    (timeout), single-path-partition-cutover. write-identity-instance PASSED
    (no SIGABRT).
  - packaging-peter-RB102-20261108T210654Z exit 0,
    4962a139e384d8ae2605070a60ff813d0780803b1d65ffcf7b0222e380bb2f05, 32/32/0/0/0, 132 files.
  - integration-peter-RB102-20261108T210728Z 21:07:28Z..22:07:07Z exit 1,
    661199001a1dc87a4446bdb88f0e6b8c274c5621830b54eadd3f40f01fabc8d4,
    555/555/22/0/0, 3249 files, 4.4G. Pre-kill acknowledgements (all final):
    embedded-node-worker x3 (SIGTERM, 2 piscina workers acked each),
    seed-migration-cutover-persisted x2 (SIGKILL, 2 workers acked each),
    opening-history-process-child x2 (self-kill), service-consensus-creation-recovery-child x2,
    learner-process-loss-worker x3. Failing files (not census scope, a
    failing test still contributes complete coverage): leader-metadata-validation,
    managed-split-admission-reliability, message-group-fresh-identity-replacement,
    raft-leader-election, three-node-seed-rebalance, lagrange-server-npm-package.
  - bootstrap-peter-RB102-20261108T220716Z exit 1,
    cce39c4aba5903ea8f430d23298ee86184d492e5819e2ad7134fa654ef7b002f, 374/374/0/0/0, 1874 files, 3.2G.
  - formation-peter-RB102-20261108T221856Z 22:18:56Z..22:23:54Z exit 1
    (verdict FAIL node_ready_lease_incomplete, windowMs 72068, leaseWaits 192,
    spreadGap 5), cddda03fcae049c5ad95b45cd0d0a51702e0bbcd6a54a222e3137f5733ba5823,
    18/18/0/0/0, 410 files. No FORCED STOP: the seed exited by itself, its
    two piscina workers complete through its orderly exit.
- Copies: scratchpad census-runs5/<lane>; host logs census-host-logs5/
  (lane logs, chain.log, seed-drain-steps.ndjson). Host cleaned (worktree,
  refs/wip/nav-census-collect-5, bundle, launcher, chain, ~/census); ~/.lab
  holds only machine.lock; host checkout b3b366573.

### Merge and join (controller, worktree HEAD 67e0bba0e, staged tree)
- merge: exit 0, 80.8 s, max RSS 299 MB, coverage files 9409/94/2361/1219/384,
  2034 src files loaded, scratchpad census-merged5.json 2296723 bytes sha256
  7c229b523f7663a0aa0876c9707931b0b989a6ebcb9e9698ca648db37798ee74, no
  unreadable file. Merged witnesses: unit 3346/3337/7 lost 1 (hangs.fixture)
  external 8; packaging, integration, bootstrap, formation: 0 lost, 0 external.
- join -> data/fallback-census/census.json, 3467140 bytes, sha256
  d54adc6f75fc50f7a4b95c46cf12a6ade90ed5de98615b518096ea2051387581.
  2803 sites: never 162, primary-only 1201, fallback-only 41, both 1399,
  unobserved 0, unloaded 0. Rows: catch_returns_default never 14 /
  primary-only 232 / both 141; two_source_fallback_reads never 126 /
  primary-only 768 / both 895; typeof_dual_paths never 22 / primary-only 201
  / fallback-only 41 / both 363. No record carries `lostWitnesses`.
- `code-navigability-budget.js --metric --rows fallback_sites_uncensused` -> 0;
  `solve.js probe --id fallback-branch-coverage-census` -> metric 0 target 0
  done=true.
- Residual by cause: none. The one lost witness (hangs fixture) voids 0
  sites; the 8 external void nothing by definition.

### R17 routings
- Formation/demo owner: the seed's SIGTERM drain takes 44.7 s
  (`total_clean_drain` elapsedMs 44733; `shutdownLogsTablePersistence`
  timedOut at 3 s; publishNodeShutdownStatus 22:23:09.784Z, drain end
  22:23:54.359Z, host log census-host-logs5/seed-drain-steps.ndjson) against
  the demo's default 15 s stop deadline, so every ordinary demo/formation run
  SIGKILLs a seed mid-drain. A shutdown that overruns its driver's deadline is
  that owner's defect; the census only lengthens the deadline in its own lane.
- SIGABRT of write-identity-instance: not a src defect (V8 OOM inside the
  coverage write under the runner's 512 MB heap); fixed in the apparatus,
  nothing to route.
- Test/harness owner (informational): service-consensus-creation-recovery-child
  held its interrupted state with a bare pending Promise (race with its own
  exit 13); fixed test-side here.

### Verifier's model (what to re-derive independently)
1. The pre-kill flush does not alter the tested semantics: outside collect
   the helper returns before any side effect (env gate; NODE_V8_COVERAGE
   alone does not arm it); SIGURG's default action is ignore and no
   repository/Node/libuv code listens for it; the flush listener replaces only
   that ignore; a final flush freezes every acknowledging thread so no JS
   runs between flush and kill (kill semantics: SIGKILL / default-action
   SIGTERM still end the child, exit code/signal unchanged - asserted by
   every touched test's own exit assertions and by the census test); a
   non-final flush lets the child's own handler run. The two test-side
   changes beyond the flush calls (service child hold timer; flush before the
   publish-head supersede calls) and the two environment switches
   (PISCINA_DISABLE_ATOMICS=1, LAGRANGE_TEST_MAX_OLD_SPACE_MB=2048) are census
   lane-only.
2. Acked-then-killed witnesses are complete: a FINAL acknowledgement is
   written after takeCoverage (main) / after takeCoverage on the worker's own
   thread, the thread then cannot run JS until killed, and a thread whose
   freeze bound expired deletes its acknowledgement; a worker counts only
   with its main thread's acknowledgement of the same request id.
3. External witnesses void nothing: entry and cwd outside every root, no
   repository file in surviving coverage except the census preload; their
   files under /tmp are copies, never the run's src.
4. The numbers: recompute the five coverage digests, merge
   (census-merged5.json sha above), join (census.json sha above), the class
   and row counts, 0 unobserved, and the probe.

## round 4 (repair after verification REJECT)

Verdict (2026-11-09, scratchpad verify-census-r3/verdict.md): REJECT on B1
(the end marker precedes the final coverage write) and B2 (four guards
without a killing witness); non-blocking N1-N7. Code and tests only; no
re-collection, no lab. The collection-5 data meet the stricter rule.

### Fixes
- B1 (scripts/checks/fallback-branch-census-witnesses.js). A thread is
  complete by its end marker only when a coverage file of that thread was
  written at or after the marker. Order on one clock: the marker's `at`
  (Date.now) against the coverage file name's wall-clock millisecond
  (`writtenAtMs >= at`; the preload's flushes wait out their millisecond,
  so a flush before the marker always has a smaller name). A marker with
  no usable `at` (N5's `{}` markers) is ordered by modification time, the
  marker's against the coverage file's (same kernel clock); only a
  strictly later file counts, a tie is lost. That fallback needs run
  directories copied with mtimes (census-runs5 has them: the four `{}`
  markers' final writes are 3-10 ms later by mtime). A worker completes by
  its main thread's orderly exit only when that main is itself complete by
  this rule. A thread with an end marker never completes by a flush
  acknowledgement (it ran JS after it). New lost cause
  `final-write-missing`. Header and preload header state the order.
- N5 (preload). Markers are built by `markerText` from the body's own
  primitive fields (arrays element by element), with JSON.stringify,
  Object.keys, Date.now, Date, Date.prototype.toISOString,
  fs.writeFileSync/readFileSync/unlinkSync, path.join and v8.takeCoverage
  captured when the preload loads (before any code of the process). A fake
  Date.now can no longer stall the flush's millisecond wait either.
- N1. Preload header: processes that drop the preload from NODE_OPTIONS
  while keeping NODE_V8_COVERAGE write no marker and are outside the
  accounting. Known sources (grep of NODE_OPTIONS in test/, scripts/, src/,
  examples/): test/bootstrap/run-anchored-scenario-helper.js and
  test/packaging/sea-bundle-smoke.test.js delete it;
  test/release/runtime-entry-link.test.js and
  test/scripts/change-proof-subsystem-participant-safety.test.js blank it.
  None is killed on a passing path (verifier's kill-site census); every
  marker-less writer in collection 5 wrote orderly-exit coverage.
- N3. The hold timer in test/service/service-consensus-creation-recovery-child.js
  stays unconditional, and the round-3 verifier's-model sentence calling it
  census-lane-only is corrected here: it is an unconditional test-side race
  fix. Without it the child holds its interrupted state with a bare pending
  Promise and an unref'd IPC channel, so its event loop empties and it exits
  13 (unsettled top-level await) unless the parent's SIGKILL lands first.
  The parent always SIGKILLs it (main and teardown), so the timer changes
  nothing a passing run observes; gating it on census mode would keep a
  known race in ordinary runs and add an environment branch to a fixture.
- N4. The epic's first 2026-11-08 bullet now says 162 / 1201 / 41 / 1399,
  0 unobserved.
- N2 (not done here, for the lead): the SIGABRT was not routed to the query
  owner as the 19:35Z decision said; the reason (not a src defect: V8 OOM
  under the 512 MB runner heap with coverage) belongs in the quest log.
- The B1 witness kills the process from ANOTHER process inside its later
  `exit` listener, not with process.abort(): same death after the marker
  and before the final write, without a core dump per test run (this
  host's core_pattern pipes to systemd-coredump regardless of ulimit). Not
  `process.kill(process.pid)` either: Node's process._kill runs the at-exit
  hooks (the coverage write) before signalling itself - measured, the
  self-kill left a post-marker file holding the exit-listener code.

### New witnesses (test/scripts/fallback-branch-census.test.js, 33/33)
- 30 `a process that dies after its end marker is lost and voids its sites`
  (collectRun, a src file whose `o.a || o.b` runs only in a later exit
  listener; lost with `final-write-missing`; the join classifies the site
  `unobserved` naming the witness, not `never`).
- 31 `witness accounting: an end marker completes only with a coverage
  write at or after it` (same-millisecond write, before-only writes and the
  worker of such a process, a worker's own marker, `{}` markers by mtime:
  later / earlier / tie).
- 32 `a thread that acknowledged a final flush runs no JavaScript before the
  kill` (main and worker tick into files every 5 ms; ack, 300 ms held kill,
  ticks unchanged on both; 3/3 complete, 2 flushed).
- 33 `markers are written in full whatever the process did to the globals`.
- 26 extended: entry in the repository with cwd outside -> lost; `node -e`
  (argv[1] `--local-corpus`) with cwd outside -> lost.
- 23 rewritten: a live child under NODE_V8_COVERAGE + the census preload
  (start marker present) gets no request and no wait (< 50 ms) when only
  NODE_V8_COVERAGE is set, and answers (true) once
  LAGRANGE_CENSUS_COVERAGE_DIR is set. pid 1 is gone.
- 14 and 27 fixtures carry `at` and a final write.

### Mutation table (scratchpad census-r4/mutate.py, logs census-r4/mutations/)
Each mutation applied alone to the worktree file, the census test file run,
the file restored (sha256 of the four touched files re-checked after: all
equal). All 26 killed.

| mutation | killed by test(s) |
| --- | --- |
| MA1 SIGURG listener does not flush | 21, 23, 32 |
| MA2 ack without takeCoverage | 21 |
| MA3 no freeze after a final flush (main) | 32 |
| MA4 no freeze after a final flush (worker) | 32 |
| MA5 final ignores the process's own listener | 21 |
| MA6 no worker wait | 21 |
| MB1 harness no-op | 21, 22, 23, 24, 32 |
| MB2 harness does not wait for the ack | 21, 22, 23, 32 |
| MB3 harness armed by NODE_V8_COVERAGE | 23 |
| MC1 every main complete | 13, 14, 17, 18, 22, 25, 26 |
| MC2 non-final ack completes | 25 |
| MC3 worker request id unmatched | 25 |
| MC4 worker ack without the main's | 25 |
| MD1 external without the cwd check | 27 |
| MD2 external without the entry check | 26 |
| MD3 external without the seen-files check | 26 |
| MD4 non-path entry counts outside | 26 |
| ME1 end marker alone completes (B1 reverted) | 30, 31 |
| ME2 worker by main exit ignores the main's final write | 31 |
| ME3 `at` comparison tolerates 5 ms before | 30, 31 |
| ME4 marker without `at` trusted | 31 |
| ME5 mtime tie counts | 31 |
| ME6 marker without `at` read by name millisecond | 31 |
| MF1 marker via JSON.stringify(body) | 33 |
| MF2 `at` via the live Date | 33 |
| MF3 fields via the live JSON.stringify | 33 |

MF3 is killed through the patched global JSON.stringify; the array path
(Array.prototype.toJSON) appears only in flush acknowledgements and has no
separate witness.

### Re-merge and re-join (collection 5, repaired code)
- merge over census-runs5/{unit,packaging,integration,bootstrap,formation}:
  exit 0, 1:25.8, max RSS 307 MB, scratchpad census-r4/merged-r4.json. Every
  key but `generatedAt` equals census-merged5.json (schema, runs, processes,
  unreadable, witnesses, files). Witnesses unchanged: unit 3346/3337/7
  lost 1 (pid 3613658, hangs fixture, `unknown`) external 8; packaging
  32/32/0/0/0; integration 555/555/22/0/0; bootstrap 374/374/0/0/0;
  formation 18/18/0/0/0. The four `{}` end markers complete by mtime.
- join: schema, head, runs and sites equal the staged census.json; only
  `generatedAt` differed, so the staged bytes were kept (file restored, not
  restaged). Classes: never 162, primary-only 1201, fallback-only 41, both
  1399, unobserved 0, unloaded 0.

### Delta verifier's model
1. Completion by end marker requires a coverage file of the thread at or
   after the marker (`at` vs name ms; mtime vs mtime, strict, without
   `at`); a worker by main exit requires that of its main. Re-derive on
   census-runs5 that no completion changes (the merge equality above).
2. Each B2 guard and each new guard has a killing witness (table above;
   re-run mutate.py).
3. Markers are independent of later global pollution (test 33; read
   `markerText`/`fieldText` and the captured primordials).
4. N1 bound documented; N3 stays unconditional with the reason above.

### Checks (round 4, final staged tree)
- Census tests 33/33; eslint on the three changed JS files clean;
  `LAGRANGE_SOLVER_LANDING=1 bash .githooks/pre-commit` exit 0 (the first
  run failed the literal guideline on markerText's JSON punctuation, now
  named in `JSON_TEXT`; the preload mutations MA1-MA6 and MF1-MF3 were re-run
  on the renamed code, all killed; the scoped complexity line about the
  unchanged `retryFailedOnce` is reported without failing);
  `npm run -s test:duplication` exit 0 (649/649, 24346/24346);
  `npm run -s test:metadata:refresh` exit 0 (impact-graph seal restaged);
  `code-navigability-budget.js --metric --rows fallback_sites_uncensused` 0.
