---
audience: evidence
recorded: 2026-11-17
---

# Bounded GCP allocation preparation

## Assignment before implementation

The operator asked to continue toward GCP comparative systems measurements and
to parallelize useful work. The existing six-VM provisioner does not request a
provider-enforced deletion time. Its campaign watchdog starts after preparation
and cannot bound VM billing lifetime. Current Google documentation supports an
absolute termination time with DELETE for standard VMs, including the existing
E2 class. This unit prepares that concrete bounded launch; it creates no cloud
resources and does not infer a historical spending grant.

The implementation owner is `core_args_runtime`, on
`work/gcp-bounded-vm-lifetime-20261117` from
`4b0c8ec1de59e9a074afa97ce260afb2868685c5`. Writable paths are
`docs/benchmarks/cloud/provision-gcp.sh`, its existing
`test/distributed/harness/__tests__/provision-gcp-script.test.js`, the relevant
section of `docs/benchmarks/cloud-reproduction-guide.md`, and this record.
Generated metadata and integration records remain root-owned.

## Scope and acceptance

Expose an explicit optional absolute UTC termination-time input on the existing
creation owner. When supplied, pass it with instance termination action DELETE
and explicit boot-disk auto-deletion. Preserve the existing six-node topology,
identity, SSH, firewall, image, storage and teardown owners. Reject malformed
explicit input before resource creation; use the existing validation/runtime
dependencies rather than adding a scheduling subsystem. Empty/omitted input
retains the documented legacy behavior and must not claim a lifetime bound.

The existing Bash-executing test seam must prove actual argument forwarding,
all six requested names, the unchanged ordinary create/place/teardown behavior,
and refusal before mutation for malformed input. It must not call real gcloud
or treat a stubbed provider response as evidence that real VMs have a schedule.
Managed native validation and independent review are required before inclusion.

At a real launch, the controller must verify each returned instance's requested
and effective termination state and boot-disk autoDelete property before
placement. The provider backstop supplements the canonical teardown, which
still owns closure after success, partial creation or failure. Stopped VMs,
leftover disks and the firewall must be checked independently at closure.

Material exclusions: no new VM scheduler, billing API, topology change, default
spending authorization, lifetime extension, retry loop or changes to unrelated
instances. The current concrete planning envelope is one six-VM allocation,
up to seven hours, one smoke attempt and one conditional capacity attempt; its
budget and authority disposition are recorded separately before execution.

## Primary provider references

- https://docs.cloud.google.com/compute/docs/instances/limit-vm-runtime
- https://docs.cloud.google.com/sdk/gcloud/reference/compute/instances/create
- https://docs.cloud.google.com/compute/docs/reference/rest/v1/instances/update

## Implementation contract before source edits

The create-only input is `VM_TERMINATION_TIME`, an optional absolute UTC timestamp
in `YYYY-MM-DDTHH:MM:SSZ` form, with whole seconds. The existing Bash runtime
validates its syntax, calendar date and time ranges before any `gcloud` call;
no new executable dependency or provider lookup is introduced. Google remains
the owner of admissible future scheduling limits. The operator must choose a
future timestamp within those limits; a syntactically valid timestamp is not
evidence of provider acceptance.

For a nonempty valid value, the one existing six-name creation call receives
`--termination-time=<value>`, `--instance-termination-action=DELETE` and
`--boot-disk-auto-delete`. The script prints that these settings were requested.
Empty or omitted input adds none of those flags and explicitly reports that no
provider lifetime bound was requested. `--place` and `--teardown` ignore this
creation-only input, including malformed or expired values, so it cannot block
cleanup. No lifetime is extended or calculated by this unit.

The existing subprocess test will retain the actual NUL-delimited creation argv
from its `gcloud` substitute. Positive controls cover the exact six names,
ordinary create and a valid leap date; negative controls cover malformed UTC,
impossible dates and invalid time components before any provider invocation.
The same suite retains placement and teardown controls with a malformed
creation-only value. Its evidence ceiling remains argument forwarding and
local Bash behavior, not real provider scheduling or VM deletion.

Implementation and managed native proof are pending. No local project test,
audit, build or generator has run for this unit.

## Workflow classification and bounded Quest proposal

R15 and the current `solver-quests.md` require a Quest: `VM_TERMINATION_TIME`
extends the public provisioner contract and introduces a provider scheduling
obligation. This is not an unchanged-contract local repair. The assignment
record is not a seal. The four-path draft is preserved as unverified work while
the integration owner prepares adoption against a genuine measuring baseline;
no Quest acceptance, review approval or resource authorization follows from it.

Proposed Quest: `gcp-bounded-vm-lifetime`, under the existing
`developer-journey-and-measured-comparisons` epic. Statement: the existing GCP
creation entrypoint accepts an explicit UTC expiry and requests the same
absolute DELETE schedule with boot-disk auto-deletion for all six named VMs,
refuses malformed input before mutation, preserves omitted-input creation and
does not let a create-only expiry obstruct placement or teardown.

Proposed `doneWhen` uses the existing `test-receipt` probe with
`file: solve/quests/gcp-bounded-vm-lifetime/evidence/receipt.json` and
`requiredReceipts: [create-time-expiry-contract]`. The existing
`scripts/quest-evidence/harness-runtime.js` should generate that receipt by
running the complete primary-classified provisioner test. Its native stdout,
stderr and first behavioral failures must be retained separately: the receipt
alone does not retain the complete subprocess output. Static gates and
content-bound independent verification remain required by their existing owners.

Baseline adoption must use the unchanged provisioner at
`4b0c8ec1de59e9a074afa97ce260afb2868685c5` with exactly the new witness file.
The explicit-expiry case first confirms successful script execution, the real
creation call, all six argv names and all six stand-in instances, then requires
the exact termination arguments. A baseline failure at a missing
`--termination-time=<value>` assertion is a measuring boundary gap. Import,
fixture, command-not-found or pre-engagement failure is not that observation.
Do not mark a missing or fabricated receipt red, change the assertion between
baseline and candidate, or treat an expected negative run as product acceptance.
Root owns native measurement, the genuine red seal, subsequent adoption of the
preserved implementation, lifecycle records and any integration decision.

## Owner transition and proof boundary

- Producer and binding: the operator supplies `VM_TERMINATION_TIME` to
  `provision-gcp.sh`; its create branch validates the value and forwards it in
  `TERMINATION_ARGS` to the existing `gcloud compute instances create` call.
  Google owns the requested and effective instance schedule. The script does
  not infer provider state from its own output.
- Shape and identity: one strict whole-second UTC timestamp, one DELETE action
  and explicit boot-disk auto-deletion apply to the existing `NODES` array.
  Project, zone, prefix, six names and all other create arguments keep their
  current owners. No membership epoch or local retry generation is involved.
- Ordering: validation precedes account lookup, firewall creation and VM
  creation. Provider schedule verification precedes campaign placement. No
  clocks or timeouts are shortened in the subprocess witness; calendar examples
  do not claim to meet Google's current future-time limits.
- Absence and refusal: empty/omitted input explicitly requests no bound;
  malformed explicit input exits 2 before provider invocation. A gcloud error
  retains the existing nonzero failure behavior. There is no retry or fallback
  that silently drops the requested schedule.
- Persistence and retained obligations: only provider acceptance and the actual
  returned instance state can establish the live schedule. Partial creation,
  allocation preparation and campaign failure still require canonical teardown;
  no new local durable state, scheduler or competing cleanup owner is added.
- Release: ordinary `--teardown` remains callable even when the environment
  contains an invalid creation expiry. Provider DELETE is a backstop; live
  closure separately checks stopped VMs, disks and firewall. The local witness
  measures subprocess argument/refusal/cleanup binding, not those cloud effects.
- Witness registration: the existing test is primary `unit`, resource
  `ordinary`, subsystem `distributed-harness`. Its observation census already
  names the provisioner and placement runner. Root owns any derived metadata
  refresh required by integration; this unit changes no baselines or registry.

## Managed native validation plan

Use a clean native managed-lab checkout and the same frozen witness bytes in
both source states. Run the ordinary classified command, retaining full output:

```sh
npm run test:file -- test/distributed/harness/__tests__/provision-gcp-script.test.js
```

First run against the unchanged baseline provisioner in an isolated worktree;
inspect the missing-argument and refusal assertions before using the resulting
red receipt for a seal. Then run on the preserved candidate without source
substitution. The local test substitutes only gcloud and placement's node
command, and must never invoke the real cloud CLI. The complete suite includes
existing identity, image, firewall, address, placement and cleanup behavior.

Run the applicable scoped checks on the candidate, and retain baseline scoped
output if a checker reports inherited debt:

```sh
bash -n docs/benchmarks/cloud/provision-gcp.sh
npx --no-install eslint test/distributed/harness/__tests__/provision-gcp-script.test.js
node scripts/check-guideline-ambient-intrinsics.js test/distributed/harness/__tests__/provision-gcp-script.test.js
node scripts/check-guideline-literals.js test/distributed/harness/__tests__/provision-gcp-script.test.js
node scripts/check-file-size-thresholds.js --base 4b0c8ec1de59e9a074afa97ce260afb2868685c5 test/distributed/harness/__tests__/provision-gcp-script.test.js
```

These JavaScript audits do not analyze Bash semantics. Native execution of the
actual script is the local behavior witness; future provider verification is a
separate launch obligation. No local project execution, cloud mutation, billing
approval, Quest seal or acceptance is claimed by this draft.

## Superseded: the bound is mandatory (2026-11-17)

Independent review confirmed that the optional input above is a "keep old behaviour if
absent" path: an omitted `VM_TERMINATION_TIME` still created unbounded VMs, and a test
asserted that path. A second GCP VM creator, the Pulumi `GCPProvisioner`
(`test/distributed/harness/gcp-provisioner.js`), set no lifetime at all. The record above
is retained as written; the contract it describes no longer holds.

The bound now has one definition, `test/distributed/harness/gcp-vm-lifetime.js`, and is
required by both creators: `provision-gcp.sh` reads `VM_MAX_RUN_DURATION_SECONDS` and
renders `--max-run-duration=<seconds>s`, `--instance-termination-action=DELETE` and
`--boot-disk-auto-delete` through `docs/benchmarks/cloud/gcp-vm-lifetime-args.mjs`;
`GCPProvisioner` reads its config's `maxRunDurationSeconds` and gives every Pulumi instance
`scheduling.maxRunDuration`, `instanceTerminationAction: DELETE` and
`bootDisk.autoDelete: true`. An absent or malformed bound is refused before any provider
call. `VM_TERMINATION_TIME` and its calendar validation are removed; a relative duration
was chosen because the committed configs of the second creator cannot hold an absolute
time. The live read-back obligations above still apply, against
`scheduling.maxRunDuration`.
