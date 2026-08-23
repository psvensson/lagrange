---
epicContractVersion: 2
id: ci-vm-admission-baseline
roadmapRow: null
graduatesTo: null
---

# Epic: CI VM admission baseline (and a separate, intentional jitter lane)

## Intent (why now)

Stop fitting the corpus into whatever VM GitHub hands us. The corpus
measures and publishes its minimum resource baseline; any candidate CI VM
must prove it meets the baseline before the corpus runs. Below-baseline
VMs yield NOT_RUN("vm-below-baseline"), never a flaky red that
impersonates a product bug. Evidence: five consecutive hosted full-gate
runs (2026-08) failed on five different jitter-surfaced faults, all green
locally on identical trees. The fuzzing value cramped runners provided by
accident is retained as a separate, intentional lane (decided below).

## Prior art already in-repo (lean on, do not duplicate)

- [`hardware-relative-convergence-budget`](hardware-relative-convergence-budget.md)
  (resolved): probe median vs stored reference; scale only work-bound
  budgets; over the clamp cap = "machine unsuitable, surfaced". This epic
  generalizes that cap from one gate to the pipeline.
- `scripts/checks/wait-for-thermal-headroom.js`: existing single-dimension
  resource-floor admission gate.
- Memory-soak oracle + `container-memory-working-set.js`: the
  measure-envelope-then-enforce pattern, promoted here to the CI VM.
- Acceptance manifests capture per-command artifacts: raw material for
  deriving the envelope empirically.
- `[ci:self-hosted]` routing: the dispatch mechanism for qualified VMs.

## What the baseline measures

Binding constraint is scheduler/timer jitter, not throughput (every
2026-08 hosted failure was scheduling-latency). Floor dimensions, all
probeable in ~20s: vCPU count, single-thread calibration score,
timer-jitter p99 overshoot (the flake predictor), memory headroom, disk
fsync latency. The floor is a checked-in requirements manifest owned like
a ratchet baseline: derived from recorded run artifacts, tightened
one-way, loosened only by deliberate re-baselining.

## Open questions with alternatives analysis (2026-08-23)

- **Q1 manifest owner.** Ratchet family: familiar one-way discipline, but
  ratchets assert deterministic tree properties and also run on dev boxes;
  a per-machine probe breaks both. Dedicated
  `scripts/checks/ci-vm-admission-probe.js` + JSON manifest matches the
  thermal-headroom prior art. Leaning: dedicated runner.
- **Q2 probe sampling.** Fail-fast: cheap, but one noisy-neighbor spike
  refuses a healthy VM. Retry-until-pass erodes the floor (jitter is not
  stationary). Median of ~3 short bursts bounds cost and a lucky burst
  cannot admit. Leaning: median-of-bursts; also record in-run jitter
  samples into acceptance artifacts for "degraded mid-run" triage.
- **Q3 refusal routing.** Auto-reroute keeps liveness but silently
  migrates a fleet-wide degradation onto the one dev box and hides the
  signal. Surface-and-stop is visible but blocks pushes on blips.
  Leaning: bounded auto-reroute with a counted, surfaced ledger; N
  reroutes/day trips an alert. The reroute budget and ledger are the
  doctrine-18 interaction contract; the reroute target must itself pass
  the probe.
- **Q4 fuzz-lane constraint.** Docker/harness cpu limits: owned, precise,
  observer stays unconstrained - but only squeeze the containerized
  layer, and the 2026-08 bugs were host-level jitter hitting in-process
  timers. Runner-level constraint (small VM / whole-host load) reproduces
  the real failure mode but starves observer and subject alike. Leaning:
  runner-level DISCOVERS, docker-level REPRODUCES deterministically.
- **Q5 qualified pool.** GitHub larger runners: zero ops, per-minute
  premium, opaque hardware. GCP spot: cheap, chosen SKU makes probe
  pass-rate predictable, existing GCP image tooling - but real ops
  surface (registration, preemption must read NOT_RUN, fork-PR security).
  Leaning: larger runners first; revisit spot on cost. The probe makes
  the pool a commodity choice.

## The separate jitter lane (decided direction)

Correctness must hold on any VM; the baseline governs only wall-clock
budgets. A scheduled fuzz lane runs the corpus under deliberate
constraint with the admission gate bypassed by declared intent. Its
findings are triaged as latent-timing quests, never pipeline noise; it
never gates a push or release.

## Targeted constrained scenario lanes (2026-08-23 addition)

Full-gate reruns cost ~30 hosted minutes per sample of a probabilistic
fault. The modular counterpart: extract the failing scenario (file,
manifest subset, or full-system scenario) and loop it under deliberate
constraint - core-pinning against busy competitors locally, docker cpu
limits in the harness, a small VM in CI. Thirty constrained minutes
yield tens of samples. No new orchestration: manifests already name
command subsets, `run-test-files.js` runs file subsets, constraint
mechanisms are owned. Division stays sharp: the full gate is the release
CERTIFICATE; the constrained lane is the DIAGNOSIS instrument.
Calibration lesson (first application, raft-logic SIGSEGV): constraint
tuned too harsh changes which fault you sample - 11/11 iterations died
in functional timeouts before teardown was reached.

## Controlled-environment lane for long-running tests (2026-08-23 direction)

Peter: long-running tests should run under controlled conditions - meaning
GCP-provisioned VMs - rather than on contended developer hardware or
below-baseline hosted defaults. A provisioned VM is the only VM whose
envelope is actually controlled: chosen SKU, no desktop contention,
reproducible from an image, and the admission probe passes by
construction instead of by luck. Evidence from the v0.1.1 certificate
campaign: three consecutive full-corpus runs on the (otherwise idle,
20-core) dev box each failed on a different intermittent test - the
flake tail is partly intrinsic races, but classification and rerolls
burned hours that a controlled lane would not.

Existing owned parts to build on: `scripts/build-gcp-harness-image.js`
(versioned image family lagrange-distributed-harness, ready-marker,
content-hash naming), `test/distributed/config/gcp-*.json`, GCP
partial-stack teardown hardening (quest gcp-affinity work, commit
16eee4d8f). Missing: a lane orchestrator that provisions from the image,
checks out an exact SHA, runs the admission probe then the designated
corpus (`check:release` or the heavy classes), collects a HEAD-bound
receipt, and tears down. Natural routing seam: the resource-class
manifests (`test/shards/resource-classes.json`) already classify tests -
heavy/exclusive classes and the release certificate go to the controlled
lane; the fast corpus stays local/hosted for pushes.

## Decision log

- 2026-08-23 - Direction approved by Peter: measure a minimum baseline
  from the corpus and fit VMs to it, rather than fitting the system to
  GitHub-hosted defaults.
- 2026-08-23 - Peter: jitter fuzzing is real value but must be a
  separate, intentional lane, not an accidental pipeline property.
- 2026-08-23 - Peter: targeted constrained scenario runs join the test
  modularization (this epic's scenario-lane section).
- 2026-08-23 - Release-certificate consequence adopted for v0.1.1:
  certify on qualified hardware; hosted full-gate becomes the nightly
  flake miner (quests: raft-logic-worker-terminate-segv,
  query-widening-hosted-assertion-flake).
