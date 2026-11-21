# GCP formation run 2 on f580579a5 (seed CPU profile on)

Scenario `fresh-formation-user-table-routability` on three `e2-standard-4` VMs, one node per VM, shipped configuration. It repeats GCP run 1 (`reports/gcp-formation-run1.md`) with one change: the seed's existing formation attribution and CPU profile are switched on. This is a diagnostic run, not certification.

**Result: FAIL after 674.0 s.** Unmet predicates are `c` and `e`.

- **Formation finished late.** The last formation operation completed 530.6 s after the formation step started, 110.6 s after the 420 s bound (run 1: 427.2 s).
- **Profile coverage.** The profile covers 13:17:02.561Z to 13:27:42.376Z. That includes 46.4 s after the formation queue drained.
- **Public PG wire not placed.** `sys-postgres-wire` was refused 22 times with `replica_inventory_unusable`.

- **Evidence:** `/mnt/data/peter/projects/lagrange-takeover-20261121/lab/gcp-formation-f580579a5-run2-profile/`. The layout matches run 1: `report.json`, `.playback/`, the generated config, `harness-console.log`, `vm/<name>/diag/`, `procedure/`, `derived/`, `archives/`. The profile chunks are in `seed-formation-profile/`, hard links to `vm/lagrange-fdiag-1/diag/formation-profile/`, with `SHA256SUMS`.
- **Labels:** EXECUTED means run or read from evidence. INFERRED means my reading. Times are UTC. Node-log times use that node's clock; harness events use the controller's clock (fdiag-3). All VMs use GCE NTP.
- **No interpretation of the profile** beyond listing, as asked.

## 1. Identity with run 1, the one difference, resources, spend, teardown

### The one difference (EXECUTED)

The three keys were set in the harness process environment on the controller, in `procedure/run-formation2.sh`. The harness forwards them to the seed container only, through `FORWARDED_SEED_HOST_ENV_KEYS` (`test/distributed/harness/cluster-class-lifecycle-base.js:70-74` at f580579a5).

| Key | Value | Semantics at f580579a5 (`src/diagnostics/formation-attribution-window.js`, called from `src/lagrange-runtime-startup.js:696`) |
| --- | --- | --- |
| `LAGRANGE_FORMATION_ATTRIBUTION` | `1` | Starts one attribution window at process start: owner buckets logged every 10 s, plus a main-thread sampling profiler through `node:inspector`. |
| `LAGRANGE_FORMATION_ATTRIBUTION_DEADLINE_MS` | `640000` | The window ends on this deadline (default 300000) or on SIGUSR2, the "formed" signal, whichever comes first. |
| `LAGRANGE_FORMATION_PROFILE_DIR` | `/data/formation-profile` | Without it there is no profiler. It writes `seed-main-thread-N.cpuprofile` every 60 s (stop, write, restart) and a final chunk when the window ends. SIGTERM writes nothing. |

- **No SIGUSR2 sender on this route.** A grep of `test/distributed`, `scripts` and `src` at f580579a5 finds none. Only `examples/service-data-affinity/run-affinity-demo.js` sends SIGUSR2. No forwarded key disables the stop-on-SIGUSR2 behaviour, but nothing sends the signal here.
  - The window ended on its deadline: `Formation attribution window` with `reason: deadline` at 13:27:42.376Z.
- **Seed only.** The seed container's environment carried the three keys. The joiners did not (`vm/*/diag/container-env.log`). The harness also set `LAGRANGE_TRANSPORT_MESSAGE_TIMEOUT_MS=30000` and `LAGRANGE_CAPTURE_LOGS=true` on all three nodes from its own code path. Run 1 did not record container environments, so whether these were set in run 1 is INFERRED.

### Identity checks (EXECUTED; `derived/identity-check.txt`)

| Item | Run 2 | Equal to run 1? |
| --- | --- | --- |
| Source | commit f580579a509293e50b0344d1c7e742b10fbf2aac, tree a5c09a1b…; shallow bare clone of `wip/core-three-repairs-composed-20261121`, tarred, scp'd to fdiag-3. Tar sha 9d0c8da3… (run 1 cd59071b…; tar timestamps differ). Controller checkout clean before and after (`git status --porcelain` 0). | yes (same commit and tree) |
| Generated harness config | Equal to the baseline content in every key except `docker`. The docker block differs only in tunnel ports, the three internal IPs and the boot `machineId`s. sha256 7cadc129… (baseline 0e84949d…; the difference is entirely in the `docker` block). | yes, except `docker` |
| Node image `/app` content | sha256 of the 7928-file manifest is 56fc9385… on all three VMs, byte-identical to run 1's manifest (`cmp`). | yes |
| Image IDs | 92206f9c…, 771e5062…, a629798b… Each host built its own, through the harness `buildOnHosts` owner, as in run 1. The first 19 of 26 layer diff IDs are identical to run 1. | same situation as run 1 |
| Base images | node:22-slim e9f565d3…; distroless nodejs22-debian12 8a3e96fe… | yes |
| VMs | e2-standard-4, europe-north1-a, Intel Broadwell (all three), image ubuntu-2404-noble-amd64-v20261105 (the image the run 1 family resolved to; pinned by name), kernel 7.0.0-1017-gcp, Docker 29.1.3, containerd 2.2.1, runc 1.3.4, 50 GB pd-ssd, default network, internal IPs. | yes |
| Containers | NanoCpus 1e9, Memory 1 GiB, MemorySwap 2 GiB, NetworkMode host. | yes |
| Route and command | Controller on fdiag-3 at nice 19, VMs registered in the controller VM's own lab inventory, then `nice -n 19 node scripts/lab.js harness run fresh-formation-user-table-routability --nodes lagrange-fdiag-1,lagrange-fdiag-2,lagrange-fdiag-3 --nodes-per-host 1 -- --capture-logs`. Node v22.23.2, npm 10.9.8, npm ci. | yes |

**Procedural differences other than the keys (EXECUTED):**

1. **Base images pre-pulled.** I pulled the base images by tag on each VM before the harness built (`docker pull node:22-slim` and the distroless tag). Run 1 pulled them during the build. The digests are the same.
2. **More host-side sampling** (`procedure/measure2.sh`). Everything runs outside the containers' 1-CPU cgroups:
   - cgroup `cpu.stat` at 1 Hz;
   - streaming `docker stats`;
   - `nstat` at 1 Hz;
   - `/proc/<pid>/task/*/stat` and `top -H` every 5 s;
   - counting-only iptables rules sampled at 1 Hz;
   - on the seed host, a copier that ran `docker cp` every 3 s and validated each new chunk as JSON.

   Run 1's samplers (ping, vmstat, load, `ss -ti` every 5 s, `docker stats` every 10 s, `nstat` before and after) ran unchanged. Host idle never fell below 58 %.
3. **This workstation.** I never touched `~/.config/lagrange/lab/inventory.json` here. All `lab` commands ran on the controller VM.

### Resources and times (EXECUTED)

| VM | Internal IP | Role | Created | Deleted |
| --- | --- | --- | --- | --- |
| lagrange-fdiag-1 | 10.166.15.209 | node 0, the seed (95ce5141); node ports 8080/8081/8082 | 13:04:42 | 13:30:31–13:31:26 |
| lagrange-fdiag-2 | 10.166.15.208 | node 1 (c14b47ee); ports 8090/8091/8092 | 13:04:42 | same |
| lagrange-fdiag-3 | 10.166.15.207 | node 2 (d1162379) and controller; ports 8100/8101/8102 | 13:04:42 | same |

- Every VM has label `purpose=lagrange-formation-diag-20261121` and was created with `--max-run-duration=3h --instance-termination-action=DELETE`.
- No firewall rule, address, image or registry resource was created. Note that disks do not inherit instance labels; they carry the name prefix.

Timeline:

| Time | Event |
| --- | --- |
| 13:08:49 | harness requested |
| 13:16:58 | three image builds done (setup 483.2 s) |
| 13:16:58.72 | seed container started |
| 13:17:02.339 | attribution window started; this is also the seed's first log line |
| 13:17:32.5 | joiners started |
| 13:18:01.800 | `cluster.ready` |
| 13:18:04.662 | formation step starts (bound ends 13:25:04.662) |
| 13:28:17.8 | containers stopped with SIGTERM |
| 13:28:19.7 | containers removed |
| 13:28:22 | harness exit 1 |

### Spend and teardown

**Spend (INFERRED from list prices).** 3 × e2-standard-4 for about 26.6 min, plus 150 GB pd-ssd and 3 ephemeral IPs, at about $0.50/h for the set: about **$0.22**. Egress was about 31 MB. Today's total with run 1 is about $0.48.

**Teardown proof (EXECUTED 13:31:31Z, `derived/teardown-proof.txt`).**
- `instances list` (prefix or label filter): 0 items.
- `disks list` (prefix or label filter): 0 items.
- `firewall-rules list --filter=name~^lagrange-fdiag-`: empty. The only rules are default-allow-icmp, default-allow-internal, default-allow-rdp and default-allow-ssh.
- `addresses list`: 0 items.
- All instances: only `lagrange-ci-runner` (TERMINATED, untouched). All disks: only `lagrange-ci-runner`.

## 2. Result (EXECUTED: report.json, events, ledger rows, node full logs)

**FAIL**, duration 674.0 s, exit 1, verdict `BLOCK_EVIDENCE_INCOMPLETE / log_window_coverage_incomplete`. Wall time: setup 483.2 s, scenario 681.1 s, teardown 2.3 s.

```
first unmet predicate c-replica-operations-quiet (projection_in_flight:95ce5141…, projection_in_flight:c14b47ee…, projection_in_flight:d1162379…, replica_operations_in_flight); unmet: c-replica-operations-quiet, e-write-readback-every-node; time-to-serve-lane 1277ms, time-to-user-table-routable 479383ms
```

**Predicates.**
- Met: `a`, `b`, `d`, `f`, `g`, observation-integrity.
- `c` was unmet in 197 of 198 polls.
- `e`: `insert_failed:public_pg_unavailable: Timed out waiting for healthy public PostgreSQL wire endpoint`. Readback mismatches on all three nodes; the per-node admin inserts returned `affectedRows 1`.
- `a` was unmet in 2 polls (302.1 s and 304.0 s, `serve_ineligible`).
- `b` was first met at 100.3 s, then unmet in 4 later polls (`partitions_observation_incomplete`).
- Polls 198, failed reads 0, playback snapshots 319.

**Times.**
- Time to serve lane: 1.277 s from scenario start, 52.2 s from the harness's `seedProcessStartAt` (13:17:13.776; the harness definition, about 11 s after the first seed log line, as in run 1).
- Time to user table routable: 479.4 s from scenario start, 530.3 s from seed start.

**User table.** CREATE was issued at the bound (13:25:04.663). It returned `pending/retry` (`schema_replica_convergence_pending`) twice, then `under_replicated/proceed` at 13:26:02.165. The three user-table ADDs ran 13:25:17.5–13:26:19.2.

### Formation operations (ledger rows from the last snapshot; terminal time cross-checked in node logs)

**Counts.**
- 141 operations: 95 ADD and 46 GROWTH_PROMOTE, all `active/ACTIVE`, `error_message` null.
- Formation (system partitions): **138** (92 ADD and 46 GROWTH_PROMOTE over 46 partitions).
- User table: 3 ADDs.

**Last formation operation.** `pl-wasm_operations-p1-1414-0`, a GROWTH_PROMOTE targeting the seed.
- Ledger `completed_at` 13:26:55.294. The seed log shows `Operation completed` at **13:26:55.977Z**.
- That is **530.6 s after the formation step started, 110.6 s after the 420 s bound.**
- Measured from other starting points: 593.6 s after the attribution window started, 596.6 s after the seed container started, 581.5 s after the harness's `seedProcessStartAt`.
- Run 1: 427.2 s after the step start, 7.2 s after the bound.
- No operation of any kind was in flight after it, through to the end of the run.

**Priority partitions.** The last priority operation completed at 97.0 s (run 1: 70.1 s). `b` was first met at 100.3 s (run 1: 72.2 s).

**Backlog of formation operations** (done / in flight / not done):

| Scenario s | Run 2 | Run 1 |
| --- | --- | --- |
| 60 | 9 / 5 / 129 | 15 / 3 / 123 |
| 120 | 29 / 3 / 109 | 36 / 3 / 102 |
| 210 | 55 / 2 / 83 | 68 / 3 / 70 |
| 300 | 77 / 3 / 61 | 97 / 3 / 41 |
| 420 | 111 / 4 / 27 | 136 / 1 / 2 |

**Per-operation duration** (row created to completed, system partitions):

| Type | Run 2 p50 / p90 / max | Run 1 p50 / p90 / max |
| --- | --- | --- |
| ADD | 15.07 / 20.03 / 31.46 s | 12.37 / 15.17 / 21.26 s |
| GROWTH_PROMOTE | 3.39 / 5.56 / 8.51 s | 2.00 / 2.96 / 3.62 s |

### Public PostgreSQL wire service: not placed (EXECUTED)

There is no `sys-postgres-wire` row in the last snapshot's services or replica operations, and `e` failed with `public_pg_unavailable`.

| Node | `sys-postgres-wire` lines | `replica_inventory_unusable` lines | First / last relevant occurrence |
| --- | --- | --- | --- |
| seed 95ce5141 (fdiag-1) | 12 | 0 | Runtime-service rebalancer leader start/stop at 13:17:40.869 → 13:25:09.175. One `Failed to update system table row` (`service_definitions` UPDATE, `DISTRIBUTED_PARTICIPANT_FAILURE`, participant d1162379) at 13:26:07.497. A CDC fetch at 13:26:08.487 |
| c14b47ee (fdiag-2) | 1 | 0 | CDC fetch at 13:26:04.939 |
| d1162379 (fdiag-3) | 134 | **22** | Rebalancer leader from 13:25:08.099. 23 `Critical rebalancing state detected` from 13:26:05.292 to 13:28:11.150. 22 `Executing rebalancing move` (add, target c14b47ee). **22 `Rebalancing move skipped` with `admissionReason: replica_inventory_unusable`, first 13:26:05.384, last 13:28:11.222**. The skip payload has `authoritativeAvailable:false`, `committedRowsState:"unavailable"` and `error:null`. 15 `Waiting for local control-plane mutation readiness…` from 13:25:13.4 to 13:28:04.8 |

In run 1 the planner and target was fdiag-2 (25 refusals). Here the planner is fdiag-3 and the target is fdiag-2.

### Other log counts (run 1's extraction method, `derived/run2-extract-run1method.json`)

| Class | seed | fdiag-2 | fdiag-3 | Run 1 |
| --- | --- | --- | --- | --- |
| `Wait bound spent` | 234 | 356 | 404 | 83 / 218 / 261 |
| `Failed to send message` | 10 | 27 | 37 | 5 / 7 / 7 |
| ACK-timeout quarantine skips | 0 | 17 | 25 | 0 / 4 / 2 |
| Named control-plane write wait expired | 0 | 0 | 0 | 0 / 0 / 0 |
| Event-loop gaps ≥ 1 s | 55 (max 6186 ms at 13:17:26.155, bootstrap) | 5 (max 3766) | 7 (max 3134) | 11 / 5 / 4 |

- 12 of the seed's 55 gaps (1.24–3.36 s) fall within 3 s of a profile-chunk flush.
- **Non-JSON lines:** 12 / 8609 / 16830. The joiner ones are 272 and 563 multi-line `Failed to write log entry after retries: … CDCIntegrationService shut down` dumps, all logged after SIGTERM at 13:28:17.4–17.7, outside the scenario window. Run 1 had 19 such blocks.
- **Leadership:** 2 ledger elections, max term 2 (seed term 1, fdiag-3 term 2). Of 47 partitions with leadership evidence, 40 had 2 elections, 4 had 3 and 3 had 1. Max term 3.

## 3. The seed profile (EXECUTED; listing only)

**Where.**
- Retained as written: `seed-formation-profile/seed-main-thread-{0..10}.cpuprofile`, 11 files, 152 MB, with `SHA256SUMS`.
- Each chunk was copied byte for byte with `docker cp` as soon as it existed and parsed. The copy log is `vm/lagrange-fdiag-1/diag/profile-copy.log`. Sizes equal the copier's records.

**Format.** V8 `.cpuprofile` JSON from `node:inspector` `Profiler`:
- `nodes[]` holds `callFrame` (`functionName`, `url`, `lineNumber`, `columnNumber`), `hitCount` and `children`;
- `startTime` and `endTime` are in µs;
- `samples[]` and `timeDeltas[]` hold the samples;
- main thread only; one chunk per 60 s flush; measured sampling interval p50 1.12 ms.

**Covered interval.**
- First sample 13:17:02.561Z, last sample 13:27:42.376Z: 640.0 s of window, 621.2 s sampled.
- The window ended on the 640 s deadline. The final chunk (10) was written at 13:27:42.913.
- Ten unsampled gaps of 0.87–1.57 s (11.5 s in total) between chunks are the stop-write-restart time.
- The process ran 35.5 s more until SIGTERM (13:28:17.849) without profiling.

**How samples are placed in time.** Wall time = chunk start anchor + (sample time − `startTime`).
- Chunk 0 is anchored on the `window started` log line. Chunk k is anchored on chunk k−1's `profile written` log line; the profiler restarts right after it.
- Each chunk's `profile written` line comes 0.5–1.6 s after its anchored end; that is the time to stringify and write it.
- Tool: `procedure/profile2.py`; output with top 200 per window: `derived/seed-profile-windows.json`.

### Chunks

| # | Wall from → to (anchored) | Samples |
| --- | --- | --- |
| 0 | 13:17:02.339 → 13:18:03.103 | 43,225 |
| 1 | 13:18:04.094 → 13:19:03.274 | 38,837 |
| 2 | 13:19:04.273 → 13:20:03.591 | 40,381 |
| 3 | 13:20:05.157 → 13:21:03.731 | 40,134 |
| 4 | 13:21:04.647 → 13:22:03.922 | 40,391 |
| 5 | 13:22:04.826 → 13:23:03.921 | 43,286 |
| 6 | 13:23:04.875 → 13:24:04.090 | 40,445 |
| 7 | 13:24:05.567 → 13:25:04.271 | 39,566 |
| 8 | 13:25:05.140 → 13:26:04.907 | 39,040 |
| 9 | 13:26:06.324 → 13:27:04.956 | 39,845 |
| 10 (final, deadline) | 13:27:06.378 → 13:27:42.376 | 24,013 |

### Windows

The split point is the last formation operation's `Operation completed` in the seed log at 13:26:55.977Z.

- **FORMATION:** profile start → 13:26:55.977. 593.4 s of wall time, 577.1 s sampled, 399,044 samples (non-idle 377,315).
- **POST-DRAIN:** 13:26:55.977 → profile end 13:27:42.376. 46.4 s of wall time, 44.1 s sampled, 30,119 samples (non-idle 29,605). This window is also the lead's "idle tail after the last operation"; no operation of any kind was in flight in it.
- **W1:** bootstrap → priority spread first met (13:19:44.937). 109,389 samples.
- **W2:** system-partition formation, 13:19:44.937 → 13:26:55.977. 289,655 samples.

**Shares of special entries.**

| Window | (idle) | (garbage collector) | (program) |
| --- | --- | --- | --- |
| FORMATION | 5.45 % | 8.22 % | 0.70 % |
| POST-DRAIN | 1.71 % | 8.99 % | 0.76 % |
| W1 | 13.50 % | 6.79 % | 1.27 % |
| W2 | 2.40 % | 8.76 % | 0.48 % |

**How to read the tables below.**
- Columns: samples / % of all samples / % of non-idle samples.
- Entries without a file are native functions with no script URL, for example `run`, `get`, `Statement`, `writev`, `registerDestroyHook`.

**FORMATION, top by self time**

| Entry | Samples | % all | % non-idle |
| --- | --- | --- | --- |
| (garbage collector) | 32,795 | 8.22 | 8.69 |
| (idle) | 21,729 | 5.45 | – |
| run [native] | 18,914 | 4.74 | 5.01 |
| deepFreeze src/raft/raft-operation-port.js:30 | 13,498 | 3.38 | 3.58 |
| fastJsonClone src/utils/fast-json-clone.js:35 | 9,775 | 2.45 | 2.59 |
| registerDestroyHook [native] | 6,023 | 1.51 | 1.60 |
| writev [native] | 5,751 | 1.44 | 1.52 |
| recordScheduledEntry src/diagnostics/formation-turn-attribution.js:394 | 5,593 | 1.40 | 1.48 |
| runMicrotasks [native] | 5,272 | 1.32 | 1.40 |
| sendToClient src/admin/admin-websocket-message-dispatch-methods.js:429 | 4,501 | 1.13 | 1.19 |
| Statement [native] | 3,876 | 0.97 | 1.03 |
| collectKnownMessageGroupDomain src/topology/cdc-group-propagation-routing.js:242 | 3,562 | 0.89 | 0.94 |
| resolveActiveMessageGroupServices src/topology/cdc-group-propagation-routing.js:43 | 3,242 | 0.81 | 0.86 |
| get [native] | 2,885 | 0.72 | 0.76 |
| deepFreeze src/utils/deep-freeze.js:28 | 2,860 | 0.72 | 0.76 |
| copyStrictOwnDataRecord src/utils/strict-own-data.js:61 | 2,816 | 0.71 | 0.75 |
| (program) | 2,793 | 0.70 | 0.74 |
| decodeUTF8 [native] | 2,552 | 0.64 | 0.68 |
| get src/cache/system-table-cache-observation-methods.js:446 | 2,442 | 0.61 | 0.65 |
| update [native] | 2,426 | 0.61 | 0.64 |

**FORMATION, top by inclusive time**

| Entry | Samples | % all | % non-idle |
| --- | --- | --- | --- |
| runMicrotasks | 256,171 | 64.20 | 67.89 |
| processTicksAndRejections node:internal/process/task_queues:72 | 144,966 | 36.33 | 38.42 |
| processTimers node:internal/timers:508 | 112,125 | 28.10 | 29.72 |
| runNextTicks node:internal/process/task_queues:63 | 111,748 | 28.00 | 29.62 |
| runFormationOwner src/diagnostics/formation-turn-attribution.js:744 | 90,626 | 22.71 | 24.02 |
| run src/diagnostics/formation-turn-attribution.js:574 | 90,487 | 22.68 | 23.98 |
| run node:internal/async_local_storage/async_hooks:77 | 89,790 | 22.50 | 23.80 |
| continueTurn src/raft/raft-rs-turn-answer.js:63 | 73,922 | 18.52 | 19.59 |
| listOnTimeout node:internal/timers:528 | 73,568 | 18.44 | 19.50 |
| drainInbound src/raft/raft-rs-runtime-owner.js:1930 | 68,394 | 17.14 | 18.13 |
| withinGroup src/raft/raft-rs-runtime-owner.js:1049 | 67,878 | 17.01 | 17.99 |
| drainReady src/raft/raft-rs-runtime-owner.js:1329 | 64,166 | 16.08 | 17.01 |
| assertCurrent src/cdc/cdc-delivery-invocation.js:83 | 62,910 | 15.77 | 16.67 |
| cdcProgressCurrent src/partition/partition-cdc-obligation-progress.js:43 | 62,606 | 15.69 | 16.59 |
| topologyBindingCurrent src/partition/partition-cdc-obligation-progress.js:32 | 62,434 | 15.65 | 16.55 |
| dispatch src/raft/raft-rs-operation-port.js:351 | 61,493 | 15.41 | 16.30 |
| execute src/raft/raft-rs-replica-lifecycle-owner.js:255 | 61,470 | 15.40 | 16.29 |
| callbackTrampoline node:internal/async_hooks:118 | 59,122 | 14.82 | 15.67 |
| processReadyCycle src/raft/raft-rs-runtime-owner.js:1306 | 56,686 | 14.21 | 15.02 |
| withDeliveryLifetime src/transport/message-router-delivery-lifetime.js:220 | 55,991 | 14.03 | 14.84 |
| executeCommand src/raft/raft-rs-runtime-owner.js:2134 | 51,804 | 12.98 | 13.73 |
| remaining src/transport/message-router-delivery-lifetime.js:96 | 50,280 | 12.60 | 13.33 |
| parentDeliveryLimits src/transport/message-router-delivery-lifetime.js:34 | 49,477 | 12.40 | 13.11 |
| perform src/raft/raft-rs-runtime-owner.js:1983 | 45,931 | 11.51 | 12.17 |
| transaction src/raft/raft-rs-durable-store.js:419 | 45,074 | 11.30 | 11.95 |

Omitted from this table: anonymous closures in `partition-cdc-obligation-progress.js:48/118` and `raft-rs-operation-port.js:352`, and `containRuntimeThrow raft-rs-operation-port.js:151`, all at 15.3–15.7 %. They are in the JSON.

**POST-DRAIN, top by self time**

| Entry | Samples | % all | % non-idle |
| --- | --- | --- | --- |
| (garbage collector) | 2,709 | 8.99 | 9.15 |
| run [native] | 1,484 | 4.93 | 5.01 |
| writev [native] | 969 | 3.22 | 3.27 |
| deepFreeze src/raft/raft-operation-port.js:30 | 873 | 2.90 | 2.95 |
| recordScheduledEntry src/diagnostics/formation-turn-attribution.js:394 | 777 | 2.58 | 2.62 |
| registerDestroyHook [native] | 775 | 2.57 | 2.62 |
| runMicrotasks [native] | 616 | 2.05 | 2.08 |
| (idle) | 514 | 1.71 | – |
| startLoop node_modules/ws/lib/receiver.js:171 | 446 | 1.48 | 1.51 |
| dispatchInboundMessage src/transport/message-router-inbound-dispatch.js:70 | 401 | 1.33 | 1.35 |
| transaction node_modules/better-sqlite3/lib/methods/transaction.js:5 | 369 | 1.23 | 1.25 |
| fastJsonClone src/utils/fast-json-clone.js:35 | 345 | 1.15 | 1.17 |
| get [native] | 278 | 0.92 | 0.94 |
| typedRowSetByteLength src/query/sql-value-codec.js:497 | 271 | 0.90 | 0.92 |
| send node_modules/ws/lib/sender.js:351 | 261 | 0.87 | 0.88 |
| wasm-to-js wasm://wasm/0029a806:1 | 244 | 0.81 | 0.82 |
| tryDeliverRaftDirect src/transport/message-router-delivery-behaviors.js:230 | 236 | 0.78 | 0.80 |
| exports.__wbg_set_3f1d0b984ed272ed vendor/raft-rs-wasm/pkg/raft_wasm.js:791 | 236 | 0.78 | 0.80 |
| (program) | 230 | 0.76 | 0.78 |
| enterSegment src/diagnostics/formation-turn-attribution.js:506 | 224 | 0.74 | 0.76 |

**POST-DRAIN, top by inclusive time**

| Entry | Samples | % all | % non-idle |
| --- | --- | --- | --- |
| runMicrotasks | 18,716 | 62.14 | 63.22 |
| processTimers node:internal/timers:508 | 14,093 | 46.79 | 47.60 |
| listOnTimeout node:internal/timers:528 | 13,739 | 45.62 | 46.41 |
| runNextTicks node:internal/process/task_queues:63 | 10,479 | 34.79 | 35.40 |
| runFormationOwner src/diagnostics/formation-turn-attribution.js:744 | 9,161 | 30.42 | 30.94 |
| run src/diagnostics/formation-turn-attribution.js:574 | 9,133 | 30.32 | 30.85 |
| run node:internal/async_local_storage/async_hooks:77 | 9,000 | 29.88 | 30.40 |
| processTicksAndRejections node:internal/process/task_queues:72 | 8,304 | 27.57 | 28.05 |
| drainReady src/raft/raft-rs-runtime-owner.js:1329 | 7,794 | 25.88 | 26.33 |
| drainInbound src/raft/raft-rs-runtime-owner.js:1930 | 7,588 | 25.19 | 25.63 |
| dispatch src/raft/raft-rs-operation-port.js:351 | 6,407 | 21.27 | 21.64 |
| processReadyCycle src/raft/raft-rs-runtime-owner.js:1306 | 6,403 | 21.26 | 21.63 |
| execute src/raft/raft-rs-replica-lifecycle-owner.js:255 | 6,402 | 21.26 | 21.62 |
| containRuntimeThrow src/raft/raft-rs-operation-port.js:151 | 6,359 | 21.11 | 21.48 |
| continueTurn src/raft/raft-rs-turn-answer.js:63 | 6,133 | 20.36 | 20.72 |
| withinGroup src/raft/raft-rs-runtime-owner.js:1049 | 6,122 | 20.33 | 20.68 |
| stepOneInbound src/raft/raft-rs-runtime-owner.js:1874 | 5,717 | 18.98 | 19.31 |
| protocolTurn src/raft/raft-rs-operation-port.js:363 | 5,151 | 17.10 | 17.40 |
| runRaftProtocolActivity src/diagnostics/raft-formation-attribution.js:15 | 5,122 | 17.01 | 17.30 |
| perform src/raft/raft-rs-runtime-owner.js:1983 | 4,911 | 16.31 | 16.59 |
| enqueue src/raft/raft-rs-runtime-owner.js:1071 | 4,649 | 15.44 | 15.70 |
| withDeliveryLifetime src/transport/message-router-delivery-lifetime.js:220 | 4,526 | 15.03 | 15.29 |
| deliver src/transport/message-router-delivery-delegation.js:61 | 4,227 | 14.03 | 14.28 |
| sendMessages src/raft/raft-rs-peer-delivery.js:198 | 4,023 | 13.36 | 13.59 |
| deliverToPeer src/raft/raft-rs-peer-delivery.js:146 | 3,947 | 13.10 | 13.33 |

**Selected entries across windows** (% of all samples, inclusive):

| Entry | FORMATION | POST-DRAIN | W1 | W2 |
| --- | --- | --- | --- | --- |
| assertCurrent src/cdc/cdc-delivery-invocation.js:83 | 15.77 | 7.48 | 12.51 | 17.00 |
| drainInbound src/raft/raft-rs-runtime-owner.js:1930 | 17.14 | 25.19 | 14.09 | 18.29 |
| drainReady src/raft/raft-rs-runtime-owner.js:1329 | 16.08 | 25.88 | 12.72 | 17.35 |
| runRaftProtocolActivity src/diagnostics/raft-formation-attribution.js:15 | 10.18 | 17.01 | 10.81 | 9.94 |
| transaction src/raft/raft-rs-durable-store.js:419 | 11.30 | 11.41 | 10.81 | 11.48 |
| collectKnownMessageGroupDomain src/topology/cdc-group-propagation-routing.js:242 | 3.82 | not in top 200 | 3.05 | 4.11 |

**Self time by file, POST-DRAIN** (% of all samples):

| File | % |
| --- | --- |
| (garbage collector) | 8.99 |
| src/diagnostics/formation-turn-attribution.js | 6.91 |
| wasm://wasm/0029a806 | 5.44 |
| run [native] | 4.93 |
| src/raft/raft-rs-runtime-owner.js | 3.61 |
| writev [native] | 3.22 |
| src/raft/raft-operation-port.js | 2.90 |
| vendor/raft-rs-wasm/pkg/raft_wasm.js | 2.66 |
| registerDestroyHook [native] | 2.57 |
| node:internal/async_hooks | 2.53 |
| src/transport/message-router-delivery-behaviors.js | 2.16 |

For FORMATION the order is:

| File | % |
| --- | --- |
| (garbage collector) | 8.22 |
| (idle) | 5.45 |
| run [native] | 4.74 |
| src/topology/cdc-group-propagation-routing.js | 4.03 |
| wasm://wasm/0029a806 | 3.76 |
| src/diagnostics/formation-turn-attribution.js | 3.65 |
| src/raft/raft-operation-port.js | 3.38 |
| src/utils/fast-json-clone.js | 2.45 |

**W1 (bootstrap → priority spread)**
- Top self:

  | Entry | % |
  | --- | --- |
  | (idle) | 13.50 |
  | (garbage collector) | 6.79 |
  | run | 3.44 |
  | deepFreeze raft-operation-port.js:30 | 2.80 |
  | fastJsonClone | 2.15 |
  | update | 1.73 |
  | sqliteTransaction better-sqlite3 transaction.js:52 | 1.51 |
  | (program) | 1.27 |
  | registerDestroyHook | 1.20 |
  | recordScheduledEntry | 0.98 |

- Top inclusive:

  | Entry | % |
  | --- | --- |
  | runMicrotasks | 51.76 |
  | runNextTicks | 26.10 |
  | processTicksAndRejections | 25.84 |
  | processTimers | 22.33 |
  | runFormationOwner | 21.21 |
  | continueTurn | 18.16 |
  | withinGroup | 16.80 |
  | callbackTrampoline | 15.24 |
  | dispatch raft-rs-operation-port.js:351 | 14.68 |
  | executeCommand | 14.51 |
  | drainInbound | 14.09 |
  | processImmediate | 12.89 |
  | drainReady | 12.72 |

**W2 (system-partition formation)**
- Top self:

  | Entry | % |
  | --- | --- |
  | (garbage collector) | 8.76 |
  | run | 5.23 |
  | deepFreeze raft-operation-port.js:30 | 3.60 |
  | fastJsonClone | 2.56 |
  | (idle) | 2.40 |
  | writev | 1.79 |
  | registerDestroyHook | 1.63 |
  | recordScheduledEntry | 1.56 |
  | runMicrotasks | 1.52 |
  | sendToClient (admin WS) | 1.26 |
  | Statement | 1.04 |
  | resolveActiveMessageGroupServices | 0.97 |
  | collectKnownMessageGroupDomain | 0.95 |

- Top inclusive:

  | Entry | % |
  | --- | --- |
  | runMicrotasks | 68.89 |
  | processTicksAndRejections | 40.29 |
  | processTimers | 30.28 |
  | runNextTicks | 28.72 |
  | runFormationOwner | 23.28 |
  | listOnTimeout | 22.60 |
  | continueTurn | 18.66 |
  | drainInbound | 18.29 |
  | drainReady | 17.35 |
  | withinGroup | 17.09 |
  | assertCurrent (cdc-delivery-invocation.js:83) | 17.00 |
  | cdcProgressCurrent | 16.91 |
  | dispatch | 15.69 |

### The attribution window's own owner buckets (same seed, the module's async-hooks accounting)

These are logged in the seed's full log as `Formation attribution snapshot` (every 10 s) and the final `Formation attribution window`.

| Owner | Whole window (640.3 s) | Up to 13:26:53.771 (591.7 s) | 13:26:53.771 → 13:27:42.376 (48.6 s, starts 2.2 s before the drain) |
| --- | --- | --- | --- |
| raft_protocol | 222.7 s (34.8 %) | 198.5 s (33.5 %) | 24.2 s (49.8 %) |
| transport | 105.4 s (16.5 %) | 97.6 s (16.5 %) | 7.8 s (16.1 %) |
| raft_apply | 62.1 s (9.7 %) | 59.1 s (10.0 %) | 3.0 s (6.1 %) |
| bootstrap | 45.3 s (7.1 %) | 42.8 s (7.2 %) | 2.5 s (5.1 %) |
| rebalancer | 43.2 s (6.7 %) | 42.6 s (7.2 %) | 0.6 s (1.2 %) |
| admin | 38.4 s (6.0 %) | 36.3 s (6.1 %) | 2.1 s (4.3 %) |
| readiness | 33.4 s (5.2 %) | 32.2 s (5.4 %) | 1.2 s (2.5 %) |
| membership_publication | 3.0 s (0.5 %) | 3.0 s (0.5 %) | 0.0 s |
| idle | 45.6 s (7.1 %) | 42.6 s (7.2 %) | 3.0 s (6.1 %) |
| unattributed | 41.2 s (6.4 %) | 36.9 s (6.2 %) | 4.3 s (8.8 %) |

## 4. Host-level numbers per node (EXECUTED)

### Phases

| Phase | From → to |
| --- | --- |
| P1 bootstrap → priority spread | seed container start 13:16:58.720 → 13:19:44.937 (joiner containers from 13:17:32.5) |
| P2 system formation | 13:19:44.937 → 13:26:55.977 |
| P3 post-drain idle tail | 13:26:55.977 → seed SIGTERM 13:28:17.849 (81.9 s) |
| Idle60 | 13:27:00–13:28:00, a 60 s window inside P3, before the harness's admin inserts and readbacks at about 13:28:04–11 |

Tools: `procedure/host2.py` and `procedure/sspps.py`; outputs `derived/host-phases-result.json` and `derived/ss-port-rates.json`.

### Container CPU %, cgroup `cpu.stat` at 1 Hz (p50 / p90)

| Node | P1 | P2 | P3 | Idle60 |
| --- | --- | --- | --- | --- |
| seed (fdiag-1) | 99.1 / 100.9 | 99.6 / 101.5 | 99.0 / 100.9 | 99.4 / 101.1 |
| fdiag-2 | 62.5 / 96.7 | 73.8 / 93.6 | 85.5 / 94.5 | 85.3 / 94.9 |
| fdiag-3 (+controller host) | 80.4 / 99.8 | 96.6 / 100.5 | 90.1 / 98.8 | 89.7 / 97.4 |

- **Streaming `docker stats` (p50 / p90) agrees:**

  | Node | P1 | P2 | P3 |
  | --- | --- | --- | --- |
  | seed | 99.5 / 101.3 | 100.1 / 101.7 | 98.7 / 102.1 |
  | fdiag-2 | 62.4 / 99.3 | 75.1 / 96.1 | 86.8 / 94.9 |
  | fdiag-3 | 79.9 / 100.8 | 97.6 / 101.1 | 91.0 / 100.3 |

- **Run 1's 10 s `docker stats` method, whole scenario** (p50 / p90 / max, memory max):

  | Node | Run 2 | Run 1 |
  | --- | --- | --- |
  | seed | 99.9 / 101.4 / 107.5, 642 MiB | 97.8 / 101.6 / 106, 533 MiB |
  | fdiag-2 | 81.9 / 97.6 / 102.8, 474 MiB | 88.7 / 97.2 / 102, 498 MiB |
  | fdiag-3 | 97.3 / 100.8 / 103.2, 483 MiB | 92.0 / 100.4 / 104, 569 MiB |

- **cgroup throttling** (share of CFS periods throttled; not measured in run 1):

  | Node | P1 | P2 | P3 | Idle60 |
  | --- | --- | --- | --- | --- |
  | seed | 78.0 % | 87.3 % | 67.3 % | 77.1 % |
  | fdiag-2 | 38.5 % | 27.7 % | 23.9 % | 24.9 % |
  | fdiag-3 | 53.7 % | 61.3 % | 35.3 % | 32.1 % |

### Per-thread CPU (`/proc/<pid>/task/*/stat`, 5 s intervals; % of one CPU; `top -H` logs retained)

| Node | Main thread p50 / p90 (P1 · P2 · P3 · Idle60) | All other threads p50 (P1 · P2 · P3 · Idle60) |
| --- | --- | --- |
| seed | 69.6 / 75.7 · 75.0 / 79.3 · 74.5 / 80.2 · 73.3 / 78.3 | 25.8 · 24.0 · 24.4 · 24.6 |
| fdiag-2 | 44.9 / 53.9 · 59.9 / 69.5 · 71.6 / 77.8 · 71.6 / 75.6 | 14.9 · 14.9 · 13.3 · 13.3 |
| fdiag-3 | 58.3 / 67.9 · 74.7 / 80.0 · 74.7 / 80.2 · 74.3 / 78.9 | 19.9 · 17.7 · 14.5 · 14.5 |

Other threads by name, mean % over P1 / P2 / P3:

| Node | Non-main threads named `node` | `v8:ProfEvntProc` (the CPU profiler's own thread) | `libuv-worker` |
| --- | --- | --- | --- |
| seed | 18.0 / 17.0 / 16.5 | 6.9 / 7.4 / 7.3 | 1.1 / 0.1 / 0.2 |
| fdiag-2 | 16.9 / 14.6 / 14.1 | – | 1.1 / 0.2 / 0.1 |
| fdiag-3 | 19.5 / 17.8 / 15.3 | – | 1.7 / 0.2 / 0.1 |

- `DelayedTaskSche` is about 0 everywhere.
- Thread count: 14 on the seed, 13 on the joiners.

### Packets between nodes in the idle tail (Idle60)

**Node ports.** The seed uses 8080/8081/8082 (REST/ADMIN/TRANSPORT), the fdiag-2 node 8090/8091/8092, the fdiag-3 node 8100/8101/8102. Each pair has one transport connection.

**Sender-side TCP segments from `ss -ti`** (`segs_out` deltas per connection; snapshots 55.2 s apart):

| Node pair (TRANSPORT) | Segments/s, one way + the other | Total segs/s | Retransmits/s (each sender) |
| --- | --- | --- | --- |
| seed ↔ fdiag-2 | 606.8 + 766.2 | **1,373** | 3.0 / 8.3 |
| seed ↔ fdiag-3 | 412.8 + 1,272.0 | **1,685** | 3.7 / 7.6 |
| fdiag-2 ↔ fdiag-3 | 1,018.1 + 1,006.3 | **2,024** | 9.0 / 4.5 |
| All node-to-node transport | | **about 5,082** | |

**Controller traffic in the same window.** The controller runs on fdiag-3.
- Seed ADMIN: 965.5 segs/s from the seed over 2 connections, 35.8 back.
- Seed REST: 7.5/s.
- fdiag-2 ADMIN: 86.3/s.
- fdiag-3 ADMIN over loopback: 27.7/s.

**During P2, for reference:**

| Connection | Segs/s |
| --- | --- |
| seed ↔ fdiag-2 transport | 718 (seed side) |
| seed ↔ fdiag-3 transport | 438 (seed side) |
| fdiag-2 ↔ fdiag-3 transport | 899 (fdiag-2 side) |
| seed ADMIN → controller | 1,215 out |

**Host iptables counting rules, per peer, all protocols** (Idle60 mean packets/s). These count at INPUT/OUTPUT, after GRO and before GSO, so they are lower than wire segments.

| Host | Traffic | pps |
| --- | --- | --- |
| fdiag-1 | in from fdiag-2 | 695.7 |
| fdiag-1 | out to fdiag-2 | 540.3 |
| fdiag-1 | in from fdiag-3 | 500.0 (transport 451.9, admin 40.5, ssh 2.6) |
| fdiag-1 | out to fdiag-3 | 402.8 |
| fdiag-2 | in from fdiag-3 | 943.9 |
| fdiag-2 | out to fdiag-3 | 979.6 |
| fdiag-3 | in from fdiag-2 | 978.8 |
| fdiag-3 | out to fdiag-2 | 942.6 |

### TCP retransmits (`nstat`, host-wide; retransmitted segments / segments sent)

| Node | P1 | P2 | P3 | Idle60 | Whole scenario | Run 1 scenario |
| --- | --- | --- | --- | --- | --- | --- |
| fdiag-1 | 326 / 139 k (0.23 %) | 2,375 / 785 k (0.30 %) | 569 / 175 k (0.32 %) | 406 / 120 k (0.34 %) | 3,284 / 1.10 M (0.30 %) | 0.26 % |
| fdiag-2 | 523 / 92 k (0.57 %) | 9,240 / 739 k (1.25 %) | 1,466 / 153 k (0.96 %) | 1,037 / 110 k (0.94 %) | 11,256 / 0.99 M (1.14 %) | 0.57 % |
| fdiag-3 | 668 / 63 k (1.05 %) | 4,316 / 636 k (0.68 %) | 843 / 195 k (0.43 %) | 677 / 140 k (0.49 %) | 5,847 / 0.90 M (0.65 %) | 0.89 % |

- `TcpExtTCPTimeouts` was 7 and `TcpExtTCPLostRetransmit` 5 on fdiag-3 in P2; both were 0 everywhere else.
- Kernel smoothed RTT on node-port connections in Idle60, p50 / p90 / max:

  | Node | p50 | p90 | max |
  | --- | --- | --- | --- |
  | fdiag-1 | 0.67 | 4.08 | 8.68 ms |
  | fdiag-2 | 0.55 | 5.22 | 14.55 ms |
  | fdiag-3 | 3.35 | 14.56 | 21.77 ms |

### ICMP, 1 Hz, scenario window 13:16:58.6–13:28:17.8

663 samples per direction, 0 lost in all six directions. Times in ms.

| Pair | min | avg | p99 | max |
| --- | --- | --- | --- | --- |
| 1→2 | 0.146 | 0.251 | 0.39 | 0.449 |
| 1→3 | 0.119 | 0.230 | 0.37 | 0.411 |
| 2→1 | 0.127 | 0.239 | 0.38 | 0.459 |
| 2→3 | 0.123 | 0.235 | 0.39 | 0.453 |
| 3→1 | 0.131 | 0.236 | 0.38 | 0.524 |
| 3→2 | 0.119 | 0.241 | 0.39 | 0.815 |

- Idle60: avg 0.20–0.24 ms, max ≤ 0.449 ms, 0 lost.
- Whole measurement window (13:08:30–13:29): 1200–1230 packets per direction, 0 % loss, max 3.256 ms.

### Host load

| VM | load1 p50 / max | vmstat idle min | iowait max |
| --- | --- | --- | --- |
| fdiag-1 | 1.17 / 1.92 | 63 % | 5 % |
| fdiag-2 | 0.95 / 1.58 | 69 % | 3 % |
| fdiag-3 | 1.26 / 1.94 | 58 % | 5 % |

Steal was 0 throughout. There were no OOM, kill or conntrack kernel messages.

## 5. What could not be captured, and executed versus inferred

**Profile limits**
- **Post-drain coverage is 46.4 s, not the roughly 190 s of run 1's idle tail (EXECUTED).** Formation drained 593.6 s into the attribution window, so the 640 s deadline left 46.4 s of post-drain profile. The process then ran 35.5 s more unprofiled until SIGTERM.
  - A larger deadline would not have reached SIGTERM. On SIGTERM the module writes no final chunk, so coverage would end at the last 60 s flush: here 13:28:03.9, about +21 s (INFERRED from the flush schedule; not run).
  - Run 2b was not run: the keys did what was required, sampling to 640 s with no stop on "formed". The coordinator's message made a rerun conditional on that failing.
- **Unsampled gaps (EXECUTED).** About 1 s every 60 s between profile chunks (stop, write, restart), 11.5 s in total.
- **Observer cost on the seed (EXECUTED).** The profiler and attribution are not free there:
  - the profiler's own thread used about 7 % of a CPU;
  - `formation-turn-attribution.js` and `node:internal/async_hooks` frames appear in the self-time tops;
  - 12 of the seed's 55 loop gaps ≥ 1 s sit within 3 s of a chunk flush.

  Formation pace also differed from run 1: ADD p50 15.1 s against 12.4 s; drain at 530.6 s against 427.2 s. Whether the measurement caused that is not established. It is one run.
- **Seed only (EXECUTED).** No joiner profile: the keys are forwarded to the seed only, and a joiner profile needs a harness change.

**Network and capture limits**
- **Per-port iptables counters (EXECUTED; design limit).** The rules named ports 8080–8082 only. The joiners' node ports are 8090–8092 and 8100–8102, so per-port rates for them come from `ss -ti` segment deltas, not from iptables. The per-peer "all" iptables counters are complete.
- **No `tcpdump` (EXECUTED).** I used counting iptables rules at 1 Hz and per-connection `ss -ti` deltas instead, which the brief allowed.
- **Counting bases differ.** iptables counts are post-GRO/pre-GSO packets. `ss` `segs_out` counts sender TCP segments. Receiver `segs_in` counts are GRO-merged and much lower; I reported sender-side numbers.
- **`docker stats` cadence.** The streaming CLI refreshes faster than 1 Hz; I kept one value per second. The 1 Hz cgroup series is the primary CPU source.

**Not established in this run**
- **Log lines after teardown (EXECUTED).** The joiners' non-JSON lines (272 and 563 blocks) are post-SIGTERM log-write failures. They are excluded from the counts above, as in run 1's method.
- **Container environment in run 1.** Not recorded, so the equality of the harness-set `LAGRANGE_TRANSPORT_MESSAGE_TIMEOUT_MS` and `LAGRANGE_CAPTURE_LOGS` is INFERRED from the code path.
- **Billing truth.** Spend is from list prices only.
