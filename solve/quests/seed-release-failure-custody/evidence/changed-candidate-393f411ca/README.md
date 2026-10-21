---
audience: development
documentClass: current
---

# Changed-selection measurement at393

Measured candidate: `393f411ca09449898465cc3cb7320c03fba2aba8`.
Selection base: `847c36a31ea3e84880dbf5e16b7e4ffb81cdd3eb`.
Started 2026-10-21 05:54:16 UTC; finished 06:26:10 UTC; exit1.

**RED, incomplete selection coverage:**1261 selected files,1159 passed,
99 reported red,3 unreported at the lenovo-laptop shard deadline. The
canonical runner counts unreported files as failures, so its total is102.
This is not a full-corpus run, a count of proven bugs, a regression verdict,
a Solver landing, or a publication/release receipt.

| Host | Selected | Reported pass | Reported red | Unreported |
| --- | ---: | ---: | ---: | ---: |
| tv-dator |365|331|34|0|
| lenovo-laptop |231|207|21|3|
| adam-laptop |254|238|16|0|
| adams-gamla |206|190|16|0|
| carinas-windows |205|193|12|0|

`input.json` preserves the exact command, explicit retry0 policy, commit,
source/scripts/test trees and selection digest. Normal machine locks,
automatic host timing and thermal admission remained in effect. The canonical
controller declined local participation because its tree was not exactly the
requested commit; all selected files were assigned to the five named hosts.
No test, deadline, timeout, baseline or production byte was changed for this run.

`controller.log` is the complete original controller stream. `exit.json` and
`execution.json` retain the original wrapper result. `files.txt`, selector
outputs and the original `summary.json` retain the selection made before
execution. That original summary is a selection inventory, not a result.

`reported-verdicts.json` derives1258 unique assigned-file verdicts from the
canonical outer runner lines. `preservation-summary.json` records those totals
and the three missing files. The raw ledgers from the four completed hosts
were copied before starting any predecessor or supplementary measurement.
The deadline stopped Lenovo before its ledger was emitted; no replacement
ledger or attempt fields have been invented for it.

`ledger-reconciliation.json` accounts for all extra raw ledger records. The
timeout-declaration test launches six generated nested runner fixtures, two
of which deliberately assert the wrong timeout. The local-corpus test launches
one additional `budget-limit-error.test.js` run. All seven raw records remain
preserved. Matching selected files by path, verdict, assertion count and
duration recovers exactly the outer results; every selected record in the
four available ledgers has attempt1 and retriedOnce=false. Nested runner
exercises are not extra outer selections or evidence of automatic retries.

`selected-test-blobs.json` binds every selected test to the exact candidate's
Git blob. `source-bindings.json` retains the49 source/test/audit bindings from
the separately reviewed focused composition at the same source tree.
`sha256.json` checks the packet's data files; it excludes itself and any later
independent review to avoid self-reference.

All31 selected files from the focused32-file operation set passed here.
`operation-witness-correspondence.json` names each. The unselected exact-handler
API file has its separate pass in `../composed-393f411ca/`. This bounded positive
evidence does not erase the99 reds or the3 coverage gaps.

The unreported files are create-table-partition-provisioning,
managed-split-admission-reliability, and sql-engine-system-writes-contract,
all under `test/integration/`. Only Lenovo reported missing assignments, so
their original host follows from the complete selection and the other hosts'
complete results. A separate exact393 same-host measurement is being retained
under `unreported-candidate-393f411ca`; it cannot rewrite this run's outcome.
Same-host predecessor measurements at847 are also separate evidence. Source
identity or historical overlap alone does not waive a failure or prove its cause.

Safety, recovery progress, resource/performance, corpus and physical
distributed certification remain distinct verdicts. The broad gate remains
red. No acceptance term or historical record is superseded by this packet.
