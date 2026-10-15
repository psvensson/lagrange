# Reproduction and classification

The Git raw directory contains exact executable byte mirrors with `.mjs.txt`
suffixes. Copy a mirror to a NEW local `.mjs` path to run it. The release archive
also carries original executables; do not overwrite any retained trace output.

    node ordering-traces.mjs > NEW-POSITIVE.json
    node ordering-traces.mjs --allow-retire-overtake > NEW-NEGATIVE.stdout 2> NEW-NEGATIVE.stderr

The first exits 0: 14 named scenarios and 729 specified six-stage action strings.
The second must exit 1 at the protected-maintenance admission assertion. It is
a design mutation, not a native production RED. No package dependency is needed;
root and independent verifier used Node v22.23.2. The final source SHA256 is
77863f5f600cf9764e4f25dc5c9f75abbbae715603069a9f9af34df71dc8e1cf.

v1/v2 and the independent malformed-field counterexample are retained. See
raw/TRACE-REVISION-NOTES.txt. Do not relabel one revision's outputs as another's.
The original v2 probe is standalone and preserves its original interpreted-field
defect; v3 adds complete interpreted/canonical-field agreement for this small
projection. Production canonical u64/size/identity encoders are not implemented
or certified by that check.

The projection assumes ordered-prefix commitment, authoritative discard inputs,
atomic application and eventual service. It does not simulate Raft elections,
network safety, SQLite crashes, whole-system scheduling or the actual D2 proof
predicates. Its receipt is simplified: reason/tagged winner, coherent-current-
receipt/missing-child recovery, full HOLD/settlement, image install, counter and
byte caps remain outside the executable subset. The one-round scheduler list
illustrates the selected rule; it is not an execution of the current scheduler.
No trace pass is an implementation oracle or successor-sealing evidence.

Native observations used the preserved run-one-capture.mjs controller, which
calls the existing labTestCommit/labTestDeps/runLabTest executor and lock owner:

    LAGRANGE_LAB_AGENT=codex:ordered-release-recovery-20261015 node run-one-capture.mjs ROOT NEW-EVIDENCE c425ef42e18236ff1187e1112a971588bb02b496 lenovo-laptop test/raft/raft-rs-backend/persistence-admission.test.js
    LAGRANGE_LAB_AGENT=codex:ordered-release-recovery-20261015 node run-one-capture.mjs ROOT NEW-EVIDENCE c425ef42e18236ff1187e1112a971588bb02b496 adams-gamla test/raft/raft-rs-backend/operation-port-ready-recovery.test.js

Recheck discovery, dependency identity and machine locks for ANY later run;
hosts here are historical observations, not leases. The placement-head, full TAP,
exit status, command plan and discovery are retained. No retry-to-green, raw SSH
runner, shared installation modification or physical cross-host certification.
Tests were unchanged at the named source head. No need to repeat these controls
until an input changes.
