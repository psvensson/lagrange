# Reproducing Comparative Benchmarks on GCP, AWS, and Azure

Back to [Comparative Benchmark Landing Page](README.md) ([HTML Dashboard](index.html)) | [Scenario Specifications](tidb-reference-scenarios.md)

This guide explains how anyone with access to **Google Cloud Platform (GCP)**, **Amazon Web Services (AWS)**, **Microsoft Azure**, or any **5 Linux hosts with Docker and SSH** can reproduce the 14-system comparative benchmark suite (`v0.4.0`) for themselves.

---

## 1. Architecture & Resource Sizing

The full comparative suite runs across **5 Linux VMs** in the same private VPC/VNet so that multi-node Raft/Paxos replication (`RF=3`), distributed SQL coordinators, and client-to-cluster RTT sweeps reflect real network and storage behavior.

| Cloud Provider | Provisioning Script | Default Instance Type | vCPU / RAM | Disk | Estimated 30-Min Run Cost (5 VMs) |
| --- | --- | --- | --- | --- | --- |
| **Google Cloud (GCP)** | [`cloud/provision-gcp.sh`](cloud/provision-gcp.sh) | `n2-standard-4` | 4 vCPU / 16 GB | 50 GB `pd-ssd` | ~$0.49 USD |
| **Amazon Web Services (AWS)** | [`cloud/provision-aws.sh`](cloud/provision-aws.sh) | `m6i.xlarge` | 4 vCPU / 16 GB | 50 GB `gp3` | ~$0.48 USD |
| **Microsoft Azure** | [`cloud/provision-azure.sh`](cloud/provision-azure.sh) | `Standard_D4s_v5` | 4 vCPU / 16 GB | 50 GB `StandardSSD_LRS` | ~$0.48 USD |
| **Any 5 SSH + Docker Hosts** | Bring your own hosts | 4+ vCPU / 16+ GB | Ubuntu 24.04 + Docker | 50 GB SSD | $0 (existing hardware) |

### Public Container Images Used
All 14 benchmarked targets pull directly from public container registries (no proprietary licenses or private credentials required):
- **Lagrange (`v0.4.0`):** `psvensson/lagrange:0.4.0`
- **Distributed & Single-Primary SQL:** `postgres:16`, `citusdata/citus:12.1`, `pingcap/pd:v8.5.8`, `pingcap/tikv:v8.5.8`, `pingcap/tidb:v8.5.8`, `cockroachdb/cockroach:v24.1.0`, `yugabytedb/yugabyte:2.20.7.0-b58`
- **In-Memory, KV & NoSQL Comparators:** `apacheignite/ignite:2.16.0`, `redis:7-alpine`, `docker.dragonflydb.io/dragonflydb/dragonfly:latest`, `aerospike/aerospike-server:latest`, `foundationdb/foundationdb:7.1.57`, `scylladb/scylla:5.4`, `mongo:latest`, `node:22-slim` (`node:sqlite` WAL)

---

## 2. Option A: Run on Google Cloud Platform (GCP)

### Prerequisites
- [`gcloud` CLI](https://cloud.google.com/sdk/docs/install) authenticated (`gcloud auth login`) with Compute Engine API enabled.
- Node.js `>= 22.13.0` on the runner machine.

### Step 1 - Provision the 5 GCP VMs
```sh
export PROJECT_ID="your-gcp-project-id"
export ZONE="us-central1-a"
./docs/benchmarks/cloud/provision-gcp.sh
```
The script creates 5 `n2-standard-4` Ubuntu 24.04 VMs (`lagrange-bench-1` .. `lagrange-bench-5`), configures an intra-cluster VPC firewall rule, installs Docker on each VM, and prints the `export HOSTS=...` and `export SSH_USER=...` variables.

### Step 2 - Run the Comparative Benchmark Suite
From `lagrange-bench-1` (or any machine with VPC SSH connectivity to the 5 internal IPs):
```sh
git clone https://github.com/psvensson/lagrange.git
cd lagrange
npm ci

# Preview the 5-node execution plan without SSHing:
node docs/benchmarks/cloud/run-comparative-benchmarks.mjs --hosts "$HOSTS" --dry-run

# Run the live 5-node Docker suite and regenerate docs/benchmarks/*:
node docs/benchmarks/cloud/run-comparative-benchmarks.mjs \
  --hosts "$HOSTS" \
  --ssh-user "$SSH_USER" \
  --regenerate-docs
```

### Step 3 - Tear Down GCP Resources
```sh
./docs/benchmarks/cloud/provision-gcp.sh --teardown
```

---

## 3. Option B: Run on Amazon Web Services (AWS)

### Prerequisites
- [`aws` CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) configured (`aws configure`) and an existing EC2 SSH key pair in your target region.

### Step 1 - Provision the 5 AWS EC2 Instances
```sh
export REGION="us-east-1"
export KEY_NAME="your-ec2-keypair-name"
./docs/benchmarks/cloud/provision-aws.sh
```
The script resolves the latest Ubuntu 24.04 LTS `gp3` AMI via AWS SSM, creates security group `lagrange-bench-sg` allowing intra-cluster traffic and SSH, launches 5 `m6i.xlarge` instances with Docker installed via `user-data`, and prints `export HOSTS=...`.

### Step 2 - Run the Comparative Benchmark Suite
```sh
node docs/benchmarks/cloud/run-comparative-benchmarks.mjs \
  --hosts "$HOSTS" \
  --ssh-user ubuntu \
  --ssh-key ~/.ssh/your-ec2-keypair.pem \
  --regenerate-docs
```

### Step 3 - Tear Down AWS Resources
```sh
./docs/benchmarks/cloud/provision-aws.sh --teardown
```

---

## 4. Option C: Run on Microsoft Azure

### Prerequisites
- [`az` CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli) authenticated (`az login`).

### Step 1 - Provision the 5 Azure VMs
```sh
export RESOURCE_GROUP="lagrange-bench-rg"
export LOCATION="eastus"
./docs/benchmarks/cloud/provision-azure.sh
```
The script creates resource group `lagrange-bench-rg`, VNet `10.42.0.0/16`, NSG `lagrange-bench-nsg`, and 5 `Standard_D4s_v5` Ubuntu 24.04 VMs (`lagrange-bench-1` .. `lagrange-bench-5`) with Docker enabled via cloud-init, then outputs `export HOSTS=...`.

### Step 2 - Run the Comparative Benchmark Suite
```sh
node docs/benchmarks/cloud/run-comparative-benchmarks.mjs \
  --hosts "$HOSTS" \
  --ssh-user azureuser \
  --regenerate-docs
```

### Step 3 - Tear Down Azure Resources
```sh
./docs/benchmarks/cloud/provision-azure.sh --teardown
```

---

## 5. Option D: Single-Machine Quick Comparison (No Cloud Account Required)

If you want to verify Lagrange's co-located compute-near-data speedup vs. client-fetched remote execution on a single laptop or workstation without provisioning 5 VMs:

```sh
npm ci
npm run demo:movielens
```

This executes [`examples/service-data-affinity/run-comparison.js`](../../examples/service-data-affinity/run-comparison.js) locally and prints the side-by-side latency and throughput comparison.

---

## 6. Reference Files & Regenerators

- Cloud provisioning & runner scripts:
  - [`docs/benchmarks/cloud/provision-gcp.sh`](cloud/provision-gcp.sh)
  - [`docs/benchmarks/cloud/provision-aws.sh`](cloud/provision-aws.sh)
  - [`docs/benchmarks/cloud/provision-azure.sh`](cloud/provision-azure.sh)
  - [`docs/benchmarks/cloud/run-comparative-benchmarks.mjs`](cloud/run-comparative-benchmarks.mjs)
- Benchmark matrix & static web regenerators:
  - [`test/distributed/harness/comparative-matrix-runner.js`](../../test/distributed/harness/comparative-matrix-runner.js)
  - [`test/distributed/harness/scaleout-series-experiments.js`](../../test/distributed/harness/scaleout-series-experiments.js)
  - [`test/distributed/harness/tidb-reference-physical-topology.js`](../../test/distributed/harness/tidb-reference-physical-topology.js)
- Recorded measurement stores:
  - [`data/tidb-comparison/history.ndjson`](../../data/tidb-comparison/history.ndjson)
  - [`data/tidb-comparison/progress-summary.json`](../../data/tidb-comparison/progress-summary.json)
  - [`data/tidb-comparison/multi-system-matrix.json`](../../data/tidb-comparison/multi-system-matrix.json)
