# Canonical test-runner output format — bounded repair review packet

**Status: clean implementation probe; independent source review and full
candidate acceptance remain pending.** This is a correction at the existing
`scripts/run-test-files.js` subprocess/output-parser contract. It changes no
Raft, metric provenance, runtime deadline or test assertion source.

## Earlier project evidence and actual red

The runner already has explicit tests for both `tap` and `node:test`, real
assertion counts, skip refusal, failure refusal and zero-output refusal in
`test/scripts/run-test-files.test.js`. Its single parser is `tap-parser`.
Project history documents large-output parser custody (2026-09-17), skipped
assertion fail-closed ownership and the shared test-machine factor. Earlier
proof receipts also invoke `node --test-reporter=tap` explicitly.

At exact frozen integration source `f30060e714d080ba438f5657b8d15f4bb992b107`,
Node.js `v24.22.1` running the existing canonical runner against
`node-test-pass.fixture.mjs` exited **1**, despite the child reporting one
passing test. The runner observed **zero TAP assertions**. The unchanged
`tap-pass.fixture.mjs` passed with three assertions. A Node-test skip also
yielded zero counted assertions; it remained red, but for the wrong reason.
The earlier seven-file metric cloud diagnostic reproduced the same mismatch
for `complexity-ratchet-closure.test.js`. A scoped source census found 845
test files importing `node:test`; this is the *candidate impact set*, not a
claim that all 845 were individually run or failed.

The first divergence is the child process's implicit output format: plain
`node file` emitted the human-oriented checkmark/spec representation for a
`node:test` file; the same unchanged file invoked as
`node --test-reporter=tap file` emitted valid TAP, without needing the
separate `--test` runner mode. Node.js documents the reporter flag as a
supported output choice: <https://nodejs.org/api/cli.html#--test-reporter>.

## One owner correction

Add `--test-reporter=tap` to the sole `TEST_NODE_ARGS` vector used by both
synchronous and asynchronous `run-test-files` launches. This pins the
existing reader's declared wire format for **every** child, including mixed
`tap`/`node:test` suites, with no framework detector, legacy execution path,
output heuristic, permissive empty-stream rule or second parser.

No tests, fixtures, authorizations, timeout declarations, machine factors,
retry settings, gate thresholds or runner fail-closed conditions were changed.

## Measured candidate probes

With the single source correction, using the same unchanged fixture bytes:

| Probe | Observed result |
| --- | --- |
| `node:test` pass + `tap` pass together | PASS, 2 files / 4 counted assertions |
| `node:test` skip | FAIL, one counted skipped assertion |
| `node:test` failed assertion | FAIL, one counted failed assertion |
| `tap` skip | FAIL, one counted skipped assertion |
| Empty output | FAIL, zero assertions refused |
| Canonical `test:file` over runner, classified runner and complexity guard | PASS, **3 files / 74 assertions**, original jobs=4 |

The last run is retained locally at
`/tmp/rs-raft-runner-format-20261025.log`, SHA-256
`da898b92d2b0f9ae4d6e06dfdff7fd062461022c6807b191b909f870890b373c`.
It has not been uploaded to the solve evidence store; its local path is not
durable acceptance custody.

## Independent reviewer questions and remaining scope

Verify that the flag works without adding `--test`, is accepted by the
repository's supported Node versions, preserves the mock-import plugin and
source maps, never suppresses an error exit, and does not alter `tap` output.
Verify a spec-output-only fixture remains uncounted. Check that the same
argument vector reaches both launch methods and that the existing
`test-file`/classified tests actually exercise the production invocation.

The metric provenance fixture's expensive first scenario still exceeded TAP's
default cap on this cloud host, including an isolated run. That is a separate
runner-capacity/test-cost finding: this output-format repair does not give it
acceptance, raise its limit or silently narrow its witness. The canonical
lab placement, original metric seven-file proof, whole corpus, startup and
release gates remain outstanding.
