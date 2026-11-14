# Reproducing the Comparative Benchmarks

Back to [Comparative Benchmark Landing Page](README.md) ([HTML Dashboard](index.html)) | [Scenario Specifications](tidb-reference-scenarios.md)

This guide explains how a comparative-benchmark campaign is run: Lagrange, TiDB + TiKV and
PostgreSQL deployed as real product containers on real hosts and driven by the canonical
workload from a separate load-generator host. The runner is
[`cloud/run-comparative-benchmarks.mjs`](cloud/run-comparative-benchmarks.mjs).

The current profile is a named **smoke** profile (`comparative-smoke-v1`): a small canonical
dataset, two offered rates, two counter-balanced repetitions. It produces raw observation
records for admission; it makes no capacity claim. Scenario B, Scenario C, scale-out, partition
sweeps, live movement, RTT sweeps, recovery and backfill are recorded in the campaign manifest as
`not-measured` (Scenario B for Lagrange as `blocked`) until their execution exists.

---

## 1. What a campaign does

1. Builds a **frozen manifest** (targets x scenario x subkind x offered rate x repetition, in the
   counter-balanced order of the paired sweep owner, with the dataset, workload, measurement,
   semantic-profile and sweep digests from their canonical owners) and digests it before any run.
2. Selects the hosts: 3 data hosts (one failure domain per replica) and 1 load-generator host
   that is never a product host.
3. For every run: deploys a fresh product arm; waits for readiness by the product's own contract
   (Lagrange `/readyz`, membership facts, partition leaders and a healthy public PostgreSQL wire
   listener; TiDB 3 Up stores and table placement; PostgreSQL `pg_isready`, streaming standbys
   and `synchronous_standby_names` read back) and fails closed when readiness is exhausted;
   reads product identity from the running containers (`docker inspect` of each container, image
   id, repo digest, entrypoint, mounts) and the product's version report; binds the client
   endpoint to the container that owns its listening socket; runs the Scenario A semantic proof
   journey against the arm (Lagrange and PostgreSQL; each proof case on a fresh Lagrange
   formation, the durability case restarting exactly the endpoint container), with its
   evidence under `test-output/bench/<campaignId>/<runId>/`; runs the canonical workload with
   the load-generator CLI (`test/distributed/harness/run-benchmark-workload.js`) from the load
   generator's own checkout, which must be at the campaign's commit, which
   loads the canonical dataset and hands it back for verification (all nine canonical tables read
   through the product's public interface and compared with the generator's digest) before any
   measurement; re-inspects the containers after the measured window; and tears down only the
   containers labelled `lagrange.bench.campaign=<campaignId>`, recording what it could not close.
4. Appends a campaign header and one v2 record per attempted run (failed runs included) to
   `data/tidb-comparison/raw-observations.ndjson`, never rewriting earlier campaigns, and writes a
   campaign summary JSON. A campaign watchdog stops issuing at the profile's budget and records
   the remaining runs as `interrupted`.

Without `--storage-root`, product data lives in the containers' writable layer and every run is
recorded as `smoke`. With `--storage-root <dir>`, each data directory is an explicit host volume
under `<dir>/<campaignId>/` and the deployment records it as `host-volume`.

Publishing is not part of the runner: published pages are regenerated from admitted cells only.

---

## 2. Default: the home lab

The lab is the default execution target. Hosts come from the registered lab inventory, never
from the command line. The repository's home-lab guide (`docs/development/home-lab.md`) owns the
inventory, the machine-wide lock and the thermal gate.

### Prerequisites
- Four or more Linux inventory nodes with the `harness` role, Docker reachable by the SSH user,
  and a checkout of this repository (`node scripts/lab.js node add ...`).
- Fresh facts: `node scripts/lab.js fleet` (the live run re-discovers the fleet itself).

### Preview
```sh
node docs/benchmarks/cloud/run-comparative-benchmarks.mjs --dry-run
```
The plan names the lab hosts it would use (3 `data`, 1 `client`), the lock each one would be
held with (purpose `bench:<campaignId>`), the thermal gate and the full frozen manifest.

### Run
```sh
node docs/benchmarks/cloud/run-comparative-benchmarks.mjs
```
A smoke campaign (the default profile) is one run per arm at one offered rate, executed in the
recorded order of its targets and marked `comparable: false`: it shows the chain runs end to end,
not how the products compare. `--profile capacity` runs the counter-balanced paired sweep.

For a publishable run, pin the Lagrange image by content and name its registry provenance:
`--lagrange-image psvensson/lagrange@sha256:<registry digest> --lagrange-image-content
sha256:<content identity> --lagrange-version <version> --storage-root <dir>`. The content
identity is the sha256 of the image's ordered layer diff_ids, which is the same on Docker's
containerd and overlay2 image stores (the image's `.Id` is not: it is the manifest digest on one
and the config digest on the other). Derive it on any host that holds the image:

```sh
printf %s "$(docker image inspect --format '{{json .RootFS.Layers}}' psvensson/lagrange@sha256:c0fcc0d3df37e3b1c4760edea289ac5fb9ad9fd745e489b0f1b44b4e31da46fb)" | sha256sum
```

For the Docker Hub `psvensson/lagrange` 0.4.0 image
(`psvensson/lagrange@sha256:c0fcc0d3df37e3b1c4760edea289ac5fb9ad9fd745e489b0f1b44b4e31da46fb`)
it is `sha256:3c263af6030eea3c663dcd863813bcbcb03acdeb3c7ded8870199f4c251e2270` (26 layers,
read on a containerd-store host on 2026-11-01). Every data host must already hold that content;
the runner never pulls it and never deletes or prunes images. On a host whose daemon cannot pull
from the registry, place the image yourself (`docker save` on a host that has it, `docker load`
on that host); the run then records its provenance as `loaded:<image id>`.
The runner never places any image: every image a host role runs must be on that host before the
campaign (data hosts: the product images, `postgres:17-alpine` and, for TiDB, `mysql:8.4.11`; the
load generator: `postgres:17-alpine`, the psql client the Lagrange arm reads through). An absent
image refuses the campaign with `image_unavailable` naming host, role and image, and every
campaign container runs with `--pull=never`. The load generator installs the reference client
(`test/distributed/reference-client`, mysql2) with `npm ci --offline` from its npm cache; a tarball
the cache lacks refuses the TiDB arm and is named. The load generator's checkout must already hold
the harness commit (`load_generator_commit_absent` otherwise; it is never fetched). On the lab,
placing the images, the commit and the cache is the operator's step (no repository code places
them on lab hosts); on GCP it is `provision-gcp.sh --place` (section 3).
Every selected host is held with the lab's machine-wide `flock` and holder record before any
deployment (a host another run holds refuses the campaign, naming the holder), the thermal gate
`scripts/checks/wait-for-thermal-headroom.js` runs on every held host, and the holds are released
when the campaign ends, however it ends. The holder record and the thermal reading of each host
are part of the campaign header.

---

## 3. Explicit: GCP

GCP is used only when asked for, with hosts you provisioned; the runner creates nothing.

### Step 1 - Provision VMs
```sh
export PROJECT_ID="your-gcp-project-id"
export ZONE="us-central1-a"
./docs/benchmarks/cloud/provision-gcp.sh
```
The script creates the VMs (the dedicated client VM last), an intra-cluster firewall rule, and
installs Docker and git. It does not open the Docker socket to everyone and does not add users to
the `docker` group: grant Docker access to the one SSH user the runner connects as yourself. SSH
host keys are verified as usual; record each VM's host key in `known_hosts` (for example with
`gcloud compute ssh` once per VM) before the run. Put Node 22 or later on the client VM.

### Step 2 - Place what the campaign needs
```sh
./docs/benchmarks/cloud/provision-gcp.sh --place --client-checkout /home/$SSH_USER/lagrange \
  --client-node /path/to/node --lagrange-image psvensson/lagrange@sha256:<digest>
```
This is the only step that uses the network on purpose; the campaign never pulls or fetches. It
runs the runner's `--provision` mode with your campaign options (`--targets`, `--lagrange-image`,
`--lagrange-image-content`): on every VM it pulls each image its role runs, by the reference the
campaign checks (the Lagrange image by its `@sha256` digest; the comparator images by their
pinned tags), pushes this checkout's HEAD (the harness commit) into `--client-checkout` on the
load generator, checks it out and runs `npm ci` there, and adds every tarball of the reference
client's lockfile to the load generator's npm cache. It then verifies each with the campaign's
own check. A failure is typed and names the host and what is missing (a `provisioning_*` code,
or the code of the campaign check that still refuses); fix it and run the step again.

### Step 3 - Preview and run
```sh
node docs/benchmarks/cloud/run-comparative-benchmarks.mjs --execution-target gcp \
  --hosts "$HOSTS" --ssh-hosts "$SSH_HOSTS" --ssh-user "$SSH_USER" --dry-run

node docs/benchmarks/cloud/run-comparative-benchmarks.mjs --execution-target gcp \
  --hosts "$HOSTS" --ssh-hosts "$SSH_HOSTS" --ssh-user "$SSH_USER"
```
The first three `--hosts` addresses are the data hosts and the last is the load generator.
A live GCP run also needs the `--client-checkout` and `--client-node` you placed with.

### Step 4 - Tear down
```sh
./docs/benchmarks/cloud/provision-gcp.sh --teardown
```

AWS and Azure provisioning scripts exist in [`cloud/`](cloud/) but are not execution targets of
this runner. Both open SSH (port 22) only to the network you name: `--ssh-cidr <cidr>` is required,
has no default and refuses a `/0` network, so pass your own address, for example
`./docs/benchmarks/cloud/provision-aws.sh --ssh-cidr 203.0.113.7/32`. Neither ever opens SSH to
`0.0.0.0/0`.

---

## 4. Runner options

```sh
node docs/benchmarks/cloud/run-comparative-benchmarks.mjs --help
```
`--targets` selects arms (`lagrange`, `tidb-tikv`, `pg-single-primary`, `pg-patroni-sync-ha-rf3`;
default `lagrange,tidb-tikv,pg-patroni-sync-ha-rf3`). The PostgreSQL HA arm is a primary with two
synchronous streaming standbys; clients connect to the primary directly and no HA manager runs.

---

## 5. Single-machine quick comparison (no cluster)

```sh
npm ci
npm run demo:movielens
```
This runs [`examples/service-data-affinity/run-comparison.js`](../../examples/service-data-affinity/run-comparison.js)
locally; it is a demonstration, not a comparative-benchmark campaign.

---

## 6. Reference files

- Runner and provisioning: [`cloud/run-comparative-benchmarks.mjs`](cloud/run-comparative-benchmarks.mjs), [`cloud/provision-gcp.sh`](cloud/provision-gcp.sh)
- Campaign owners: [`comparative-benchmark-campaign-manifest.js`](../../test/distributed/harness/comparative-benchmark-campaign-manifest.js), [`comparative-benchmark-campaign-runner.js`](../../test/distributed/harness/comparative-benchmark-campaign-runner.js), [`comparative-benchmark-lab-hosts.js`](../../test/distributed/harness/comparative-benchmark-lab-hosts.js), [`comparative-benchmark-workload-call-site.js`](../../test/distributed/harness/comparative-benchmark-workload-call-site.js)
- Deployment layer: [`real-product-cluster-deployers.js`](../../test/distributed/harness/real-product-cluster-deployers.js) and the `real-product-*` owners beside it
- Raw observation store: [`data/tidb-comparison/raw-observations.ndjson`](../../data/tidb-comparison/raw-observations.ndjson)
