# Brief: closed-admission startup census (read-only)

You are a census agent for the Lagrange repository (distributed SQL on Raft; rs-raft backend). Repo: /mnt/data/peter/projects/lagrange. Read CLAUDE.md, docs/steering/rules.md, docs/steering/router.md first (R03 authority is consumed not copied; R11 one execution path).

## Situation
On the activation lane worktree `/mnt/data/peter/projects/.worktrees/rs-raft-startup-activation-20261011` (source bytes == commit 14fac7d6; do NOT modify this worktree) participant transaction admission on every partition starts CLOSED (src/partition/partition-participant-transaction-pause.js: `newPause`, `pausedWriteAnswerOf`) and is opened only by the participant release protocol (src/node/replica-handler-participant-cutover.js, src/node/replica-handler-participant-release.js, src/node/replica-handler-release-recovery.js, src/bootstrap/bootstrap-service-seed-workflow.js:259-328 `releaseSeedParticipantCohorts`). The owner's ruling: "closed mutation admission must allow the established recovery owners to perform the snapshot recovery, replica discovery and CDC settlement needed to complete startup. Trace that dependency through production once: recovery must not wait for permission that its own work is required to establish. Seed registration itself is a new write; the activation owner must account for the actual registration write and its authority." Your census is that trace. Facts only, with file:line citations; classify; flag unknowns.

## Deliverable
Write `/tmp/claude-1000/-mnt-data-peter-projects-lagrange/7d226e8e-2620-4ebc-b06e-31e1a39b76b9/scratchpad/activation/startup-admission-census.md` with these sections:

A. **Pause consumers.** Every production site that consults the pause (`pausedWriteAnswerOf`, `participantCutoverPauseOf`, `invalidateParticipantReleaseAdmission`, `raiseParticipantCutoverPause`) and, for the write kernel site in src/partition/partition-service-raft-write-commit.js (~:442), exactly which command origins/types are refused while CLOSED and which bypass it (see `admitCommittedCommand` / `PARTITION_COMMITTED_COMMAND_ORIGIN` in src/partition/partition-committed-command-admission.js, and the release owner's own commands). A table: site, what it gates, bypass origins.

B. **Seed bootstrap write inventory.** For the seed node's bootstrap (src/bootstrap/bootstrap-service-seed-workflow.js `buildSeedCheckpointSteps` phases INFRASTRUCTURE, MESSAGE_GROUPS, PARTITIONS, REGISTRATION, CACHE_HYDRATION, then the COMPLETE handoff `attachSqlRuntimeToStartupOwner` / `activateSteadyStateRuntimeHandoff`): every write issued (genesis rows, system-table creation, schema migration cutover `executeCutoverTransaction`, seed registration rows NODES/SERVICES/READY/rejoin hints, CDC subscription/obligations, artifact/image payload rows, anything else), with: owner module:line, target table/partition, the path it takes (partition-service-raft-write-commit? control-plane gateway? direct SQLite? message group?), whether the pause applies, and whether it runs BEFORE or AFTER `releaseSeedParticipantCohorts`. Mark the ones that would be refused while CLOSED.

C. **Joining node.** The non-seed path: where `participantReleaseRecovery.releaseFreshCreate` is called (src/node/replica-handler-create-methods.js:~413) in the replica CREATE lifecycle, what writes precede/follow it, and whether a joiner's registration writes go to partitions whose admission is still CLOSED at that moment (on the joiner, or on the seed).

D. **Restart with existing storage.** How admission is re-opened after a process restart (src/node/replica-handler-release-recovery.js `reconcile` with TRIGGER.EXISTING_ORIGIN: does it re-run the full PAUSE/RETIRE/… cycle? what is blocked until then?), and the role of the durable authorization record (`_partition_write_generation.participant_release_authorization_text`) vs the volatile ADMISSIONS map.

E. **Recovery work that must run while CLOSED.** The owner names snapshot recovery, replica discovery and CDC settlement. For each: the owner module, whether it issues partition writes, whether those writes hit the pause, and whether the release protocol itself waits on any of them (circular-wait candidates: e.g., `settleQueryRelease` needs the SQL engine (`service.sqlQueryEngine` / `handler.cdcIntegrationService.sqlQueryEngine`) — when is that engine attached relative to the release loop? see `prepareFreshSeedActivationReadCut`).

F. **Transaction and participant state kept across the pause.** What `isReleaseDrained` counts (src/partition/partition-participant-release-facts.js:46-70) and which of those counters can be non-zero on a fresh seed during bootstrap (e.g., proposals/pendingOutcomes from the release protocol's own commands; the Raft catch-up condition appliedIndex===commitIndex===lastIndex).

G. **Open questions** you could not settle from the source, listed plainly.

## Method and constraints
- Read-only. Grep/read inside the worktree; small `node -e` reads are fine; no test runs needed.
- Also compare with the reviewed base commit 10c2f0610 (`git -C /mnt/data/peter/projects/lagrange show 10c2f0610:<path>`) where a write path existed before the release protocol, to say what changed.
- Do not modify any file under /mnt/data/peter/projects. No git commit/push/reset/checkout --/clean/rebase/amend. No `find /` or filesystem-wide scans.
- No design proposals; facts, classification, unknowns. Cite file:line for every claim.
