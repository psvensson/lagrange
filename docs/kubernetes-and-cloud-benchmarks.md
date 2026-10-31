---
audience: operator
documentClass: current
---

# Kubernetes Deployment and Cloud Benchmarks Guide

This guide provides practical, copy-pasteable instructions for operators and platform engineers who want to:
1. **Deploy Lagrange on an existing Kubernetes cluster** using the official Helm chart (`charts/lagrange-node`), configure credentials, and deploy data-local services without pod-level volume mounts.
2. **Run all benchmark and comparison scenarios in your own cloud or lab** (GCP, AWS, Azure, or on-premise hardware) to independently measure throughput, latency, locality, and freshness against PostgreSQL and TiDB/TiKV.

---

## Part 1: Deploying Lagrange on an Existing Kubernetes Cluster (`charts/lagrange-node`)

Lagrange packages an official Helm chart at `charts/lagrange-node`. It establishes a distributed cluster using Kubernetes StatefulSets with stable DNS naming and persistent volume claims (PVCs).

### 1. Cluster Topology and Prerequisites

- **Kubernetes**: 1.26 or newer
- **Helm**: 3.10 or newer
- **Storage**: A dynamic PersistentVolume provisioner (default storage class or explicitly configured)
- **Topology Architecture**:
  - **Seed Node StatefulSet** (1 replica): Initializes cluster consensus and coordinates initial join handshakes.
  - **Joiner Node StatefulSet** (`joiners.replicas`): Additional cluster members forming partition and Raft consensus groups.
  - **Total Cluster Nodes** = `1 + joiners.replicas`. A setting of `joiners.replicas=2` creates a 3-node cluster; `joiners.replicas=4` creates a 5-node cluster.

### 2. Install via Helm

#### Option A: Quick Install (Published Release 0.3.3)

Deploy a 3-node cluster (1 seed + 2 joiners) to your current Kubernetes context:

```bash
helm install lagrange charts/lagrange-node \
  --set image.tag=0.3.3 \
  --set joiners.replicas=2
```

For a 5-node cluster (recommended for scale-out evaluations):

```bash
helm install lagrange charts/lagrange-node \
  --set image.tag=0.3.3 \
  --set joiners.replicas=4
```

#### Option B: Deploy from a Custom or Development Registry (0.4.0)

If you build your own container image from the active development branch (`main`):

```bash
helm install lagrange charts/lagrange-node \
  --set image.repository=<your-registry>/lagrange \
  --set image.tag=0.4.0 \
  --set joiners.replicas=2
```

### 3. Configure Credentials and Custom Environment Variables

Lagrange nodes accept environment variables for PostgreSQL-wire authentication, REST ports, and consensus tuning. Use `node.extraEnv` in a `values.yaml` file to set explicit credentials:

Create `lagrange-values.yaml`:

```yaml
# lagrange-values.yaml
joiners:
  replicas: 2

node:
  restPort: 8080
  logLevel: info
  extraEnv:
    - name: PGUSER
      value: "postgres"
    - name: PGPASSWORD
      value: "lagrange-dev-password"
    - name: REST_API_PORT
      value: "8080"

persistence:
  enabled: true
  size: 20Gi

resources:
  requests:
    cpu: "2"
    memory: 4Gi
  limits:
    memory: 4Gi
```

Apply the configuration:

```bash
helm upgrade --install lagrange charts/lagrange-node -f lagrange-values.yaml
```

### 4. Verify Pod Readiness

Inspect running pods and StatefulSet status:

```bash
kubectl get pods -l app.kubernetes.io/name=lagrange-node
```

Expected output for a 3-node cluster:

```text
NAME                         READY   STATUS    RESTARTS   AGE
lagrange-lagrange-node-seed-0     1/1     Running   0          45s
lagrange-lagrange-node-joiner-0   1/1     Running   0          30s
lagrange-lagrange-node-joiner-1   1/1     Running   0          25s
```

Port-forward the client-facing service to your local machine:

```bash
kubectl port-forward svc/lagrange-lagrange-node 8080:8080 5432:5432
```

In another terminal, verify the REST health and readiness probes:

```bash
curl -fsS http://127.0.0.1:8080/livez
curl -fsS http://127.0.0.1:8080/startupz
curl -fsS http://127.0.0.1:8080/readyz
```

When `/readyz` returns HTTP 200 `{"status":"ok"}`, the cluster has formed voter quorums and is ready to process queries.

### 5. Build, Publish, and Deploy Services to Kubernetes

Lagrange services are compiled to WebAssembly components and deployed using registered immutable identities over the standard PostgreSQL wire protocol.

Because deployment consumes registered identities and sealed bytecode from the replicated `ArtifactPayloadStore`, **you do not need container volume mounts, shared NFS filesystems, or Kubernetes CRDs**:

```bash
# 1. Point CLI to the port-forwarded Kubernetes service
export PGHOST=127.0.0.1
export PGPORT=5432
export PGUSER=postgres
export PGPASSWORD=lagrange-dev-password

# 2. Build your service locally
npm run build

# 3. Publish bytecode to the cluster ArtifactPayloadStore
npx lagrange service publish .
# Returns: Published artifact package: <package-id>

# 4. Deploy by registered immutable identity
npx lagrange service deploy --package-id <package-id> --idempotency-key deploy-k8s-v1

# 5. Inspect status
npx lagrange service inspect <package-id>
```

Invoke your endpoint over the port-forwarded HTTP port:

```bash
curl -fsS -u postgres:lagrange-dev-password \
  -H 'content-type: application/json' \
  -d '{"accountId": 101}' \
  http://127.0.0.1:8080/amounts/summary
```

---

## Part 2: Running All Comparison Scenarios in Your Own Cloud or Lab

Lagrange includes an automated distributed benchmarking framework (`scripts/run-distributed-matrix.js`) that provisions real VM environments and measures actual workloads under strictly identical hardware conditions.

### 1. Cloud Configuration Overrides

The default GCP template is located at `test/distributed/config/gcp-default.json`. You can override project, zone, machine types, and instance counts by creating your own JSON configuration file:

Create `my-cloud-config.json`:

```json
{
  "gcp": {
    "project": "my-cloud-project-id",
    "zone": "us-central1-a",
    "machineType": "e2-standard-4",
    "vmCount": 5,
    "preemptible": false
  },
  "resourceLimits": {
    "memory": "4g",
    "cpus": "2.0"
  }
}
```

Run the canonical distributed benchmark matrix against your cloud infrastructure:

```bash
node scripts/run-distributed-matrix.js \
  --target gcp \
  --profile canonical \
  --gcp-template my-cloud-config.json
```

Or using the standard npm script:

```bash
npm run distributed:gcp
```

For bare-metal machines or registered lab servers, target the lab environment:

```bash
npm run distributed:lab
```

### 2. Running Specific Comparison Scenarios

You can target specific individual comparison suites on your cloud VMs (`test/distributed/run.js`), your registered lab machines (`scripts/lab/lagrange-lab.js`), or Docker clusters:

#### Scenario A: Contended OLTP Baseline (PostgreSQL, TiDB/TiKV, Lagrange)

Measures transactional throughput, p50/p95/p99 latency, and write-conflict retry behavior under contended OLTP load:

```bash
# Run Lagrange Scenario A contended OLTP cases on cloud VMs or lab machines
node test/distributed/run.js \
  --config my-cloud-config.json \
  --scenario scenario-a-new-order-contention-lagrange

node scripts/lab/lagrange-lab.js harness run scenario-a-new-order-contention-lagrange \
  --base test/distributed/config/local-three-node.json

# Run paired TiDB/TiKV Scenario A live baselines
node scripts/checks/run-tidb-scenario-a-new-order-contention-live.js
node scripts/checks/run-tidb-scenario-a-payment-live.js
node scripts/checks/run-tidb-scenario-a-order-status-live.js
node scripts/checks/run-tidb-scenario-a-delivery-live.js
node scripts/checks/run-tidb-scenario-a-stock-level-live.js
```

#### PostgreSQL Multi-Node Baseline & Public-Path Comparison

Measures multi-node public PostgreSQL wire throughput, latency quantiles, and partition distribution against PostgreSQL 16:

```bash
# Cloud VM execution
node test/distributed/run.js \
  --config my-cloud-config.json \
  --scenario postgres-baseline-comparison

# Lab machine execution (one node per physical host)
node scripts/lab/lagrange-lab.js harness run postgres-baseline-comparison \
  --base test/distributed/config/local-benchmark-5node.json

node scripts/lab/lagrange-lab.js harness run public-path-multinode-baseline \
  --base test/distributed/config/local-three-node.json
```

#### Comparative Efficiency & Negative Controls

Runs the paired comparative efficiency suites (negative controls, request enrichment, and MovieLens grouped reduce) and projects the canonical claim table from retained receipts:

```bash
node scripts/checks/run-comparative-efficiency-negative-controls-live.js
node scripts/run-comparative-efficiency-movielens-public-request-workload.js
node scripts/checks/run-comparative-efficiency-claim-projection-live.js
```

#### MovieLens Top-N Ranking and Placement Affinity

Runs the 100,000-rating Bayesian movie ranking comparison across 6 partitions on 5 nodes against a standalone PostgreSQL 16 baseline:

```bash
npm run demo:movielens
```

### 3. Reviewing Receipts and Summarizing Runs

Benchmark runs record raw telemetry, execution traces, and timing spans under `test-output/distributed-matrix/<run-id>/` and `test-output/reports/`.

Generate a summary report of all completed scenarios:

```bash
node scripts/summarize-harness-runs.js --report-dir test-output/reports
```

The summarizer produces an ASCII table detailing scenario status (PASS / FAIL / REFUSED), elapsed duration, cluster size, throughput (ops/sec), and latency quantiles.

### 4. Canonical Evidence Admission Pipeline

In accordance with rule D1 (Actual comparisons only), all published comparative figures, markdown tables, and charts are projected directly from retained raw run receipts:
- No synthetic latencies or analytical multipliers are permitted.
- If a comparator or scenario is unsupported, it is recorded as an explicit non-numeric outcome (`unsupported` or `not measured`).
- You can recompute all published tables from your own retained receipts using the projection tools, providing full auditability and reproducibility in your own cloud.

---

## See Also

- [First Hour With Lagrange](tutorials/first-hour.md)
- [JavaScript Service Reference](reference/javascript-service-reference.md)
- [Rewrite A Hot Path For Lagrange](tutorials/rewrite-a-hot-path.md)
- [Performance and Network-Cost Measurement](performance-and-cost-estimation.md)
- [Helm Chart README](../charts/lagrange-node/README.md)
