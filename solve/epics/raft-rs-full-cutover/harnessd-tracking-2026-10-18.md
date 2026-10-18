# Harnessd tracking for the rs-raft lanes — 2026-10-18

## Current primary-directory choice

The owner subsequently chose to make the planning in
`/mnt/data/peter/projects/lagrange` current. That directory now contains the active
epic/lane plan, the current Quest records and required historical proof, with the
earlier roadmap/epic preserved outside active discovery. See
[current primary planning](current-primary-planning-2026-10-18.md). Registering
the primary directory after this update is committed can display current planning
and historical planning documents. It no longer needs a separate planning
worktree just to show the current work.

The checkout selection discussion below records the earlier alternative and its
deployment constraints. Its statement that the primary has only older planning
is superseded by this update. Service-account Git access and writable execution
provisioning are separate concerns and remain to be verified; registration still
does not start workers. The primary's staged implementation work remains intact.

## Reuse the existing owners

The [lane register](execution-lanes-2026-10-18.md) schedules the work.
Lagrange's existing epic, Quest seals, logs and evidence retain correctness and
completion authority. Harnessd provides project visibility, exact-commit planning
views, accepted tasks, separate execution lanes, agent revisions and attention
checkpoints. No new planning database or copied Quest status is needed.

Harnessd source inspected: `d309e37d960ad46ac4f36c88aa67843797dc5852`.
The installed `project-planning-view.js`, `lagrange-native-planning-adapter.js`,
`project-epic-run.js` and `agent-backend-catalogue.js` matched the inspected source.
Registration has not been performed by this documentation change; live visibility
and execution are not claimed.

## Select the checkout deliberately

The UI supports both **Work → Projects → Add project → Existing local folder**
and **From GitHub → Clone and add project**. An existing checkout is valid for
registration; cloning is not intrinsically required.

The planning view reads the exact committed HEAD of the registered checkout.
Refresh does not fetch, merge other worktrees or include uncommitted edits.
The original primary checkout is on `integrate/rs-raft-2026-09-30` at
`0996d7576516af24f5f4d3e1e9aee37c775aabae` with another agent's staged work.
Registering it can expose historical planning and recovery inventory, but cannot
show this new lane map or supply clean execution authority.

A separate linked worktree holds the current handover plus this tracking change:

```text
/mnt/data/peter/projects/.worktrees/rs-raft-harnessd-lanes-20261018
branch: plan/rs-raft-harnessd-lanes-20261018
origin: psvensson/lagrange
```

It is a planning source, not a claim that an operator-owned execution checkout
has been provisioned. Register this source only after these documentation edits
are committed and only if read-only visibility is the intended use. Registration
does not support silently switching an existing repository to a different path.
For the full planning/publication workflow, prefer an operator-owned managed clone
from the start. A fresh GitHub clone normally starts at the default branch; it
does not automatically select the cloud handover or this planning branch.

The live service inspected on 2026-10-18 is `harnessd-recovery.service`, running
as `harnessd-operator` with private state `/var/lib/harnessd`, `ProtectHome=yes`,
`ProtectSystem=strict`, and writable state only under `/var/lib/harnessd`.
The session preparing this plan has neither its authenticated browser session nor
passwordless administrator access. Registration must therefore be completed by
the operator through the UI or the service's existing trusted owner ingress.

If Git refuses the local checkout as foreign-owned, an administrator may explicitly
trust that exact canonical path for the service account, following Harnessd's
`docs/PROJECT_DISCOVERY.md`. Do not use a wildcard trust entry, change the primary
checkout's ownership, relax the service sandbox or mutate the live SQLite database.
Exact Git trust allows inspection; it does not make this shared checkout writable.
If access is unavailable, use an operator-owned checkout under the private state
directory and select the intended committed planning branch there.

The managed clone can also be populated from a trusted local Git export through
administrator provisioning; using GitHub is a convenience, not a requirement to
discard the existing repository. Do not move or chown the primary working copy.

## Verify visibility before starting work

1. Register `psvensson/lagrange` through the existing project-registration owner.
   A successful project card is distinct from a running lane.
2. Open **View project planning**, refresh, and select `raft-rs-full-cutover`.
3. Check the displayed checkout path and full revision. Its epic source should
   contain **Execution lanes and Harnessd tracking (2026-10-18)** and the nine-row
   lane table. The table is included directly in the epic source because nested
   Markdown links are not guaranteed to be browsable in the bounded preview.
4. Confirm the native adapter shows `wasm-creation-genesis` as a member through
   its existing explicit `epic` reference. Do not infer completion from an epic's
   status or from this scheduling table.
5. If the displayed HEAD is older, resolve the registered source through normal
   checkout/recovery ownership. Do not pull/reset the dirty primary checkout.

At the handover revision the adapter reports a dangling epic reference to the
prospective `transaction-topology-admission-barrier` Quest. Preserve that fact as
scope uncertainty when considering an epic run; do not create a fake solved Quest
or remove membership just to satisfy the coordinator.

## Prepare bounded tasks, then create execution lanes

Executable Harnessd artifacts use `planning/accepted/*.json` and the existing
task-v2 contract. Draft them after the execution base and bounded scope are ready;
do not place speculative accepted files in this documentation commit.

| Proposed task prefix | Read-mode Quest subject reference | Admission prerequisite |
| --- | --- | --- |
| `rsraft-a-finality` | `wasm-creation-genesis` | Approved bounded design and preserved test-only checkpoint |
| `rsraft-b-inventory` | `wasm-creation-genesis` | D1 resolved and independent contract/oracle approval |
| `rsraft-c-grant-recovery` | `wasm-creation-genesis` | Corrected U1 approval and reviewed K-bound decision |
| `rsraft-d-activation` | Newly sealed activation Quest | Reviewed charter/red probe and upstream prerequisites |
| `rsraft-e-freshmg` | `message-group-fresh-identity-membership` | Exact candidate inventory and bounded owner scope |
| `rsraft-f-transactions` | Existing applicable TX1 Quest | Exact remaining receipt and compatible execution base |
| `rsraft-g-custody` | Existing applicable snapshot/cleanup Quest | Evidenced remaining gap, no duplicate learner repair |

These are proposed names, not accepted task identities. Each actual task needs an
exact base SHA, explicit authority/dependency keys, bounded changed paths,
meaningful proof commands and a pinned eligible agent revision. Submit the concrete
proposal through Harnessd's planning PR/acceptance owner. Ordinary model advice,
this lane map and a similar task name do not establish those fields or acceptance.
Use an explicit foreign read-mode association for the parent Quest; do not make a
task depend on completion of the same unfinished Quest it is implementing. Local
exclusive/shared authority keys separately describe writer conflicts.

The existing **Approve and merge planning** flow records authenticated human
acceptance. Preserve that gate. Later tasks whose base depends on earlier results
are prepared at their actual new base, not silently rebased from today's plan.

For a Peter-owned read-only registration, this publication/acceptance flow is
blocked pending writable provisioning: its owner fetches, updates Git refs and
creates worktrees through the registered project path. A separate task binding
does not redirect those planning operations. Registration alone is not readiness.

For parallel work, prepare independent accepted tasks through the ordinary outcome
owner onto separate lanes. Serialize overlapping writers. The existing **start
epic raft-rs-full-cutover** coordinator intentionally advances one task at a time
on one lane; it is suitable for serial continuation, not a seven-lane fan-out.
Choose one scheduling owner for a given accepted task set. Do not run both against
the same tasks and interpret an OTHER_LANE checkpoint as a defect to bypass.

Execution uses clean isolated operator-owned task checkouts. The task-checkout
binding owner does not accept a shared linked worktree as an isolated execution
checkout. Keep project registration, planning observation, task acceptance and
execution checkout binding as distinct operations.
The inspected source contains `bindTaskCheckoutViaOperator`, but the live
operator action/HTTP/console surfaces do not expose that administrative operation.
If this route is needed, provision its supported owner path before promising
parallel execution. A clean linked planning source can supply an isolated task
checkout; the new target, rather than the source, must have its own Git store.

## Agent selection and completion

Use the lane register's model/effort defaults, then verify the deployed catalogue
and writable capability. Record the actual immutable agent revisions. Detection
of a Codex/Claude model is not writable certification. Do not change the existing
Spelunk personal-helper binding just to make Lagrange visible; personal-helper
routing is a separate owner decision if later execution needs it.

Each independent verifier receives the exact commit and applicable checklist.
Harnessd task completion does not close A/B/C's shared Quest. Keep missing accepted
planning, design REVISE, dirty source, stale base, unavailable execution and missing
proof as explicit checkpoints. Final acceptance still follows the Lagrange epic,
Quest, independent-review and publisher gates.
