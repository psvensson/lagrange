---
audience: evidence
recorded: 2026-11-02
quest: comparative-benchmark-evidence-repair
---

# Live diagnosis 2026-11-01: summary (derived index)

Full report: relocated bundle `comparative-benchmark-evidence-repair--comparative-benchmark-evidence-repair-evidence-2247fccd2-2026-11-01.tar.gz`, sha256 `5c535ce6bb2cd0232e276af9f895405cc264ecc7c25acfaf06d974ffd0f25b69`, file `live-diagnosis-2026-11-01.md`
(URL and per-file sha256 in `log.ndjson` and
`solve/changes/evidence-relocation/comparative-benchmark-evidence-repair/relocation-inventory/`).
Section numbers below are the full report's.

## Answers

- **(a)** Not on the 3-/4-node clusters as deployed: every Scenario A UPDATE answered after 29.7-30.0 s with
  `DISTRIBUTED_PARTICIPANT_FAILURE` / `Partition service not found` (no affectedRows, no writeReceipt), so a
  5 s client saw 100 % timeouts (D01). On the 5-node cluster, once `bench_accounts` became routable (~2 min
  41 s after CREATE), the UPDATE answered in 0.17-1.6 s with `affectedRows:1`; ten acks advanced
  balance/version by exactly ten (§7.3).
- **(b)** The 4-node 153 B answers are the `TABLE_NOT_FOUND` envelope (152 B live; mean 153.31 B with the
  driver's ids): the `bench_*` tables were never registered on the queried nodes (§3.5).
- **(c)** PG-wire scale, discovery, connection and auth work on every topology; SQL fails like the admin
  stream while unroutable (`XX000`); on the routable 5-node cluster write + readback work end to end
  (rowCount 1 in 0.29-0.59 s; integers arrive as text) (§7.4).
- **(d)** Canonical adapter dataset preparation fails on both: 3-node 55P03 for 120 s; 5-node 55P03 then
  `XX000` participant failure from `tableExists` (33.7 s); no transaction family was exercised (§5, §7.4).
- **(e)** Five different "0.4.0" artifacts; the lab tag cannot start a seed; the GCP digest is not on
  Docker Hub; the live steps used the Hub image by digest (§0.3).

**Classification:** client handling hid a product failure - the driver's 5 s timer counted every request as
completed ~25 s before the product answered `DISTRIBUTED_PARTICIPANT_FAILURE`, and the product failure is
that user-table partitions on a `/health`-ready cluster stay unroutable for minutes (serve lane blocked by
control-plane priority recovery, provisioning cohort failures, `node_ready_lease_incomplete`).

## Hosts (§0.1)

| Host | IP | Kernel | Docker | nproc | RAM |
| --- | --- | --- | --- | --- | --- |
| tv-dator (seed) | 192.168.86.32 | 6.8.0-138 (Ubuntu 22.04) | 29.9.2 | 12 | 15 GiB |
| adam-laptop | 192.168.86.34 | 7.0.0-34 (Ubuntu 24.04) | 29.1.3 | 8 | 15 GiB |
| adams-gamla | 192.168.86.41 | 6.14.0-37 (Ubuntu 24.04) | 29.1.3 | 4 | 15 GiB |
| lenovo-laptop | 192.168.86.27 | 6.8.0-64 (Ubuntu 22.04) | 29.1.3 | 8 | 15 GiB |
| carinas-windows | 192.168.86.26 | 6.18.33.2 WSL2 | 29.1.3 | 12 | 7 GiB |

## Image identity (§0.3)

| Where | Reference | Image id | Starts a seed? |
| --- | --- | --- | --- |
| tv-dator, adam-laptop, adams-gamla, carinas-windows | `psvensson/lagrange:0.4.0` (local tag) | `sha256:d5b7b368…` (0.2.5 image + 0.4.0 sources, no `npm ci`) | No (exit 1 in 1.7 s) |
| lenovo-laptop | local tag | `sha256:1ccf95e8…` | not tried |
| controller | local tag | `sha256:d830c94f…` | not used |
| GCP campaign | `psvensson/lagrange@sha256:5437366a…` | unknown | not on Docker Hub |
| Docker Hub tag | manifest `sha256:c0fcc0d3…` | `sha256:18aeffc9…` | Yes (used for all live steps) |

## Classification table (§8)

| # | Observation -> owner |
| --- | --- |
| C1 | 5 s client timer counts every request completed; the product's 29.8 s participant failure discarded -> client handling (D01/D03) |
| C2 | No user-table partition routable on a predicate-ready cluster (serve lane blocked by priority recovery, provisioning cohort 0/2) -> product defect |
| C3 | Harness called the cluster ready 15 s after joiners started; `/health` ready = SQL engine object exists -> setup/readiness (D05) |
| C4 | 4-node 35-65 ms / 153 B rows are `TABLE_NOT_FOUND` envelopes over an abandoned CREATE -> client handling over setup failure |
| C5 | Seed INSERTs never existed (3 s wait, answer ignored) -> client handling + product (C2) |
| C6 | PG wire: scale + discovery fine, SQL `XX000` -> product (C2); minor SQLSTATE fidelity |
| C7 | Adapter dataset preparation 55P03, table never visible in 120 s -> product (provisioning convergence) |
| C8 | Lab image cannot start a seed (missing componentize-js) -> setup (image provenance) |
| C9 | "0.4.0" names five artifacts; GCP digest unretrievable -> setup (identity, D18) |
| C10 | `lane=bench` meaningless, `SELECT 1` unanswerable on admin stream, ~250 KB cache_dump per client -> client handling |
| C11 | Provisioning convergence non-deterministic (5-node 2 min 41 s; 3-/4-node never in 13-21 min) -> product defect; harness waits |
| C12 | 5-node UPDATEs `affectedRows:0` counted complete (D08) -> client handling |
| C13 | UPDATE receipts carry no durable commit witness (INSERT receipts do) -> transaction execution (receipt owner) |
| C14 | Joiner heartbeats 20 s-4 min stale, ready leases expire, `node_ready_lease_incomplete` -> product (readiness publication) |
| C15 | Routable 5-node PG-wire write + readback works; integers as text -> works; minor wire typing |
| C16 | Adapter setup fails on routable 5-node: `tableExists` gets `XX000` during provisioning -> product + adapter contract gap |
