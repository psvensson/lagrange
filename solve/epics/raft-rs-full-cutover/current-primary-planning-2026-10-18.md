# Current primary planning — rs-raft takes priority

The owner chose on 2026-10-18 to use the existing primary directory for current
planning and to retain its earlier plan as history. The active execution priority
is [raft-rs-full-cutover](../raft-rs-full-cutover.md), ordered by the
[lane register](execution-lanes-2026-10-18.md) and
[cloud handover](HANDOVER-2026-10-18-cloud.md). The
[closeout plan](closeout-plan-2026-10-17.md) retains the final acceptance sequence.

## Current work and source provenance

The current planning and Quest records were imported from published commit
`a1c3cde54fcb46471791062bcae4a6000ae484e0`, which extends cloud checkpoint
`f5717e6f53a3ae18c2f470a507a180c3eca2cc17` with the lane plan. The
[import manifest](primary-planning-import-2026-10-18.json) records each file's
source hash, Quest seals and historical terminal statuses.

All 32 existing Quest definitions associated with the epic, their append-only
logs and their declared retained receipt files are present. Existing log bytes
were preserved. No terminal was manufactured or reinterpreted. The prospective
`transaction-topology-admission-barrier` remains an explicit missing reference;
this planning refresh does not invent a seal to make an epic coordinator start.

The independent U1 rejection and the finality, inventory, U2 and activation
preparation documents are available locally beneath
`solve/quests/wasm-creation-genesis/evidence/recovery-20261017/`. The complete
[source Quest evidence](https://github.com/psvensson/lagrange/tree/a1c3cde54fcb46471791062bcae4a6000ae484e0/solve/quests)
remains pinned to the imported commit. Additional evidence not copied locally
must be obtained and verified in the lane's execution checkout before use; it
is not presumed present or passing.

This refresh imports no production or test implementation. The prior primary
commit was `0996d7576516af24f5f4d3e1e9aee37c775aabae`, and its 18 staged paths
are preserved. A historical SOLVED Quest or stored passing receipt does not
certify those implementation bytes. U1's reviewed subject is
`a251ce4fd9c980a78c0fd33d8a5f873161f90870`; the handover's composed candidate is
`e7a3525a52afcc1e38218483f87ca3a74a421744`. Re-read refs before execution and
bind every task, review and proof to its actual base/head.

## Earlier planning remains discoverable

- [Historical primary roadmap](../../archive/plans/primary-before-20261018/roadmap.md)
  preserves the former immediate Stable Core priorities.
- [Historical primary rs-raft epic](../../archive/plans/primary-before-20261018/raft-rs-full-cutover.md)
  preserves the former epic presentation and scheduling.
- The earlier lifecycle [authority census](quest-records/replica-lifecycle-durable-generation/authority-census.md)
  and [changed-source ledger](quest-records/replica-lifecycle-durable-generation/changed-src-ledger.md)
  retain their exact bytes at the same historical locations used by the published
  source. Importing that Quest's recorded closure requires retiring these two
  working records from its terminal proof directory; its log stays in place.

Each archived roadmap/epic has a prominent wrapper and retains the original
document bytes after that wrapper. Both live outside active `solve/epics/` and
`solve/quests/` discovery. Harnessd can browse them as planning documents through
the roadmap's progress/history index; they do not create another active epic or
new execution tasks.
Older dated decisions inside the live epic remain provenance or binding acceptance
as applicable, while the current lane register controls immediate scheduling.

## Harnessd registration and execution

Register `psvensson/lagrange` using the existing local directory
`/mnt/data/peter/projects/lagrange`. Then open **View project planning**, refresh
and select `raft-rs-full-cutover`. Its source preview identifies the active lanes
and the implementation/evidence boundary. The roadmap document list also exposes
the two clearly titled historical plans.

The installed reader was previously verified to support this layout. Live
registration still requires the authenticated operator UI or trusted service
ingress; this change does not claim that registration occurred. The service runs
as a different user and may need exact-path Git trust for read access. Its current
sandbox makes this developer checkout read-only, so writable planning publication
and execution still need explicit provisioning through their owners. Those are
deployment concerns, not reasons to leave the primary planning stale.

Do not activate the historical plan, treat imported receipts as current-head
approval, or start an epic run to bypass missing accepted tasks. Use the existing
worktree/recovery inventory to locate old unfinished implementation and evidence;
adopt any resulting work only through the current lane and acceptance owners.
