# Principal WASM v1 lane handover — 2026-10-16

STOP: protocol/source HOLD at a concrete creation-origin counterexample. Do not make another production correction before reconciling the existing service-creation -> WASM lifecycle -> INIT contract. No merge, F1 supersession or release activation/sealing.

## Exact custody

- Worktree: `/mnt/data/peter/projects/.worktrees/wasm-writer-slots-v1-20261016`.
- Non-main preservation branch: `review/wasm-writer-slots-v1-20261016`.
- Base: `cdcb9c95f4bdb90e709ed4d20058b51cb193625f`.
- Test-only checkpoint: `26cded6cb74594b8d38bce24e6a862302b605e23`.
- Frozen WIP source / executed test checkpoint: `9b53962f2e7b8402b2a6a02a4a24b45985cd3563`.
- Raw evidence: `/tmp/lagrange-wasm-writer-v1-20261016/`.
- Quest: `wasm-writer-slots-v1`, open, metric8/target0, newest source verification reject. Do not land or claim the eight receipts fulfilled.

Read AGENTS.md -> rules.md -> router.md, then this Quest's DESIGN.md, both design reviews, INIT counterexample review, STOP-DECISION.md and RESULTS.md. The later recreation audit explicitly qualifies the earlier design approval.

## Finding and first result

A legitimate delayed INIT for incarnation I can reach a new current replica by the same serviceId. Empty metadata has no independently bound creation origin, so it accepts I; old ENROLL then old WRITE can execute again. New intended incarnation J has not yet applied. This is NOT the ordinary retained-file restart schedule.

Only `wasm-writer-recreation-origin-v1.test.js` was executed: locked lenovo-laptop, exact source9b53962f, no retries. Whole file FAIL exit1, 2pass/1fail, named OLD_WRITER_REVIVED_AFTER_RECREATION. Real SQLite deterministic application; no native RF3 or end-to-end recreation/data-loss claim. Same-file exact replay and different-service refusal controls pass. Its SHA256 is9edc4b49f2de67da1c3cfce310b171a36e8329437c4c2b189a97db0ac480ec1f.

## Prepared but unexecuted

The v1 native completion companion (2 tests, pre-run reviewed), state controls (11), caller CAS controls (9), completion/lifecycle controls (7), completion-only mutation, process-loss/snapshot proof and affected cone remain unexecuted. Do not promote source inspection or fixture authoring into passing evidence.

Source prototype contains fixed slots, canonical codec, atomic writer state, caller CAS helper, local afterCommit interests and lifecycle/admin integration. It is incomplete, not independently approved source. Scoped ESLint passes; normal source pre-commit fails six new literal findings and two new decision-boundary findings, with three new scoped complexity violations. Aggregate duplication attribution remains unclassified. Documented WIP preservation does not waive these gates or permit landing. No ratchet was increased.

## Next bounded owner decision

A current authoritative service-creation binding must reach WASM lifecycle and deterministic INIT before initialization can accept a caller's incarnation. A per-replica CREATE journal is not automatically a common service-incarnation authority. Do not invent a second permit service, choose a local UUID independently per replica, or confuse placement/new filename with creation authority. Alternatively, enforcing never-reused service IDs would explicitly narrow recreation semantics and requires owner approval. No such restriction exists at this inspected seam today.

After that exact contract is reviewed, extend the same witness to reject old INIT/ENROLL/write and resume the frozen v1 completion/replay/control plan. Preserve all original historical bytes.

## Preserved boundaries

Shared checkout `/mnt/data/peter/projects/lagrange` was untouched: HEAD0996d7576516af24f5f4d3e1e9aee37c775aabae, integrate/rs-raft-2026-09-30, 18 staged paths, staged binary diff SHA2560b2ea79142a13f4dcada523f01108fbd8a4809492838e23f7a0246a7159953fc. Recheck ownership/processes/locks; these observations are not leases.

Original WASM test blob32bc78324927187134ea2e2e59de63467dbebed9, original fixture blobc15b2ca4b10c7a27988d11ae2eae3c974690313b, W07 blobdebc16f442ba63b100332d93b285865d36d1c376 and runtime blobd8f86b81e7c3098da01cf558aa37a85334c7ace9 unchanged. Original F1 remains unchanged. Earlier recorder, ROLLBACK, predecessor WASM comparisons were not rerun.

Full release successor stays unsealed/unactivated; F1 and runtime-increment approval HOLD; shared-control-wave HELD; Runner/TAP PARKED; PR122 rejected. No harnessd used. No new lab job remains intentionally running. Use existing locked lab executor; no shared dependency installation changes.

User requests early preservation/handover when usage falls below5%. Live usage percentage was unavailable; preservation is performed now at the protocol STOP rather than awaiting that threshold. Final remote publication identity and archive receipt are recorded alongside this handover after evidence preservation.


## Appended creation-origin decision and owner audit — 2026-10-16

The guiding owner accepts the recreation counterexample and selects common
creation-owner-bound incarnation while retaining reusable logical service IDs.
INIT confirms that already authoritative incarnation; it never selects it from
empty storage. Retained restart and same-instance replica replacement preserve
the binding; explicit recreation obtains a new one. Old CREATE historical
completion does not grant current activation. Application compares stored
binding; retained DB/image mismatch refuses opening without rewriting history.
No writer sequence, slot, acknowledgment or retirement redesign is selected.

Read `creation-binding/CONTRACT-GATE.md`, its source manifest and independent
owner audit before source work. The current inspected paths have immutable
installation intent and replica CREATE machinery, but no common durable
per-service current-incarnation transition or complete activation-to-genesis
handoff. Catalog-install activation explicitly records unsupported; the
direct desired-state CREATE path resolves a cached definition and tracks local
operations. Neither supplies the missing authority. The gap includes stale
CREATE across awaits and existing group/peer/storage identity. An injected
expectedIncarnation would not close it. This is the user's explicit stop
condition for an unavailable common creation authority.

No source/test edits or executions in this follow-up audit. The original
2-pass/1-fail component result and all prepared-but-unexecuted proof remain
as previously recorded. The prototype and static violations remain HOLD.
The next bounded unit must establish current service-creation authority and
its replica/genesis handoff in the existing owners, then resume the already
prepared WASM completion plan. Full native recreation/snapshot proof is still
unavailable. No main merge or release activation.
