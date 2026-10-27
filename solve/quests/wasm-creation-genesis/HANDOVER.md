# Creation-to-genesis handover — user-requested stop, 2026-10-16

Status: **STOPPED at the user's instruction. Whole unit HOLD.** This is a
non-main WIP preservation checkpoint, not Quest landing, source approval,
activation or a release claim. All this lane's new production source work is
still unimplemented. Do not merge the inherited prototype/evidence branch.

## Exact checkout and preservation

- Worktree: `/mnt/data/peter/projects/.worktrees/wasm-creation-genesis-20261016`
- Branch: `review/wasm-creation-genesis-20261016`
- Base / reviewed audit: `f6c3698be77043ddd19e3a2a923a6d0ac6d2a9a9`
- First test-only checkpoint and executed checkpoint:
  `688c75e0a5db943985f8ff2a93e5355560ac1aa1`
- This handover is committed with the second preservation checkpoint. Resolve
  its exact final SHA from the remote branch and the external publication receipt;
  no self-referential hash is claimed inside this file.
- Source diff against the base is empty. New files are contracts, review records,
  tests/fixtures, generated metadata and retained evidence. No production repair
  was attempted, including the approved process-custody prerequisite.

Shared integration was rechecked at stop: branch `integrate/rs-raft-2026-09-30`,
HEAD `0996d7576516af24f5f4d3e1e9aee37c775aabae`, the same 18 staged paths.
Binary staged-patch SHA256 remains
`0b2ea79142a13f4dcada523f01108fbd8a4809492838e23f7a0246a7159953fc`.
No shared checkout/dependency changes or foreign process cancellations occurred.
Own node_modules links to
`/tmp/opencode/release-linearization-rev2-correction/node_modules`;
lock graph `0b49533effbed7e3577dd212628a99e56c630068f76a9dc148cfc8dc96b28bf0`.
Fresh owner/lab checks remain required on resume; observations are not leases.

## Approved contract, not implemented functionality

Read actual AGENTS → rules → router, then this Quest's records. R1 and its
REVISE findings are preserved; R2 is the current local approved contract.

- `CONTRACT-R2.md` SHA256
  `f086f2edb4126221be2834f8d15b688e836472286d8f3da544aa8e1d5f6e6224`
- `HANDOFF-INTERFACES.md` SHA256
  `73ce46f2cb6828d5a07fa5e7811152929314de9be97f777af2b1d62524470cea`
- Independent reviewer: `subagent:/root/completion_consumers`.
  Exact verdicts are in `PRE-SOURCE-INDEPENDENT-REVIEW-R2.md` and
  `INTERFACE-AND-TEST-PRE-RUN-REVIEW.md`.

The selected mechanism assigns one `service_instances` row to the existing
ServiceDefinitionsOwner. Real authoritative conditional SQL compares the exact
prior canonical state; local locks do not arbitrate. Full creation identity is
(S, expected version, caller-retained nonce). Sixteen retained decision records
preserve winner/conflict attribution; monotonic versions fence retired history.
Selection J is distinct from permission to serve J. At most two instance bodies,
nine resource slots each, retain ordinal fences. J cannot receive serving
permission until every owed I resource closes. Original resource intent/token
survives every await and recovery. No TTL, absence or unknown reply releases it.
The total encoded currentness state profile is 131072 bytes, not a total-system
resource bound; encoding proof is still required.

ServiceLifecycleManager owns one durable CREATE origin/admission row for this
route. `intent_json` is immutable; `admission_json` stores the returned token.
It stays IN_PROGRESS through bootstrap. Lower runtime journaling consumes this
origin instead of inventing another. Explicit BOOTSTRAPPED_HELD must propagate
through driver, runtime lifecycle, service lifecycle and RuntimeServiceHandler;
none may convert it to ACTIVE/RUNNING/COMPLETED. Same original continuation
resumes matching INIT and publication. Descriptor fields are consensusBinding,
consensusSlotRequest and consensusResourceToken. Immutable definition projection
must also survive normalization; current normalization drops important fields.

Common persisted B precedes writer INIT; INIT confirms it. Group/peer/route/
storage use the existing identity owners with incarnation separation. Local
PUBLISHED/RETIRED permission is separate from replicated genesis. Intact same-
directory PUBLISHED recovery can proceed without metadata quorum; its global
outstanding obligation still blocks J. Local retirement must persist before
metadata CLOSED. Shared snapshot/image import remains an explicit dependency.

The catalog route remains ACTIVATION_UNSUPPORTED. Request Cells/OCI are not
forced through this protocol. Direct consensus composition must supply actual
module/port/storage/transport owners; missing dependencies remain typed refusals.

## Executed evidence — one new whole-file run only

`test/entrypoint/creation-recovery-process-custody.test.js`
- Test SHA256 `0c74a25cb936900d1357f7a3745d3c3860a43e74df02b21b860c512921c00a54`
- Git blob `980fe4ce9d7a5a09c689ec780a8aae8ad8a94443`
- Checkpoint `688c75e0a5db943985f8ff2a93e5355560ac1aa1`
- Locked host `lenovo-laptop`, Node v22.23.2.
- First result: **3 tests: 1 pass, 2 failures; exit 1**. No retry.
- Both semantic failures: `SUCCESSOR_ADMITTED_WITH_UNRELEASED_OLD_RESOURCE`.
  Early shutdown rejection skipped old resource cleanup, yet the process-lock
  wrapper's finally released ownership; a real second process acquired the lock
  while a real old SQLite handle remained open. Healthy shutdown control passed.
- This is component process-custody evidence. It does not execute successor
  startup, native RF3 overlap, recreation, or demonstrate data loss.
- Raw TAP SHA256
  `2f0feed8d2a59ff002fe2944e5172dd8ccd77024e74d78b19f95ade0097f21f0`.
- Complete copied evidence: `evidence/process-custody-first/`.

Command:
```
node /tmp/lagrange-runtime-correction-20261015/run-group-capture.mjs \
 /mnt/data/peter/projects/.worktrees/wasm-creation-genesis-20261016 \
 /tmp/lagrange-creation-genesis-20261016/process-custody-first \
 688c75e0a5db943985f8ff2a93e5355560ac1aa1 lenovo-laptop \
 test/entrypoint/creation-recovery-process-custody.test.js
```

The approved bounded correction is successful-shutdown-only lock release,
startup final-owner release only after every ordinary cleanup succeeded, and
strong reference custody until actual release/process death. Preserve acquisition
await-before-abort and register-before-abort. Merely dropping a guarded cleanup
closure is not enough: GC could release its SQLite handle. No source edit exists.

## Authored tests are NOT executed evidence

1. `startup-failed-cleanup-process-custody.test.js`: two cases, exact hash
   `be58a8d6f5c9df3f1c101a64b50c282818f38990b29aba78102af2333e2baf92`.
   Independent approval for first locked run exists. NOT RUN. It covers failed
   unwind and healthy release; fixture holds owner strongly, so production
   reference lifetime still needs proof.
2. `service-instance-creation-cas.test.js`: nine prospective cases, hash
   `4d9e4904b472429b5359adcb22353392855c1d6a461b6b1924b4c28ea92054cd`.
   Fixture hash
   `7a3b69a318e90a09c9d65b95a50956992422ec3e4abb8a6bb54c1d5c7c956a59`.
   Real owner/gateway/CDC plus SQLite predicate evaluation; read adapter is
   explicitly component-only. Lost-response vacuity corrected by observing
   applied state before retry. Reviewer inspected correction content but did
   not independently recompute final hashes before STOP: exact-byte approval
   remains pending. APIs/schema absent; do not run for missing-symbol RED.
3. `wasm-creation-bound-native.test.js`: prospective native cases, hash
   `8cd62bd27739803eb264188f9baa8ac2f8265ba03ce8d82e0028ee3795154590`.
   Fixture hash
   `0ca22fc4d2f3def38ce87445d61eb4213f0a66498c83744d6d88526bece4ffcb`.
   **REVISE, NOT RUN.** Draft initializes then ENROLLs before publication;
   required order is INIT → actual publish/PUBLISHED → ENROLL. Correction is
   intentionally unapplied at user STOP. Non-ACTIVE projection sink needs honest
   observation/qualification; actual runtime can swallow its error, so this is
   not a proven setup failure. Positive scope ends at local grant/serving; full
   endpoint/ACTIVE authority is not yet covered. C2/C9/C11/C12 remain planned.

Scoped syntax/lint reported passing for authored fixtures; no actual test
execution follows from that. Original prepared writer v1 completion/state/
caller/lifecycle tests remain unexecuted. No new static/full-cone gate or
semantic binding/completion mutation was run. Original prototype static debt
(six literals, two decision-boundary, three complexity findings) remains HOLD.

## Resume without repeating the absence audit

1. Recheck exact branch/remote, shared staged hash, agents, processes and locks.
2. Read R2 + handoff + independent reviews. Complete only pending exact test
   review and the identified native fixture ordering correction. Freeze each new
   test profile before source; retain all prior bytes/results.
3. Run approved startup falsifier once through locked executor, preserve first
   result; implement the reviewed process-custody prerequisite without dropping
   strong lock ownership. No retry-until-green.
4. Implement the approved complete creation/CAS → durable original intent →
   resource custody → phased lifecycle → common genesis interaction through
   existing owners. APIs/new schema are still absent. Do not certify fragments.
5. Execute C1–C13 with explicit component/native/process/image limits, real
   production owner outputs, semantic binding-check mutation, then resume held
   writer completion/replay proof. Correct prototype static debt via normal gates.
6. Independent final exact source/evidence review and non-force review publication.

No source acceptance or product proof follows from contract approval. Required
process-loss, native metadata arbitration, full publication, retained recovery,
shared snapshot and affected-cone evidence remain absent. Full creation unit,
writer completion, whole runtime/F1 and main readiness remain HOLD. Full release
successor remains unsealed/unactivated; shared-control-wave HELD, Runner/TAP
PARKED, PR122 rejected. No new source work is authorized by this handover beyond
the user's existing reviewed scope; the current instruction is to stop.
