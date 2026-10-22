# Transport-independent cluster networking — current handover (22 October 2026)

This is the current index for the [epic](../transport-independent-cluster-networking.md). It carries forward the original [research and transport architecture](research-and-plan.md) and the append-only [N0 evidence record](n0-baseline-2026-10-17.md). This note supersedes their *status snapshots*, not their historical evidence or acceptance rules.

## Governing boundaries

- The current integration baseline inspected for this handover is Lagrange `main` at `0146e1f41ce006d68fd0430c779b20ff1c660e1c` (22 October); this is **not** an approved rs-raft certification baseline for N1.
- Independent complete-cluster operation is mandatory for **each** transport: WebSocket, NATS-only, and later Veilid-only. No hidden alternate inter-node fallback; optional mixed transport is a later feature, never a prerequisite. Keep `ctx.call`, SQL, CDC, snapshot, split/merge and recovery semantics transport-neutral.
- `MessageRouter` remains the single semantic owner of normalized delivery, peer admission, ACK/correlation, queue pressure, deadline and retry outcomes. A future peer-link adapter owns only physical framing, acceptance, inbound frames, availability/pressure, size and close/cancellation. Reconcile rather than duplicate the historical `TransportProvider`/`TransportRegistry` and `node_endpoints` owners. Bulk transfer must work on the selected standalone backend itself.
- The original plan explicitly **holds N1 production changes and integration** until an exact stable rs-raft owner baseline is accepted. No separate Raft core, controller, runtime owner or timeout knob should be introduced as a network workaround.

## Evidence and current frontier

| Item | Result | Exact source / receipt | Ceiling |
| --- | --- | --- | --- |
| N0 original five-file suite | 5/5 files, 14/14 cases on each of `lenovo-laptop` and `tv-dator` | `ff50557a77749c9a5f59fc4d3c95f7b3cd5e93f0`; lab #136 and #137 | Real hardware running mostly in-process fixtures; **not** 3-host Raft/network certification |
| N0 traffic/timing observations | Native leader heartbeat ~60 ms; Append can be emitted before heartbeat; live `configureTick` metadata can differ from core behavior | N0 baseline, lab #104/#106, #123–#125 | 16-group synchronous response pump reached 676.83 ms; cause not equated with production network or CPU |
| N0 physical scenario negative controls | **10/10 cases PASS on two separate workers**, zero failure/skip | `b61b9c2c63b41e3a8c4fa3ecfd78c6ab82cf5498`; lab [#748](https://github.com/psvensson/lagrange-lab/issues/748) on `tv-dator`, [#749](https://github.com/psvensson/lagrange-lab/issues/749) on `local-workstation` | Refuses repeated providers, missing identities, 4 nodes on 3 hosts, empty traffic; no live 3-host network measurement |
| N0 hardened-source integrated suite | **5/5 files, 18/18 cases PASS** on `tv-dator`; no skips/cancellations | `b61b9c2c63b41e3a8c4fa3ecfd78c6ab82cf5498`; [lab #751](https://github.com/psvensson/lagrange-lab/issues/751), exit 0, execution/thermal/container scopes closed | Same in-process and component ceilings; no three-host physical wire certification |
| Genuine 3-host N0 | **OPEN** | `n0-physical-network-baseline` scenario + existing distributed harness | No preserved positive 3-physical-host report, distinct boot identities, host-interface counters and cleanup witness |
| N1 / NATS-only / timing profiles / Veilid-only | **NOT IMPLEMENTED or CERTIFIED** | Original epic frontiers N1–N4 | Do not infer availability from tests or documentation |

Lab issue numbers above are in private `psvensson/lagrange-lab`. Test verification is scoped to its exact candidate, not a claim that Lagrange `main` or another rs-raft worktree has passed it.

## Lab route, corrected for the current controller

The 17 October [operator procedure](n0-physical-lab-operator.md) describes the historical v0.1.6 fixed-profile bridge. Its fixed `n0-physical-network-3` addition ([lab PR #416](https://github.com/psvensson/lagrange-lab/pull/416)) was **closed unmerged**. The lab's current 22 October `AGENTS.md` instead owns a generic authorized pool `lab-work` request through the one current controller and worker; no N0-specific profile/approval is required.

That change does **not** itself prove an available three-host distributed-harness run. The two just-completed focused jobs actually used only `tv-dator` and `local-workstation`; the `lenovo-laptop` preference on #749 was not the selected execution host. The current registered/attested fleet and support for invoking the original multi-host Lagrange harness from a non-reserved orchestrator must be measured, not assumed. A worker already holding a physical machine lock must not recursively try to take that same lock as one of the harness's targets.

The next admissible physical operation is an **actual single owned three-host harness scenario** through the current lab path once three distinct eligible Linux/Docker hosts and original harness orchestration are evidenced. Retain the exact source SHA, chosen physical identities and machine locks, original request ID, scenario/config, convergence and cleanup receipts; read routed-interface before/after counters on **each** host over the scenario's bounded idle window. These counters include unrelated traffic; do not label them per-Lagrange, per-peer RTT or Veilid capacity. A refused/unavailable run is not a passing N0 result.

**A green three-host interface-counter scenario still would not finish all N0 obligations.** The existing baseline separately asks for authenticated per-peer RTT, message-class/pressure attribution and desired-versus-effective timing visibility. Keep these as explicit evidence gaps until their own bounded witnesses exist; do not treat host-wide RX/TX deltas as those measurements.

## Next owned actions and stop conditions

1. **N0 integrated exact-head proof — DONE for the five test files only:** original lab #751 executed all five at the hardened `b61b9c2...` source on `tv-dator`, PASS 18/18; retain its original terminal log digest and closed physical scopes. The distinct multi-host scenario is not part of these five files.
2. **Lab execution owner:** establish current three-host admission/attestation and orchestration of the existing `node scripts/lab.js harness run n0-physical-network-baseline` (three distinct providers, `--nodes-per-host 1`, no fast-local substitution). Use the existing pool/controller; do not resurrect PR #416 or build a second scheduler. Stop before claiming physical results if those capabilities are unavailable.
3. **Raft owner:** accept an exact stable rs-raft integration baseline; retain the desired-vs-effective `configureTiming` mismatch and the 16-group pump tail as open measured findings, without adjusting timeouts to make a test green.
4. **N1 entry, after the accepted rs-raft baseline and reviewed N0 foundation:** one bounded Quest owns the `MessageRouter` ↔ peer-link interaction. First test unchanged WebSocket and in-process behavior, identity/incarnation admission, correlation and ACK semantics, cancellation, pressure, retry/deadline outcomes, and bulk isolation. Only then factor the existing physical socket operations; do not add NATS yet.
5. **N2 NATS-only:** its own cold formation, query/service, replication, CDC, catch-up/snapshot, split/merge, restart, broker-loss and seed-loss tests with **all direct inter-node WebSocket paths disabled**. A broker send is never an application ACK. Fragment/bulk must be bounded on NATS alone.
6. **N3/N4:** independently prove effective Raft timing semantics/static profiles and then Veilid-only with bounded small-frame/bulk transfer, private-route lifecycle and no alternate inter-node fallback. Dynamic per-group adaptation and mixing remain later frontiers.

No merge or release claim follows from this handover. The epic's planned certification projector is still absent and the epic is unsealed. Use the current exact source/owner evidence when turning any action into a sealed Quest.
