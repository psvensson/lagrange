# Native settlement-to-reauthorization control

Whole-file result: **PASS on the first execution**, exit 0, at test checkpoint
`8a4986dd82e4f26436945dc139727024d9b70b41`, on locked `lenovo-laptop`.
One Node test case, every assertion retained; no retry, skipped assertion,
timeout increase, production edit or manufactured discharge result.

Raw classified duration 7,551 ms; Node subtest 5,834.907 ms. The later release
itself took 82.794 ms, within the unchanged 10-second release budget. The
source-visible nested delivery budget issue remains untested under failure:
release settlement does not pass its outer deadline into QueryEngine delivery,
whose ordinary partition budget may be 30 seconds. A healthy measured margin
does not close that failure schedule.

## Exact change and execution

| File | SHA256 / purpose |
| --- | --- |
| `test/partition/participant-release-prepared-settlement-native.test.js` | `99d05469b9df1240d3c566c81cf4989e3fdb49fe35c9e34e7272b78f3846ebaa`; all original assertions plus real authority, discharge delivery/proof, HELD census and retained row checks |
| `test/partition/participant-release-query-engine-fixture.js` | `4523c8a43ab3f6e75e4d2993ed14e44717a4003825bbb699a3f923578be4109a`; new composition of real existing owners |
| `test/partition/participant-release-tx1-native-fixture.js` | `12c914b98ce063bfa023c14314c173907a16ed6a744ddc71902462af209bec13`; optional test-only composition before initial measured release and owned cleanup |

The same commit adds this test to the existing runtime/application contract
and coupled pair in `test/shards/impact-contracts.json`. The normal generators
updated `impact-graph-seal.json`, `subsystem-classes.json` and
`solve/changes/global-owner-debt-inventory/inventory.json`. No `src/` bytes changed.

Command actually executed, using the previously preserved controller over
the repository's `labTestCommit` / `runLabTest` / `labTestDeps` APIs:

```sh
node /tmp/lagrange-native-contract-20261015.4671q2wx/run-one-capture.mjs \
  /mnt/data/peter/projects/.worktrees/release-fencing-decision-closeout-20261015 \
  /tmp/lagrange-release-closeout-20261015.0x0xyh24/native-reauthorization \
  8a4986dd82e4f26436945dc139727024d9b70b41 lenovo-laptop \
  test/partition/participant-release-prepared-settlement-native.test.js
```

The existing lab owner rechecked dependencies and exact commit, acquired its
machine lock and used an isolated remote checkout. Discovery reported Node
v22.23.2, matching dependency graph, 8 cores; no shared dependency installation
was changed. Thermal gate reported CPU 48C. The raw log records placement-head,
placement process, dependency links and unchanged classified policies. The
existing results relay copied full TAP before successful checkout cleanup;
its temporary local result ledger was restored/removed as it was before.

`native/raw.tap`, `native/run.log`, `native/plan.json`, `native/discovery.json`
and `native/exit-code.txt` are authoritative run artifacts. The JSON diagnostics
are decoded copies: TAP's escaped backslashes/hash markers were unescaped once
before parsing. Raw TAP is unchanged. The controller's exact bytes are retained
as `run-one-capture.mjs.txt` (copy to an `.mjs` filename to run); it only composes
existing lab APIs and captures output, and is not a new native harness.

## Actual owner path and observations

The application group is native RF3, with one SQLite file per replica. Native
RF1 services hold `sql_transactions` and `sql_transaction_participants`.
`SeedRuntimeBridgeOwner.acquireSqlQueryEngine` constructs the real QueryEngine
and gateway; real CDC authoritative reads consume these native services.
The real QueryExecutor routes decisions using fixture routing metadata derived
from actual native leaders. No transaction cache row is a discharge authority.

All groups run in one process on one physical host over the existing loopback
transport. This is owner integration evidence, not cross-host, process-crash,
router ACK/late-response or current production bootstrap certification.

Observed in this one complete run:

- Local BEGIN/staging, then durable PREPARED at index 5, on all three replicas.
- Real PAUSE closes ordinary admission. Exact PREPARE replay returns the
  existing result without changing participant rows.
- The actual coordinator records ROLLBACK; participant settlement reaches
  ROLLED_BACK at index 6 while ordinary admission remains closed and user data
  remains empty. This creates no successful user-data application claim.
- Exact DECISION replay and terminal PREPARE preserve the terminal result;
  opposite COMMIT is refused; ordinary write remains cutover-paused.
- Real QueryEngine recovery reads return the retained ROLLED_BACK coordinator
  row and a legitimately empty native progress table. The manifest remains
  nonempty and the query census remains HELD.
- Later release performs two actual QueryEngine ROLLBACK deliveries through
  the transport; both return the same terminal decision index 6. Four real
  control release messages carry invocation-bound queryDrainProof values.
- Release returns `cut_over`. All three application replicas have committed
  and applied position 6, admission OPEN, unchanged terminal participant rows
  and empty user data. The coordinator row count remains one and census HELD;
  the actual discharge proof, not CLEAR/deletion, permits reopening.

The passive recorder returns original arguments/results without overrides.
The earlier direct test sends do not pass through it, so the later deliveries
are nonvacuous evidence of QueryEngine discharge. Setup occurs before the
initial measured release to preserve captured PAUSE tuple lifetime. Cleanup
drains existing release work before removing the added engine/native service.
Initial and later application releaseId are the same in this existing-owner
fixture; the four control messages carry the same current proof value. This
establishes real discharge and reopening, not a unique release-request/epoch
binding or delayed bytes across a new committed authorization.

## Controls and preservation limits

The prior failed N2 file remains at accepted head `108282c...`, SHA256
`c931bbd94708fe42cbbf75c3eea646c802b1c9d66667e413139d3af49ff2be4f`, with its
original first-failure TAP in the accepted archive. Both runs used
`lenovo-laptop`; the treatment is missing fixture composition, not production
repair. The accepted archive was reverified: SHA256
`550f0e0a7fbb5ded309206d60474567bd428ddfde808c99f0b8b4a2691783bf1`, all 133
payload hashes match. The review/model/history files remain unchanged.

The completed four investigations were not rerun. Their results remain bound
to their original commits; they are not relabeled as runs of this checkpoint.
The two pre-run review findings (canonical leader metadata, diagnostics on a
failed later release) were corrected before the first execution. One scoped
lint error for missing `performance` import was corrected before execution.
Those are test-development findings, not semantic native REDs.

ROLLBACK does not prove COMMIT. The later COMMIT control must use actual
`recordTransactionDecision` -> `persistDistributedTransactionDecision`
(`src/query/distributed/distributed-transaction-decision.js:146`,
`src/query/sql-query-engine-transaction-persistence-methods.js:262`) after real
PREPARE evidence and a frozen manifest. Pause before participant COMMIT apply;
then show exactly-once data application, terminal replay/opposite refusal and
reopening. Fixed settlement deliberately cannot create a first COMMIT
(`distributed-transaction-settlement.js:169`). The existing integrated
`transaction-coordinator-group-fixture.js` and release-settlement COMMIT unit
control use persistence/answer doubles; they identify the interaction but
cannot replace that native control. Full query composition also needs actual
participant-progress and write-operation persistence dependencies.

## Verification scope

Independent review `reviews/native-test-review.txt` binds exact test bytes and
all eight relevant categories before the run. Scoped ESLint passed. The new
helper passes strict cyclomatic (12) and cognitive (20) checks; the two modified
files have zero scoped complexity violations. Shard classification and existing
impact registry checks passed. The normal commit hook passed and regenerated
metadata. Its inventory refresh recorded inherited complexity/duplication debt;
it did not raise a baseline. The production source is unchanged, so this packet
does not repeat the accepted packet's complete lint/complexity census.

Inherited lint/complexity and same-host predecessor RC1/RC2 F-MIR results stay
separate and remain integration obligations. No failure was waived as part of
this test control. Production protocol, successor and main remain untouched.
