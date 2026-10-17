# N0 physical lab run — bounded operator procedure

2026-10-17 — awaiting one **real** three-host execution. This is a
local operator action because the currently authorized cloud lab bridge
only exposes `test-files` and the optional fixed
`rolling-restart-3` harness profile; there is **no locally enabled
fixed N0 physical scenario profile**. Do not turn a test file into an
unauthorized SSH runner and do not relabel old two-host unit-test
receipts as inter-host measurements.

## Preferred existing-controller route (not yet locally enabled)

As of the latest [controller ping #181](https://github.com/psvensson/lagrange-lab/issues/181),
the live bridge is **v0.1.6** with `uncertain_execution=true` due to original
[lab job #160](https://github.com/psvensson/lagrange-lab/issues/160).
Harnessd's [M10 dispatch PR #365](https://github.com/psvensson/harnessd/pull/365)
is still draft and its Lagrange `raft-smoke` profile is single-host;
it is **not** the N0 three-host scenario.

The preferred controlled route is [lagrange-lab issue #182](https://github.com/psvensson/lagrange-lab/issues/182):
a new, *locally commissioned*, fixed `n0-physical-network-3` entry under the
**existing** private lab `harness` operation, using its current journal,
three-host physical placement, machine locks and one physical source
execution authority. It is **not yet installed or enabled**.

No new cloud N0 source request should be posted until job #160 receives
operator-verified physical reconciliation, the independently reviewed
[v0.1.7 parser correction #168](https://github.com/psvensson/lagrange-lab/pull/168)
is safely activated, and the fixed N0 profile is separately approved.
The manual isolated-checkout commands below remain an optional operator
procedure, not permission for an agent to evade the controller's journal
or run SSH via a lab `test-files` job. Nothing in this runbook certifies
a physical three-host measurement before its report exists.

## Tested source and expected output

- Test-only proof branch: `proof/n0-full-bounded-20261017`.
- Exact five-file lab-proven SHA:
  `ff50557a77749c9a5f59fc4d3c95f7b3cd5e93f0`.
- Scenario:
  `test/distributed/scenarios/n0-physical-network-baseline.js`.
- Existing distributed harness and machine-wide lab locks own
  scheduling/SSH/Docker/cleanup; the scenario itself owns no infrastructure,
  doesn't change production code, and refuses a topology with fewer than
  three genuinely distinct host identities.
- A valid scenario result reports
  `schema=lagrange-n0-physical-host-wire/1`,
  `networkModel=docker-host-network`,
  `spreadUnit=host`,
  `distinctHosts >= 3`, `perHost[3]` containing one selected host
  interface and positive `rxBytes/txBytes`, plus a convergence witness.
  These are **host-interface bytes including unrelated local traffic**,
  not per-process or Veilid bytes. IP/TCP headers, individual Raft message
  types, and per-peer RTT remain unquantified unless separately observed.
  A missing measure should fail rather than be labeled zero.

The physical three-host profile must be explicitly accepted by the
operator. Prefer eventually adding a fixed, locally opt-in
`n0-physical-network-3` harness operation to the existing lab/harnessd
control plane; do not create an arbitrary command execution interface.

## Locally executing once (does not alter the working checkout)

The following uses an isolated, **detached** source checkout and the
existing locally configured Lagrange harness. It does not stash, reset,
merge, replace, or stage any file in the existing repository. The
temporary directory is retained so that results can be examined
and attached to the epic. No controller grant, host registration, or
machine threshold is modified.

Change `NODES` only if the selected three machines are not all Linux
Docker hosts registered with the `harness` role. Run
`node scripts/lab.js list` in the original checkout to inspect names.
The example below names three candidate lab machines, not a claim that
they are all presently healthy harness providers.

```bash
(
  set -euo pipefail

  ROOT=/mnt/data/peter/projects/lagrange
  EXPECTED=ff50557a77749c9a5f59fc4d3c95f7b3cd5e93f0
  NODES=tv-dator,lenovo-laptop,adam-laptop
  SCRATCH="$(mktemp -d /tmp/lagrange-n0-physical.XXXXXX)"

  echo "N0 evidence directory: $SCRATCH"
  git clone --local --no-hardlinks --no-checkout \
    "$ROOT" "$SCRATCH/checkout"

  git -C "$SCRATCH/checkout" fetch --no-tags \
    https://github.com/psvensson/lagrange.git \
    refs/heads/proof/n0-full-bounded-20261017

  ACTUAL="$(git -C "$SCRATCH/checkout" rev-parse FETCH_HEAD)"
  test "$ACTUAL" = "$EXPECTED" || {
    echo "REFUSED: remote N0 branch has moved from pinned source $EXPECTED"
    exit 1
  }

  git -C "$SCRATCH/checkout" checkout --quiet --detach "$EXPECTED"
  test -d "$ROOT/node_modules" || {
    echo "REFUSED: main checkout has no installed node_modules"
    exit 1
  }
  ln -s "$ROOT/node_modules" "$SCRATCH/checkout/node_modules"

  (
    cd "$SCRATCH/checkout"
    test "$(git rev-parse HEAD)" = "$EXPECTED"
    node scripts/lab.js harness doctor --nodes "$NODES"
    node scripts/lab.js harness run n0-physical-network-baseline \
      --base test/distributed/config/local-three-node.json \
      --nodes "$NODES" --nodes-per-host 1 \
      2>&1 | tee "$SCRATCH/n0-harness.log"
  )

  echo "N0 run preserved under: $SCRATCH"
)
```

**Refusal is correct** if fewer than three distinct Linux Docker
machines are eligible, if a host lock/thermal guard refuses, if the
pinned SHA has changed, if controller dependencies are absent, or if
the runtime cannot converge. Do not reclassify this as a successful
measurement. This test uses the original distributed harness's Docker
host-network implementation; it does **not** prove that Veilid has
similar network behavior.

## What to preserve back into the epic

Preserve the pinned SHA, selected lab host inventory and distinct
kernel/machine identities, scenario report and logs, the harness's
startup/pre-flight and cleanup evidence, timing window, network-route
interfaces, and before/after RX/TX differences. Include all
refusals/timeouts as first-class evidence. Compare the N0 scenario's
host-wide counts to the already measured native Raft envelope and
MessageRouter loopback figures **without equating their scopes**.

Once the physical report is accepted and independently reviewed,
update [n0-baseline-2026-10-17.md](n0-baseline-2026-10-17.md).
Only then may the N0 milestone be submitted for completion review.
The parent transport epic remains open until NATS-only/Veilid-only
work is independently proven. This run is not an rs-raft merge gate.
