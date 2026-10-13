# Native runtime-load recovery attempt, 2026-10-12

WIP only. User authorized preservation pushes and continuation toward rs-raft
merge. This bounded unit continues the existing TX1 loaded-provenance seam;
it does not authorize independent approval, Quest landing or main integration.

Exact inherited source: 4151a3ab4cf3859651507d2f575a49754deb8f61 (preserved TX1
owner WIP, not a reviewed integration). Runtime blob:
54fe5ceed1a390cfacbdcdc20f7b4778937cce07. Reuse its private binding owner;
do not recreate that owner or replace other lanes wholesale.

The supplied one-line reorder makes shared health HEALTHY only after the
replacement core is instantiated. The native integration witness uses the
existing PartitionNodeCluster and existing core fault/entry observer seams,
with real vendored raft-rs and independently read SQLite WAL files. A trap is
injected at the native-call containment boundary, not caused by malicious
peer data. Two single-voter groups deliberately share one runtime; this is
not multi-host, RF3, SQL engine, CDC or startup certification.

Four isolated process/source-copy cases: same-artifact recovery control,
missing glue, coherently changed glue rejected by the loaded-byte pin, and
repeated load refusal. A different group initiates recovery after artifact
restoration. Both groups must be recreated before the caller proceeds, retain
their own committed data and identity, and commit/read new data exactly once.
No production factory, exported seam or feature flag is added. Cold copying
and loading count within each integration test's duration. Neither the source
checkout's artifacts nor the operator's local lab files are faulted.

The bounded GitHub-hosted Action measures the original source, the committed
WIP candidate, source-only revert, and the existing operation-port cone. It
uses the canonical test:file runner and metadata producers. It appends attempt
records with Solver but never records an approving verifier or calls land.
Non-main commits use the runbook's explicit WIP preservation allowance, not a
passing publication gate. Source and evidence pushes are non-forced and refuse
if the exact work branch advanced. No self-hosted runner, cloud provisioning,
new credentials, main write, merge, tag, release or background deployment.

Every native success claim must bind the Action run, candidate commit, source
and test hashes, measured engagement and the red/revert result. Earlier 20-case
controlled diagnostics are not upgraded to native evidence. A failed setup,
missing case, wrong red, source mismatch or timeout stays incomplete/failing.
Independent category-complete review (recovery/replay, admission, concurrency,
owner interaction and harness fidelity) plus the broader cutover gates remain
required. The temporary execution workflow is not a permanent release gate.
