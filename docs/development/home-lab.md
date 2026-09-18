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
safe to run again: rerun it when `lab fleet` reports that a worker's lockfile or
dependencies differ. Then check what every machine can run:

```bash
node scripts/lab.js fleet
```

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
3. Physical distributed scenario semantics remain owned by
   `test/distributed/run.js` and its scenario registry.
4. K3s owns only deployment-style Kubernetes scheduling and lifecycle.
5. GCP remains the controlled scale and repeatability surface.

A failure should be repaired at the owner that produced it rather than by
teaching a neighboring layer to compensate for it.
