# Read-only TX1 timeout investigation, 2026-10-13

Baseline HEAD: `e6d43bc1acb128a2b83ac89c77a3ec400e7edb1f`.
Read-only production/test-source investigation. No source edits, new tests,
heavy test executions, or Git writes were performed for this investigation.
Existing local classified-runner evidence was read; same-host lab comparison
is owned by the parent investigation and is not claimed here.

## Measured result: M1 is assertion-green but operationally red

`baseline-results.ndjson` reports seven passing files. M1 is one test assertion
at 31,486 ms. `baseline-m1.tap:2` and
`.tap/test-results/test/integration/seed-migration-cutover-persisted.integration.test.js.tap:2`
retain an ERROR `wait_bound_spent`:

- wait `table_partition_target_node_wait`, bound 1000 ms, elapsed 1010 ms;
- requiredReplicaCount 2, resolvedNodeCount 1, activeNodeRowCount 1;
- maximumProvisionableReplicaCount 1, failOnTimeout false;
- seed node is published membership epoch 1, serveEligible/repairEligible true,
  transport connected, freshness fresh, no node-trust rejection reasons;
- available node's operation-creation admission is READY/PROCEED, allowed true;
- rejectedTargetNodePlans is empty.

This is healthy CREATE setup at M1 lines 135-144, with no injected hold or clock
advance. `createSeedQuerySurface` attaches the SQL engine already published by
production seed bootstrap; its header's historical description of a separate
setup engine does not describe the current helper's actual same-owner wiring.
The timeout is not evidence of a missing cache node or rejected available node.

## Systemic interaction and permissible initial outcome

Table creation records desired RF3 from the service configuration
(`table-creation-service-class.js:86-89`; canonical architecture
`process-partitioning.md:56-58`). `TableCreationService` owns default initial
minimum: quorum(3)=2 (`table-creation-service-partition-provisioning.js:30-39,
99-113`). Its callback hands this implicit minimum to SQL provisioning.

SQL provisioning knows only one eligible physical node. It waits for the
implicit quorum-sized minimum first (`initial-partition-provisioning.js:147-173`),
then, only after WAIT_TIMEOUT, derives the already-supported single-node floor
and reduces target/minimum to one (`:197-253`). The one admitted node was usable
before that timer. Therefore expiry currently decides when supported work may
start; the interaction fails to separate desired RF, admissible founding cohort,
and the rebalancer's future full-RF obligation.

Single-node initial provisioning is production policy, not a fixture error:
`provision-target-methods.js:88-106` explicitly permits minimum one when the
requested RF is below three or observed active-node count is at most one.
`test/query/sql-query-engine-provision-partition-waits.test.js:692-789` codifies
one initial replica from one visible node. That test even requires polling
(`sleepCalls > 0`) and accepts spending a short convergence timer; it does not
prove absence of healthy timeout events. Three active nodes with hard storage
shortfall must still preserve a quorum floor, witnessed by
`sql-query-engine-provision-partition-quorum.test.js:742-835`.

The supported pre-wait path is to consume the available node's owner-issued
admission and the implicit founding-cohort policy, provision that node, and
report desired3/resolved1/minimum1/routable1/fullReplicaCountConverged=false.
`provisioning-completion-summary.js` forces PENDING/WAIT until desired RF is
reached; `table-creation-service-completion.js:251-258` marks pending creation,
and `SchemaProvisioningJobOwner.executeJob:449-454` retains nonterminal retry
debt. Serving initial work is not full RF3 certification. The remaining debt
must be discharged by existing replica-operation/rebalancer owners as membership
grows, without rewriting the requested policy or making the schema job terminal
early.

Seed system-table RF3 has a different composition: `seed-partitions-phase.js:
128-148` constructs every declared system-table replica on the same seed node,
using replica IDs for the peer cohort. Ordinary CREATE normalizes unique target
node IDs and creates one ADD per physical target node. Three local system-table
replicas do not provide three physical user-table placement targets or node-fault
spread. Neither RF1 configuration nor borrowing those three system replicas
repairs this interaction.

## Owner census and missing aggregate contract

| Concern | Current production owner / consumer |
| --- | --- |
| desired partition RF | table creation configuration; existing-table reconciliation consumes `resolveDesiredReplicationFactor` |
| implicit minimum | `TableCreationService.provisionInitialPartition` / injected SQL quorum calculator |
| published membership and node trust | `ControlPlaneReadinessService.getProvisioningNodeTrustViewSync`, publication snapshot and liveness owners |
| target selection / shortfall lowering | SQL provisioning methods and target methods |
| per-target creation admission | `RebalanceCoordinator.observeOperationCreationAdmission`, returned by `checkProvisioningAdmission` |
| enforcing ADD / stable child identity | `RebalanceCoordinator.createOperation`; previously-issued immutable admission is passed back to that same owner |
| durable CREATE intent and retry | `SchemaProvisioningJobOwner` |
| metadata, routability and leader completion | SQL routing-readiness methods consuming existing owner observations |
| budget allocation | SQL `ControlPlaneTimeoutPolicy`; caller `SqlRequest.timeoutBudget` when present, root30s provisioning budget otherwise |

`checkProvisioningAdmission` (`rebalance-coordinator-operation-creation.js:
278-284`) returns the canonical immutable observation with contractState,
nextAction, reasonCodes, retryAfterMs, planningIdentity and moveIdentity. The
observer builds READY/PROCEED or DEFERRED/RETRY
(`operation-creation-admission.js:103-133`). That is a per-target answer, not an
aggregate initial-cohort answer or a forecast of future membership.

SQL `createProvisioningTargetRejection` drops the canonical state/action/retry
and identity fields (`provisioning-admission-methods.js:109-130`). Its local
`hasOnlyTransientProvisioningShortfall` reconstructs transient classification
from literal reason-code sets (`:8-36,201-251`). Empty rejected lists are not
transient. The whole-cluster rewait is allowed only for maxProvisionable=0,
implicit minimum, and that whitelist (`provisioning-deadline-methods.js:14-56`).
The caller cannot consume one typed distinction among stable one-node capacity,
unpublished/unknown membership, expected membership growth, transient admission
hold and unusable required cohort. There is no aggregate owner-issued release
edge explaining why this healthy request should wait for a nonexistent second
node. `coupledPairs` names the committed bootstrap stamp interaction, but a
search of the manifest found no named minimum/cohort/admission interaction.

The repair boundary is that existing aggregate SQL-provisioning interaction,
not another owner or subsystem alongside the existing policy. Consume current owner
membership/trust and canonical admission observations once; preserve the
generation/fence and route createOperation through the existing enforcing
owner. Do not introduce a second admission decision, duplicate the whitelist,
copy placement/liveness policy into the fixture, or use elapsed time to choose
the founding cohort. Exactly which existing owner exports the aggregate answer
is an owner judgment for the parent, not an implementation chosen here.

## Reachable callers and further source findings

Actual target waiter has one provisioning caller, plus the deadline helper's
rewait. The production initial-provisioning method is reached by fresh durable
CREATE and existing/replayed CREATE reconciliation through the table-creation
callback; constructor installs that callback at `instance-initializer.js:
271-286`, startup transfers it at `startup-sql-runtime-handoff.js:144-152`.
Managed split (`managed-split-workflow.js:555-598`) and merge
(`managed-merge-workflow.js:675-691`) directly call the same provisioner with
explicit node targets, explicit initial minima and one execution budget.
Their explicit targets bypass the initial target waiter. Their topology adapters
also use the same owner admission probe before durable child metadata creation.

These additional issues are source-reachable, not newly runtime-proven:

1. The target waiter's catch (`provision-target-methods.js:232-253`) treats every
   non-cancellation error from generic waiting/refresh as timedOut and suppresses
   it when failOnTimeout=false. An unexpected owner/readiness/admission failure
   after an earlier valid observation can follow the fallback path with earlier
   admission data. Typed dependency unavailability must not become WAIT_TIMEOUT.
2. Explicit target count clips targetReplicaCount (`initial-provisioning.js:
   77-83`), then `resolveMinimumProvisioningReplicaCount:73-75` clips explicit
   minimum to that target. Input explicit minimum2 with one explicit target
   becomes minimum1, contradicting the explicit-minimum preservation contract
   stated in the admission helper. Split/merge supply these values in production;
   no evidence here establishes that their current planner emits that mismatch.
3. Generic `waitForCondition` tests an awaited predicate before examining the
   remaining deadline (`select-execution.js:178-209`) and again after expiry
   (`:216-218`). A slow owner call or a late positive can return success beyond
   the shared deadline. Source tests model in-budget progress, but this
   investigation has not executed a late-positive falsifier.
4. Transient all-node hold waits spend the short/adaptive target bound before
   rewaiting to the parent bound. Even an eventual healthy in-budget cure can
   emit an initial `wait_bound_spent`. Existing progress tests accept this
   geometry. A canonical progress/release answer should be re-driven under the
   single parent budget rather than spending a diagnostic subdeadline first.
5. Every refusal in operation-creation admission is DEFERRED/RETRY; SQL's local
   whitelist then decides which refusals can lower the implicit floor. There is
   no typed aggregate hard-insufficiency-versus-progress state. A repair must
   preserve the three-active-node hard-shortfall and explicit-minimum controls,
   not simply accept maxProvisionable=1 in every case.

## Budget and positive progress obligations

Production defaults are root provisioning30s, poll50ms, target convergence1s
(`query-constants.js:473-477`). The adaptive target wait increases its bound to
10s only when initial active rows already meet required count
(`provision-target-methods.js:145-164`). The all-cluster hold helper consumes
`getRemainingBudgetMs` from the same parent and cannot create a fresh root.
Metadata, routable-count and leader waits also receive that parent.

Progress must remain owned: available eligible/admitted founding cohort releases
planning; durable ADD progression releases replica-metadata/routability waits;
leadership owner releases the leader wait; later membership/placement progression
discharges desired-RF debt. Stable current capacity is not itself evidence that
membership can never grow. The new aggregate answer must retain desired-RF debt
and consume current published membership, rather than use observer row count as
durable future-capacity authority.

## Native A3/A4 spent budgets are explicit negative controls

The native stderr contains exactly two records:
`a3-rollback` bound60000 elapsed120024 and `a4-r` bound60000 elapsed120009, both
PREPARING with one participant PREPARED. The whole native file took4091ms in the
classified-runner record; these are virtual-clock advances, not two physical
two-minute recovery waits.

`transaction-leg-a-three-replica.test.js:42-43` defines PAST_BUDGET_MS=120000.
A3 creates the coordinator with `nowFn=Date.now()+offsetMs`, holds its actual
post-PREPARE persistence, stops a follower, and advances offset to120000 only
for the rollback case (`:238-255`). It then releases the hold and asserts the
durable ROLLBACK and all replicas ROLLED_BACK after restart (`:279-287`).
A4 deliberately holds the same post-PREPARE boundary and advances the clock
before release (`:322-339`); it subsequently tests replay idempotency and refusal
of reversal. The fixture passes nowFn to the real engine (`transaction-coordinator-
group-fixture.js:227-234`). `prepareForDecision:145-172` detects that budget
expired after PREPARE and records ROLLBACK before fanout. `runCommitProtocol:
197-202` adopts that exact durable decision. ROLLBACK retries intentionally
exclude the expired caller budget (`protocol.js:438-439`) so the prepared
obligation is actually discharged; recorded COMMIT similarly progresses without
reversing the decision (`decision-protocol.js:236-267`).

These two exact injections demonstrate the required failure path. They must be
identified by test/session and asserted timeout decision/outcome, never given a
general file-wide or suite-wide timeout exemption. Healthy commit/restart/replay
and M1 paths must have zero un-injected spent bounds.

## Strongest next falsifiers, proposed only

Use the existing production M1 witness as the operational red: capture structured
wait-bound events and require zero for the healthy setup/cutover/release path,
while retaining all durable transaction and independent replica-state assertions.
The already-retained `baseline-m1.tap:2` makes this red now, without a new run.

The corresponding deterministic owner-interaction witness should supply a
published, trusted single-node membership and that node's canonical ADMITTED
observation, RF3 with defaulted quorum minimum, then require that the owner
selects the permitted initial cohort before any timeout/poll sleep. Require
requested RF3 and PENDING desired-RF debt, one stable ADD child, and later join
progress completing RF3 through existing owners. Retain controls for explicit
minimum2 with one target (refuse/defer, no lowered minimum), three-node hard
storage shortfall (no unauthorized RF1), genuinely unknown membership (typed
dependency state), transient ledger hold released before parent deadline
(no spent diagnostic subbound), failed owner read (no timedOut rewrite), and
late admission positive (no deadline resurrection). No tests were written here.

Repair cannot be certified by lowering or suppressing logs, shortening/raising
timeouts, changing fixture RF, adding local availability logic, skipping an
admission check, or classifying all successful assertions as clean. Parent owns
Quest scope/owner judgment and exact-head runtime/lab verification.
