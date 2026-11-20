---
id: operation-integrity-and-reliable-formation
status: open
proof: certification
roadmapRow: RM-0.2.9-published-operating-contract
graduatesTo: architecture/contracts/authority-and-recovery.md
doneWhen:
  probe: test-receipt
  args:
    file: solve/quests/canonical-authority-formation-acceptance/evidence/receipt.json
    requiredReceipts:
      - contract-first-authoring-verified
      - content-bound-review-and-interaction-proof-verified
      - report-classification-verified
      - management-authority-verified
      - canonical-completion-observation-verified
      - policy-currency-verified
      - routing-freshness-verified
      - formation-progress-verified
      - natural-shutdown-verified
      - lab-and-evidence-custody-verified
      - repository-legacy-fallback-closure-verified
      - original-formation-receipt-admitted
      - frozen-composition-required-gates
      - all-material-findings-discharged
      - comparison-handoff-bound
      - catalog-authority-and-visible-reconciliation-verified
      - cdc-recipient-domain-and-retained-debt-verified
      - cache-replica-incarnation-coherence-verified
      - load-admission-ingress-identity-verified
      - quest-evidence-and-candidate-binding-verified
      - cdc-source-image-occurrence-completion-verified
      - replica-settlement-generation-fencing-verified
      - locking-read-authoritative-reservations-verified
      - retained-read-view-generation-custody-verified
      - postgres-wire-description-contract-verified
      - retained-priority-census-owner-redrive-verified
      - partition-checkpoint-epoch-generation-verified
      - independent-verification
quests:
  - quest-evidence-and-candidate-binding
  - cdc-source-image-occurrence-completion
  - replica-settlement-generation-fencing
  - locking-read-authoritative-reservations
  - retained-read-view-generation-custody
  - postgres-wire-description-contract
  - catalog-authority-and-visible-reconciliation
  - cdc-recipient-domain-and-retained-debt
  - cache-replica-incarnation-coherence
  - load-admission-ingress-identity
  - contract-first-authoring-and-producer-fidelity
  - content-bound-review-and-interaction-proof
  - canonical-report-outcome-classification
  - management-action-authority
  - canonical-replica-completion-observation
  - table-policy-outstanding-read-currency
  - routing-overlay-complete-state-retirement
  - formation-spread-progress-at-cause
  - node-startup-natural-shutdown
  - lab-census-benchmark-evidence-custody
  - repository-legacy-fallback-closure
  - canonical-authority-formation-acceptance
  - fresh-formation-user-table-routability
  - formation-ready-lease-independent-of-spread
  - serve-eligibility-committed-epoch-read
  - fresh-create-release-authority-from-committed-operation
  - replica-admission-from-committed-operation
  - dynamic-config-startup-owned-initialization
  - explicit-single-replica-partition-configuration
  - parallel-query-read-authority-propagation
  - admin-diagnostic-owner-consolidation
  - replica-create-timeout-replay-custody
  - partition-placement-declared-target
  - committed-readiness-fixture-custody
  - required-entity-operation-observation
  - committed-node-remove-safety-wake
  - system-cache-reconciliation-ingress
  - runtime-definition-create-authority
  - readiness-bulk-required-domain
  - readiness-direct-publication-planning-identity
  - readiness-direct-publication-planning-custody
  - readiness-self-grace-service-evidence-contract
  - failed-create-cleanup-claim-normalization
  - strict-hydration-fixture-owner-ports
  - tap-default-machine-factor-portability
  - node-ready-lease-renewal-cadence
  - strict-operation-outcomes
authorizes:
  - src
  - test
  - docs
  - architecture
  - models
  - scripts
  - solve/epics
  - solve/quests
  - roadmap*
  - package.json
  - package-lock.json
  - eslint.config.js
  - tsconfig*
  - data/fallback-census
  - examples/service-data-affinity
---

# Canonical authority and reliable formation

This continues `operation-integrity-and-reliable-formation`. A fresh cluster must
complete the existing public formation and user-table journey through one
canonical authority for each permission, completion, policy and routing decision.
Recovery retains obligations and progresses; startup and shutdown own their
resources. The authoring and proof workflow must catch invented contracts and
invalid evidence before integration.

## Current integration summary (20 November 2026 - reliability and agent usability)

- **Owner and checked source:** the current Codex root session owns integration,
  taking over the stopped Antigravity session. The clean starting candidate is
  `candidate/reconciliation-20261119` at
  `6c0bdff11f24e32459178e9d2c0d9f563e7cd790`. Remote candidate and remote main
  were checked on 20 November: main is
  `5edfcadb508f9a82783159026364d3005836cc5c`; local main is older
  (`428a27fc63fa3cf2af677a9e6a46444f8ac3125e`). Different ancestry does not
  establish a missing repair: extracted/cherry-picked content must be compared.
  Other worktrees are preserved, not reset or reassigned.
- **Governing sources:** rule-set revision 5; AGENTS, rules, router, Quest
  workflow, delegation, documentation lifecycle, and the user's 20 November
  reliability and agent usability programme. The programme's numbers below are
  references to obligations, not new Quest IDs or a second acceptance ledger.
- **Adopted bounded unit (01):** commit
  `f5d5d1c13d90fb58e3c5299d1e096fb53dfc7db1` reconciles this summary and the named active
  owner summaries, architecture entrypoint, locking-read explanation, capability
  source/projection, operations and migration guidance. Writable scope is those
  explanatory surfaces, `docs/execution-semantics.md`, the codec's input-typing
  JSDoc, and their existing evidence/review records. The latter two are explicit
  scope amendments for contradictions found in the same current guidance path.
  No runtime,
  test-selection, acceptance threshold, sealed predicate or historical receipt
  changes are authorized by this documentation unit. Source/proof repairs use
  their own bounded Quest or eligible direct route and independent review.
- **Credited implementation:** `530035262` through `6c0bdff11` contains the
  admission wait's entry/post-await deadline checks, removal of untyped-success
  exceptions from four reconciliation consumers, unknown growth-policy refusal,
  bounded worker-start observation, and completed-growth census compensation for
  delayed role projection. ES6 P1-P5 remain implemented component work. These
  are not newly assigned untouched defects and do not establish service acceptance.
- **Evidence ceiling:** the ES6 receipt reports 18 files / 1,428 assertions with
  zero failures. Item 07 must admit the original execution, source/runtime and
  composition applicability before this count supports a current acceptance
  claim. Original task-3804 output has confirmed the count, but omits those
  execution identities. Preserve the original receipt and failed physical results. The stopped
  task-3823 formation trial at `6c0bdff11` failed; reported 33/36 system-partition
  progress is not the complete formation predicate or a passing trial. Its original
  report first fails `a-serve-lane-open` with `control_snapshot_read_failed`;
  spread, quiet, user-table routability and observation integrity also fail.
- **First residuals:** the atomic persistence adapter and shared terminal/release
  helpers still admit weak result combinations (02). CREATE awaits initial
  admission before entering the bounded waiter (03). Release has equal outer
  and leaf RPC limits, but identical in-flight cutovers already coalesce; the
  handover's claim that each timeout immediately re-pauses requires correction
  against original logs. Completed-growth compensation needs identity/generation
  and retirement proof (04). Support-envelope builder defaults and simulated
  drills cannot certify physical support (07/14).
- **Execution and continuation:** the user's subsequent explicit local-shell
  authorization permits routine Unix commands, repository tooling and Git work
  here. Runtime testing remains on the lab machines, parallelized through the
  existing placement/resource owners. Root observes submitted runs by their actual request identity. No
  new runtime acceptance run is submitted by this adoption. Root owns documentation and
  composition; delegated documentation authors and an independent evidence
  reviewer work in disjoint scopes. Runtime investigations and proposed designs
  make no implementation or acceptance claim. One writer will own each coupled
  repair after its scope is recorded.

### Core verification and the next physical run

The immediate release work is formation, routable SQL and recovery of interrupted
operations. The comparison owner runs the lab smoke after the formation gate
holds on the same composition, then measures Lagrange on the authorized GCP
profile. Backup, restore and PITR retain their later milestone allocation.

- At `8ed84f88a` the formation observer enforces the original 420-second
  deadline on a completed observation. The original task-3823 recording
  shows 27 completed promotions at the last sample before the deadline, 30 at
  the next sample and 33 at the end of recording. All 60 polls reported
  operations in flight. The exact count at the deadline is unknown.
- The aggregate release deadline and detachable per-caller waits are on
  `witness/participant-release-lifetimes-20261120` at `5cc73e45e`.
  Managed request `3bce09eb-3cbe-4f32-b9c0-ad320cc926e3` ran both selected
  files on `tv-dator` and passed 23 runner assertions on that source. The
  preceding run passed both files but its collector misidentified the batch
  runner as a test. Its original failed postflight remains available under
  request `6d7114de-3e27-4f81-958d-93eaddeaa24d`.
- The strict outcome composition at `2ce889722` passed six managed SQLite
  and workflow suites on tv-dator (1,252 runner assertions). Independent
  review identified one remaining credit ambiguity when a terminal pre-write
  observation is unavailable. The repository owner must prove who committed
  the transition before reporting new progress.
- The formation witness at `fab05d1d9` requires a distinct INSERT through
  each node and reads the expected stored ID and value through a different
  node. The managed witness passed 34 assertions. The original public PG
  check and all three original node observations remain required.
- Physical run `fa71e599` at `0115084f7` failed. The final playback sample
  showed 41 active ADDs, 12 failed ADDs and one pending ADD. The coordinator
  logged the startup cleanup snapshot deferral 1,024 times across 13 operation
  IDs. The target logged the original refusal once. A diagnostic CREATE
  returned `LEDGER_TRANSITION_UNRESOLVED`. All three containers were removed.
  [Original report, logs, snapshots and configuration](https://github.com/psvensson/lagrange/releases/download/solve-evidence/fresh-formation-user-table-routability--formation-three-host-fa71e599-nov20.tar.gz)
- The target retained the first rejected authoritative cleanup read for the
  lifetime of the replica handler. CREATE, REMOVE and membership requests all
  awaited that rejection. The original lifecycle owner intentionally froze
  the first successful read to protect cleanup tokens. The adjacent CREATE
  recovery owner already re-arms after a failed read. At `1fcac4b05`, both
  use that recovery owner. The successful result stays frozen, and shutdown
  joins the admitted sweep. Four managed suites passed 339 assertions. A
  second three-host trial on that source reached the original deadline with
  operations still in flight. The last snapshot 4.488 seconds before expiry
  recorded 68 completed ADDs and 33 promotions. Across the 46 original
  system partitions, 13 still lacked a completed promotion at that sample.
  The exact counts at expiry are unknown. The startup snapshot refusal did
  not recur in the retained logs.
- In that trial, `e068cbdc`, SQL CREATE and COUNT succeeded after the
  formation deadline. The public PostgreSQL INSERT and readback succeeded,
  but INSERT failed through two nodes. The observer recorded six read
  failures. The three trial containers were removed. The release owner must
  trace the shared control-partition stalls across the leader change, and
  the SQL owner must locate the first failed per-node write. Preserve the
  original deadline, quiet window and per-node checks.
  [Original report, logs, snapshots and configuration](https://github.com/psvensson/lagrange/releases/download/solve-evidence/fresh-formation-user-table-routability--formation-three-host-e068cbdc-nov20.tar.gz)
- A separate native counterexample at `bd2c33ec5` found that the clean
  dependent release path could reopen after control authority shut down.
  The healthy control passed. At `b217da7ec` both release paths recheck
  control authority at resume. The four focused suites for release and
  startup cleanup passed 100 assertions on adam-laptop.
- All 38 reviewed strict-outcome source and witness digests match
  `8281e61d2` and `b217da7ec`. The broader 22-file fixture sweep on
  adams-gamla passed 15 files and failed seven on `b217da7ec`. The
  workflow, reservation and proof owners must reconcile those failures
  against the actual repository and conditional writes before integration.
- The integration owner must obtain three consecutive 420-second physical
  formation passes on one composition, then a successful lab smoke. The
  GCP comparison owner retains the Lagrange measurement.

### Current continuation after the third physical diagnostic

The public candidate `edbf84c2d` carries the corrected Quest continuations.
The integration branch `wip/core-runtime-composed-20261120` carries the
runtime repairs. For the two original malformed-outcome and synthetic-support
findings, this distinction determines which source an agent should reproduce.

- At `8281e61d2`, managed request `2378f3a8-3dc2-4ddf-982b-d8d13b6efe3a`
  passed 521 runner assertions through the real SQLite strict-outcome witness.
  Its reviewed partial receipt admits three of six obligations. The receiver
  still owes broad fixture coverage, historical controls and final composed
  review. At `98e2cc397`, all seven previously failing suites passed 265
  assertions on adam-laptop. CL-029 checks the typed ACTIVE advance and the
  exact applied SQLite CAS against SYNCING before source removal.
- Physical run `57e4db30-f269-468b-931e-46ce809818a5` measured `1bd94e2b3`
  on tv-dator, adam-laptop and adams-gamla. The last sample inside 420 seconds
  still had three incomplete operations. Eleven observation reads failed. A
  timeout on one admin request reset other requests on the same lane. The user
  table CREATE reported a schema-operations participant timeout and COUNT
  could not obtain routing metadata. All three trial containers were removed.
  The native control drain in this run cleared approximately 1.3 seconds after
  its refusal. Its timing alone cannot explain the missing formation progress.
  [Original report and node logs](https://github.com/psvensson/lagrange/releases/download/solve-evidence/fresh-formation-user-table-routability--formation-three-host-57e4db30-nov20.tar.gz)
- The direct admin read now shares one budget across connection and response.
  Its managed real-socket witness also covers independent waiters. CREATE
  finalization after participant release still needs proof against a replaced
  service and tracker. A composed run at `b4a5bb898` passed 45 of 53 files
  across three lab workers. Six failures involve workflow fixtures or their
  contracts. Two deterministic formation cadence assertions also failed.
  On the same worker, `200142a3` passes both. Selecting the later canonical
  gateway fixture on that exact source at `8ede43d60` reproduces both failures.
  Each pressure probe times both the gateway read and its nested SQL call.
  At `9ea3e4f90` the convergence fixture counts each underlying SQL read
  once. Both original bounds and the two neighboring fairness and holder-release
  files pass on tv-dator (32 assertions). Independent review approved this
  bounded fixture change.
  [Single-change control and original outputs](https://github.com/psvensson/lagrange/releases/download/solve-evidence/fresh-formation-user-table-routability--composed-cadence-gateway-pair-nov20.tar.gz). The passing
  physical streak is zero of three. Lab smoke and the GCP Lagrange arm follow
  the accepted formation gate.
  [Managed suite selections and outputs](https://github.com/psvensson/lagrange/releases/download/solve-evidence/strict-operation-outcomes--core-placement-outcome-composition-b4a5bb898-nov20.tar.gz).

The composed source at `58ec69a2a` includes the independently reviewed
CREATE recovery and complete operation census. At `d4f4c69cd` the native
growth controls observed an occupied placement during joint membership,
clearance after the terminal ledger write, and the next dispatch to a new
leader with the original placement target preserved. The active strict-outcome
assignment follows two effects through their existing owner: a new strict
retry joining an older timer and a remote target-progress wake after
planning. Both must revalidate the exact operation before sending.
[Managed recovery and census controls](https://github.com/psvensson/lagrange/releases/download/solve-evidence/strict-operation-outcomes--workflow-wake-strict-census-and-growth-d4f-nov20.tar.gz).

The same 53-file selection on `58ec69a2a` passed 51 files and failed two.
One convergence witness interpreted a fulfilled second REPLACE request at
virtual time 26,000 ms as a new admission. It passed on the CREATE parent
and reproduced on the strict-workflow parent on the same host. A same-run
SQLite trace at `a6e64ac98` shows that the seed hold, returned operation
ID and sole PENDING database row were identical before and after the
request. The workflow owner must distinguish valid same-intent reuse from
a conflicting target, and exercise the foreign-terminal reply against the
original holder under both conditions.
[Paired parent runs and original SQLite trace](https://github.com/psvensson/lagrange/releases/download/solve-evidence/strict-operation-outcomes--ledger-self-move-same-holder-trace-nov20.tar.gz).
The second failure is a direct CREATE caller in the growth
deadline fixture. Its success case omitted the registered release route.
[Original 53-file run](https://github.com/psvensson/lagrange/releases/download/solve-evidence/strict-operation-outcomes--core-composed-53-58ec-nov20.tar.gz).

Static verification also has a measured selection defect. In request #5499
the checker lost access to the base, printed a fatal Git error, and returned
success on zero changed JavaScript files. In #5500 the provisioned base
tree and full changed-path list matched the integration owner's digests.
On `0760d97d4` that measured range reached ESLint on 1,012 paths and
failed on 28 errors and seven file-size regressions. The change-selection
owner must surface mandatory Git read errors. The changing runtime and
test owners retain the measured lint and size repairs.
[Rejected range attempts](https://github.com/psvensson/lagrange/releases/download/solve-evidence/quest-evidence-and-candidate-binding--static-selection-unreadable-base-5498-5499-nov20.tar.gz)
and [measured range and original output](https://github.com/psvensson/lagrange/releases/download/solve-evidence/quest-evidence-and-candidate-binding--static-bound-range-5500-nov20.tar.gz).

### Physical formation and placement stability

At `dc021bf30` the existing embedded formation test passed on tv-dator in
39.971 seconds (20 assertions). Three real processes published membership,
settled operations, created a table, observed an empty COUNT, and read back
the inserts from every node. All three installed admin-observation guards
recorded zero calls. This is the single-host public SQL control for the
physical investigation. The 420-second three-host predicate still has a
passing streak of zero.
[Original managed result, three node logs and guards](https://github.com/psvensson/lagrange/releases/download/solve-evidence/fresh-formation-user-table-routability--e8-embedded-public-sql-dc021-nov20.tar.gz).

The same public journey on composed source `af9fd5d0a` failed after
265 seconds on tv-dator. The probe table had three service rows, zero
active addressed services, and two remote ADD operations timed out in
CREATING. The reported write failure followed the routing failure. A
November 5 trial of this same probe also failed to provision its partition.
The creation and workflow owners must account for the first missing state
transition on one identified replica before changing admission or release.
The management guard recorded zero calls on each node. Physical formation,
the subsequent smoke and the Lagrange GCP measurement remain open.
[Original failed public journey and worker logs](https://github.com/psvensson/lagrange/releases/download/solve-evidence/fresh-formation-user-table-routability--e8-public-formation-af9-nov20.tar.gz).

After repairing startup, run `e068cbdc` first observed six-partition spread at
36.629 seconds; run `57e4db30` observed it at 90.548 seconds. Each run
started 46 system partitions with a configured replica count of three. For
each non-priority ledger operation, take its creation through completion, or
only through its latest observed update if incomplete. Combine overlapping
intervals and clip them to the first spread observation and the original
420-second boundary. Non-priority work covered 383.194 of 383.371 remaining
seconds in the first run and all 329.452 remaining seconds in the second.
The longest uncovered gap was 122 ms. These recorded intervals preclude the
required five seconds of global quiet even if every admin read succeeds.
Public SQL remains an independent service criterion.
[First original](https://github.com/psvensson/lagrange/releases/download/solve-evidence/fresh-formation-user-table-routability--formation-three-host-e068cbdc-nov20.tar.gz)
and [second original](https://github.com/psvensson/lagrange/releases/download/solve-evidence/fresh-formation-user-table-routability--formation-three-host-57e4db30-nov20.tar.gz).

The second ledger also records an actual reversal on adam-laptop. ADD
`pl-contexts-p1-505-0` completed, then REMOVE `pl-contexts-p1-559-0` was
admitted 6.280 seconds later for the same replica. After the REMOVE committed,
ADD `pl-contexts-p1-619-0` targeted the same node again. The sampled node
incarnation remained 1. Its READY lease was expired 3.614 seconds before the
REMOVE admission and valid again in a sample 29.68 seconds afterward. The
admission records a repair but omits the precise deficit kind. The placement
source classifies a learner outside the READY set as dead; the component test
expects removal even when the lease expired by one millisecond. Compare the
exact decision-time input and current Raft membership before attributing this
physical REMOVE to that classification. A genuine failure and a changed
incarnation must still recover.

The placement and formation owners should follow the same operation IDs from
durable admission through dispatch, committed membership, terminal release and
recensus. Measure completed distinct target placements against outstanding
work, using the existing source/target slot limits and original physical
profile. Separate useful progress from retries and inverse moves. For example,
in the first run ADD `pl-package_registry_mappings-p1-909-0` spent 50.003 s
between SYNCING and ACTIVE. In the second, `pl-debug_breakpoints-p1-522-0`
spent 30.888 s there. Both full logs record repeated, same-operation
authority-read timeouts before the leader accepted the work. What occupied
that authority and how much time the duplicate delivery added remain open.

Managed native diagnostic `ac19b2e2-a695-47c8-a8b3-a50547c3f53d`
on tv-dator exercised three schedules against a committed SQLite node census
and actual Raft membership at `b990d1b18`. Timely renewal preserved the
learner. Delaying renewal until one millisecond after expiry admitted REMOVE.
Renewing the same incarnation while REMOVE was pending still led to removal
and another ADD on that host. A durable FAILED input allowed removal and
kept the host ineligible. Workflow completion and lease changes were
controlled inputs in this diagnostic.
[Original native TAP, transitions, runtime and artifact manifests](https://github.com/psvensson/lagrange/releases/download/solve-evidence/fresh-formation-user-table-routability--formation-learner-reversal-native-5496-nov20.tar.gz).

In the physical run, at 21:18:02.111Z, 1.125 s after the REMOVE admission,
the lease service on d8b38f9c explicitly skipped disconnecting 6998462b
because its transport was connected. The seed recorded the same decision
at 21:18:05.099Z. The decision-time NODES read for the REMOVE is missing.
The active lease owner already distinguishes expiry from disconnect. Its
guarded write matches node ID, observed lease and heartbeat before clearing
the lease and recording DISCONNECTED. Placement collapses those cases for
an existing learner and also uses the eligible-node set for voter repair.
[Physical node logs](https://github.com/psvensson/lagrange/releases/download/solve-evidence/fresh-formation-user-table-routability--formation-three-host-57e4db30-nov20.tar.gz).

The follow-up at `4b85cd2e2` exercised the production lease sweep and
HeartbeatService's SQLite write. Two cases failed. Placement admitted REMOVE
although the sweep kept the connected learner. An old observed lease also
disconnected a newer boot with the same heartbeat and expiry values. Two
controls passed. A later heartbeat in the same boot defeated the stale write,
and a true disconnect followed by a committed same-boot rejoin restored
eligibility. The heartbeat and placement owners share this correction.
[Original four-case run](https://github.com/psvensson/lagrange/releases/download/solve-evidence/fresh-formation-user-table-routability--formation-placement-owned-disconnect-4b85c-nov20.tar.gz).

At `c2def7ee9` the heartbeat writer conditions its single update on the
observed boot incarnation, lifecycle status and connection state as well as
the node ID and both watermarks. Independent review traced zero affected
rows through the lease sweep. On tv-dator the newer boot and same-boot
renewal both survived, and genuine disconnect followed by rejoin still
worked. The connected-learner placement case still failed. All five sweep
consumer files passed on adams-gamla (165 assertions).
[Guarded-write originals](https://github.com/psvensson/lagrange/releases/download/solve-evidence/fresh-formation-user-table-routability--formation-lease-disconnect-c2def-nov20.tar.gz).

The placement owner must preserve the exact existing replica across an overdue
renewal, keep the host ineligible for new work, and prove removal and recovery
after an owned disconnect or confirmed replica failure. Trace missing rows,
reconnection, changed incarnations and voter repair before choosing what
authorizes irreversible removal. Exercise the production guarded write racing
renewal, the committed wake and revalidation at the effect. Preserve voter
floor, per-host capacity, ledger exclusivity and original quiet window. The
remaining formation throughput investigation follows the completed operations
and the exact delayed authority request. Background work continues throughout.

The native two-schedule test at `68b868cc8` reproduced a second reversal
at the effect itself. A committed placement REMOVE for a learner remained
pending while native membership promoted the target. The delayed REMOVE
reached the registered handler and removed the voter. In the control, the
leader could remove a confirmed isolated learner while its host remained
unavailable. The placement owner must preserve the intended role and exact
replica through dispatch, membership change, local lifecycle cleanup and
reconstruction. Fixing the earlier eligibility decision alone leaves this
race reachable. Its frequency on the three-host runs is unknown.
[Native removal and true-loss controls](https://github.com/psvensson/lagrange/releases/download/solve-evidence/fresh-formation-user-table-routability--delayed-learner-removal-after-promotion-68b-nov20.tar.gz).

The same physical run records three failed ADDs. Two targeted 6998462b
and one targeted d8b38f9c. All three CREATE handlers logged
`release_fact_unavailable` with `missingFact=replica_release_reply` and the
same seed owner, 126d7916. Operation `pl-debug_breakpoints-p1-592-0` reached
durable FAILED 398.890 seconds after scenario start. The indices and contexts
operations failed at 449.034 and 473.402 seconds. At the CREATE boundary
`releaseFreshCreate` converts the typed missing reply into a generic exception.
A lost reply leaves the seed's effect unresolved. The activation owner must
preserve the exact materialized replica and resume its owed work, while a
proven terminal failure still permits cleanup. Pair same-service reply loss
and later recovery with explicit refusal, post-deadline delivery and successor
replacement. Source at `e48d8888a` passes the held-success and held-refusal
replacement cases. The broader run passed six of seven files and review
found remaining same-service read and deadline cases.
[Physical source logs and ledger](https://github.com/psvensson/lagrange/releases/download/solve-evidence/fresh-formation-user-table-routability--formation-three-host-57e4db30-nov20.tar.gz)
and [managed paired release and broader results](https://github.com/psvensson/lagrange/releases/download/solve-evidence/fresh-formation-user-table-routability--create-registered-release-custody-and-cone-nov20.tar.gz).

The composed CREATE at `0760d97d4` retains the materialized worker during
temporary uncertainty. All eight selected files passed on tv-dator and
adams-gamla (661 assertions, no retry). Independent review traced the
registered release route and finite recovery for the same service. A stale
success or refusal after local replacement could publish neither ACTIVE nor
FAILED. In the K3 native test the target persisted entries before its ACTIVE
write was refused, then the owner refused both attempts to reopen the lost
disk using the same replica ID. The test observes the target's log.
[Composed source, native custody and routing results](https://github.com/psvensson/lagrange/releases/download/solve-evidence/fresh-formation-user-table-routability--create-composed-registered-recovery-0760d-nov20.tar.gz).
The earlier router failures remain available in the
[original attempts](https://github.com/psvensson/lagrange/releases/download/solve-evidence/fresh-formation-user-table-routability--create-activation-registered-route-and-native-floor-nov20.tar.gz).

The CREATE admission owner requires an owner-RPC read. At `07b8787ea`
that read waited on a local partition query whose rows the contract could
never accept. At `2ca08690c` it calls the designated owner directly. The
remote success, refusal, unavailable route and same-host native cases pass,
as do the neighboring permitted read modes (ten files, 758 assertions).
Independent review covers removal of the unused wait. A permanently blocked
query *at the selected owner* and atomic fencing across NODES, SERVICES and
the operation ledger remain separate obligations.
[Original held-read controls and passing source](https://github.com/psvensson/lagrange/releases/download/solve-evidence/fresh-formation-user-table-routability--cdc-required-owner-held-local-2ca-nov20.tar.gz).

Both physical runs spent most recorded operation time on ADD. Summing each
ADD's own ledger step durations inside the original 420 seconds, SENDING and
SYNCING accounted for 390.7 and 528.0 of 1172.8 operation-seconds in
`e068cbdc`, and 419.1 and 428.4 of 1135.2 in `57e4db30`. Concurrent
operations contribute separately. Follow their actual transport, authority
and activation events before changing fleet scheduling. A controlled held-reply
experiment at `dc4ea4236` stopped in the embedded fixture's pre-start
OPEN_SESSION. It produced no observation of contention.
[Embedded setup failure](https://github.com/psvensson/lagrange/releases/download/solve-evidence/fresh-formation-user-table-routability--held-reply-before-engagement-nov20.tar.gz).

Historical counterparts include the repository's single terminal winner and
the formation repair that joined admission and its clearing event. The
current placement owner superseded older timer and dual-owner wake schemes.
Compare etcd's membership catch-up check and Kubernetes' conditional writes
when deciding which observation can authorize each effect.
[Terminal CAS](../quests/replica-operation-terminal-cas/quest.json),
[formation admission history](../quests/formation-barrier-spread-cure-admission-liveness/quest.json),
[current placement authority](../quests/replica-placement-admission-owner/quest.json),
[etcd learner design](https://etcd.io/docs/v3.5/learning/design-learner/) and
[Kubernetes API concurrency](https://kubernetes.io/docs/reference/using-api/api-concepts/).

On the composed `18d2d6482`, managed tv-dator request
`42d96bf9-6ad8-4837-be72-054a55e21503` ran the existing distributed SQL
differential oracle against SQLite 3.49.2. All 522 runner assertions passed
on their first attempt. The original artifact records the test executable,
loaded native SQLite binding, engine build and compile settings. In parallel,
five prepared-transaction and locking-read control files passed on adam-laptop.
Four exercise native participant paths. The J4 locking-read journey uses a
participant delivery double. Public SQL on three physical nodes and the
comparative workload still need their own measured outcomes.
[SQL oracle originals](https://github.com/psvensson/lagrange/releases/download/solve-evidence/fresh-formation-user-table-routability--base-sql-oracle-original-5497-nov20.tar.gz)
and [prepared and locking-read controls](https://github.com/psvensson/lagrange/releases/download/solve-evidence/fresh-formation-user-table-routability--prepared-path-and-locking-controls-nov20.tar.gz).

### Programme adoption and dependency order

Content reconciliation of main's recent extracted repairs is source-only:
PR230 parser/membership/bulk cleanup, PR231 typed codec, PR232 PreVote recovery,
PR233 real SQLite fixture and PR234 CONNECTING-abort handling are present in the
candidate, sometimes with later extensions. The codec's omitted Boolean JSDoc
is corrected in this unit. The candidate's real CONNECTING-abort witness lacks
main's explicit no-attachment assertion; item 07 must reconcile that proof
difference rather than treating the suites as byte-identical. No main repair
is assigned again merely because `git cherry` reports different patch identity.

The existing owners below retain acceptance. Every item must be accepted in its
assigned milestone or explicitly superseded by a user-authorized scope decision.
An assignment, source guard, component closure or later version label does not
discharge a service claim. The ordered release queue remains 0.4.1, 0.5, then
the existing 0.6-0.9 predecessors of 1.0. Independent preparation may precede
publication; it cannot bypass acceptance dependencies. Recovery, ordinary
diagnostics, retries and user backup/restore/PITR are AGPL product obligations.

| Item | Existing owner / acceptance home | Next bounded result and dependencies |
| --- | --- | --- |
| 01 | This epic; documentation lifecycle; `RM-0.2.9-published-operating-contract` | Correct the finite current guidance surface and content reconciliation; distinguish implementation, measurement and support. 0.4.1. |
| 02 | OperationWorkflowOwner / ReplicaOperationRepository; WP1/4/5/8 | After 01, census persistence, terminal/progress consumers and release fixtures; close recognized result combinations through real SQLite construction, competing writers, lost replies and interrupted release. 0.4.1. |
| 03 | ReplicaHandler admission/release, dispatch/recovery, merge worker, bulk transport; WP6/D7 | Consume 02 where relevant; trace original budgets, cancellation, continuing obligations and identity-fenced cleanup across create/release, lanes, merge, bulk and public adapters. 0.4.1 corrections; full supported envelope in 0.5. |
| 04 | ReplicaPlacementOwner, membership and placement/formation Quests | Consume 02/03; prove durable intent, reconstructed attempts/holds, completed-growth generation scope and canonical clearing-event wakes. Physical drain stays in 09. 0.4.1. |
| 05 | TX1, locking reservations, participant apply and CDC debt | Consume 02/03 and ES6 P1/P2/P4; prove prepare-first single/multi-participant composition, durable decision before fanout, replay and reopened-state conflict recovery. Retired one-phase path stays retired. 0.4.1 corrections; 0.5 supported-path qualification. |
| 06 | Parser/renderer/codec/catalog/planner/merge/live-query; coordinator-sqlite-merge | Consume 01 and D1-D3; census public parameters through metadata/replay; same recorded SQLite build/settings for the differential oracle, independent PG expectations. 0.4.1 corrections; existing 0.5 query acceptance. |
| 07 | quest-evidence-and-candidate-binding, proof-authority, classified runners and support-envelope owner | With 01-06, admit original runs and faithful fixtures; reject synthetic/default physical evidence, missing phases and known-bad results. 0.4.1 and each later capability. |
| 08 | ES6 and [code navigability](code-navigability-and-mistake-resistance.md); gated [core convergence](core-architecture-convergence.md) | Consume 01 and changing owners; explicit interfaces and reserved fresh-agent repair, policy, resume and duplicate-removal tasks. Historical WP9 exercises count only with applicable original setup/evidence. 0.4.1 current boundaries; 0.5 broader work. |
| 09 | canonical-authority-formation-acceptance, fresh-formation-user-table-routability and stabilization | Consume relevant 02-08 proofs; one pinned composition, affected checks and existing full gates, three consecutive physical successes and comparative smoke. 0.4.1 formation; 0.5 full journey/pilot also consumes 11-14 and existing security/locality/API prerequisites. |
| 10 | [Developer journey and measured comparisons](developer-journey-and-measured-comparisons.md), graduated comparative specification | After 07/09 and semantic gates, admit small smoke, then both full public WASM/conventional and Scenario A TiDB/TiKV comparisons on real supported systems. Scenario B retains 2.0. 0.5. |
| 11 | [Stabilization](release-0-2-7-stabilization.md), Raft/CDC/transaction/outcome retention owners | After 02-05/07, bound all retained-state classes, safe horizons, physical bytes/replay and admission; prove two compaction cycles, reconstruction and resumption after finite blockers. 0.5; stronger 1.0 qualification. |
| 12 | Public SQL/request and statement-outcome owners, TX1, PG and embedded facade | After 02/05/07 and 11 retirement contract, define canonical scoped mutation identity, exact-intent replay/refusal, fenced lookup and retired-identity rejection through real clients. New capability in 0.5. |
| 13 | CLI/management/diagnostics, pilot-operational-view and installed developer journey | After 01/07/09 and relevant mechanisms, one supported start/join/inspect/diagnose/drain/stop/reconcile route with certainty, debt and safe continuation; measured thirty-minute public onboarding. 0.5, extended with recovery. |
| 14 | supported-upgrade-and-recovery-envelope and pilot Q12 dependencies | After 07/09/11-13 and existing Q6/Q7/Q8-Q9/Q11 prerequisites, qualify exact artifact pairs and restart/full-stop/rolling/mixed-version/rollback cells with real drills. 0.5 named pairs; 1.0 policy. |
| 15 | `RM-1.0-consistent-snapshot-api`; partition/TX/catalog/topology owners | After 05/07/11/12 and format contracts, bound a coherent cluster barrier/cut, pins and interruption recovery; independent restore oracle rejects fractured cuts. Establish bounded core specification first. 1.0. |
| 16 | `RM-1.0-user-recovery-mechanisms`; core recovery/storage/artifact/management owners | After 15/11-13, establish bounded recovery spec; complete-manifest-last backup and fresh-deployment restore from retained artifacts alone, including failures, identity exclusion and measured bounds. 1.0. |
| 17 | Same recovery owner; durable history/TX1/retention | After 15/16 and archive contract, transaction-consistent target mapping, contiguous verified history, bounded archive debt and restartable recovery; reject gaps and unavailable targets. 1.0. |
| 18 | `RM-1.0-support-contract`; topology/durability/certification/release owners | After all applicable items and existing release prerequisites, freeze and measure workload/topology/resource/recovery envelope and operational procedures. Separate process-crash from power-loss evidence. 1.0. |

**Next action:** the explanatory adoption passed independent review and its
documentation checks; this does not close all of item 01 or the programme.
The initial witnesses and generated metadata are pinned at
`58a2080337b56b4e5f97bcb54da59f57b94e6611`. Managed request
`3883b67b-2d12-459c-a08e-d8a5f64b4ebe`
([lab issue 5482](https://github.com/psvensson/lagrange-lab/issues/5482)) was
completed with exit 1 and execution scope closed after 50.556 seconds. Both
physical shards reached behavioral red: strict outcomes on `tv-dator` (eight
malformed-result cases; ordinary transition, thrown-reply retry and reopened
SQLite controls pass), support evidence on `adam-laptop` (five false-certification
negatives fail; policy control passes). Independent review admits the outcome
run as a red baseline only. Original native binary/SQLite build identities are
absent; original discovery Node/version/boot observations do not establish exact
test-process identity or green/composition acceptance. Eight original artifacts
were reopened and matched their controller hashes; the
[retained archive](https://github.com/psvensson/lagrange/releases/download/solve-evidence/strict-operation-outcomes--strict-outcomes-and-support-original-red-3883b67b.tar.gz)
also preserves request, discovery and collection observations. The strict outcome Quest sealed at `58a208033` with all six obligations
outstanding. Its first obligation has a measured failing baseline. The other
five await proof. The assigned writer now migrates the repository, workflow
consumers and affected fixtures under the reviewed
[strict outcome design](operation-integrity-and-reliable-formation/strict-operation-outcomes.md).
Root owns evidence admission and integration. The operator's immediate objective
is a working base system, a successful smoke, then the missing Lagrange GCP
measurement against the existing comparison results. Verify the clean composed
candidate, resolve its base-system failures, and pass the existing physical
formation gate before the comparative smoke and measurement. Use the comparison
owner's Scenario A runner, original observations and declared profile. Check
reference workload, topology and artifact applicability before reporting a
comparison. Backup, restore and PITR follow the measured base system under their
existing milestones.

The [lifetime proposal](operation-integrity-and-reliable-formation/admission-release-lifetimes.md)
preserves the source census and prior contracts; the [adoption review](operation-integrity-and-reliable-formation/adoption-review-20261120.md)
records independent findings and original-evidence custody. Then serialize the affected lifetime/placement/TX/SQL
repairs and their composition. Freeze supported limits before acceptance;
preserve failures and use prospective supersession for any changed bound.
For 09 preserve the three named physical hosts, 420-second bound, all serving
lanes, six priority-partition spread, original quiet window, CREATE/COUNT,
every-node INSERT/readback, learner-address, projection and cleanup predicates.
No polling/resync shortcut supplies an absent owner wake. A later failed gate
routes its demonstrated blocker without undoing bounded repair credit.

### Retained WP0-WP10 coordination (previous session)

- **Integration owner and authority:** local integration client session (`b978a448-c2c8-4df9-a5cd-2aa151c80592`), executing the complete 11-work-package ES6 strengthening and integration programme (`WP0` through `WP10`). Rule-set revision 5 remains governing (`AGENTS.md`, `docs/steering/rules.md`, `docs/steering/router.md`, `docs/steering/workflow-guidelines/solver-quests.md`).
- **WP0 Baseline & Branch Reconciliation:**
  - `main`: `5edfcadb508f9a82783159026364d3005836cc5c` (integrates PR #234: `CONNECTING` bulk-dial abort error absorption and real WebSocket witness in `src/transport/bulk-transfer-channel.js` and `test/transport/bulk-transfer-lane-isolation.test.js`, plus `src/query/sql-value-codec.js` JSDoc alignment).
  - Planning snapshot candidate: `d66a533196b53c2193e8c2baf6e68655d8493e2a` on `candidate/reconciliation-20261119`.
  - Intermediate repair commit on candidate: `5a5f8baf554129fd7bb335ea837b851106c3683a` on `candidate/reconciliation-20261119`.
  - ES6 Owner Safety epic ([`es6-owner-safety.md`](es6-owner-safety.md)): records `P1` (`committed-batch-recovery-witness`), `P2` (`durable-prepared-conflict-authority`), `P3` (`production-construction-and-binding`), `P4` (`proposal-attempt-replay`), and `P5` (`runtime-contracts-and-owner-navigation`) implemented in ordinary ES6 JavaScript with receipts in [`solve/epics/es6-owner-safety/evidence/receipt.json`](es6-owner-safety/evidence/receipt.json).
  - **ES6-only supersession decision:** Ordinary ES6 JavaScript, Node >= 22.12.0, `better-sqlite3`, existing ESLint/dependency-cruiser checks, classified test runner, and home-lab fleet facilities govern all active work. Historical sealed references to TypeScript/`checkJs` (such as [`contract-first-authoring-and-producer-fidelity`](../quests/contract-first-authoring-and-producer-fidelity/quest.json)) remain historical and are explicitly superseded for active implementation by runtime construction validation, producer conformance, and negative behavioral witnesses.
- **Owner & Quest Mapping (WP0):**
  - SQL parsing, rendering, parameter binding, and coordinator merge (`WP2`, `WP6` worker pool, `WP7` SQL oracle): owned by [`coordinator-sqlite-merge`](../quests/coordinator-sqlite-merge/quest.json).
  - Live-query relation occurrences, alias collation, and Tier 1 vs. Tier 2 evaluation (`WP3`, `WP7` live-query witnesses): owned by [`coordinator-sqlite-merge`](../quests/coordinator-sqlite-merge/quest.json) (`src/live-query/`).
  - Single-voter founding, odd-voter growth (`GROWTH_PROMOTE`), authoritative committed non-joint membership completion, intent vs. administration route, named reconciliation progress outcomes, and learner `raft_role` lifecycle preservation (`WP4`, `WP5`, `WP7` membership/recovery witnesses): owned by [`fresh-formation-user-table-routability`](../quests/fresh-formation-user-table-routability/quest.json) and [`replica-placement-admission-owner`](../quests/replica-placement-admission-owner/quest.json).
  - Bulk transfer channel & coordinator merge worker lifetime ownership (`WP6`): owned by [`raft-snapshot-bulk-transfer`](../quests/raft-snapshot-bulk-transfer/quest.json) and [`coordinator-sqlite-merge`](../quests/coordinator-sqlite-merge/quest.json).
  - ES6 runtime boundary contracts, deep-copy isolation, dependency rules, and owner navigation (`WP8`, `WP9`): owned by [`es6-owner-safety.md`](es6-owner-safety.md) and [`replica-placement-admission-owner`](../quests/replica-placement-admission-owner/quest.json).
- **WP9 Reserved Fresh-Context Exercises:**
  - **WP9 Exercise 1 (SQL — subagent `dcc4e2d3-cb6e-4bd4-886a-c55445d03970`):** Syntax-directed emitted-order parameter collection by explicit placeholder identity (`node.index`), JS Boolean parameter normalization (`true`/`false` -> `1n`/`0n`, never SQL `TRUE`/`FALSE` keyword) in mutation rendering (`src/query/query-executor-sql-command-rendering.js`), PostgreSQL window function lexical parameter order (`src/query/sql-parser-expression-methods.js`), single-application of `_paramMapping` on execution AST copies (`src/query/sql-query-engine-statement-execution.js`), and emitted-order fragment parameter extraction in `src/query/distributed/join-pushdown-plan.js` and `src/query/distributed/distributed-query-planner.js`.
  - **WP9 Exercise 2 (Runtime — subagent `1f4c98aa-349d-4476-8e38-aad893b742fb`):** Named reconciliation progress outcome contract (`OPERATION_RECONCILE_OUTCOME`: `completed`, `advanced`, `waiting`, `held`, `refused`) replacing the shared Boolean return contract across `reconcileOperationLifecycle`, `reconcileGrowthPromoteLifecycle`, `applyReconciledReplicaStatus`, `reconcileActiveReplicaStatus`, and `reconcileTimeoutOperation` (`src/rebalancer/operation-workflow-recovery-status-reconcile.js`, `src/rebalancer/operation-workflow-recovery-reconcile.js`, `src/rebalancer/operation-workflow-growth-promote.js`), plus growth completion provenance validation and separation of durable operation intent from current administration route.

### WP1 — Explicit Boundary Contracts & Finite Consumer Census (7 Required Distinctions)

| # | Distinction | Producer / Authority | Boundary Contract | Complete Consumer Census |
| --- | --- | --- | --- | --- |
| **D1** | **SQL Boolean keyword** (`IS [NOT] TRUE\|FALSE`), **numeric literal** (`1`, `0`), **JS Boolean parameter** (`true`/`false` -> `1n`/`0n`), and **identifier named `"TRUE"`** | `src/query/sql-parser-expression-methods.js` (`convertExternalLiteral`, `convertDialectLiteral`, `convertIsNull`), `src/query/sql-value-codec.js` (`encodeTypedParams`) | Source-text SQL Boolean keywords carry `sqlType: INTEGER` with boolean `value` (`true`/`false`) so `renderIntegerLiteral` emits `TRUE`/`FALSE` (preserving SQLite `IS [NOT] TRUE\|FALSE` truth tests). Numeric literals carry numeric/BigInt `value` (`1`/`0`). Bound JS Boolean parameters normalize to `1n`/`0n` at bind/render time and never rewrite `?` into a SQL Boolean keyword. Double-quoted `"TRUE"` converts to `EXPR_TYPE.COLUMN_REF` (`column: 'TRUE'`). | `src/query/sql-statement-renderer.js` (`renderIntegerLiteral`, `renderBinary`), `src/query/query-executor-sql-command-rendering.js` (`toStorageClassLiteralAst`), `src/query/sql-value-codec.js`, `src/live-query/live-query-service.js` (`normalizeRowCellForSqlite`). |
| **D2** | **Original placeholder identity** (`node.index`, `$N`, `?`) vs. **rendered placeholder position** | `src/query/sql-parser.js` (`createParameterNode`, `_paramMapping`), `src/query/sql-parser-expression-methods.js`, `src/query/sql-parser-select-methods.js` | Every `EXPR_TYPE.PARAMETER` node receives its 0-based `index` once in lexical source order. PostgreSQL `$N` records 1-based positions in `_paramMapping`, applied once when normalizing execution parameters. Every SQL renderer and fragment planner collects bound parameter values in **emitted placeholder order** by resolving each emitted `PARAMETER` node's explicit `index`. No consumer uses `Object.entries`/`Object.values` key order or missing-index cursor inference. | `src/query/sql-statement-renderer.js` (`renderSelectWithParameters`, `renderExpressionWithParameters`, `renderLimit`), `src/query/query-executor-sql-command-rendering.js` (`buildInsertSQL`, `buildUpdateSQL`, `buildDeleteSQL`), `src/query/distributed/distributed-select-fanout-plan.js`, `src/query/distributed/join-pushdown-plan.js`, `src/query/distributed/distributed-query-planner.js`, `src/query/distributed/distributed-write-constraint-helpers.js`, `src/query/sql-query-engine-statement-execution.js`, `src/partition/partition-write-footprint-contract.js`. |
| **D3** | **Catalog source identity**, **query scope**, **relation occurrence**, and **SQL alias** | `src/live-query/live-query-service.js` (`extractTableBindings`, `buildProbeTableDefinitions`), `src/query/distributed/join-pushdown-plan.js` (`buildTableIndex`) | Each relation reference in a query has a catalog `tableName` (schema/collation authority), a `queryScope` (`root` vs. `nested:<n>`), an `occurrenceId` (unique per occurrence), and an optional `alias` (`effectiveName = alias \|\| tableName`). Two aliases of one catalog table share catalog column types/collations while materializing distinct probe/coordinator tables. Ambiguous unqualified column references across multiple bindings in the same scope fail closed. | `src/live-query/live-query-service.js` (`compilePredicate`, `buildProbeTableDefinitions`), `src/live-query/live-query-group.js` (`resolvePartitions`, `getTableInfo`), `src/live-query/live-query-group-helpers.js` (`isComplexQuery`, `resolveWhereInfo`), `src/query/distributed/join-pushdown-plan.js`. |
| **D4** | **Committed non-joint membership** vs. **projected service role** (`SERVICES.raft_role`) | `src/node/replica-handler-membership-methods.js` (`handleProposeGrowthPromote`, `areReplicasCommittedVoters`), `src/partition/partition-service-raft-lifecycle-wiring.js` (`isPromotedLearnerVoterObservation`), `src/raft/replica-voter-readiness.js` | `GROWTH_PROMOTE` completion requires authoritative non-joint committed Raft membership (`votersOutgoing` empty and all `promoteReplicaIds` in `voters` for `operation.partitionId`). `SERVICES.raft_role` (`leader`, `follower`, `learner`) is a lifecycle/discovery projection preserved across `ReplicaStateMachine` and `systemTableCache` transitions so active learners are classified as learners (never failed voters), and never substitutes for committed Raft membership when completing `GROWTH_PROMOTE`. | `src/rebalancer/operation-workflow-growth-promote.js` (`reconcileGrowthPromoteDispatchResponse`, `completeGrowthPromoteOperation`), `src/node/replica-handler-membership-methods.js`, `src/node/replica-handler-class.js`, `src/node/replica-handler-create-status-methods.js`, `src/node/replica-state-machine-transition.js`, `src/cache/system-table-cache-authoritative-reconciliation.js`, `src/rebalancer/replica-placement-owner-deficits.js`. |
| **D5** | **Durable operation intent** (`ADD` physical placement target, `GROWTH_PROMOTE` promoted identities) vs. **current administration route** | `src/rebalancer/replica-placement-owner-deficits.js`, `src/rebalancer/replica-placement-owner-admission-statement.js`, `src/rebalancer/operation-workflow-growth-promote.js` | `ADD` durable `targetNodeId` names the physical placement target node where the learner/replica is created and is immutable across routing retries. `GROWTH_PROMOTE` durable intent is `(partitionId, promoteReplicaIds)`; its administration route (`administrationRouteNodeId` / leader target resolution) tracks the current partition leader for `PROPOSE_GROWTH_PROMOTE` delivery. | `src/rebalancer/operation-workflow-growth-promote.js` (`redirectGrowthPromoteTargetNode`, `resolveGrowthPromoteTargetNodeId`, `applyGrowthPromoteRequestFields`), `src/rebalancer/operation-workflow-dispatch-execution.js`, `src/rebalancer/replica-operation-repository-row-methods.js`. |
| **D6** | **Actual operation advancement** vs. **successful retry bookkeeping** vs. **terminal settlement** | `src/rebalancer/operation-workflow-growth-promote.js`, `src/rebalancer/operation-workflow-recovery-status-reconcile.js`, `src/rebalancer/operation-workflow-recovery-reconcile.js` | Reconciliation returns explicit named outcomes (`OPERATION_RECONCILE_OUTCOME`: `completed`, `advanced`, `waiting`, `held`, `refused`). Only `completed` and `advanced` (where `workflowStep` durably advanced or terminal commit succeeded) count as progress (`didOperationReconcileAdvanceOrComplete === true`). Retry scheduling, route refresh, and unconfirmed handoff checks return `waiting`/`held` and never suppress step-timeout or total operation budget evaluation in `reconcileTimeoutOperation`. | `src/rebalancer/operation-workflow-recovery-status-reconcile.js` (`reconcileTimeoutOperation`, `reconcileOperationLifecycle`, `applyReconciledReplicaStatus`, `reconcileActiveReplicaStatus`), `src/rebalancer/operation-workflow-recovery-reconcile.js`, `src/rebalancer/operation-workflow-growth-promote.js`, `src/rebalancer/operation-workflow-recovery-timeout.js`. |
| **D7** | **Caller settlement**, **resource termination**, and **ownership transfer** | `src/query/distributed/coordinator-merge-process.js` (`CoordinatorMergeProcessPool`), `src/transport/bulk-transfer-channel.js` (`createByteRateTokenBucket`, `createBulkTransferChannelRegistry`) | Every async operation has a single-shot caller settlement guard, deterministic listener/timer teardown on all exit paths (pre-start, queued, active, handoff-boundary cancellation, error, completion, and shutdown), explicit child-process `SIGKILL` or socket `terminate()` on abort/timeout, and identity-checked eviction so late callbacks never reuse a killed worker, leak an `AbortSignal` listener, or evict a replacement connection. | `src/query/distributed/coordinator-merge-process.js`, `src/query/distributed/distributed-merge-engine.js`, `src/transport/bulk-transfer-channel.js`, `src/raft/raft-snapshot-bulk-transfer.js`. |

### Coverage and Closure Matrix (15 Required Rows — WP0 through WP10)

| Row | Work Package / Obligation | Owner Surface | Proof / Witness Surface | Status |
| --- | --- | --- | --- | --- |
| **1** | **WP0**: Baseline reconciliation, review-finding disposition, ES6-only supersession, WP9 reservation, and 15-row matrix instantiation | `solve/epics/operation-integrity-and-reliable-formation.md`, `solve/epics/es6-owner-safety.md` | Epic coordination record & git lineage | `verified satisfied` |
| **2** | **WP1**: Explicit boundary contracts and finite consumer census for Distinctions D1–D7 | `solve/epics/operation-integrity-and-reliable-formation.md`, `src/query/INDEX.md`, `src/rebalancer/INDEX.md` | `scripts/check-guideline-navigability.js`, `scripts/check-guideline-decision-boundaries.js` | `verified satisfied` |
| **3** | **WP2 (D1)**: SQL Boolean keyword (`IS [NOT] TRUE\|FALSE`) vs. numeric literal (`1`/`0`) vs. JS Boolean parameter (`true`/`false` -> `1n`/`0n`) vs. identifier `"TRUE"` | `src/query/sql-parser-expression-methods.js`, `src/query/sql-statement-renderer.js`, `src/query/query-executor-sql-command-rendering.js` | `test/query/sql-boolean-and-parameter-binding.test.js`, `test/query/sql-semantics-oracle/sql-semantics-oracle.test.js` | `in progress` |
| **4** | **WP2 (D2)**: Lexical placeholder identity (`node.index`, `$1..$N`) vs. emitted placeholder order across `SELECT`, `INSERT`, `UPDATE`, `DELETE`, multi-row partition slicing, and `JOIN` pushdown | `src/query/query-executor-sql-command-rendering.js`, `src/query/sql-parser-expression-methods.js`, `src/query/sql-query-engine-statement-execution.js`, `src/query/distributed/join-pushdown-plan.js`, `src/query/distributed/distributed-query-planner.js` | `test/query/sql-boolean-and-parameter-binding.test.js`, `test/query/sql-semantics-oracle/sql-semantics-oracle.test.js` | `in progress` |
| **5** | **WP3 (D3)**: Scoped relation occurrence metadata, per-alias probe tables, ambiguous column refusal, and Tier 1 vs. Tier 2 live-query evaluation selection | `src/live-query/live-query-service.js`, `src/live-query/live-query-group.js`, `src/live-query/live-query-group-helpers.js` | `test/live-query/live-query-alias-collation.test.js`, `test/live-query/live-query-service.test.js`, `test/live-query/live-query-group.test.js` | `in progress` |
| **6** | **WP4 (D4)**: Authoritative non-joint committed Raft membership owns `GROWTH_PROMOTE` completion; learner `raft_role` preserved across lifecycle transitions; conditional terminal-write dispositions and reconstructed-owner restart recovery | `src/node/replica-handler-membership-methods.js`, `src/rebalancer/operation-workflow-growth-promote.js`, `src/node/replica-handler-class.js`, `src/node/replica-handler-create-status-methods.js`, `src/node/replica-state-machine-transition.js`, `src/cache/system-table-cache-authoritative-reconciliation.js` | `test/rebalancer/growth-promote-authoritative-completion-and-progress.test.js`, `test/node/replica-local-only-row-convergence.test.js`, `test/rebalancer/replica-placement-owner-formation-drain.test.js` | `in progress` |
| **7** | **WP5 (D5)**: Separation of durable operation intent (`ADD` target node, `GROWTH_PROMOTE` promoted identities) from current growth administration route | `src/rebalancer/operation-workflow-growth-promote.js`, `src/rebalancer/replica-placement-owner-deficits.js`, `src/rebalancer/replica-placement-owner-admission-statement.js` | `test/rebalancer/growth-promote-authoritative-completion-and-progress.test.js` | `in progress` |
| **8** | **WP5 (D6)**: Named reconciliation progress outcomes (`completed`, `advanced`, `waiting`, `held`, `refused`) and independent step-timeout / operation-budget evaluation | `src/rebalancer/operation-workflow-recovery-status-reconcile.js`, `src/rebalancer/operation-workflow-recovery-reconcile.js`, `src/rebalancer/operation-workflow-growth-promote.js` | `test/rebalancer/growth-promote-authoritative-completion-and-progress.test.js` | `in progress` |
| **9** | **WP6 (D7)**: Bulk transfer channel (`CONNECTING` dial abort, token-bucket listener cleanup, replacement safety) and `CoordinatorMergeProcessPool` (pre-start, queued, active, handoff-boundary cancellation, and pool shutdown) lifetime ownership | `src/transport/bulk-transfer-channel.js`, `src/query/distributed/coordinator-merge-process.js` | `test/transport/bulk-transfer-lane-isolation.test.js`, `test/query/coordinator-merge-process-pool.test.js` | `in progress` |
| **10** | **WP7**: Seeded SQL differential oracle & real SQLite operation/reservation store and live-query/membership witnesses registered in test classifications and impact contracts | `test/query/sql-semantics-oracle/`, `test/helpers/sqlite-operation-reservation-store.js`, `test/live-query/live-query-alias-collation.test.js`, `test/rebalancer/growth-promote-authoritative-completion-and-progress.test.js` | `npm run audit:impact-contracts`, classified test runner | `in progress` |
| **11** | **WP8**: Runtime boundary validation, deep-copy of retained nested inputs, narrow mutators, extended `dependency-cruiser` rules with negative witnesses, owner headers, and generated `INDEX.md` navigation | `dependency-cruiser.config.cjs`, `src/partition/`, `src/rebalancer/`, `src/query/` | `npm run test:deps`, `test/query/scenario-a-transaction-coordination-fast-path.test.js`, `npm run audit:guidelines` | `in progress` |
| **12** | **WP9 (SQL Exercise)**: Fresh-context subagent implementation of reserved SQL parameter identity & emitted-order binding (`dcc4e2d3-cb6e-4bd4-886a-c55445d03970`) + independent `quest-review` verification | `src/query/query-executor-sql-command-rendering.js`, `src/query/sql-parser-expression-methods.js`, `src/query/sql-query-engine-statement-execution.js`, `src/query/distributed/join-pushdown-plan.js`, `src/query/distributed/distributed-query-planner.js` | Independent review verdict & discriminating SQL witnesses | `in progress` |
| **13** | **WP9 (Runtime Exercise)**: Fresh-context subagent implementation of reserved named reconciliation progress outcomes & growth completion provenance (`1f4c98aa-349d-4476-8e38-aad893b742fb`) + independent `quest-review` verification | `src/rebalancer/operation-workflow-growth-promote.js`, `src/rebalancer/operation-workflow-recovery-status-reconcile.js`, `src/rebalancer/operation-workflow-recovery-reconcile.js` | Independent review verdict & discriminating runtime witnesses | `in progress` |
| **14** | **WP10 (Static & Classified Suite Gates)**: Fast static audit, lint, dependency-cruiser, impact contracts, durable-command-format fence, and full classified regression sweep across the home-lab fleet | Repository-wide | `node scripts/check-fast-static.js`, `npm run lint`, `npm run test:deps`, `npm run audit:impact-contracts`, `node scripts/run-classified-test-files.js` | `in progress` |
| **15** | **WP10 (Physical 3-Node Lab Formation & Comparative Smoke Gate)**: 3 consecutive physical 3-host `fresh-formation-user-table-routability` runs within 420s bound on `tv-dator,adam-laptop,adams-gamla` + lab comparative smoke | `scripts/lab.js`, physical lab fleet | `solve/quests/fresh-formation-user-table-routability/evidence/receipt.json`, `solve/quests/replica-placement-admission-owner/evidence/receipt.json` | `in progress` |

## Retained integration summary (17 November 2026)

- **Integration owner and authority:** the current ChatGPT root session,
  following the operator's 17 November instruction to take over development,
  fix the verified latest-review errors and continue the existing GCP
  comparative measurement campaign. Rule-set revision 5 remains governing.
- **Candidate:** defect baseline
  `4b0c8ec1de59e9a074afa97ce260afb2868685c5` from
  `wip/integrated-candidate-20261115`; isolated continuation branch
  `work/review-fixes-gcp-prep-20261117`. Current main is
  `fc626cbf377a334c6960836afb92d837acd25ed9`. No new integration or publication
  acceptance is claimed.
- **Measured blockers:** native SQL scalar result regressions, explicit budget
  conflict admission, dropped repository operation observations at Phase B
  target-slot admission, and HTTP probes extending a caller's total deadline.
  Their original failures, controls, source identities and evidence hashes are
  retained in the [repair review record](../../docs/evidence/review-repairs-2026-11-17/README.md).
- **Component state:** scalar/budget and the separately discovered text-order
  repair passed native job 4918 (10 files, 1,299 assertions; all seven frozen
  diagnostics engaged with intended results). Target-slot admission passed
  job 4910; HTTP deadline and final fixture-static correction passed jobs
  4908/4915. Independent source/proof reviews and complete log hashes are
  retained in their component records. Root owns composed metadata, exact
  candidate gates and physical continuation.
- **Execution boundary:** repository execution, including tests, audits and
  generators, remains on the managed lab. Source editing and Git inspection
  may occur in the collaborator workspace. Existing thermal, physical custody
  and original-evidence requirements remain unchanged.
- **Next action:** satisfy the composed candidate's applicable gates, then run the existing
  small physical-lab pre-gate. The measured-comparisons epic retains GCP
  topology, semantic parity, repeated measurements and claim admission. No
  physical campaign has been submitted by this takeover yet.
- **Separate work:** portability PRs 222/223 and the literal-checker binding
  residual remain separate units. The measured publication-dependent cached
  terminal-operation delay is recorded with the target-slot owner and is not
  claimed fixed. Optional GCP create-time expiry is a separate provisioner
  contract unit. Historical formation, comparison and
  release claims below are not promoted by the latest component review.

## Retained integration summary (15 November 2026)

- **Governing rules and source:** rule-set revision 5, integrated from
  `origin/main` `c4f1cd064bee29d174ba63d0d8d52486651bc59f` into candidate branch
  `work/integrated-candidate-20261115`. All five active repair streams are
  verified within their bounded scopes and composed on one candidate lineage.
- **Bounded repairs composed in the 15 November 2026 candidate:**
  - **Stream 5b -- Foundation PRs `#208`-`#211` (`2dc0ca4cc..40cc67121`):**
    canonical JSON data-plane serialization, Raft durable-store connection
    custody, CDC timer-until-shutdown resource cleanup, and `PR206`
    replica-lifecycle observation row-carrier cut.
  - **Stream 4 -- [cdc-oversized-entry-range-scan](../quests/cdc-oversized-entry-range-scan/quest.json) (`3c2c3af13`, `96d6aefb8`, `082b8fc8f` / component `f28f61cf4`):**
    eliminates repeated $O(M)$ position and byte-sum scans of oversized CDC
    entries via connection-scoped `_cdcOwedEntryBytes` (`SELECT_OWED_ENTRY_BYTES`
    executes once per oversized entry across an entire drain, `<= 4` queries per
    wave at 512, 1024, and 4096 events, and finalizes/evicts tallies on
    transaction commit and rollback via `commitOwedEntryByteTallies` and
    `rollbackOwedEntryByteTallies`), pages `firstReadyRow` and
    `owedEntryPositionsAfter` by `DRIVE_PAGE_ROWS`, and uses position-only
    `readOwedCdcObligationPositions` in `drainPendingHydratedObligations`
    (verified on `adams-gamla` in lab jobs `9f6d4ede-a952-418b-a775-0dc425c40785`
    and `58cbbc58-c927-4b1a-8ed9-3d3453ab1f1d`, 9/9 test files, 328 assertions;
    post-closure applicability recorded in
    [post-closure-applicability-2026-11-15.md](../../docs/evidence/cdc-oversized-entry-range-scan-2026-11/post-closure-applicability-2026-11-15.md)).
  - **Stream 5a -- [node-ready-lease-renewal-cadence](../quests/node-ready-lease-renewal-cadence/quest.json) & authoritative `SERVICES` incarnation supersession (`fb634397f`, `678b9492f`, `19ff97346` / component `2005ad36e`):**
    derives `HeartbeatService` renewal cadence and `metadataUpdateCooldown` from
    `leaseTtlMs` (`floor(leaseTtlMs / 3)`), separates `SERVICES` birth
    incarnation identity (`created_at`) from causal supersession ordering
    (advancing the birth timestamp floor across owner restarts, fencing
    authoritative point reads with `beforeReadSnapshot` / `afterReadSnapshot` and
    CDC `sourceLogIndex` provenance, and preserving unknown `appliedIndex: null`
    as `null` via `normalizeSourceLogIndex` so a reborn authoritative incarnation
    replaces a stale cached incarnation even after owner restart and clock
    rollback), and binds the affinity demo formation verdict to explicit
    convergence (verified on `carinas-windows` in lab jobs
    `bbb81104-731c-41dd-80c9-9515d8ac37c6` and
    `5b4798a9-dbb9-46ec-9ea1-f81a264eb898`, 9/9 test files, 573 assertions).
  - **Stream 2 -- [formation-ready-lease-independent-of-spread](../quests/formation-ready-lease-independent-of-spread/quest.json) (`#217`, `5bc4d0769..ebd94a498`, `f67f16071` / component `40233af70`):**
    retires the formation-cohort spread gate on `NODES.status = READY` and the
    associated formation-release handoff machinery (`~29,770` net lines deleted
    across `src/`, `models/`, `scripts/`, and `test/`), enforces the
    `READY`-lease + voter-ready floor on priority `REMOVE` safety
    (`evaluateRemoveSafety`, `MovePlanner`, and `ConsensusRecoveryService`),
    prevents `projectPriorityTerminalCreateTargets` from resurrecting pre-wipe or
    tombstoned `SERVICES` rows, preserves `REPLICA_OPERATIONS` across
    wiped-data-dir restarts with both external-cleanup and local-disk-only
    (`markWipedReplicasFailed: true`) witnesses in
    `dt-formation-joint-admission-release-liveness.test.js`, and records
    post-closure applicability in
    [post-closure-applicability-2026-11-15.md](../../docs/evidence/formation-ready-lease-independent-of-spread-2026-11/post-closure-applicability-2026-11-15.md).
  - **Stream 1 -- Comparative harness & explicit provisioning (`#218`, `#219`, `6855453b6..0f0392838`, `89404602b`, `1caf39d24`, `1a5a9235d` / component `c7746ef77`):**
    lands [comparative-explicit-load-generator](../quests/comparative-explicit-load-generator/quest.json)
    and [comparative-campaign-explicit-provisioning](../quests/comparative-campaign-explicit-provisioning/quest.json),
    enforces `Promise.allSettled` startup ownership and cleanup in
    `RealProductLagrangeDeployer` and `RealProductPostgresDeployer`, enforces one
    shared `420,000 ms` wall-clock formation deadline and `AbortSignal`
    cancellation across sequential Lagrange readiness stages, derives canonical
    DDL + index (`idx_orders_customer_latest`) validation before retained-cohort
    truncation in `LagrangeOltpAdapter`, and records post-closure applicability
    in
    [post-closure-applicability-2026-11-15.md](../../docs/evidence/comparative-campaign-explicit-provisioning-2026-11/post-closure-applicability-2026-11-15.md)
    (verified on `tv-dator` job `9b3f4a63-b442-4f4c-ac4e-5885305cc405` and
    `adams-gamla` job `1034c873-144c-4f88-a6e4-1a85294630c7`, 15/15 test files,
    135 assertions).
- **Service and aggregate acceptance status (R09 / R19 / R22):**
  bounded deterministic, differential, and unit/integration proofs for the five
  streams are green on their verified trees, but neither the unchanged physical
  three-node service gate
  ([fresh-formation-user-table-routability](../quests/fresh-formation-user-table-routability/evidence/receipt.json))
  nor the broader epic aggregate
  ([canonical-authority-formation-acceptance](../quests/canonical-authority-formation-acceptance/quest.json))
  is claimed as passed until the frozen integrated candidate completes its
  three-consecutive-run physical formation journey and all required aggregate
  receipts are admitted. Earlier intermediate failure `9e8a8950` (`c3ec15e6b`,
  where `control_plane_publications-p1` remained in `ledger_in_flight` for
  `2,817 ms > 2,500 ms` under `g-projection-agrees-with-authority`) remains an
  unresolved failure of that earlier composition and is not reclassified away.
- **Next action:** execute the combined cross-stream regression witnesses and the
  public formation journey `fresh-formation-user-table-routability` on the lab
  fleet against the frozen `work/integrated-candidate-20261115` SHA, followed by
  physical three-node qualification (`E9`) and `Q12` aggregate receipt admission.

### Integrated candidate commit table (15 November 2026)

| Layer | Stream | Commit range (`work/integrated-candidate-20261115`) | Component branch head | Bounded scope and verification witness |
| --- | --- | --- | --- | --- |
| Base | `origin/main` | `c4f1cd064` | `c4f1cd064` | Clean starting baseline (`#216` merged). |
| Layer 1 | Stream 5b (`#208`-`#211`) | `2dc0ca4cc..40cc67121` | `40cc67121` (`origin/wip/order5b-foundation-repairs-rebased-20261115`) | Canonical JSON data plane, durable-store connection custody, CDC timer shutdown resource, and `PR206` lifecycle-observation cut; 6 test suites (60 assertions) green. |
| Layer 2 | Stream 4 (`cdc-oversized-entry-range-scan`) | `3c2c3af13`, `96d6aefb8`, `082b8fc8f` | `f28f61cf4` (`origin/wip/order4-cdc-oversized-entry-range-scan-20261115`) | Single-aggregate per-entry owed byte tally finalized on transaction commit/rollback, paged `firstReadyRow`, and position-only hydration drain; lab job `58cbbc58` (9 files, 328 assertions) green. |
| Layer 3 | Stream 5a (`node-ready-lease-renewal-cadence` + cache merge) | `fb634397f`, `678b9492f`, `19ff97346` | `2005ad36e` (`origin/wip/order5a-lease-cadence-service-row-20261115`) | TTL-derived `HeartbeatService` renewal cadence, `SERVICES` birth identity vs causal supersession with unknown-position preservation, and affinity formation verdict; lab job `5b4798a9` (9 files, 573 assertions) green. |
| Layer 4 | Stream 2 (`formation-ready-lease-independent-of-spread` `#217`) | `5bc4d0769..ebd94a498`, `f67f16071` | `40233af70` (`origin/wip/order2-formation-ready-lease-20261115`) | Spread-independent `READY` lease, `READY`-lease voter-ready `REMOVE` floor, `REPLICA_OPERATIONS`-preserving wiped-data-dir recovery (external + local-disk-only witnesses), and 9 sealed priority-recovery cases; 12/12 joint-admission convergence tests green. |
| Layer 5 | Stream 1 (`#218` + `#219` comparative harness & adapter) | `6855453b6..0f0392838`, `89404602b`, `1caf39d24`, `1a5a9235d` | `c7746ef77` (`origin/wip/order1-comparative-provisioning-20261115`) | `Promise.allSettled` startup ownership, shared `420,000 ms` formation wall-clock deadline + `AbortSignal` cancellation, canonical DDL + `idx_orders_customer_latest` index validation before cohort truncation; lab job `1034c873` (15 files, 135 assertions) green. |

### Prior planning summary (12 November 2026)

- **Governing rules and source:** rule-set revision 5, inspected at
  main `ef93af85dcd6add82ff5b5fee21ca12d205c61cd` and preserved WIP
  `dc29d85bedbbe4310bfcd4cf7e46e8b65a654b2d`. They are divergent evidence inputs,
  not an accepted integrated candidate. Main retains the agent-tooling Q1-Q7
  implementation; its absence in the older WIP lineage is not a deletion.
- **Integration responsibility:** this change owns planning reconciliation only.
  The execution integration owner must reconcile active writers, preserved
  branches and current evidence before admitting a runtime composition. No lab
  job or runtime writer is assigned here. One writer owns each changing
  interaction; proof/selector work can proceed alongside independent diagnosis.
- **Observed blockers:** historical formation failures remain unresolved at the
  service boundary. Current source review adds evidence-admission gaps, CDC
  source-image/occurrence mismatch, delayed generation-unsafe settlement,
  retained-read physical custody, locking-reservation and PG-description gaps.
  Some paths exist only in the WIP and require composition review. These source
  findings and counterexamples are not claimed as newly executed failures.
- **Service status:** the existing
  [formation receipt](../quests/fresh-formation-user-table-routability/evidence/receipt.json)
  still fails. It is unchanged. The broader aggregate probe has no receipt and
  is explicitly unmeasured. Neither the plan nor earlier focused successes
  establish service, release or comparative acceptance.
- **Current unit:** the earlier blanket description of Q1-Q16 as unsealed is
  obsolete. Q1, Q2, Q5 and Q14 have terminal solved records; other states come
  from their actual logs. Historical acceptance is preserved. The six bounded
  successors below and amended Q12 aggregate are unsealed, with no new runtime
  receipt. Tooling Q8 remains a separate open pilot, not a product repair owner.
- **Next action:** compose canonical census/checkpoint recovery and close the
  source-bound evidence path; pair generation/CDC repairs with their real
  callers and recovery, then read-view and client corrections. Use actual red
  measurements before sealing and discharge material findings before the frozen
  three-node formation journey. Preserve Q6 policy currency and valid prior
  repairs. A refuted hypothesis is recorded as refuted, not implemented anyway.

The dated E0-E9 material below is retained context, not another current summary.
Original observations and accepted bounded repairs keep their original scope.
Use the linked Quest logs and applicable evidence to determine current state.

### Steering enforcement follow-ups (13 November 2026)

The steering reconciliation was inspected against main
`f402575b0667bc02110849867cabacf013e61be6`, under rule-set revision 5. It changes
required working practice, not runtime behavior, sealed acceptance or the
service verdict above. The following bounded executable follow-ups remain
unimplemented by that documentation change, within the existing 0.4.1 correction
allocation. The integration owner assigns their actual candidate and writer
before execution; this list is not a claim that a worker or lab run has started.

| Follow-up | Existing owner and bounded acceptance |
| --- | --- |
| Per-package scope | Solver scope owner, coordinated with [evidence and candidate binding](../quests/quest-evidence-and-candidate-binding/quest.json). Check the declared package assignment, including standalone fixes, against actual changed paths. An explicit authorized amendment changes that assignment without changing a seal. Prove rejection of unintended expansion and acceptance of a valid amendment. |
| Proof-machinery review | The same [evidence and candidate binding](../quests/quest-evidence-and-candidate-binding/quest.json) continuation owns review eligibility. Preserve current `src/` coverage and content binding while including proof selection, execution, interpretation, admission, publication and operative acceptance inputs. Prove rejection without applicable independent approval and preservation of harmless notes. |
| One real owner-boundary trial | The next bounded causal product repair owns its actual runtime/composition seam and invalidated callers. Extend the existing contract-authoring checker through that owner; reject an invalid actual producer and consumer through unchanged production binding, and preserve the valid path. A typedef-only check or repository-wide modularization campaign does not discharge this trial. |
| Ratchet update integrity | The existing [code navigability owner](code-navigability-and-mistake-resistance.md), coordinated here for the correction. Reject deletion-funded new violations, accept evidence-backed identity-preserving moves, and compare a measurement correction on one pinned tree with history and newly exposed debt retained. Do not raise thresholds or create another debt ledger. |

Use the existing Quest threshold to seal a bounded implementation only after its
real falsifier measures red; do not reopen terminal Q1/Q2 records or copy their
receipts. Source/proof work already in progress, including publication and
evidence custody, keeps its current owner and must be reconciled before another
writer is assigned. The steering PR needs independent document review and the
applicable documentation, routing and generated checks; it does not require a
new product certification campaign. Its first product trial must show a bounded
causal repair integrated against the accepted base with its new witnesses and
the remaining unaccepted work explicitly reconciled.

## P0 reconciliation and explicit completion amendment

The user approved installation of the verified plan on 10 November. The sealed
[formation Quest](../quests/fresh-formation-user-table-routability/quest.json)
now names this epic, matching its pre-existing membership and receipt. Its
statement, constraints, sealing SHA, `doneWhen`, required receipt IDs and failed
receipt are preserved; the routing correction is appended to its log.

This epic's earlier completion criterion consumed only that service receipt.
It is explicitly replaced at the epic level by the broader
[Q12 aggregate](../quests/canonical-authority-formation-acceptance/quest.json).
This is an additional completion obligation, not a change to the sealed service
criterion. Q12 consumes the original service receipt and adds Q1-Q11 and Q13-Q16,
the 12 November continuations below, natural exit, evidence custody and
frozen-composition proof. It may not duplicate the
service predicate or infer a pass from Quest status, a review note or a plan.
No aggregate receipt is fabricated; before sealing Q12, its existing proof owner
must produce reproducible input validation and a genuine red measurement.

Each new Quest declares its evidence location and concrete required receipt IDs.
Absence currently means `measuring: false`, never pass. New work seals only after
its actual probe measures red. Already sealed or terminal Quests retain their
acceptance; a changed sealed premise requires explicit supersession.

## Registered work and execution dependencies

Each linked record owns its statement, boundary, constraints and acceptance.
All rows apply P0 and Q1's contract-first discipline. Dependencies below govern
admission and final acceptance; Solver does not implement a dependency scheduler.
The semantic owner is named even when no execution agent has been assigned.

| Work | Quest | Responsible interaction | Difficulty | Admission dependency |
| --- | --- | --- | --- | --- |
| Q1 | [Make contract-first authoring executable](../quests/contract-first-authoring-and-producer-fidelity/quest.json) | Quest workflow, fixture guidance and selected real producer/consumer | medium | P0 |
| Q2 | [Bind review and interaction proof to the code](../quests/content-bound-review-and-interaction-proof/quest.json) | Solver/provenance and existing interaction-proof selection | medium | P0 |
| Q3 | [Make report classification refuse unsupported evidence](../quests/canonical-report-outcome-classification/quest.json) | Report producer, classifier and public triage/receipt path | small to medium | P0 |
| Q4 | [Consume management authority from the actual owner](../quests/management-action-authority/quest.json) | Consensus/partition authority and management consumers | high | Q1 |
| Q5 | [Give replica completion one canonical observation](../quests/canonical-replica-completion-observation/quest.json) | Replica repository and completion/recovery consumers | high | Q1 |
| Q6 | [Preserve policy currency for all outstanding reads](../quests/table-policy-outstanding-read-currency/quest.json) | Table-policy producer, outstanding reads and mutation consumer | medium to high | Q1 |
| Q7 | [Retire routing protection only after the relevant state catches up](../quests/routing-overlay-complete-state-retirement/quest.json) | Query engine, cache/projection and query executor | medium to high | Q1 |
| Q8 | [Restore formation progress without weakening safety](../quests/formation-spread-progress-at-cause/quest.json) (superseded at cause by [formation-ready-lease-independent-of-spread](../quests/formation-ready-lease-independent-of-spread/quest.json)) | Planner, admission, membership and formation release; one writer | high | Q1, Q3 |
| Q9 | [Make failed and successful startup terminate naturally](../quests/node-startup-natural-shutdown/quest.json) | Node lifecycle and retained resource owners | medium to high | Q1 |
| Q10 | [Unify lab, census and benchmark evidence custody](../quests/lab-census-benchmark-evidence-custody/quest.json) | Canonical lab runner, census and benchmark proof producers | medium | Q3 |
| Q11 | [Close legacy and fallback removal by semantic owner](../quests/repository-legacy-fallback-closure/quest.json) | Existing per-owner retirement Quests; integration owns global reconciliation | scope dependent; potentially large | P0 |
| Q12 | [Prove the frozen composition and hand off to comparisons](../quests/canonical-authority-formation-acceptance/quest.json) | Integration and existing service/acceptance owners | integration | Q1-Q11, Q13-Q16, the 12 November continuations and original formation proof |
| Q13 | [Catalog authority and visible reconciliation](../quests/catalog-authority-and-visible-reconciliation/quest.json) | Catalog read consumer, canonical read-authority gateway and cache reconciliation owner | high | P0/Q1; Q2 review; shared-owner coordination |
| Q14 | [CDC recipient domain and retained debt](../quests/cdc-recipient-domain-and-retained-debt/quest.json) | Latency topology, message-group recipient mapping and CDC propagation progress interaction | high | P0/Q1; Q2 review; shared-owner coordination |
| Q15 | [Cache replica incarnation coherence](../quests/cache-replica-incarnation-coherence/quest.json) | Shared system-table cache ingress/merge and replica lifecycle publication interaction | high | P0/Q1; Q2 review; shared-owner coordination |
| Q16 | [Load admission ingress identity](../quests/load-admission-ingress-identity/quest.json) | Actual load ingress, discovery selection, table admission cache and query dispatch interaction | medium | P0/Q1; Q2 review; shared-owner coordination |

### 12 November continuations (initial completion: 0.4.1)

These refine the current correction scope; they do not reopen completed Quests
or copy their passed evidence. Each proposal owns its actual falsifiers and
acceptance. Existing source and execution owners retain implementation authority.

| Continuation | Existing interaction and admission boundary |
| --- | --- |
| [Evidence and candidate binding](../quests/quest-evidence-and-candidate-binding/quest.json) | Continue solved Q1/Q2 and proof-authority work through Solver, executed-report/provenance and one immutable lab selection plan. Include proof/harness edits and acceptance-bearing constraints; preserve docs-only and WIP-preservation boundaries. |
| [CDC source-image occurrence completion](../quests/cdc-source-image-occurrence-completion/quest.json) | Continue Q14 through cache image replacement, occurrence deduplication and delivery frontier. A refused effect retains its obligation; generation/census composition shares the canonical cache owners. |
| [Replica settlement generation fencing](../quests/replica-settlement-generation-fencing/quest.json) | Continue Q5 through suspended completion, status mutation, retry and rollback. Refence at the actual effect and preserve a successor's state/resources. |
| [Authoritative locking reservations](../quests/locking-read-authoritative-reservations/quest.json) | Correct currently admitted SQL through existing participant/TX1 owners or explicitly refuse unsupported behavior. The broader Queryable Core journey remains 0.5. |
| [Retained-read generation custody](../quests/retained-read-view-generation-custody/quest.json) | Continue completed paged-call work through the database/partition lifetime owner, real WAL retention and exact-generation close acknowledgement. Coordinate snapshot replacement and all reader classes. |
| [PG wire description contract](../quests/postgres-wire-description-contract/quest.json) | Correct descriptions for admitted statements through the existing adapter and canonical SQL core. Broader cancellation, call alias and driver qualification remain 0.5. |
| [Canonical census owner redrive](https://github.com/psvensson/lagrange/blob/dc29d85bedbbe4310bfcd4cf7e46e8b65a654b2d/solve/quests/retained-priority-census-owner-redrive/quest.json) | Existing sealed, unmerged WIP record. Preserve its scope/authority constraints and distinguish absent, not-derived and unavailable evidence before composition; do not recreate the Quest. |
| [Checkpoint epoch and generation](https://github.com/psvensson/lagrange/blob/df2ead4f6bc069b1d6def9bb2a236ed868fb999b/solve/quests/partition-checkpoint-epoch-generation/quest.json) | Existing sealed, unmerged owner. Preserve full cadence, dispatch/install, failure and bounded re-ask acceptance; narrow custody approval is not whole-Quest acceptance. |

The last two links are immutable preserved records, not files or passed gates on
main. Integration must reconcile their existing seals, scope constraints, full
logs and candidate applicability before admitting them. Q12 requires the six
new bounded receipts and both existing owner outcomes explicitly; its amended
unsealed `doneWhen` matches this epic. No replacement service predicate is added.

Execution isolation is a measured follow-through under the
[pilot epic](pilot-readiness-and-public-proof.md), initial completion 0.5. Guests
already use workers; first prove the actual synchronous native SQL boundary and
interrupt capability. Extend existing atomic statement outcomes and TX1 rather
than creating another ledger. Per-shard WAL pins do not prove a global cut,
and cancellation does not undo committed apply. The
[preserved retention epic](https://github.com/psvensson/lagrange/blob/dc29d85bedbbe4310bfcd4cf7e46e8b65a654b2d/solve/epics/system-table-retention.md)
and its
[statement-outcome proposal](https://github.com/psvensson/lagrange/blob/dc29d85bedbbe4310bfcd4cf7e46e8b65a654b2d/solve/quests/partition-statement-outcome-retention/quest.json)
remain stabilization-owned 0.5 planning inputs. Their checker and source census
are not installed or newly measured on main by this change.

```mermaid
flowchart TD
  P0[Reconciled baseline and owners] --> Q1[Authoring and producer fidelity]
  P0 --> Q2[Review and paired-proof binding]
  P0 --> Q3[Report classification]
  P0 --> Q11[Legacy and fallback closure]
  Q1 --> Q4[Management authority]
  Q1 --> Q5[Completion observation]
  Q1 --> Q6[Policy currency]
  Q1 --> Q7[Routing freshness]
  Q1 --> Q8[Formation progress]
  Q1 --> Q9[Natural shutdown]
  Q3 --> Q8
  Q3 --> Q10[Lab and evidence custody]
  Q1 --> Q12[Frozen composition acceptance]
  Q2 --> Q12
  Q3 --> Q12
  Q4 --> Q12
  Q5 --> Q12
  Q6 --> Q12
  Q7 --> Q12
  Q8 --> Q12
  Q9 --> Q12
  Q10 --> Q12
  Q11 --> Q12
  Q1 --> Q13[Catalog authority and visibility]
  Q1 --> Q14[CDC recipient identity and debt]
  Q1 --> Q15[Cache incarnation coherence]
  Q1 --> Q16[Actual ingress admission]
  Q13 --> Q12
  Q14 --> Q12
  Q15 --> Q12
  Q16 --> Q12
  F[Existing three-node formation Quest] --> Q12
  Q12 --> C[Existing comparison epic]
```

Diagnosis does not wait for every tool change. Q2/Q3 tooling and Q10 runner work
can proceed independently of runtime investigation. Q4-Q7 get separate writers
only after shared gateway/projection contracts are mapped. Q8 has one writer
across the complete transition; Q9 must coordinate if it touches that lifecycle.
Q13/Q15 share cache ingress and reconciliation and require one coordinated
writer; Q16 admission also includes its cache and request-context binding.
Count review, test and integration waits as WIP. Integrate one accepted
interaction at a time and record discovered causal dependencies here.

## Independent review reconciliation (10 November)

The second review supplies four concrete product interactions that the first
Q1-Q12 plan did not isolate adequately. Source inspection at `947fbe658` supports
the mechanisms below; the local runtime files are unchanged by this planning
branch. The report's behavioral witnesses remain verifier-reported: the linked
Library text/ZIP returned login pages and were not retrieved, and this session
ran no runtime reproduction. The reported seven green files/561 assertions are
not promoted to current independent execution evidence.

| Finding | Source-backed gap and disposition |
| --- | --- |
| Q13 catalog authority | The metadata consumer requests owner-local/owner-RPC empty confirmation without required leader authority, checks array-shaped rows rather than complete authoritative scope, and can classify raw fetch results as FOUND/applied while tombstones fence visibility. Repair the consumer and reconciliation contract together; retain genuine absence and stale-replay protection. |
| Q14 CDC recipient identity | Cached latency groups are mapped, but raw tree order is unioned as required message-group targets. Progress retains omitted captured groups. Repair all input mapping and already captured invalid bindings as one obligation-preserving interaction, using the real tree in both propagation modes. |
| Q15 incarnation coherence | Shared stale backfill can fill successor gaps from predecessor fields before the downstream identity guard sees the row. Fence merge/lifecycle advancement before provenance is lost and inspect the actual mutation payload. Durable corruption or quorum loss is not established. |
| Q16 actual ingress | The first local endpoint from mixed PostgreSQL/admin discovery decides admission; the cache is keyed only by table. Preserve actual service/protocol/incarnation through selection, caching and query dispatch, rather than search for any ready endpoint. |
| Comparison C1/C2 | Existing proof binding correctly rejects reformed deployments. The benchmark still needs a supported reset preserving the deployed cohort, and the TiDB runner still lacks required canonical case execution. Their implementation belongs to the existing comparison epic. |

The local branch graph confirms that `947fbe658ebb2efe993900b672ded51d5610dbcb`
and WIP `386644a2109bf2cc7847ee2b4a6002a7ad872e7f` diverge from
`c8215e322cbd1347f50297b7cfa5b6c669fae52a`. The WIP's later timestamp is not
integration precedence. The integrated active-read policy repair must survive
composition; Q6 records its exact source blob and adverse response-order witness
through `PriorityPublicationSafetyRows.getCriticalMinReplicaCount`, with ABA and
eviction controls. Source divergence was checked; this session did not execute
that witness or a destructive REMOVE.

These defects are candidates for the service's causal investigation, not proof
of the complete formation failure. Q8 must still trace the first divergence.
The original quorum, completion, routing, shutdown, custody and global removal
obligations remain open unless their own evidence discharges them. Additional
repairs do not waive the unchanged physical three-consecutive-run service seal.

## Reuse and scope boundaries

- [committed-readiness-fixture-custody](../quests/committed-readiness-fixture-custody/quest.json)
  retains its sealed readiness fixture proof; Q1 adds authoring/type-check
  prevention, not another fixture owner.
- [required-entity-operation-observation](../quests/required-entity-operation-observation/quest.json)
  retains its required entity-read seal. Q5 covers canonical completion and
  the remaining ordinary/per-operation callers excluded by that earlier repair.
  Coordinate the existing
  [system-table-row-decoders](../quests/system-table-row-decoders/quest.json)
  and its caller Quests before changing their shared boundary.
- [partition-placement-declared-target](../quests/partition-placement-declared-target/quest.json)
  retains its placement/policy proof. Q6 first verifies the current active-read
  repair and extends proof only where its actual currency contract requires it.
- [fallback-branch-coverage-census](../quests/fallback-branch-coverage-census/quest.json)
  and [comparative-benchmark-evidence-repair](../quests/comparative-benchmark-evidence-repair/quest.json)
  remain completed claims at their recorded scope. Q10 verifies current custody,
  execution, deployment binding and applicability; it does not reopen their seals.
- [code-navigability-and-mistake-resistance](code-navigability-and-mistake-resistance.md),
  [dead-fallback-retirement](../quests/dead-fallback-retirement/quest.json) and
  [live-dual-path-classification](../quests/live-dual-path-classification/quest.json)
  remain the existing bounded inventory/retirement owners. Q11 reconciles all
  maintained executable paths and global closure, including classes and paths
  beyond those limited probes. Register independent per-owner removal Quests
  where needed, without duplicate writers; include them in Q12 before closure.
- The original formation Quest alone owns the existing three-node user journey.
  Q8 is a bounded causal repair, Q9 adds natural-exit proof, and Q12 consumes
  their evidence. A local five-process diagnostic is not physical qualification.

## Completion and comparison handoff

The epic stays open until all required prevention and bounded repair work is
independently verified against applicable inputs, the original three-node receipt
passes its unchanged three-consecutive-run requirement on the frozen candidate,
natural shutdown and final custody/gates pass, and Q11 reports zero unresolved
legacy/fallback violations and zero unclassified candidate sites across its
repository-wide inventory. Classification, routing a violation to another Quest,
renaming a branch, a coverage gap or raising a ratchet does not close removal.
Legitimate defaults and owned representation conversion require a semantic
justification; they cannot conceal an alternate decision algorithm.

Use current source/caller evidence and meaningful negative controls, with safety,
progress after finite failures and bounded resources at the necessary deterministic,
native and physical layers. No deadlines, safety floors or service predicates are
weakened. Independent review returns all material findings for the interaction;
repeated rejection triggers causal/design reassessment, not another speculative
patch. Completed bounded repairs remain accepted within their measured scope
when a later service gate fails; the epic remains open for the named blocker.

The separate successor is
[developer-journey-and-measured-comparisons](developer-journey-and-measured-comparisons.md),
with its own public workload, five-node topology, actual deployment and semantic
qualification. The superseded matrix is not an execution owner. Three-node
formation, local diagnostics, comparative performance, publication and release
remain different claims. This planning installation authorizes none of their
unexecuted acceptance results.

## Evidence and historical research

The reassessment was captured from `947fbe658ebb2efe993900b672ded51d5610dbcb`.
Q12's append-only log records the retained local assessment/manifest locations
and hashes; no raw logs, copied source trees or fabricated run results are added
here. Q8 and Q9 name the relevant historical failure families in their records.
The existing service receipt and Quest log retain the original red acceptance.

Primary-source comparisons inform the design, not proof of Lagrange behavior:
[Raft membership](https://raft.github.io/raft.pdf) and
[etcd learners](https://etcd.io/docs/v3.5/learning/design-learner/) motivate
consuming the actual consensus configuration and transition evidence;
[FoundationDB's simulator](https://www.foundationdb.org/files/fdb-paper.pdf)
motivates faithful fault witnesses through production owners;
[checkJs](https://www.typescriptlang.org/tsconfig/checkJs.html) supports a bounded
concrete producer/consumer pilot. Configuration alone is not live quorum, a
parallel model is not production proof, and typing does not prove temporal safety.

## Historical milestone and integration baseline (4-6 November)

- **Assigned version milestone:** `0.4.1` (`RM-0.2.9-published-operating-contract`
  in `docs/development/agpl-feature-map.md`), the immediate bounded correctness
  and stabilization release following published `v0.4.0`
  (`07206ba1c8bb396f4eb097a753915bb34580d824`).
- **Preserved successor dependencies:** `0.5` retains five-node comparative
  qualification (`RM-0.4-wasm-public-comparison`, `RM-0.4-scenario-a-comparison`),
  standard HTTP/Hono service authoring (`RM-0.5-standard-http-service-api`), and
  full Queryable Core completion (`RM-0.2.9-stable-core-completion`). Three-node
  formation correctness in `0.4.1` does not claim five-node comparative
  performance.
- **Integration owner:** the current local integration session on
  `work/composed-05-comparison-readiness-20261103`, composing the reviewed
  `work/formation-takeover-20261105` lineage and resuming from the 6 November
  handover at `3bd7e2e8875c5ff32fd94162a3775aea991a35df`.
- **Reviewed baseline SHA:** `77e5b4c5ba01826f2ddceecb088f56fcd27b436e`.
- **Starting candidate SHA at E0:** `63e4a854b783d4b3176b3ecd123677384c96fafa`
  (one commit ahead of `77e5b4c5ba01826f2ddceecb088f56fcd27b436e`, landing
  `ServeEligibilityOwner` published-only epoch ratchet, required-domain node
  readiness completeness in `ControlPlaneReadinessService`, and bounded causal
  aggregation in `ControlPlaneDiagnosticsLedger`).
- **Retained red baseline and quests:** preserves
  `solve/quests/fresh-formation-user-table-routability/quest.json` (red physical
  run `multi-host-lab-run1-20261101T2118Z` retained in relocated bundle
  `comparative-benchmark-evidence-repair--comparative-benchmark-evidence-repair-evidence-435c426b9-2026-11-01.tar.gz`),
  `solve/quests/serve-eligibility-committed-epoch-read/quest.json`,
  `solve/quests/fresh-create-release-authority-from-committed-operation/quest.json`,
  and `solve/quests/replica-admission-from-committed-operation/quest.json`.

### Recorded integration status (6 November)

Resumed after the 14:44 UTC / 15:44 CET handover checkpoint on 6 November
(`/home/peter/Downloads/lagrange-handover-20261106T144624Z/`). The H1 and H2
proof corrections from `independent-planning-implementation-hold.md` are now
complete, including the retained-evidence fixture at
`readiness-planning-snapshot-identity-owner.test.js:854-865`, and the two-file
planning proof passes (2/2 files, 31 reported assertions) alongside all 33
static audits. Rule-set revision 5 remains in force; committed planning proof,
remaining causal repairs, E8, E9, publication, main merge and comparative
measurements remain open.

The two work branches diverged after `fffd9add`. The reviewed composition was
committed and pushed as `4024a23e7`, retaining all seven takeover commits through
`5e1d3223f` together with the composed branch through `827f7be7d`. Production
edits do not overlap. Both
lineages of the formation Quest log are retained byte-for-byte, in their
original order; earlier timestamps below are historical evidence, not current
acceptance. Generated inventories and test metadata are regenerated from the
combined tree.

The takeover contributes schema-job retry custody for temporary provisioning
refusals (`79088e840`, simplified by `9f9e03926`), retained serving-owner source
wakes without the 100 ms polling arm (`340e34e48`), exact FAILED lifecycle/replay
custody and the nested epic YAML parser (`9ee285e1a`), and committed-node lease
consumption without cache fallback (`5e1d3223f`). Its diagnostics/CDC helper
extractions and genuine three-process no-admin witness (`2f344fde5`), plus
startup-owner evidence (`d717874ca`), are retained. The bounded completed-handoff
E3 witness and its disabled-trigger control remain separate from the new
three-process proof. The E6 every-ACK negative, native proposal-count proof and
seven-field E7 accounting remain intact.

The three bounded prerequisites `explicit-single-replica-partition-configuration`,
`parallel-query-read-authority-propagation` and
`admin-diagnostic-owner-consolidation` have each passed independent review and
normal `solve.js land`. Their receipts bind their bounded evidence to source
`26f786b2`; none closes E8, E9 or publication. The takeover's broader gates
remain red: 25 failed files in its 1,350-file change cone, plus six distinct
failures in the earlier Q6 set. Reproduction on a predecessor does not waive
any of these failures. Final F10 liveness lab proof, startup/replay Quest
landing, combined-tree verification and broader publication proof remain due.

The pre-composition transaction-facade failures are retained. The single permitted
unchanged `26f786b2` standalone retry again timed out at I2.1. A separately
instrumented, product-source-identical diagnostic passed I2.1 but failed I2.2b
(expected one callback step, observed zero; 48/49 TAP assertions passed).
Complete logs show `replica_operations-p1` release refusing
`current_control_owner_fact`, then recovering after about a minute. This is
bounded-progress evidence, not proof of a permanent deadlock or of the exact
nested control-owner cause. Tracing the declared priority target and table-policy
authority, and examining the existing release owners, remain investigations;
no speculative cutover repair or deadline relaxation is admitted. The unchanged
transaction fixture passes on composed `4024a23e7` (58 runner assertions,
106,454 ms, first attempt on TV); this does not identify which change affected
its outcome.

All 33 static audits pass on `4024a23e7`. Its 17-file composition proof on Lenovo
passes 16 files (1,372 total reported assertions). The genuine three-process
no-admin witness fails at the application CREATE probe: quorum remains
unavailable within the existing 68,702 ms factor-scaled bound. All three guards
report `installed: true, calls: []`; six retained log/guard files match their
remote hashes. The complete package manifest is
`sha256:36cf52246105c954ec61abd2002e3532931544b285fce33c2686839488977ea4`.
No retry of that combined-source formation witness has been submitted, and E8
remains red.

A separate real-owner discriminator now exposes the historical S6b target
divergence: actual seeded system partition rows and readiness declare RF3,
while table policy with the explicit RF1 application default feeds RF1 into
the actual planner, which emits REMOVE r2 for both `replica_operations` and
`sql_transactions`. Supplying only the existing declared-target answer makes
both planners emit no move. The sealed `partition-placement-declared-target`
repair now projects that sole declaration through table policy, the planner
and coordinator. It removes the alternate table target field, inert setter
APIs, clamping/default target paths and unavailable-policy permission. Admin
and CREATE reject unsupported target requests before effects. Real-owner
local witnesses cover declared RF1/3/5/9, finite policy-read recovery through
the existing scheduler with a disabled-trigger negative, and minimum-five
REMOVE refusal with retained retry custody. Shared policy test fixtures have
one implementation. Independent implementation review, frozen lab proof and
normal Quest landing remain required; this is not E8 or E9 acceptance and
does not explain the separate default-RF3 three-process failure by itself.

Adam's completed migration keeps both active container stores and rollback data
under `/mnt/old/lab`; the last direct check found 12 GiB free on root and 52 GiB
on `/mnt/old`. E9 retains `adam-laptop,lenovo-laptop,tv-dator`, the same physical
scenario and three consecutive fresh-state successes on one final candidate.
The takeover's temporary `adams-gamla` substitution and low-space warning are
historical. No current-candidate E9 run, publication, main merge or comparative
measurement has completed. Comparative measurements follow the main merge.

### Recorded proof package (6 November)

Current integration status: the takeover history is composed and the three
bounded prerequisite Quests have terminal land records. `51269c445` preserves
the lab inventory temporary-file race repair and partition-target fixture
corrections. `b15227816` consolidates readiness test-port construction and
supplied-port custody. `8b08183a7` carries the independently reviewed required
entity-operation observation repair and seven caller-fixture corrections.
Its frozen affected selection reports **1,095 passing files, 40 failing files,
and 43,906 reported assertions across 1,135 files**. This is not the full corpus.
Collected logs and their byte-verified manifest are retained under
`test-output/verification-20261106-partition-target/operation-observation-frozen-callers/`.
Same-host `b15227816` controls reproduce 27 of those failures; 13 files pass
the predecessor, including 12 corrected fixture callers and a retained-seed R1
timeout still under investigation. Neither inherited redness nor a predecessor
pass establishes a cause by itself. The independently reviewed `2b446a7ce`
checkpoint consolidates coordinator construction, storage result construction,
and gateway session forwarding. All 33 static audits pass. Its frozen Lenovo
run passes 30 of 31 files (1,451 reported assertions): all 27 ordinary files,
message-group routing and two partition-policy integrations are green.
Membership-consistency Test 7 now passes, but the file exhausts its unchanged
240-second parent bound at Test 15 after repeated bootstrap delays; that failure
remains open. Logs and checksums are retained in `coordinator-fixture-frozen/`.

Four inherited contract repairs and `system-cache-reconciliation-ingress` are
committed in independently reviewed checkpoint `61ce6e979`: explicit S6a
planner-witness supersession, dead query vocabulary removal, committed readiness
fixture construction, removal of the helper-hidden SQL target trust fallback,
and one private write primitive in the existing cache reconciliation owner.
The prior-source negatives remain retained. The exact committed-tree Lenovo
check passed all 18 focused files with 1,477 reported assertions, attempt one
without retries; `cache-and-contracts-frozen/` retains the logs and byte-verified
manifest. Committed applicability binds the reviewed manifests to that tree.
All 33 static audits passed the reviewed source. The canonical source-range
selection from `2b446a7ce` to `61ce6e979` contains 1,880 files and remains owed;
a later receipt-only change cannot replace that implementation proof. No Quest
or epic receipt is admitted by the bounded results.

The real three-process no-admin witness passed on `205b5683f` at Lenovo's measured
factor 2.3 with zero guarded admin calls. Its predecessor used factor 1.4, so this
is bounded candidate evidence, not a same-budget causal comparison or E9.
`committed-node-remove-safety-wake` now owns the confirmed R17 floor/wake defect:
the workflow cache receiver is unbound, projected floor credit competes with
committed authority, and unavailable evidence must defer before the source-not-
counted SAFE exit. Its independently approved design is implemented in the
current worktree. The first independent implementation review held missing
replica identity admission, unrelated initiator dependencies, mutable intrinsics,
nested row custody, a masked clock assertion and explicit interaction registration.
The follow-up approved four findings but retained HOLD on outer/scalar evidence
admission and mutable map reads through floor credit. Those remaining paths are
corrected in manifest `11308747`; both earlier reviewed byte sets and failed
controls are preserved. The expanded 40-file caller check passes with 3,068
reported assertions, and the unchanged reviewer counterexamples now refuse the
hostile inputs without changing shared identity. All 33 static audits pass.
Independent review `7af63aa2` approves those exact bytes for normal WIP checkpoint
and frozen proof. Committed applicability was verified at `ab55403b`; its
first frozen Lenovo schedule passed 39/40 files and retained the completion
file's unscaled 30-second TAP root timeout. Same-host single-file diagnostics
passed on both parent and candidate without changing their source. The separate
`tap-default-machine-factor-portability` repair owns that execution defect.
Its reviewed and committed `d511e4f0` candidate passes the original 40-file
schedule with 3,068 reported assertions and no retries; the completion file
passes 147 assertions in 33,095 ms process duration. Fresh machine factor 2.4
differs from the prior 2.3 and is recorded, not presented as identical-budget
causal evidence. Independent applicability `325afcdb` verifies the committed
inputs and bounded result. Full source-range/runner proof and receipts remain
required before closure.
The bounded bulk-readiness domain repair removes only unconditional observer-ID
injection. Both bulk readers retain published, required and observed nodes,
including negative missing-row entries. Two focused files pass 163 assertions and
all 33 static audits pass; independent review 59cec4ff approves the three-path
manifest 0a346fe6 for WIP checkpoint. Exact committed applicability at 502c603f
and its first-attempt Lenovo frozen proof (2 files/163 assertions) are approved
by 4dafa304. The strict-hydration fixture now supplies the actual cache and one
explicit router, reaches the real missing-SERVICES verifier and prevents mode
swap; its two files/11 assertions and owned teardown are independently approved
by 9a3a85f9. Exact 6cd5753f committed/frozen applicability is approved by
c5c95acb (2 files/11 assertions, first attempt). This remains a fixture
correction; full source proof and receipt admission are still due.
The unchanged predecessor has three inherited readiness callers red: two
planning identity/build-cost witnesses and the missing-both-rows self-grace
fixture. Planning custody now reduces whole-rig builds from 685 to 565 while
preserving the 1,020 observed readiness results, and its corrected two-file
proof passes 31 reported assertions; committed `ad0d64de` and its first-attempt
Lenovo frozen proof (2 files/31 assertions) are approved by `5e8512cf`. The
missing-both-rows self-grace contract (`readiness-self-grace-service-evidence-contract`)
is committed at `e8fd1cc6`, passes the frozen 28-file readiness caller proof on
Lenovo (28/28 files, 2,738 reported assertions, first attempt), and is
independently approved (`independent-e8fd1cc6-applicability.md`). Operation-bound
failed-create cleanup claim normalization (`failed-create-cleanup-claim-normalization`)
is committed at `6317f224`, passes the frozen 9-file cleanup and admission proof
on Lenovo (9/9 files, 359 reported assertions, first attempt), and is
independently approved (`independent-6317f224-applicability.md`). The remaining
retained source-cone fixture and host-factor repairs (`cluster-test-helpers.js`
partition forwarding, `replace-source-removal-owner.test.js` readiness fixture,
`single-path-partition-cutover.test.js`, `fresh-seed-activation-public-child.js`,
`seed-migration-cutover-persisted.integration.test.js`,
`critical-replica-placement-causal-trace.integration.test.js`, and
`membership-consistency.integration.test.js` machine-factor scaling) are locally
verified and ready for independent review and frozen lab proof. The existing
semantic owner now distinguishes invalid lease data from explicit clearing;
committed node authority supplies floor credit and the existing retained owner
subscribes to meaningful committed changes. The bounded real-owner witness
holds planning deliveries and fallback timers in both arms: disabling only the
committed subscription prevents progress, and releasing the held planning
notification provides the separate recovery control. This isolates that trigger's
contribution without claiming it is production's sole trigger.
Its record explicitly supersedes the exhausted predecessor Quest's lease-zero
carve-out without editing that terminal history or its separate five-node gate.
The adjacent cached SERVICES topology fallback/merge is recorded separately and
is not endorsed as authoritative. The bounded runtime-definition/CREATE repair
now has one canonical policy and one explicit authoritative keyed read, with
retained-origin precedence. The shared Binding owner validates generated version
identity and canonical declaration digest; invalid lineage cannot grant placement
or CREATE. Local expanded proof passes 25 files/792 reported assertions, followed
by 2 files/94 after mechanical test corrections, and all 33 static audits. The real
coordinator recovery witness holds then runs its retained retry callback after a
finite authority failure, preserving the durable operation and replica identity;
its scheduler and persistence boundaries are controlled. Independent review
`71b2104e` approves exact content manifest `337b3a6b` for WIP checkpoint only.
Exact committed applicability at 04459151a is approved by 5231611c, and its frozen
Lenovo 25-file schedule passes 792 reported assertions on the first attempt.
The separate public Binding journey on 04459151a fails before application CALL:
sys-postgres-wire never publishes its endpoint and CREATE repeatedly reports
service_definition_authority_unavailable. Diagnostic-only 339a5463, with product
bytes unchanged from 04459151a, observes the actual handler missing its gateway.
ControlPlaneSetup created the owner without returning it, and seed/join did not
retain it for guarded runtime setup. The bounded repair returns that exact
owner and shares its seed/join handoff, checks the named gateway prerequisite
in the existing startup gate, and clears the retained reference through existing
cleanup owners. Seven focused files/334 assertions and all 33 static audits pass.
Committed `3bd7e2e8` passes the public Binding journey (one file/70 reported
assertions) and the first executed frozen focused batch (31 files/1,117), both
on Lenovo without retries. Independent committed applicability `31d8337a` and
focused addendum `0e464513` approve these bounded claims. The initial wrapper
finished the public journey, then failed before focused planning by reusing a
released source snapshot; its exit-1 disposition is retained. The focused batch
used a fresh snapshot of the same SHA. Full source-range proof and formal receipt
admission remain required. The old-source negatives and independent
malformed-lineage failures remain retained. Readiness diagnostics now attribute
100 additional heavy builds to nested fresh bulk evaluations during publication
planning, not the unexecuted background queue; the required-node output contract
must be preserved while repairing that cost. Other retained reds, final E8,
unchanged E9, publication and main merge remain open. The current
integration session owns the committed planning proof and remaining causal
repairs.
Comparative measurements follow acceptance and main merge. Adam's active stores
remain under `/mnt/old/lab`; a fresh fleet check reports about 52 GiB available
there, and the migration rollback is retained.

- Candidate base: `fffd9addfd600cf58bc0c40b1c7df43d5ba4a899`, clean on takeover;
  rule-set revision 5. The user-provided evening review accepts the bounded
  production repairs in E1, E2, E4, E6 and E7. Their existing adverse schedules
  remain retained; this does not complete E8 or E9.
- E3 now has a bounded completed-placement handoff witness in
  `test/admin/completed-placement-autonomous-progress.test.js`: terminal ADD
  and stale target visibility are initial conditions. A settled SERVICES read
  refusal clears, the existing membership driver and CDC hydration wake the
  real priority-visibility listener, and the publication owner persists a
  satisfied priority summary through the gateway into SQLite. No new ADD
  execution is claimed. The first admin read follows durable assertions.
  Its disabled-trigger negative must remain unresolved for the same 40-second
  virtual recovery bound, preserving the production 5-second driver and
  30-second catch-up cooldown.
- E6 validates **every** proposed `CDC_DELIVERED` command before measuring it;
  adding a 257-event ACK to otherwise valid batches must fail measurement.
  Router deliveries retain a separate transport-count assertion.
- E6 proposal cost is bound to
  `test/topology/cdc-group-propagation-proposal-cost.test.js`:
  `K = 4` distinct source event waves, `M = 3` message groups **including the
  source**, `c = 1`. The healthy schedule has sequential waves, native RF1
  group leaders, no injected faults or leadership changes, and timely native
  application. Count every call to each real consensus port's `propose`,
  including any refused or retried attempt, after group setup. The measured
  bound is `proposals <= c*K*M` (12), with native applied-index advancement
  and cache effects on every group. This counts CDC propagation proposals;
  source-partition SQL/`CDC_DELIVERED`, setup and membership proposals are
  excluded. The negative doubles real native proposals (24) while transport
  stays at eight deliveries and must reject the same bound. This is a
  component/native healthy-schedule claim, not physical performance evidence.
- E7 names the outward seven-field accounting below. E8 final committed-tree
  focused/process-isolated proof and independent verification, and E9 three
  consecutive fresh-state physical runs remain open. The formal receipt stays
  failing until its existing obligations have evidence. Continuation owner:
  the current local integration session; no physical run has yet been submitted.
- E8 on frozen `0bafa0f3e5fba82ab6b580d3f2bc185f70dddf01` passed 28/29
  files on tv-dator (2,130 reported assertions). The one-runtime embedded
  public-seam fixture requested default RF3 and correctly received
  `PROVISIONING_UNAVAILABLE`. The bounded prerequisite
  `explicit-single-replica-partition-configuration` makes RF1 an explicit
  public startup choice for that fixture while retaining default RF3 and
  its requested quorum. The new configuration regression is red on the
  previous schema. E8 must run again on the resulting frozen candidate.
  The earlier E3/E6 content approval is retained, not promoted to E8 approval.
- E9's archived registered red baseline has been recovered and its two
  bundle hashes verified. The first-divergence receipt still needs the
  same-learner authoritative SERVICES/cache observation identified in the
  historical H1 investigation; the current reviewer is checking retained
  owner diagnostics. Three future green runs alone cannot supply that causal
  observation. This does not change any physical acceptance predicate.
- E8 on frozen `1bbbe17dcec3db9c93eb846e9d70f36c0d8d7bf2` passed all
  30 focused/process-isolated files on tv-dator (2,326 reported assertions)
  and received exact-candidate independent approval. Later fixture and
  diagnostic changes require a new frozen verification; this result is not
  current-candidate or whole-corpus acceptance. Two additional public fixtures
  on `5d678fca9c22ff4bf10b0a04e93928246d58111e` passed with explicit RF1
  (transaction facade: 58 assertions; consumer contract: 123 assertions).
  The new default-RF3 fixture observed the specific provisioning refusal and
  retained RF3, then timed out on a follow-on INSERT; that failed attempt is
  preserved and is not counted as a passing file.
- Three bounded historical H1 attempts remain unadmitted. The first used a
  different seed placement; the next two used the original tv-dator/Adam/
  adams-gamla placement. The admin log feed missed native refusal events;
  the corrected container-stdout observer captured them. The original SQL
  shape still used a local-cache shortcut. A corrected routed DISTINCT read
  returned rows but no authority witness because the existing parallel-query
  success mapper dropped that field. The bounded diagnostic prerequisite
  `parallel-query-read-authority-propagation` forwards the serving owner's
  supplied evidence through ordinary and speculative success. It does not
  change formation decisions or retroactively admit unwitnessed observations.
  Historical diagnostic runs are separate from E9's untouched physical gate;
  no current-candidate E9 run has yet been submitted.
- E8 on frozen `6b0d1f2ae3e84c5045cab6448bca93247de79264` passed all
  36 files on tv-dator: 2,708 reported assertions, each file on its first
  attempt. Independent review verified the retained manifest, source hashes,
  worker identity and clean candidate. The default-RF3 negative ends at its
  scoped CREATE refusal and retained RF3; it makes no INSERT latency claim.
  Subsequent admin source consolidation requires a fresh frozen E8 binding.
- The fourth historical run on `e5770352` plus the explicit read-witness
  diagnostic overlay reproduced red in 553,301 ms. Independent review admits
  the prescribed H1 observation for two current learners: witnessed SERVICES
  leader rows, complete seed cache absence brackets, and later same-key
  address refusals whose synchronous resolver had no usable mapping. A third
  capture observes arrival within the bracket and is classified separately.
  The earliest logged visibility-bound breach and repeated CDC holds are
  retained; identifying the precise withholding obligation/subscriber and
  binding the repair to that cause remain distinct from this observation.
  Full logs, report, raw envelopes and review are retained in the
  [verified H1 evidence archive](https://github.com/psvensson/lagrange/releases/download/solve-evidence/fresh-formation-user-table-routability--h1-authority-e5770352-diagnostic-20261106.tar.gz)
  (SHA-256 `580c684639ae62838ef17f83cfacc1994d784700474be908e2faebde833eb9a9`).
- Adam's user-run storage migration is complete. Docker and containerd use
  `/mnt/old/lab`; root has 12 GiB free and `/mnt/old` has 52 GiB free after the
  historical run. Original stores are retained in the migration rollback
  directory. This removes the storage prerequisite, not the formation gate.
- The publication ratchets reproduced 1,726 complexity violations against
  1,720 and source duplication 40 groups / 1,267 lines against 39 / 1,236.
  Bounded Quest `admin-diagnostic-owner-consolidation` removes two exact
  diagnostic clones, shares CDC diagnostic reads and separates per-partition
  projection from aggregation. First measurements are 1,720 complexity
  violations and 38 duplicate groups / 1,207 lines; the duplicate baseline is
  tightened on the checker's hint. Independent review and committed lab proof
  remain required. No physical E9 sequence, publication, merge or comparative
  measurement has been completed.
- Expanded E8 at `de8ccfe430d7836a3ba69df41112089b81573f59` passed
  39/40 files (2,856 reported assertions). The added outward admin fixture
  alone expected an ACTIVE target service to hide a CREATING ADD. The same
  two failures reproduced at `6b0d1f2` on the same tv-dator host; the liveness
  owner and fixture were unchanged. Its correction retains in-flight `1`
  and timeline `true`, as E3 requires. All five isolated embedded/runtime
  files passed. This red package remains retained, not accepted as E8.
- Whole static checks at `de8ccfe43` passed 31/33. The remaining unused
  pressure/timeout helper is now consumed through its existing diagnostic
  owner (unused exports 1,389/1,389). The separate bounded retry-contract
  repair removes an inherited `entity_type` alternative from the normalized
  operation decision; repository ingress already owns conversion to
  `entityType`. Its authority guard passes without changing retry budgets or
  canonical runtime-service retry behaviour.
- Candidate `26f786b202b5b8614d6fc927f6d457be75273d4f` passes all 33
  whole-tree static audits. Its expanded E8 package passes 41/42 files
  (2,888 reported assertions); the first transaction-facade request times
  out and later assertions cascade. The unmodified predecessor `de8ccfe43`
  reproduces that first timeout on the same TV host. Both red runs are
  retained. Warning logs show operation-ledger writes paused after membership
  removal; a separate INFO-level diagnostic must establish the release
  owner's refusal before assigning a repair. No timeout, hold or acceptance
  condition has been relaxed.
- The same `26f786b2` passes ten additional causal witnesses on Lenovo
  (348 reported assertions), independently verified. Existing accepted
  learner/admission/peer repairs implement H1's prescribed alternative:
  the decision reads committed authority instead of awaiting a cache row.
  The historical witness and accepted rejecting controls support that
  boundary; they do not identify a particular CDC subscriber's withholding
  mechanism. Full E8, unchanged E9, receipt admission, publication and merge
  remain open. Comparative measurements follow the main-branch merge.

## Approved user-visible contract

1. **Fresh three-node formation:** each node's serve lane opens from committed
   authority (`serveEligible: true`), all six priority partitions reach
   `readyDistinct == required`, and `replica_operations` reaches `0` in-flight
   for the registered quiet window.
2. **Approved `CREATE TABLE` contract:** completes at the sealed committed
   quorum-minimum cohort with a visible typed `under_replicated` outcome when
   appropriate, returns typed `57P03` (`PROVISIONING_UNAVAILABLE`) below quorum,
   and retains responsibility for completing replication.
3. **Public SQL routability:** `SELECT COUNT(*)`, `INSERT`, and readback succeed
   from every node with zero `learner_address_unresolvable` refusals for
   durably committed learners.
4. **Observational purity:** diagnostics and readiness/snapshot observers
   observe progress without mutating product caches or causing convergence.

## Historical E0-E9 work package map (6 November)

These statuses describe the earlier composition; the current summary and linked
Quest evidence above govern continuation.

| Work package | Invariant | Production owner | Retained obligation / trigger | Test and evidence | Status |
| --- | --- | --- | --- | --- | --- |
| `E0` Candidate & baseline | Single version milestone (`0.4.1`), one composed candidate from `77e5b4c5b`, preserved quest seals and successor links | `solve/epics/operation-integrity-and-reliable-formation.md`, `docs/development/agpl-feature-map.md` | Keep epic/quest/roadmap alignment current at each package boundary | `npm run audit:roadmap-authority`, `node scripts/solve.js board` | Complete (`572461011`) |
| `E1` Authority & metadata meaning | Preserve `ELIGIBLE`/`INELIGIBLE`/`ABSENT`/`UNAVAILABLE` definition outcomes; decisive SQL authoritative absence vs unavailable routing; sealed quorum-minimum initial partition provisioning without observed-singleton RF3 downgrade; `PUBLISHED`-only epoch floor; complete `SELECT` plan propagation and post-overlay routing snapshot repair | `src/node/runtime-service-definition-resolution.js`, `src/node/runtime-service-generic-replica.js`, `src/control-plane/serve-eligibility-owner.js`, `src/query/sql-query-engine-metadata-authority-refresh.js`, `src/query/sql-query-engine-initial-partition-provisioning.js`, `src/query/sql-query-engine-provision-target-methods.js`, `src/query/query-executor-partition-routing-snapshot.js` | Authoritative SQL absence overrides and evicts stale cached presence; RF3 sealed quorum minimum (`2`) never downgrades to `1` on observed singleton node count; `awaitPostOverlayRoutingRepair` passes positional `routingReadinessDimension` through the overlay/serve-refresh chain | `test/node/runtime-service-handler.test.js`, `test/query/sql-query-engine-cold-metadata-plan-coherence.test.js`, `test/query/sql-query-engine-provision-partition-waits.test.js`, `test/control-plane/serve-eligibility-owner.test.js`, `test/control-plane/serve-eligibility-committed-epoch-read.test.js`, `test/query/sql-query-engine-execution.test.js` | Bounded repairs verified by evening review at `fffd9add`; composed acceptance E8/E9 pending |
| `E2` Role-publication freshness & voter readiness | Monotone revision-fenced role publication and shared incarnation-fenced `raft_role` preservation across durable persistence and local seeding; purpose-specific voter readiness | `src/raft/authoritative-row-mutation-helper.js`, `src/partition/partition-service-metadata-mutation-helpers.js`, `src/message-group/message-group-service-metadata-publication.js`, `src/node/replica-state-machine-lifecycle-observation.js`, `src/node/replica-state-machine-transition.js`, `src/node/replica-handler-create-status-methods.js`, `src/node/replica-handler-status-methods.js`, `src/raft/replica-voter-readiness.js` | Superseded flush revision and stale cached `raft_role` yield to current live Raft role; durable role persistence and local priority seeding share one incarnation-matching rule in `replica-state-machine-lifecycle-observation.js` | `test/raft/authoritative-row-mutation-helper.test.js`, `test/partition/durable-voter-visibility-role-write.test.js`, `test/node/replica-state-machine.test.js`, `test/node/replica-local-only-row-convergence.test.js`, `scripts/check-voter-readiness-single-owner.js` (metric 0) | Bounded repairs verified by evening review at `fffd9add`; composed acceptance E8/E9 pending |
| `E3` Causally read-only observation & honest admin liveness | Zero observer-originated product cache writes and convergence progress without admin polling; outward `inFlightCount` uses `replica_operations` terminal state without active-service shortcuts or local observer startup-time erasure of remote owners' operations | `src/cache/read-only-system-table-cache.js`, `src/node/node-runtime-local-authorities.js`, `src/admin/admin-control-snapshot-local-build-base.js`, `src/admin/admin-control-snapshot-leadership-summary.js`, `src/rebalancer/replica-operation-liveness.js` | Read-only cache proxy throws `READ_ONLY_SYSTEM_TABLE_CACHE_MUTATION` on write/reconcile; `ignorePreRestart` requires actual operation owner start-time evidence; convergence progresses without `getControlSnapshot` polling | `test/admin/admin-control-snapshot-local-published-membership-recovery.test.js`, `test/admin/admin-control-snapshot.test.js`, `test/admin/completed-placement-autonomous-progress.test.js` | Bounded handoff proof independently approved; E8/E9 pending |
| `E4` CREATE, retry, transition & cleanup custody | Post-`ACTIVE` transient progress deferral preserves live runtime; confirmed boot/attempt supersession fences and retires superseded runtime via single cleanup owner (`fenceFailedReplicaCreateRuntime`); per-call admission observation; workflow visibility across concurrent admission/membership advancement and terminal timestamp adoption; bounded mutation retry cost | `src/node/replica-create-admission-owner.js`, `src/node/replica-create-admission-retained-recovery.js`, `src/node/replica-runtime-cleanup-custody.js`, `src/node/replica-create-process-owner.js`, `src/node/replica-handler-create-methods.js`, `src/rebalancer/replica-operation-repository-mutation-persistence-methods.js`, `src/rebalancer/operation-workflow-coordinator-created-handoff-scheduling.js`, `src/rebalancer/operation-workflow-transition-retry.js` | Per-call `{progressed, row}` prevents cross-call `lastAdvanceRow` bleed; retained recovery delegates runtime unregistration exclusively to `fenceFailedReplicaCreateRuntime` and requires positive tagged/instance identity match; workflow UPDATE confirms when concurrent admission/membership owner advances its fields | `test/node/replica-create-admission-owner.test.js`, `test/node/replica-create-admission-recovery.test.js`, `test/node/replica-runtime-cleanup-custody.integration.test.js`, `test/rebalancer/replica-operation-confirmation-authority-read.test.js`, `test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js` | Bounded repairs verified by evening review at `fffd9add`; composed acceptance E8/E9 pending |
| `E5` Deferred join, config & runtime handoffs | Deferred join message-group activation retains owned retry trigger; subscribe-before-hydrate config initialization; `WasmComponentDriver.#prepareRequestCell` generation fence before and after `stop(serviceId)` | `src/bootstrap/node-joining-message-group-runtime-delegation.js`, `src/config/raft-adaptive-timing-controller.js`, `src/config/dynamic-config-service.js`, `src/runtime/wasm-component-driver.js` | Retained `deferredMessageGroupServiceReplicaIds` re-drives on bounded timer until empty or shutdown; `WasmComponentDriver.#prepareRequestCell` aborts after `await stop(serviceId)` if service generation changed | `test/bootstrap/node-joining-service-message-group-activation.test.js`, `test/config/raft-adaptive-timing-controller.test.js`, `test/config/dynamic-config-service.test.js`, `test/runtime/minimal-deployment-request-cell-runtime-readiness.test.js` | Complete (`65cc65b62`) |
| `E6` CDC fairness, exact coverage & hydration handoff | 3+ contender FIFO slice fairness with live credit retention across delayed ACK continuations and lifecycle-only contender retirement; bounded `<= 256` hydration ACK batches with actual-prefix pressure preserved; absolute retry timer deadlines (`dueAtMs`); pre-hydration invocation retirement via progress-cell `logIndex` and verified `command.acknowledged` batches | `src/topology/cdc-group-propagation-durable-delivery.js`, `src/topology/cdc-group-propagation-service.js`, `src/partition/partition-cdc-obligation-progress.js`, `src/partition/partition-cdc-obligation-delivery.js` | Reservation hold expiry (`300ms`) allows ready work without dropping a live contender's FIFO queue position or credit; actual owed-prefix pressure (`readOwedCdcHead`) bounds retained delivered rows; retry timer preemption compares absolute `dueAtMs`; `command.acknowledged` batches verified `<= 256` | `test/topology/cdc-group-propagation-service.test.js`, `test/topology/cdc-group-propagation-proposal-cost.test.js`, `test/partition/cdc-hydration-live-handoff.test.js`, `test/partition/partition-cdc-obligation-reclamation.test.js` | Bounded fixes and explicit ACK/proposal measurements independently approved; E8/E9 pending |
| `E7` First-cause diagnostics & required-domain evaluation | Bounded key-based diagnostic aggregation retaining `firstSample`, `latestSample`, original cause, boundary, owner, trigger, and explicit truncation/eviction loss accounting outward on `AdminControlSnapshot`; complete keyed readiness disposition over published required node domain | `src/control-plane/control-plane-diagnostics-ledger.js`, `src/control-plane/authoritative-node-evidence-reconciler.js`, `src/control-plane/control-plane-readiness-diagnostics-eligibility.js`, `src/control-plane/control-plane-system-table-gateway-dependency-resolution.js`, `src/admin/admin-control-snapshot-readiness-diagnostics-methods.js`, `src/admin/admin-control-snapshot-control-plane-diagnostics.js`, `src/control-plane/control-plane-readiness-service-node-methods.js` | Every required node in published membership receives an explicit readiness entry; `ControlPlaneDiagnosticsLedger` bounds payload values, preserves distinct-key root causes under secondary churn, and exposes explicit loss accounting (`evictedKeys`, `overwrittenEntries`, `droppedSamples`, `truncatedStrings`, `truncatedArrays`, `truncatedObjects`, `totalLossEvents`) outward on `AdminControlSnapshot` | `test/control-plane/control-plane-readiness-service-cluster-health-and-recovery-diagnostics.test.js`, `test/admin/admin-control-snapshot.test.js` | Bounded mechanism verified at `fffd9add`; outward field names reconciled; E8/E9 pending |
| `E8` Composed verification on faithful substrates | Deterministic repros with negative controls and process-isolated embedded-cluster verification covering E1–E7 on one canonical candidate SHA | `test/closure/registry.json`, `test/integration/helpers/embedded-cluster-harness.js`, focused unit/integration suites | Fresh independent verifier must bind approval and negative controls to the final committed candidate; earlier approvals retain only their measured scope | Focused witnesses, genuine three-process `test/integration/fresh-formation-without-admin-polling.integration.test.js`, native owner-wake negative in `test/convergence/dt6-publication-quorum-failback-network.test.js`, public application fixtures and exact-candidate independent verification `approve` | In progress |
| `E9` Unchanged physical acceptance & closure | Three consecutive green fresh-state runs of `fresh-formation-user-table-routability` on `local-three-node.json` (`tv-dator,adam-laptop,adams-gamla`) within 420 seconds each and admitted proof receipt | `scripts/lab.js`, `solve/quests/fresh-formation-user-table-routability/evidence/receipt.json` | Full node logs, harness reports, and admitted receipt bound to exact candidate SHA | `node scripts/lab.js harness run fresh-formation-user-table-routability --base test/distributed/config/local-three-node.json --nodes tv-dator,adam-laptop,adams-gamla` (x3 consecutive, frozen clean candidate) + `node scripts/solve.js probe --id fresh-formation-user-table-routability` | In progress |

## Decision log

- 2026-11-04: Created `operation-integrity-and-reliable-formation` for milestone
  `0.4.1` (`RM-0.2.9-published-operating-contract`), binding work packages
  `E0–E9` to one composed candidate starting from reviewed baseline
  `77e5b4c5ba01826f2ddceecb088f56fcd27b436e` (current `HEAD`
  `63e4a854b783d4b3176b3ecd123677384c96fafa`). Preserved existing quest seals
  (`fresh-formation-user-table-routability`,
  `serve-eligibility-committed-epoch-read`,
  `fresh-create-release-authority-from-committed-operation`,
  `replica-admission-from-committed-operation`) and `0.5` successor dependencies
  for five-node comparative qualification.
- 2026-11-05: Reopened `E1`, `E2`, `E3`, `E4`, `E6`, `E7`, and `E8` to address
  the 2026-11-05 independent observer findings on one candidate while retaining
  completed subcases: single-owner custody unregistration and shared incarnation
  provenance (`E4`/`E2`), removal of RF3 observed-singleton quorum downgrade and
  positional `routingReadinessDimension` in `awaitPostOverlayRoutingRepair`
  (`E1`), CDC actual-prefix pressure + live credit retention + absolute
  `dueAtMs` retry deadlines + `command.acknowledged` batch verification (`E6`),
  and bounded cost / progress-without-admin-polling / diagnostic loss accounting
  / receipt applicability (`E3`/`E4`/`E7`/`E8`/`E9`).
- 2026-11-05 takeover: preserved the sealed Quest and previous failures;
  corrected the E8 evidence ceiling and registered the hydration interaction
  witness. Diagnostics aggregation and CDC lane bookkeeping are extracted
  within their existing owners to satisfy the scoped size rule. The physical
  host substitution above resolves a disk preflight refusal without deleting
  another run's data, lowering the requirement, or changing the scenario.

- 2026-11-10: Installed the user-approved canonical-authority plan as Q1-Q12
  unsealed Quest proposals at `947fbe658ebb2efe993900b672ded51d5610dbcb`, rule-set
  revision 5. Corrected only the original formation Quest's epic routing and
  appended its explanation. Explicitly replaced the epic-only completion probe
  with Q12's broader aggregate; preserved the original service seal, failed
  receipt, all completed repair claims and append-only logs. Added natural exit,
  proof custody, prevention and repository-wide no-legacy/fallback closure as
  completion obligations. Corrected the unsealed cleanup planning premise that
  coverage proves code dead; existing retirement/classification work retains
  its bounded owner. This is planning adoption, not implementation or acceptance.

- 2026-11-10 independent-review amendment: added Q13-Q16 and their required
  entries to the still-unsealed Q12 aggregate after inspecting actual owner
  paths and history. Made policy repair preservation explicit in Q6; expanded
  Q1/Q2 to preserve identity/scope through the full producer-to-decision path.
  Routed cohort-preserving reset and missing TiDB execution to C1/C2 under the
  existing comparison epic. No original service/comparison seal, receipt or
  earlier log entry changed. Source confirmation and external reported
  reproduction remain distinct; no new runtime tests or campaign ran here.
- 2026-11-14: Registered `node-ready-lease-renewal-cadence` under
  `operation-integrity-and-reliable-formation` to unify READY-lease renewal
  cadence ownership in `NodeReadyLeaseAuthority` (`DEFAULT_RENEWAL_INTERVAL_MS`
  = `5000 ms` for a `15000 ms` lease) and eliminate `Number(null) -> 0`
  timestamp coercion across `NodeReadyLeaseAuthority`, `LeaseService`,
  `node-readiness-policy.js`, and `message-group-target-resolver.js`.
- 2026-11-15: Assembled integrated candidate `work/integrated-candidate-20261115`
  from `origin/main` `c4f1cd064bee29d174ba63d0d8d52486651bc59f` combining
  Stream 5b (`#208`-`#211`, `2dc0ca4cc..40cc67121`), Stream 4
  (`cdc-oversized-entry-range-scan`, `3c2c3af13`), Stream 5a
  (`node-ready-lease-renewal-cadence` and authoritative `SERVICES` incarnation
  merge, `fb634397f`), Stream 2 (`formation-ready-lease-independent-of-spread`
  `#217`, `READY`-lease voter-ready `REMOVE` floor, and 9 sealed recovery
  cases, `5bc4d0769..ebd94a498`), and Stream 1 (`#218`, `#219`, seed-first
  startup ownership, `LagrangeOltpAdapter` single-bootstrap/schema gate, and
  cohort-preserving reset, `6855453b6..0f0392838`). Preserved R09/R19/R22
  separation between bounded stream verification and pending physical
  three-node formation (`fresh-formation-user-table-routability`) / `Q12`
  aggregate acceptance.
