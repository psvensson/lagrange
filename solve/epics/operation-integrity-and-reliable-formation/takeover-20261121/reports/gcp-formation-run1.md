# GCP formation run 1 on f580579a5 (pinned baseline)

Scenario `fresh-formation-user-table-routability`, three nodes, one per VM, f580579a5 (tree a5c09a1b), shipped configuration. Diagnostic run, not certification. **Result: FAIL after 617.7 s.**

- Evidence: `/mnt/data/peter/projects/lagrange-takeover-20261121/lab/gcp-formation-f580579a5-run1/`, laid out like the lab run 2 evidence: `report.json`, `.playback/`, the generated config, `harness-console.log`, `vm/<name>/diag/` per VM, `baseline-identity.json`, `procedure/`, `derived/`, `archives/`.
- Labels: EXECUTED means run or read from evidence. INFERRED means my reading. Lab numbers come from `reports/formation-run2-analysis.md`, and I recomputed the log counts with the same script (`derived/lab-run2-extract.json`); they match exactly.

## 1. Route, commands, resources

**Route (EXECUTED).** I used route 2, the unchanged lab adapter, but **the controller ran on one of the VMs (`lagrange-fdiag-3`) instead of this workstation**.

Why:
- Route 1 conflicts with the guardrails. `run-distributed-matrix.js --target gcp` runs the whole matrix with no single-scenario selection. Its `GCPProvisioner` (Pulumi) creates its own VPC and `ddb-*` firewall rules without labels, and needs a custom image family. Its `installImage` does `docker save` on this workstation and uploads the image from here.
- Route 2 with a controller on this workstation is not possible without a source change. `scripts/lab/harness.js` `buildRemoteConfig` writes `hostInfo.internalIp = externalIp = node.ip`. Peers dial `internalIp` (cluster-class-lifecycle-base.js:524). The runner dials `externalIp` for admin/REST (cluster-class-quiescence.js:1398).
  - With internal IPs, this workstation cannot reach the nodes.
  - With external IPs, nodes would talk over external addresses, and node ports would have to be opened to the internet.
- With the controller inside the VPC, the harness code path, command and generated config shape are exactly those of the lab run, and everything travels over internal IPs.
- Differences from the lab run:
  - The controller shares a host with node 2.
  - The driver runs at nice 19.
  - The driver-to-node polls cross the VPC, not Wi-Fi.

**`LAGRANGE_LOOP_GAP_THRESHOLD_MS` was not set (EXECUTED check).** It is not in `FORWARDED_HOST_ENV_KEYS` (cluster-class-lifecycle-base.js:61), so the harness does not forward it without a source change. No `LAGRANGE_*` variable was set.

**Commands (repeatable; the scripts are in `procedure/`):**
```
# workstation: source transport, 44 MB, one upload
git clone -q --depth 1 --branch wip/core-three-repairs-composed-20261121 --bare file:///mnt/data/peter/projects/lagrange src.git && tar -cf src.git.tar src.git
gcloud compute instances create lagrange-fdiag-1 lagrange-fdiag-2 lagrange-fdiag-3 --project=something-2e584 --zone=europe-north1-a \
  --machine-type=e2-standard-4 --network=default --image-family=ubuntu-2404-lts-amd64 --image-project=ubuntu-os-cloud \
  --boot-disk-size=50GB --boot-disk-type=pd-ssd --labels=purpose=lagrange-formation-diag-20261121 \
  --max-run-duration=10800s --instance-termination-action=DELETE --boot-disk-auto-delete \
  --metadata-from-file=startup-script=procedure/startup.sh        # apt: docker.io git iputils-ping
# each VM (gcloud compute ssh): sudo usermod -aG docker peter
# lagrange-fdiag-3: gcloud compute scp src.git.tar; bash controller-setup.sh
#   (Node v22.23.2 tarball, SHASUMS256 verified; git clone; npm ci; ed25519 key)
# controller pubkey appended to ~/.ssh/authorized_keys on all 3; ssh-keyscan of the 3 internal IPs on the controller
# on lagrange-fdiag-3, in ~/lagrange:
node scripts/lab.js node add lagrange-fdiag-1 --ssh peter@10.166.15.206 --ip 10.166.15.206 --os linux --arch x64 --roles harness
node scripts/lab.js node add lagrange-fdiag-2 --ssh peter@10.166.15.205 --ip 10.166.15.205 --os linux --arch x64 --roles harness
node scripts/lab.js node add lagrange-fdiag-3 --ssh peter@10.166.15.204 --ip 10.166.15.204 --os linux --arch x64 --roles harness
node scripts/lab.js harness doctor --nodes lagrange-fdiag-1,lagrange-fdiag-2,lagrange-fdiag-3          # ok x3
bash ~/measure.sh start <self> <peer>=<ip> ...          # on each VM, before the harness
setsid nohup bash ~/run-formation.sh ...                 # = nice -n 19 node scripts/lab.js harness run fresh-formation-user-table-routability \
                                                         #   --nodes lagrange-fdiag-1,lagrange-fdiag-2,lagrange-fdiag-3 --nodes-per-host 1 -- --capture-logs
bash ~/measure.sh stop                                   # on each VM, after the harness exits
gcloud compute instances delete lagrange-fdiag-1 lagrange-fdiag-2 lagrange-fdiag-3 --zone=europe-north1-a --delete-disks=all --quiet
```

**Resources (EXECUTED).** No firewall rule was created: the default network's `default-allow-internal` (10.128.0.0/9) and `default-allow-ssh` sufficed. No address, registry or image resource was created.

| VM | Internal IP | Role | Created (UTC) | Deleted (UTC) |
| --- | --- | --- | --- | --- |
| lagrange-fdiag-1 | 10.166.15.206 | node 0 (seed) | 12:01:16 | 12:29:59 |
| lagrange-fdiag-2 | 10.166.15.205 | node 1 | 12:01:16 | 12:29:59 |
| lagrange-fdiag-3 | 10.166.15.204 | node 2 + controller | 12:01:16 | 12:29:59 |

- All three: zone europe-north1-a, e2-standard-4 (4 vCPU, 16 GB, Intel Broadwell 2.2 GHz), 50 GB pd-ssd boot disk, label `purpose=lagrange-formation-diag-20261121`, max-run-duration 10800 s with DELETE.
- Image: ubuntu-2404-noble-amd64-v20261105, kernel 7.0.0-1017-gcp, Docker 29.1.3 (containerd snapshotter, cgroup v2).
- The full identity is in `baseline-identity.json`.

## 2. Result (EXECUTED, from report.json and the node full logs)

- **FAIL**, scenario duration 617.7 s, exit 1, verdict `BLOCK_EVIDENCE_INCOMPLETE / log_window_coverage_incomplete`.
- Wall time: setup 510.3 s (three sequential image builds), scenario 624.4 s, teardown 4.7 s.
- Predicate line:
  `first unmet predicate c-replica-operations-quiet (projection_in_flight:751f5575…, projection_in_flight:868fba57…, projection_in_flight:fab780c9…, replica_operations_in_flight); unmet: c-replica-operations-quiet, e-write-readback-every-node; time-to-serve-lane 219ms, time-to-user-table-routable 438235ms`
- Met: a-serve-lane-open, b-priority-spread, d-user-table-routable, f-no-learner-address-unresolvable-for-committed-row, g-projection-agrees-with-authority, observation-integrity.
- Not met:
  - **c-replica-operations-quiet**, in all 234 polls. In flight at the end: `pl-wasm_operations-p1-1434-0:ADD:pending` and `pl-storage_reservations-p1-1440-0:GROWTH_PROMOTE:syncing`.
  - **e-write-readback-every-node**: `insert_failed:public_pg_unavailable: Timed out waiting for healthy public PostgreSQL wire endpoint`, plus readback row mismatches on all three nodes. The per-node admin inserts returned `affectedRows 1`.
- Timeline:
  - Seed process start 12:14:29.791. `cluster.ready` 12:15:11.973 (42.2 s later).
  - Formation step 12:15:11.974 → 12:22:11.974 (420.0 s bound; `formationSatisfied false`).
  - User-table step 12:22:11.974 → 12:22:30.209.
  - Write/readback step → 12:24:32.8.
- Time to serve lane: 219 ms from scenario start (42.4 s from seed start). Time to user table routable: 438.2 s from scenario start (480.4 s from seed start). The user table was issued after the formation bound, not after formation was satisfied.
- Polls 234. Failed reads 0. Failed control-snapshot reads 0. Playback snapshots 523.
- Priority partitions reached 3/3, in scenario seconds: ledger `replica_operations-p1` 12.3; control_plane_publications 43.9; schema_operations 43.9; sql_transaction_participants 46.7; sql_transactions 65.8; sql_write_operations 72.2.
  - `b` was met from 72.2 s, then went unmet in 6 later polls, all `partitions_observation_incomplete`.
  - `a` was unmet in 4 polls (`serve_ineligible`: 58.6 s, 218–221 s).
- Ledger leadership: 2 quorum elections, max term 2. The seed took term 1; the fdiag-2 node took term 2. 44 of the 47 partitions with leadership evidence show exactly 2 elections (seed term 1, a joiner term 2). The exceptions stay at term 1: `logs-p1` and `nodes-p1` on the seed, and the user table `tbl-5aa54f3c…-p1` on fdiag-2.

**Per-node counts.** Node IDs: seed 751f5575 on fdiag-1; fab780c9 on fdiag-2; 868fba57 on fdiag-3.

| Class | seed (fdiag-1) | fdiag-2 | fdiag-3 |
| --- | --- | --- | --- |
| `Wait bound spent` | 83 | 218 | 261 |
| `Failed to send message` | 5 | 7 | 7 |
| `Skipping ACK-timeout quarantine … (slow, not dead)` | 0 | 4 | 2 |
| `Named control-plane write wait expired` (lines) | 0 | 0 | 0 |
| Event-loop gap ≥ 1 s (watchdog 1000 ms) | 11 (max 5026 ms at 12:14:40.565, bootstrap) | 5 (max 3621 ms) | 4 (max 4427 ms) |

**First occurrences (node clocks):**
- `Wait bound spent`:
  - seed 12:15:29.115: `message-router` "remaining SERVICE_RESPONSE grant after ACK", bound 4620 ms, elapsed 4634 ms.
  - fdiag-2 12:15:00.951 and fdiag-3 12:15:02.217: `REPLICA_OPERATION_READ_RETRY_TIMEOUT_MS` 1000 ms, error `authoritative_row_source_unavailable`.
- First delivery-ACK miss (`MESSAGE_TIMEOUT_MS (delivery ACK)`):
  - fdiag-2 12:15:02.504 (bound 500, elapsed 501), 32.7 s after seed start.
  - fdiag-3 12:15:02.722 (499/501).
  - seed 12:15:31.172 (500/908).
- `Failed to send message`: seed 12:18:44.008, fdiag-2 12:15:36.748, fdiag-3 12:15:37.046. All carry `"error":"Recovery read delivery closed"`.
- ACK-timeout quarantine skip: fdiag-2 12:15:58.351 (target seed `swim-ping`, `lastInboundAgoMs 648`); fdiag-3 12:16:08.500 (target seed `replica_operations-p1-r1`, `lastInboundAgoMs 628`).
- Named-write wait expired: none.

## 3. Network, containers, host (EXECUTED)

**ICMP, 1 Hz, during the scenario window (12:14:16–12:24:34).** 603–604 samples per direction, 0 lost in all 6 directions.

| Pair | min | avg | p99 | max | loss |
| --- | --- | --- | --- | --- | --- |
| fdiag-1→2 | 0.133 | 0.245 | 0.400 | 0.553 | 0 % |
| fdiag-1→3 | 0.151 | 0.264 | 0.406 | 0.590 | 0 % |
| fdiag-2→1 | 0.121 | 0.245 | 0.412 | 0.593 | 0 % |
| fdiag-2→3 | 0.135 | 0.251 | 0.412 | 0.490 | 0 % |
| fdiag-3→1 | 0.140 | 0.263 | 0.381 | 0.434 | 0 % |
| fdiag-3→2 | 0.119 | 0.252 | 0.384 | 0.433 | 0 % |

Times in ms. Over the whole measurement window (12:05:23–12:24:58, including the image builds) the maximum was 1.59 ms and loss stayed 0.

**TCP retransmits (`nstat`, host-wide), scenario window:**

| VM | Retransmitted segments | Segments sent | Rate |
| --- | --- | --- | --- |
| fdiag-1 | 4038 | 1.570 M | 0.26 % |
| fdiag-2 | 7494 | 1.314 M | 0.57 % |
| fdiag-3 | 5872 | 0.656 M | 0.89 % |

- Before → after the whole window: 5→4105, 0→7574, 1→5942.
- `TcpExtTCPLostRetransmit` 0 everywhere. `TcpExtTCPTimeouts` +6 on fdiag-1 over the whole window, 0 elsewhere.
- Per-connection `ss -ti` totals on ports 8080–8102 account for nearly all retransmits.
- Kernel smoothed TCP RTT on the node-port connections: p50 1.19 / 1.37 / 4.28 ms, p99 12.4 / 13.8 / 21.8 ms, max 23 / 32 / 36 ms (fdiag-1/2/3).

**Containers (`docker inspect` during the run):** `NanoCpus=1000000000` (1.0 CPU), `Memory=1073741824` (1 GiB; MemorySwap 2 GiB), `NetworkMode=host`, on all three. This equals the base config `local-three-node.json` (1.0 CPU / 1g).

**docker stats, about every 10 s, scenario window:**

| Node | CPU p50 | CPU p90 | CPU max | Memory max |
| --- | --- | --- | --- | --- |
| seed (fdiag-1) | 97.8 % | 101.6 % | 106 % | 533 MiB |
| fdiag-2 | 88.7 % | 97.2 % | 102 % | 498 MiB |
| fdiag-3 | 92.0 % | 100.4 % | 104 % | 569 MiB |

**Host:**

| VM | uptime before | uptime after | load1 during scenario (p50 / max) | vmstat idle min | iowait max |
| --- | --- | --- | --- | --- | --- |
| fdiag-1 | 0.04, 0.11, 0.05 | 1.02, 0.91, 0.59 | 0.91 / 1.22 | 68 % | 5 % |
| fdiag-2 | 0.12, 0.19, 0.09 | 0.61, 0.78, 0.55 | 0.81 / 1.31 | 70 % | 4 % |
| fdiag-3 (controller) | 0.36, 0.36, 0.16 | 1.29, 1.29, 0.85 | 1.29 / 1.96 | 65 % | 5 % |

Steal was 0 % throughout. There were no OOM, kill or conntrack kernel messages.

**Per-call cost of identical synchronous code** (`publication_recovery_gate_snapshot_build` totalMs/count, the metric the run 2 analysis used): seed 0.145, fdiag-2 0.142, fdiag-3 0.141 ms.

## 4. Side by side (lab run 2 versus this run)

| Row | Lab run 2 (Wi-Fi) | GCP run 1 |
| --- | --- | --- |
| Result, duration | FAIL, 508.5 s | FAIL, 617.7 s |
| Setup wall time | 100.9 s (cached image) | 510.3 s (3 fresh builds) |
| a serve lane | fail | **pass** (4 of 234 polls unmet) |
| b priority spread | fail | **pass** (from 72.2 s) |
| c replica operations quiet | fail | fail (all polls; 2 ops in flight at end) |
| d user table routable | fail (`ready_lease_expired`) | **pass** at 438.2 s |
| e write/readback | not evaluated | fail (`public_pg_unavailable`) |
| f learner address | pass | pass |
| g projection agrees | fail (80 s on ADAM) | **pass** |
| observation integrity | fail (37) | **pass** (0) |
| First unmet | a-serve-lane-open | c-replica-operations-quiet |
| Time to serve lane (scenario / seed start) | 8006 ms / 43.7 s | 219 ms / 42.4 s |
| Time to user table routable | never | 438.2 s (480.4 s from seed start) |
| Seed start → cluster.ready | 35.1 s | 42.2 s |
| Formation step | 420.0 s, not satisfied | 420.0 s, not satisfied |
| Polls / failed reads / failed control-snapshot reads | 34 / 37 / 30 (seed 21, GAMLA 9) | 234 / 0 / 0 |
| Playback snapshots | 74 (303 s gap) | 523 |
| 3/3 spread: ledger, cpp, schema, sql_tx, sql_tx_part, sql_write (s) | 23.9, 113.8, 113.8, 379.5, 387.5, never | 12.3, 43.9, 43.9, 65.8, 46.7, 72.2 |
| Ledger leadership (elections / max term) | 10 observed, max term 19 (ADAM campaigned 18×) | 2, max term 2 |
| Other partitions | 41 of 46 have 1 election (seed term 1); cpp max term 22, schema 12 | 44 of 47 have 2 (term 1 seed, term 2 joiner); logs, nodes, user table stay at term 1 |
| First delivery-ACK miss after seed start | 36.6 s (ADAM→SEED, 999/1000) | 32.7 s (fdiag-2, 500/501) |
| `Wait bound spent` (seed / 2nd / 3rd) | 1336 / 829 / 738 | 83 / 218 / 261 |
| `Failed to send message` | 268 / 162 / 108 | 5 / 7 / 7 |
| ACK-timeout quarantine skips | 43 / 326 / 388 | 0 / 4 / 2 |
| `Named control-plane write wait expired` | 31 / 0 / 0 | 0 / 0 / 0 |
| Event-loop gaps ≥ 1 s | 1 / 0 / 0 (seed bootstrap 2133 ms) | 11 / 5 / 4 (max 5026, 3621, 4427 ms) |
| Per-call sync cost (ms) | 0.069 / 0.106 / 0.172 | 0.145 / 0.142 / 0.141 |
| Container CPU after startup | seed 17–40 %, ADAM 29–64 %, GAMLA 24–60 % (sparse) | p50 98 / 89 / 92 %, p90 ≈ 97–102 % |
| Container memory max | ≤ 600 MB | 533 / 498 / 569 MiB |
| Container limits | 1.0 CPU / 1g (config) | NanoCpus 1e9 / 1 GiB, host network (inspected) |
| ICMP RTT | separate idle measurement 11:53–12:03: loss 0–3.3 %, p50 7–196, p99 498–874, max 706–1163 ms | during run: loss 0 %, avg 0.25, p99 ≤ 0.41, max ≤ 0.59 ms |
| TCP retransmits | not measured | 4038 / 7494 / 5872 segs (0.26 / 0.57 / 0.89 %) |
| Controller | workstation, wired; polls over Wi-Fi | on fdiag-3 (shares node 2's host), nice 19; polls over VPC |

## 5. Teardown proof (EXECUTED, 2026-11-21T12:30:07Z; `derived/teardown-proof.txt`)

```
$ gcloud compute instances list --filter="name~^lagrange-fdiag- OR labels.purpose=lagrange-formation-diag-20261121"
Listed 0 items.
$ gcloud compute disks list --filter="name~^lagrange-fdiag- OR labels.purpose=lagrange-formation-diag-20261121"
Listed 0 items.
$ gcloud compute firewall-rules list --filter="name~^lagrange-fdiag-"
(empty; all rules: default-allow-icmp, default-allow-internal, default-allow-rdp, default-allow-ssh)
$ gcloud compute instances list   ->  lagrange-ci-runner  europe-north1-a  TERMINATED   (untouched)
$ gcloud compute addresses list   ->  Listed 0 items.
```

**Workstation inventory.** I never wrote `~/.config/lagrange/lab/inventory.json`; every `lab` command ran on the controller VM against that VM's own inventory. I backed the file up first (sha256 b10b260e…, `derived/workstation-lab-inventory-before.json`). Its hash is now fc017134…, because other agents' concurrent `lab test changed` probes on the home lab refreshed it at 12:30 UTC. Their changes are probe timestamps, free-space numbers and machine-lock holders. The node set is unchanged and there are 0 `fdiag` entries. **I did not restore the backup**, because that would erase their live data.

**Spend (INFERRED from list prices, not billing data).**
- 3 × e2-standard-4 for about 28.7 min each, plus 150 GB pd-ssd and 3 ephemeral IPv4 addresses.
- About $0.50 per hour for the set: about $0.148/h per VM in europe-north1, $0.038/h for the disks, $0.015/h for the IPs. The repository's curated table has $0.134/h for us-central1.
- Total about $0.25. Egress about 7 MB.

## 6. Not captured, deviations, caveats

- **The controller shares a host with node 2.** This is a deviation from the lab topology. fdiag-3 had the highest host load (load1 max 1.96 of 4 vCPU, idle ≥ 65 %).
- **Image identity.** Each VM built its own image through the harness's `buildOnHosts` owner (sequentially). The image IDs therefore differ: 2020d2c0…, 18cd395c…, 83578cbf…. Each node container ran its own host's image.
  - Base images are the same digests everywhere.
  - The first 19 of 26 layers are identical.
  - The sha256 of all 7928 files under `/app` is identical on all three VMs (manifest 56fc9385…).
  - The lab run built per host the same way.
- **Loop-gap threshold.** `LAGRANGE_LOOP_GAP_THRESHOLD_MS=100` could not be set, so only gaps ≥ 1 s are visible. There is no sub-second loop-delay series.
- **Unparsed log lines.** The node full logs contain 12 / 17 / 592 non-JSON lines (fdiag-1/2/3). The counts above cover JSON lines only, the same method that reproduces the lab numbers.
- **Not measured:**
  - Lab TCP retransmits, and lab RTT during run 2 (the lab RTT row is a separate idle measurement).
  - cgroup CPU-throttle counters (`cpu.stat nr_throttled`); only docker-stats CPU % exists.
  - Billing truth.
- **Large file.** `snapshots.ndjson` is 527 MB. The whole evidence directory is 576 MB, plus a 3.3 MB zstd archive in `archives/`.

## 7. Five-VM variant of this route (commands only; nothing provisioned)

```
gcloud compute instances create lagrange-fdiag-1 lagrange-fdiag-2 lagrange-fdiag-3 lagrange-fdiag-4 lagrange-fdiag-5 \
  <same flags as above>      # E2_CPUS quota 72 >= 20; SSD quota fine
# per VM: wait for /var/lib/lagrange-fdiag-startup-done; sudo usermod -aG docker peter
# controller on the last-placed VM (lagrange-fdiag-5): scp src.git.tar + controller-setup.sh; run it
# append the controller pubkey on all 5; ssh-keyscan the 5 internal IPs on the controller
node scripts/lab.js node add lagrange-fdiag-N --ssh peter@<ipN> --ip <ipN> --os linux --arch x64 --roles harness   # N=1..5
node scripts/lab.js harness doctor --nodes lagrange-fdiag-1,...,lagrange-fdiag-5
bash ~/measure.sh start lagrange-fdiag-N <the other four as NAME=IP>      # 20 ping directions
nice -n 19 node scripts/lab.js harness run <SCENARIO> --base test/distributed/config/local.json \
  --nodes lagrange-fdiag-1,lagrange-fdiag-2,lagrange-fdiag-3,lagrange-fdiag-4,lagrange-fdiag-5 --nodes-per-host 1 -- --capture-logs
gcloud compute instances delete lagrange-fdiag-1 ... lagrange-fdiag-5 --zone=europe-north1-a --delete-disks=all --quiet
```

- **Base config.** The five-node base config `test/distributed/config/local.json` (size 5) has `resourceLimits` 2g / 2.0 CPU and shorter timeouts (nodeStartup 30000, convergence 60000), unlike the three-node config (1g / 1.0 CPU). The lab's five-node acceptance is `public-path-multinode-baseline` on that config.
- **Setup time.** Five sequential per-host builds take about 15 min of setup.
- **One image ID on every VM, if required.** Build once and `docker save | docker load` over internal ssh to the other four before the run. The harness then reuses the image, because the label `ddb.git-hash` matches HEAD and the tree is clean.
- **Cost (INFERRED).** About $0.83/h (5 × $0.148 + 250 GB pd-ssd $0.064 + 5 IPs $0.025). A 45-minute run is about $0.65.
