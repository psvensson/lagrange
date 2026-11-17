---
audience: agent
status: candidate-awaiting-native-proof
---

# Capacity artifact path fixture repair

## Assignment recorded before the fixture edit

This bounded direct repair starts from commit
`706ab191723c480342dd13ac3f9ed6ae1b370d81`, tree
`0d3b5721f61a3b97e93f3ee67cc80dbdf0f96476`. Loaded guidance is rule-set
revision 5, `AGENTS.md`, the rules and router, the Quest workflow, and the
fixture, regression and harness guidelines. The unchanged contract is owned by
`inspectBenchmarkCapacityArtifactPath` in
`test/distributed/harness/benchmark-capacity-artifact-path-integrity.js`:
an existing absolute path with no symbolic-link component is valid, while
any symbolic-link component is rejected as `symlink_component_forbidden`.

The writable scope is exactly:

- `test/distributed/harness/__tests__/benchmark-statistical-capacity-protocol-adversarial.test.js`
- `docs/evidence/review-repairs-2026-11-17/capacity-path-fixture.md`

The repair changes only how this existing test creates its physical fixture
directories. Production path inspection, the healthy acceptance assertion,
the explicit hostile symlink assertion, test selection and thermal policy
remain outside the writable scope. The existing direct-change route applies
because the defect is local, the contract is unchanged and the original test
is the regression witness. Independent review and native proof remain required.

## Original measured failure

Managed core job `5040`, request `5ca07a2042e042b9b56cb4203de69eca`, executed
the candidate at the source identity above. Root retained and hash-verified
its complete original worker log:

- File: `takeover-core-corrected-worker.log` in the takeover evidence collection.
- Bytes: `17381`.
- SHA-256: `e6cb0c65f93179e93c3950263bae1d95cca265743c1283185dd2accac2949e0a`.

The first failing test's complete TAP was exported before the later thermal
interruption and collected as
`takeover-core-corrected-artifacts/CORE_GATE_OWNER_ARTIFACT_1`, SHA-256
`b87a21397363fb33097488f42a8d84db1938d843a92fe2f26a90e79cc854e5ef`.
The original TAP reports 26 assertions: 25 pass and one fails. In
`artifact path integrity rejects a symlink in any parent component`, the
healthy direct-path assertion at original line 267 expected `valid: true`
and observed `false`; the explicit hostile symlink rejection passed.

The later worker `THERMAL_ABORT` is a separate execution failure. It does not
erase this already-completed test result or establish that the remaining
selected corpus passed. The complete selected-test stdout and final execution
ledger were not exported before hard thermal scope closure and are unavailable
after the managed worker removed its disposable work tree. Only artifacts
with complete, hash-verified export frames are retained proof. Root owns the
original artifact collection and the separate thermal investigation.

## Cause and proposed correction

The fixture currently creates both directories under `tmpdir()` and passes
those textual paths to the actual production verifier. The verifier walks
each absolute path component with `lstat`; it does not resolve away a symbolic
link before deciding whether that component is forbidden.

The installed managed worker at release
`53e262450fada3b4e706898201a3c732811ae4d0` deliberately exports a short
`TMPDIR` alias. Its `generic_scope.py::short_temporary_path` creates a symbolic
link from `/tmp/lab-<uid>-<identity>` to the request's owned `work/tmp`, and
`generic_worker.py` exports that alias as `TMPDIR`, `TMP` and `TEMP`.
Consequently, the fixture's nominally healthy textual path itself contains a
symbolic-link parent before its test-created directories are reached. The
owner's refusal is consistent with its contract; weakening it would hide the
fixture defect.

Import the existing Node `realpath` operation and resolve `tmpdir()` once
before creating the two physical fixture directories with `mkdtemp`. Keep
the test-created `linked` parent and both original assertions. This uses the
same production inspector and does not add a helper, alternate verifier or
new subsystem.

## Proof boundary and next measurement

The original failure is measured evidence; the causal trace above is source
analysis. This candidate must still be measured natively. Root will arrange
one old/new run of the ordinary owner test file under the managed worker's
symlinked temporary parent, retaining both complete classified streams and
TAP. The old fixture must fail at the healthy assertion, and the corrected
fixture must accept the physical path while still rejecting the intentional
symlink. No changed assertion, skipped test or retry-to-green is authorized.

No local project test, audit, generator, build or lifecycle command has been
run for this repair. A non-main WIP commit preserves the candidate only; it
does not claim accepted integration, full core gates or campaign readiness.
Native metadata regeneration, independent review and the exact candidate
gates remain with root. The publication destination for this task is
`wip/integrated-candidate-20261115`; the main-specific `npm run publish`
command is not this branch's publication route.
