---
audience: development
---

# Home lab development and test runners

## Purpose

The home lab complements, rather than replaces, the existing local-VM and GCP
validation paths.

Use it for two different kinds of evidence:

1. Native OS and hardware diversity through GitHub self-hosted runners on Linux,
   macOS, and Windows.
2. Real multi-machine distributed-system behavior through Linux Docker hosts and
   an optional K3s cluster.

Do not make macOS or Windows pretend to be native Kubernetes nodes. Keep their
native operating systems useful for portability checks. If their hardware should
also participate in K3s, run a Linux VM on that machine and register the VM as a
separate Linux lab node.

The command-line owner for this lab is:

```bash
node scripts/lab.js help
```

The lab inventory is user-local. It defaults to
`~/.config/lagrange/lab/inventory.json` on Linux/macOS and the corresponding
`%APPDATA%` location on Windows. Override the directory with
`LAGRANGE_LAB_HOME`. No credentials or K3s tokens are stored in the inventory.

## Recommended topology

A useful initial layout is:

| Machine | Native runner | Distributed harness | K3s |
| --- | --- | --- | --- |
| always-on Linux host | yes | yes | server + worker |
| additional Linux host | yes | yes | worker |
| additional Linux host | optional | yes | worker |
| macOS host | yes | no | Linux VM only |
| Windows host | yes | no | Linux VM only |

The distributed harness and K3s are deliberately separate surfaces. The
existing distributed harness already owns scenario behavior and report shape.
The home-lab adapter only supplies real Docker hosts to that harness; it does
not redefine scenarios or pass/fail rules.

## Prerequisites

On the controller machine:

1. Node.js 22 or later.
2. OpenSSH client.
3. Git.
4. `gh` only when configuring GitHub self-hosted runners.

On Linux nodes with the `harness` role:

1. OpenSSH server reachable from the controller by key authentication.
2. Docker Engine.
3. The SSH user can access the Docker socket, normally through the `docker`
   group.
4. The node's LAN address is stable enough to use for the duration of tests.

On Linux nodes with the `k3s` role:

1. OpenSSH server.
2. `curl`.
3. `sudo`.
4. After the first K3s server installation, non-interactive K3s administration
   expects narrowly scoped passwordless sudo for `k3s` and reading the K3s node
   token. If that is not desirable, perform joins and K3s administration
   manually rather than weakening sudo policy globally.

## Initialize the inventory

```bash
node scripts/lab.js init
```

Register machines once. `--os` and `--arch` can be omitted when SSH probing is
available.

```bash
node scripts/lab.js node add main-linux \
  --ssh peter@main-linux \
  --ip 192.168.1.20 \
  --roles runner,harness,k3s \
  --labels storage=nvme,gpu=rtx3080

node scripts/lab.js node add small-linux \
  --ssh peter@small-linux \
  --ip 192.168.1.21 \
  --roles harness,k3s \
  --labels storage=ssd

node scripts/lab.js node add macbook \
  --ssh peter@macbook.local \
  --roles runner \
  --labels class=laptop

node scripts/lab.js node add windows-box \
  --ssh peter@windows-box \
  --os windows \
  --arch x64 \
  --roles runner \
  --labels class=desktop
```

List the resulting inventory:

```bash
node scripts/lab.js list
```

Re-probe a node after an OS or architecture change:

```bash
node scripts/lab.js node probe macbook
```

Run the controller and harness checks:

```bash
node scripts/lab.js doctor
node scripts/lab.js harness doctor
```

## Provision a test worker

A worker that runs test files needs the toolchain the full-corpus canary
installs (helm, wasm-tools, psql, java, ripgrep, jq), node at the engines floor,
a checkout whose dependencies match its lockfile, and the pinned MovieLens
dataset. One generated script installs all of it. It is generated from this
checkout, so its toolchain is the canary workflow's own install step and cannot
drift from CI. Copy it to a registered worker, then run it there yourself; it
asks for sudo once:

```bash
node scripts/lab.js provision --copy small-linux
ssh -t USER@HOST bash lagrange-lab-worker-setup.sh
```

Or write it to a file and copy it yourself:
`node scripts/lab.js provision --output lagrange-lab-worker-setup.sh`. It is
safe to run again: rerun it when `lab fleet` reports that a worker's dependency
graph or installed dependencies differ (`dependency-graph-differs`,
`dependencies-differ-from-lockfile`). The dependency graph is the lockfile less
its two release-version fields, so a version-only release bump never needs a
rerun. `lab fleet` measures against the working tree's lockfile and says so; a
placed run (`lab test`, the change proof) measures against the commit it
places. Then check what every machine can run:

```bash
node scripts/lab.js fleet
```

## Sharing the lab between agents and projects

Several agents, in this repository and in other projects, use the same lab
machines. Every lab host therefore has one machine-wide lock,
`${LAB_LOCK_DIR:-$HOME/.lab}/machine.lock`, and one holder record beside it,
`machine.holder.json`. Whoever runs anything heavy on a lab host - a test
corpus, a formation, a benchmark - first takes the lock with `flock` and a
bounded wait, writes the holder record while holding it, and removes the
record on exit. `flock` is the lock: the kernel releases it when its holder
exits, however it exits. The record is for people and for `lab fleet`; a
record whose lock is free is stale evidence, never a lock. The default lives
in the home directory of the lab user every controller connects as, so every
agent reaching the host as that user shares it; agents that reach it as
different users set `LAB_LOCK_DIR` to one directory all of them can write.

The holder record is one JSON object:

```json
{"project":"lagrange","agent":"claude:SESSION","controller":"workstation","purpose":"test:ordinary","sha":"COMMIT","startedAt":"2026-09-23T10:00:00Z","expectedMinutes":12,"pid":4242}
```

`agent` is free text naming who placed the work (`claude:SESSION`,
`codex:TASK`), `controller` is the machine that placed it, `purpose` says what
runs (`test:LANES`, `formation:SCENARIO`, `bench:NAME`), and `pid` is the
shell that holds the lock.

Another project needs nothing from this repository. On the lab host, start the
heavy work from a POSIX shell with these four lines, giving `flock -w` your
own budget in seconds - never `-n` alone and never an unbounded wait - and
your own values in the record (none may contain a double quote or a
backslash):

```sh
mkdir -p "${LAB_LOCK_DIR:=$HOME/.lab}" && exec 9>"$LAB_LOCK_DIR/machine.lock"
flock -w 600 9 || exit 98
printf '{"project":"%s","agent":"%s","controller":"%s","purpose":"%s","sha":"%s","startedAt":"%s","expectedMinutes":%s,"pid":%s}\n' my-project codex:TASK "$CONTROLLER" test:all "$(git rev-parse HEAD)" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" 30 $$ > "$LAB_LOCK_DIR/machine.holder.json"
trap 'rm -f "$LAB_LOCK_DIR/machine.holder.json"' EXIT
```

Exit 98 means another run held the machine for your whole wait: go to another
machine or come back later. Everything the shell starts afterwards inherits
the lock, so a benchmark or corpus started from it is covered. A shell killed
by a signal it does not trap leaves its record behind; that is harmless,
because the lock is released anyway and `lab fleet` shows the record as stale.

In this repository the lab CLI follows the same convention:

1. Placement - a placed classified run and `lab test` - takes the lock in its
   lab-side wrapper, waiting no longer than the shard's own estimate (at most
   30 minutes), and keeps this checkout's own lock inside it. Its record names
   project `lagrange`, the agent from `LAGRANGE_LAB_AGENT` (else
   `lagrange:CONTROLLER:PID`), purpose `test:LANES` and the shard's estimate.
   A host still held after the wait is reported as
   `placement: host-busy NAME held-by AGENT since STARTED`; its shard goes to
   the next ready host, then to the controller, and a held host is not tried
   again in the same run. A host too hot to run (`host-thermal-unfit`) is
   re-placed the same way.
2. `lab harness run` holds every node of a formation before any node starts,
   one at a time in name order within one 30-minute budget, with purpose
   `formation:SCENARIO`. A held node refuses the whole formation, releasing
   the nodes already held:
   `harness: node NAME busy, held by AGENT (PROJECT, PURPOSE) since STARTED`.
3. `lab fleet` shows each machine's lock: `busy: held by AGENT (PROJECT,
   PURPOSE) since STARTED, expected N min`, `free`, or `stale record (pid
   dead)`; `lab fleet --json` carries the record as its holder wrote it.
   Placement reads the same facts from discovery and skips a held machine
   before it tries it.

Set `LAGRANGE_LAB_AGENT` to name yourself, for example `claude:SESSION`.

The rule: agents run heavy work on lab hosts only through `lab test`,
placement or `lab harness run` in this repository, or through the recipe above
in another project - never a raw ssh runner invocation such as
`ssh HOST node scripts/run-classified-test-files.js`, which takes no lock and
which no other agent can see. A hardening contract refuses one anywhere in
`scripts/` or `.github/`.

## Native GitHub runners

Use native runners for portability and hardware-specific work. Labels are
calculated from inventory metadata:

```bash
node scripts/lab.js runner labels macbook
```

Runner registration requires a repository explicitly. Prefer a private control
repository such as a dedicated `lagrange-lab` repository. Do not attach trusted
home machines to pull-request workflows in the public Lagrange repository.

```bash
node scripts/lab.js runner configure macbook \
  --repo psvensson/lagrange-lab
```

The command uses the local `gh` login to request a short-lived registration
token. The token is streamed over SSH and is not written to the inventory.

On Linux and macOS, add `--service` to install/start the generated GitHub runner
service as part of configuration:

```bash
node scripts/lab.js runner configure main-linux \
  --repo psvensson/lagrange-lab \
  --service
```

Linux service setup is non-interactive and therefore requires suitable
passwordless sudo for the runner service commands. Without `--service`, start
the runner manually from `~/.lagrange-actions-runner/run.sh`.

Windows runner service setup is part of runner configuration. `--service`
passes the Windows service option, but the remote shell must have the
administrator privileges required by GitHub's runner installer. Otherwise
configure without `--service` and run `run.cmd` interactively until the machine
is prepared for service installation.

The private control workflow should check out an explicit Lagrange commit SHA
and invoke the repo's existing commands. Suggested label examples are:

- `home,lagrange,linux,x64,role-runner`
- `home,lagrange,macos,arm64,role-runner`
- `home,lagrange,windows,x64,role-runner`
- hardware labels such as `gpu-rtx3080` or `storage-nvme`

A minimal private-control-repository workflow can stay intentionally dumb: it
chooses a machine and delegates the proof definition back to this repository.
For example:

```yaml
name: lagrange-home-lab
on:
  workflow_dispatch:
    inputs:
      lagrange_sha:
        description: Exact 40-character Lagrange commit SHA
        required: true
        type: string
      runner_os:
        required: true
        type: choice
        options: [linux, macos, windows]
      profile:
        required: true
        type: choice
        options: [smoke, all, gate]

permissions:
  contents: read

jobs:
  test:
    runs-on:
      - self-hosted
      - home
      - lagrange
      - ${{ inputs.runner_os }}
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd
        with:
          repository: psvensson/lagrange
          ref: ${{ inputs.lagrange_sha }}
          persist-credentials: false
          fetch-depth: 0
      - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e
        with:
          node-version: '22'
          cache: npm
      - run: npm ci
      - run: node scripts/lab.js test ${{ inputs.profile }}
```

Keep this workflow in the private control repository, not under this public
repository's workflows. That keeps untrusted public pull-request code away from
trusted home machines while still making every test command come from the
checked-out Lagrange commit.

## Existing test entry points

The lab CLI deliberately delegates to the existing test owners:

```bash
node scripts/lab.js test changed
node scripts/lab.js test smoke
node scripts/lab.js test gate
node scripts/lab.js test postpush
node scripts/lab.js test all
```

These map to the existing change selector, smoke manifest, project-hardening
acceptance gate, post-push gate, and classified full test suite. The lab does
not maintain a second test list.

### Measure the change cone from a named commit

`lab test changed --lane LANE` runs the change selector's plan of the commit
(`--sha`, default this checkout's clean `HEAD`). By default the selector
measures the change from the merge base with `origin/main`, which is what a
push would carry. A long unpublished branch - several merged quests waiting for one
publish - then looks like the whole branch changed, and a release-surface file
such as `Dockerfile` changed anywhere on it refuses the run with
`RELEASE_PROOF_REQUIRED`.

Name the comparison commit with `--base-sha` to verify only what changed since
it:

```bash
node scripts/lab.js test changed --lane all --sha HEAD --base-sha <commit>
```

The lab passes the commit to the selector's own `--base`, so the one owner of
the changed set decides it: the cone, and the release-surface check, cover
`<commit>..<sha>` only, and a release-surface file changed before
`<commit>` does not refuse. The flag is `--base-sha` rather than `--base`
because `lab harness run --base CONFIG` already names a harness base
configuration; `--base-sha` pairs with `--sha` as the other end of the range.
It applies only to the `changed` profile. It narrows what the lab runs; the
push gate still proves the full range against `origin/main`.

### Split a run over the lab: the controller is a reserve

Test work is parallelized on the lab machines as much as possible (owner,
2026-10-05). `lab test PROFILE --split` spreads the files by measured cost over
the ready lab hosts. All five remote hosts are usable - `tv-dator`,
`carinas-windows`, `adam-laptop`, `adams-gamla` and `lenovo-laptop` - and none
is excluded; discovery decides each run which of them are ready. The
controller is the machine every agent works on, and it runs hot, so it is a
reserve, not a peer:

- With at least two free lab hosts (`CONTROLLER_RESERVE_MIN_HOSTS` in
  `scripts/lab/probe.js`) it takes only what no lab host can run: a file over
  every host's per-file bound. A host another run holds is not free; it takes
  only what no free host fits.
- With fewer than two free hosts but at least two held ones, the held hosts
  are peers whose shares queue on their locks, charged their holders'
  expected wait from the holder record, and the controller stays a reserve -
  so several agents splitting at once do not all fall back to it. When a
  holder is expected past a share's own bounded lock wait (its estimate, at
  most 30 minutes; a record that cannot say counts as the full 30), the
  controller is the way to finish and takes part as a peer.
- Otherwise, and whenever it has thermal and load headroom, it takes part as
  one more machine. A controller without headroom, or whose tree is not the
  commit, takes only what no lab host fits.

The plan says which rule applied and what the controller kept, for example
`lab test: controller: reserve - 5 free lab hosts; takes 0 file(s), only what
no lab host fits`, before any share starts.

A placement checkout on a lab host links this checkout's ignored workspace
(`node_modules`, `data/` and the model checkers under `tools/`) and declares
every link it makes in `LAGRANGE_WORKSPACE_INJECTIONS`, as the publisher's
gate checkout does, so no link is ever repository content to the change
taxonomy (an ignore rule written for a directory, such as `tools/alloy-*/`,
does not match a link to one).

Harness nodes that share one host's network take ports in blocks of ten:
node `n` serves REST on `8080 + 10n`, with its admin and transport ports
directly above it.

## Run the distributed matrix on local, lab, or GCP targets

The canonical scenario matrix has one owner:
`test/distributed/harness/scenario-registry.js`. Execution targets do not
maintain their own scenario lists. The matrix runner changes only where each
canonical config/scenario pair executes:

```bash
# Existing single-machine Docker path.
node scripts/run-distributed-matrix.js --target local --profile canonical

# Real Docker daemons on registered lab machines.
node scripts/run-distributed-matrix.js --target lab --profile canonical \\
  --nodes main-linux,small-linux,third-linux

# GCP hosts. Scenario semantics still come from the canonical local config;
# the GCP template supplies only the provisioning substrate.
node scripts/run-distributed-matrix.js --target gcp --profile canonical
```

The smaller physical-system certification profile is derived from the unique
real distributed scenarios referenced by `TOPOLOGY_FAILURE_GATE_MATRIX`. It is
not the deterministic `test:topology-failure-gates` command, which remains a
separate invariant-simulation proof:

```bash
node scripts/run-distributed-matrix.js --target lab --profile topology \\
  --nodes main-linux,small-linux,third-linux
```

Convenience npm commands are `distributed:all`, `distributed:lab`,
`distributed:lab:topology`, `distributed:gcp`, and
`distributed:gcp:topology`.

Every matrix report records the execution target and profile. Lab reports also
record the selected physical host names. The matrix runner deliberately has no consensus-backend selector: consensus
implementation choice is not an execution substrate dimension.

For GCP, the default provisioning template is
`test/distributed/config/gcp-default.json`. The runner overlays its `gcp`
settings onto each canonical scenario config and defaults to one Lagrange node
per VM, preserving the scenario's cluster size and behavioral settings. Use
`--gcp-template` to select another provisioning template.

## Run existing distributed scenarios on physical machines

The existing distributed harness already supports multiple Docker providers.
For the home lab, the adapter opens a temporary SSH forward from a loopback TCP
port on the controller to each remote Linux Docker Unix socket. Nothing listens
on a LAN-facing Docker TCP port.

The generated harness config contains ordinary `docker.hosts` plus aligned
`docker.hostInfo`. It also asks the existing image-build owner to ensure the
current source image exists on every selected Docker host. Because there is
more than one Docker provider, the existing harness automatically uses
host-network mode and advertises each machine's LAN address to its peers.

Preview the generated configuration and tunnel commands:

```bash
node scripts/lab.js harness run rolling-restart \
  --base test/distributed/config/local.json \
  --nodes main-linux,small-linux \
  --dry-run
```

Run it:

```bash
node scripts/lab.js harness run rolling-restart \
  --base test/distributed/config/local.json \
  --nodes main-linux,small-linux
```

Omit the scenario to run the canonical scenario matrix for the selected base
configuration:

```bash
node scripts/lab.js harness run \
  --base test/distributed/config/local-three-node.json \
  --nodes main-linux,small-linux
```

Pass unchanged distributed-runner arguments after `--`:

```bash
node scripts/lab.js harness run node-join-under-load \
  --base test/distributed/config/local.json \
  --nodes main-linux,small-linux,third-linux \
  -- --deterministic-debug
```

Before any node starts, the adapter holds every selected node's machine-wide
lock (see "Sharing the lab between agents and projects"); a node another run
holds refuses the formation, naming the holder.

The adapter always disables fast-local mode for a physical-host run. The source
image is therefore the normal built harness image, rather than a bind mount from
the controller's local source tree.

A remote physical harness run needs at least two Linux Docker hosts. A
single-host distributed run should continue to use the existing local Docker
configuration, because the distributed harness only switches to host-network
addressing when more than one Docker provider is present.

All selected Linux machines must be able to reach each other's advertised LAN
addresses and the harness port range. Keep this traffic on the trusted home LAN;
do not expose these ports to the Internet.

## K3s setup and administration

K3s is useful for deployment-style tests and experiments that should look like
a Kubernetes installation. It is not inserted underneath the existing
distributed scenario harness.

Initialize the first server:

```bash
node scripts/lab.js k3s init-server main-linux
```

Pin a specific K3s release when desired:

```bash
node scripts/lab.js k3s init-server main-linux --version vX.Y.Z+k3sN
```

Join another registered Linux node. The join uses the server's installed K3s
version so the cluster does not accidentally mix versions:

```bash
node scripts/lab.js k3s join small-linux --server main-linux
```

Inspect the cluster without copying a root kubeconfig onto the controller:

```bash
node scripts/lab.js k3s status --server main-linux
```

Synchronize inventory metadata to Kubernetes node labels:

```bash
node scripts/lab.js k3s labels --server main-linux
```

Operational helpers:

```bash
node scripts/lab.js k3s cordon small-linux --server main-linux
node scripts/lab.js k3s drain small-linux --server main-linux
node scripts/lab.js k3s uncordon small-linux --server main-linux
```

The label namespace is `lagrange.dev/`. Inventory roles become labels such as
`lagrange.dev/role-harness=true`, and custom inventory labels are copied under
the same namespace.

## Storage rule for Lagrange tests

Do not add Ceph, Longhorn, GlusterFS, or another replicated storage layer below
Lagrange merely to make Kubernetes storage convenient. Lagrange's own
replication and failure behavior are the thing being tested. Prefer local disks
or explicitly provisioned local persistent volumes so that a Lagrange replica
still maps to one physical machine and one physical storage path.

Heterogeneous disks are useful test input. Label them in inventory and use
placement rules when a scenario needs a controlled fast/slow storage mix.

## Failure ownership

Keep the boundaries explicit:

1. Inventory and SSH connectivity are owned by the home-lab adapter.
2. Native OS execution is owned by the self-hosted runner on that machine.
3. Distributed scenario and matrix semantics remain owned by
   `test/distributed/run.js` and the canonical scenario registry.
4. Local Docker, lab Docker, and GCP are execution substrates for that same
   matrix; none owns a separate scenario list or pass/fail rule.
5. K3s owns only deployment-style Kubernetes scheduling and lifecycle.
6. GCP remains the controlled scale and repeatability surface.

A failure should be repaired at the owner that produced it rather than by
teaching a neighboring layer to compensate for it.
