# Metric provenance: cloud focused-run diagnostic

Recorded 2026-10-25T14:04:49Z. **No passing metric-suite or lab acceptance
claim.** Exact frozen source: local `f30060e714d080ba438f5657b8d15f4bb992b107`,
remote equivalent `13cdfe4ef1b620037c0c5f326dd6ff0193f0a70d`, Git tree
`5659709d5010bdfa26a3dc545ef948772d8daa51`. A detached clean worktree
ran on the separate cloud host with Node.js `v24.22.1`, installed project
dependencies and the repository's `npm run test:file` classified runner. No
source, fixture, gate, machine factor, concurrency setting or timeout was
changed. This is supplemental host-local evidence, not a canonical lab job.

## Deliberately selected diagnostic scope

One `test:file` invocation selected these seven files, with the runner's
ordinary lane at jobs=4:

| File under `test/scripts/` | Result | Runner assertions |
| --- | --- | ---: |
| `metric-report-inputs.test.js` | PASS | 27 |
| `metric-cycle-resolution.test.js` | PASS | 80 |
| `metric-cycle-custody.test.js` | PASS | 23 |
| `metric-duplication-inputs.test.js` | PASS | 6 |
| `inventory-ordinal-segments.test.js` | PASS | 24 |
| `metric-report-provenance.test.js` | FAIL: TAP timeout | 33 |
| `complexity-ratchet-closure.test.js` | FAIL: zero TAP assertions | 0 |

The runner returned **five files passed, two failed, 193 reported assertions**.
This selection was made here for investigation; its precise equivalence to the
older author's seven-file list has **not** been established. The failure log
does not supersede the independently approved metric source review or its
historical source-bound author results.

## First causal boundary observed

`complexity-ratchet-closure.test.js` imports `node:test` and, invoked as an
ordinary file by `test:file`, prints four Node test successes but **zero**
assertions in the fail-closed TAP count. A source census found **845**
`test/**/*.test.js` files importing `node:test`. This establishes one actual
test-framework/reporting mismatch and a broader **systemic hypothesis** at the
test runner's format contract. It does not establish that all 845 files fail:
the current test classification, invocation modes, and Node test reporter
routes still need their own complete census and control witness. Treat this as
test infrastructure, not metric cache semantics. An earlier proof receipt in
`test/manifests/proof-authority-falsifiers.receipt.json` explicitly invokes
`node --test-reporter=tap`, so the repository has previously needed to select
a reporter for Node tests. Do not add a permissive empty-TAP fallback.

`metric-report-provenance.test.js` reached its third TAP entry after the first
two passed all **30** inner assertions and then hit TAP's timeout. The first
entry repeatedly runs real metric producers and took 32.731 seconds in the
seven-file run; the next took 2.283 seconds. An isolated unchanged `test:file`
rerun still failed with the same timeout: the expensive first entry took
29.668 seconds and the second took 2.175 seconds. Both failures therefore
preceded any new semantic assertion failure. The isolated reproduction
weakens the four-way-contention-only explanation; host capacity and the
test's repeated full-producer cost remain competing causes. The TAP default
30-second cap is documented in `scripts/run-test-files.js`. The older author
measured a maximum file time of 23.365 seconds on a different host. No budget
increase, timeout floor, test weakening or forced-refresh workaround was made.

## Exact raw-log custody and next owner

Both synchronous commands terminated and the detached source worktree was
clean. The two raw logs are **temporary local files** and have not been
uploaded to the solve evidence store. These checksums allow later custody if
that upload becomes available:

| Local file | SHA-256 |
| --- | --- |
| `/tmp/rs-raft-metric-focused-f30060e-20261025.log` | `495127489feffb18167ad3b00c35df53cdf2c5c7b3b1a47aed19d9bad1132f78` |
| `/tmp/rs-raft-metric-provenance-isolated-f30060e-20261025.log` | `b824ac73df2d3b58d275b007e0f52717f087dd058bb50cd6250d2a22f931a4c2` |

The existing canonical lab controller owns the original affected-file
receipt, actual host placement, thermal admission and complete result
collection. The runner/test-framework owner must determine the intended
format classification and preserve zero-assertion refusal while admitting
real Node test outcomes. The test-cost owner must compare this exact source
under an authorized runner before attributing a performance regression or
changing the unit case's work. No native, public startup, multi-machine, main
merge or release acceptance was performed here.
