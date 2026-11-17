# Literal checker lexical binding repair

## Direct repair assignment, recorded before implementation

- Base: `4b0c8ec1de59e9a074afa97ce260afb2868685c5`.
- Branch: `work/literal-binding-repair-20261117`.
- Author: `literal_binding_repair`; integration and managed proof owner: `/root`.
- Writable paths: `scripts/check-guideline-literals.js`, a private binding
  resolver at `scripts/literal-constant-bindings.js`,
  `test/scripts/check-guideline-literals.test.js`, and this record.
- Existing contract: code-style's named constant ownership and the scanner's
  distinction between a static local constant and a calculated runtime local.
  The scanner must resolve the referenced binding before accepting its name or
  a module `Object.freeze` alias as evidence of that ownership.
- Bounded cause: `isUpperSnakeConstantReference` accepted the spelling of any
  uppercase identifier, and `collectObjectFreezeAliases` retained alias names
  without declaration identity. Function parameters with those same names
  therefore inherited a different binding's constant exemption.
- Acceptance: retain the original two counterexamples as regression cases;
  classify their literal `500` as a violation; preserve true module constants,
  imports, static local constants, and unshadowed module freeze aliases; check
  parameter, destructuring, block, loop, catch, declaration, and closure
  shadows through the public scanner. Scope construction remains private to
  this checker and reuses its existing AST and traversal owner.
- Material exclusions: no baseline increase, exemption, changed literal
  vocabulary, new audit, dependency, runtime subsystem, GCP operation, product
  source repair, or modification of another candidate. This repair does not
  perform whole-program value analysis or prove that ambient intrinsics have
  never been mutated. The existing module catalog admission remains intact.
- Dependencies: managed native proof and independently reviewed old/new raw
  measurement on the same pinned source; generated metadata belongs to the
  integration owner. No local project test, checker, audit, build, or generator
  execution is authorized.

This is an unchanged-contract direct repair: one demonstrated name-versus-
binding cause, one existing checker owner, and a public-entry regression
witness. A competing cause or required owner-contract change would exceed
this assignment and require reassessment under the Quest workflow.

## Prior witness and bounded history

Managed native job `4900` on the base above ran
`push-review-literal-binding-diagnostic.mjs` with SHA-256
`637f0805463eab3836a1b0c2754aa8e2713221d638657e35512e1767971f17b4`.
The retained log is
`/workspace/scratch/1d848e6f888d/review-1105-harness-native.log`.
The diagnostic records current and semantic counts separately; its successful
process exit confirms the retained observations, not correct checker behavior.

| Case | Observed violations | Required violations |
| --- | ---: | ---: |
| Lowercase runtime parameter multiplied by `500` | 1 | 1 |
| Uppercase runtime parameter `BUDGET` multiplied by `500` | 0 | 1 |
| Actual module `const BUDGET = 10` multiplied by `500` | 0 | 0 |
| Runtime parameter `freeze` called with `{waitMs: 500}` | 1 | 1 |
| Same parameter shadowing module `const freeze = Object.freeze` | 0 | 1 |
| Actual unshadowed module freeze alias with `{waitMs: 500}` | 0 | 0 |

The targeted history points to
`2e5bc9c581bc787a06e60c497b5137b6648e6907`, which repaired enclosing-const
scope traversal and calculated local initializers. Its static-reference and
freeze-alias cases retained the name-only assumption. That earlier repair's
passing scope-boundary fixtures did not cover lexical reference identity.
The current change extends the same scanner and test suite. The historical
baseline re-anchor is retained as history and is not repeated here.

## Proof status and integration handoff

Implementation is prepared; native acceptance and independent verification are
pending. Source/Git inspection alone does not establish passing execution.
No local project code was executed. `git diff --check` reports no whitespace
errors. Both source files remain below the 800-line source-file limit.

The scanner now resolves an identifier to the nearest declaration before
accepting a constant reference. Module const owners and imports retain their
existing admission; a simple local const declarator must have a static
initializer, with a cycle-safe per-binding memo. Freeze aliases retain the
original declaration identifier. A runtime shadow of `Object`, `Buffer`,
`Set`, or `Map` also cannot borrow the ambient intrinsic's exemption; the
existing named `Buffer` import from Node's buffer module remains supported.

The private resolver uses the existing parsed AST and `walkAst`. It separates
parameters from body declarations, uses block/catch/loop/class/switch scopes,
and resolves hoisted declarations after collecting all bindings. It is not
a second audit, parser, dependency, or proof pipeline. The public scanner tests
contain the six original witness cases, shadow and static-owner controls, and
both original defects in the existing filesystem report test.

### Managed proof plan

Run through the managed native adapter on the frozen candidate. Retain the
candidate, invocation, worker/job identity, exit status, TAP, and artifact
digests. The integration owner supplies generated metadata before final proof.

1. Run the public owner suite:
   `npm run test:file -- test/scripts/check-guideline-literals.test.js`.
   Require the two former zero-count counterexamples to report exactly their
   literal `500`, preserve their zero-count module-owner controls, and require
   the filesystem report to retain both new violation records. Skipped,
   unengaged, or empty TAP does not establish acceptance.
2. Run scoped lint, complexity/cognitive checks, literal audit, and applicable
   file-size/import-impact checks on the two checker source paths and owner
   test through the existing static/proof owners. Do not raise a ratchet or add
   an exemption to obtain a pass.
3. On one immutable copy of base
   `4b0c8ec1de59e9a074afa97ce260afb2868685c5`, feed identical `src/` and
   `scripts/` source contents and relative file paths to the old and candidate
   `collectMagicLiteralViolationsFromSource` functions. Keep raw, unbaselined
   records from both versions, per-file counts, and added/removed identities
   (`filePath`, literal value, kind, occurrence count). Code under measurement
   must not change between the two scans. Record raw totals and compare them
   with the existing baseline separately; the baseline stays unchanged.
4. Independently review the frozen content and the same-source comparison.
   Newly exposed debt remains named debt requiring owner disposition. Native
   unit success alone does not establish a green full literal gate, service
   scenario, comparative measurement, or release acceptance.

The original diagnostic asserts historical counts, so executing it unchanged
against the correction is expected to fail those historical-count assertions.
Use the retained native observations for old behavior and the retained public
regression suite for corrected behavior; do not rewrite the historical witness.

## Completed component proof, appended 2026-11-17

### Unchanged scope and frozen source

Root assigned this evidence-only follow-up after collecting and independently
reviewing the native result. The writable scope for this follow-up is this
record alone. The checker, private resolver, test, baseline and original
assignment remain unchanged. The earlier pending status and proof plan above
are retained as history; the observations below update the component proof
status without claiming integration or final-gate completion.

Managed proof [4938](https://github.com/psvensson/lagrange-lab/issues/4938),
request `e66eb8cd04884868a2d4f89bec2e29ec`, executed on `local-workstation`
with Node `v22.23.2`. Its source was remote preservation commit
`7f13e35b224f26b7175fb63b2dc3187f0e14415f`, tree
`075a692848e1f20ca653ca248129d1168a551bd7`. The local preservation commit
`ad0f7fbe6790a7cb4e952098a81f9093075ba040` has that identical tree. The
counterfactual used baseline `4b0c8ec1de59e9a074afa97ce260afb2868685c5`,
tree `b17f89301e4ecace0a8fa852a6ebbefe91517105`, with only the exact
candidate witness overlaid for its owner-suite run.

| Frozen input | SHA-256 |
| --- | --- |
| `scripts/check-guideline-literals.js` | `f06c5dbee49c860efeb6535b9d8e33d8790669fa7829ec257dc97c3e17db1f6b` |
| `scripts/literal-constant-bindings.js` | `a4c99803e37b092e420e8d03b70198e695047e0c9c37e2a4b9283596ceb6b35b` |
| `test/scripts/check-guideline-literals.test.js` | `3feacb02f17a6253b958d1c7591ba3b68b237687ab4bb126482d6d6593f7078b` |
| Unchanged literal baseline | `13b8ccfa55e4ffccc41aa1b839a80a835373bd58f2cba4b85c89c5b45e9e4c22` |

### Actual regression and control observations

Each source state ran the complete classified owner suite once through the
existing `scripts/quest-evidence/harness-runtime.js`; retry was disabled.
Both generated receipts name the same witness digest. The baseline receipt
failed and its command exited 1; the candidate receipt passed and its command
exited 0. The harness's receipt label does not create or seal a Quest.

The baseline had 19 top-level subtests: 15 passed and four failed. Its 58 leaf
assertions contained 33 passes and 25 failures. The first failure was the
uppercase runtime-parameter counterexample. The other failing subtests cover
runtime shadowing forms, unresolved/mutable/cyclic or shadowed intrinsic
references, and preservation of the new findings in the filesystem report.
The candidate passed all 19 subtests and all 58 leaf assertions. The classified
runner reports 77 aggregate assertions because it includes the 19 parent
subtest results; this is the same run, not a second measurement.

The six original diagnostic inputs were also fed directly to both public
scanners, preserving the observed violation records:

| Original case | Baseline count | Candidate count |
| --- | ---: | ---: |
| Lowercase runtime parameter multiplied by `500` | 1 | 1 |
| Uppercase runtime parameter `BUDGET` multiplied by `500` | 0 | 1 |
| Actual module `const BUDGET = 10` multiplied by `500` | 0 | 0 |
| Runtime parameter `freeze` called with `{waitMs: 500}` | 1 | 1 |
| Same parameter shadowing module `const freeze = Object.freeze` | 0 | 1 |
| Actual unshadowed module freeze alias with `{waitMs: 500}` | 0 | 0 |

In the two repaired cases the new record identifies the literal `500` as
`free_floating_number_literal`. The surrounding healthy controls remain
unchanged. Native execution therefore discriminates the two demonstrated
binding defects instead of merely showing that the process returned zero.

### Identical-input scan and scoped checks

The comparison completed all 2,499 selected baseline `src/` and `scripts/`
files. Both public scanners received the same relative paths and source bytes,
verified against the pinned Git blobs. The corpus manifest SHA-256 is
`26f91552ffec92ae07a89d09340a3dd1d06a8463551ba930714eed90f8bbe7d7`.
Old and new raw outputs each contain 4,729 records and are byte-identical,
with SHA-256
`a691bab59da186de8a32fc6d8473de840f1eb37b9ebd7502e14cb3b3d969d940`.
There are zero added or removed identities or occurrences, zero changed files,
and zero unbaselined records in either scan. The literal baseline was not
re-anchored or otherwise changed.

The complete candidate literal gate scanned 2,500 files, including the new
private helper, and reported zero new violations and 4,729 inherited
violations. This preserves existing debt; it does not claim a debt-free tree.
Equality on this finite repository corpus does not replace the regression
witnesses that demonstrate the corrected lexical classification.

The native scoped results were:

- ESLint and the file-size gate passed. The latter compared against exact
  baseline `4b0c8ec1de59e9a074afa97ce260afb2868685c5`.
- Scoped complexity and cognitive reports had zero violations both before and
  after. The new helper separately passed strict thresholds 12 and 20.
- The scoped literal audit scanned two files: zero new and one inherited
  violation. The decision-boundary audit scanned two files with no violations.
- The ambient-intrinsic command exited zero but scanned zero files. That
  domain exclusion supplies no intrinsic-audit coverage for this unit.
- The impact-contract registry passed with 98 contracts and 72 coupled pairs.

### Collected evidence, review and remaining limits

Root collected the complete worker stream and native log, then extracted and
hash-verified all 99 artifact files under
`/workspace/scratch/1d848e6f888d/takeover-literal-binding-proof-artifacts/`.
The complete logs are
`/workspace/scratch/1d848e6f888d/takeover-literal-binding-proof-worker.log`
and `/workspace/scratch/1d848e6f888d/takeover-literal-binding-proof-native.log`.
These collected bytes, rather than a native temporary-directory survival
assumption, provide the retained proof. Installed worker release
`53e262450fada3b4e706898201a3c732811ae4d0` treats its temporary workspace
as disposable after scope closure through `generic_worker.py` and
`run_retention.py`; unexported temporary files are not evidence held for later
collection.

The durable evidence collection contains 65 ordered pages, numbered 0 through
64, for stream
`13aa2d1be3fda84b52804e59e81c38398165430d4275ea02095cdf7d2760ec5a`:

| Pages, inclusive | Evidence collection issues |
| --- | --- |
| 0 | [4949](https://github.com/psvensson/lagrange-lab/issues/4949) |
| 1 | [4954](https://github.com/psvensson/lagrange-lab/issues/4954) |
| 2-33 | [4957](https://github.com/psvensson/lagrange-lab/issues/4957) through [4988](https://github.com/psvensson/lagrange-lab/issues/4988), in order |
| 34-64 | [4990](https://github.com/psvensson/lagrange-lab/issues/4990) through [5020](https://github.com/psvensson/lagrange-lab/issues/5020), in order |

The first submitted envelopes for pages 1-64 used the wrong schema and were
corrected before evidence admission. Those envelope corrections changed neither
the data nor the stream; the collected worker bytes and hash below are unchanged.

| Collected evidence | Bytes | SHA-256 |
| --- | ---: | --- |
| Complete worker log | 517547 | `05388006e51b759e567813c0599a191c957f37dac71d07d2c267afe7dd8c7cb8` |
| Complete native log | 3580645 | `5e4ad951fa97c27018b3b33c25435ecdf7bbc55ce30b92f30faefeaed63f53db` |
| `baseline.receipt.json` | 1001 | `02f459b451c60523c3ef623824c70d3be12c1b9327a624888d4e0add3784f4e0` |
| `candidate.receipt.json` | 803 | `6b43b5844e74120e1a7649ea74bf7d6364a1519702f03691af0f628c5971a735` |
| `baseline.full.tap` | 24819 | `c0e414fbea766742cf435b66937ad77da3405ab0293a3d2c868e46d4f93f4735` |
| `candidate.full.tap` | 6421 | `3323f5f40fead41e94f0355cb27aaf8fdea956566a11cf089c94c03c48aa5069` |
| `comparison/comparison-status.json` | 639 | `8db035976b7ed9c353973f88ea22107207596f58b5cac2c309017573faa507e7` |
| `comparison/original-witness-observations.json` | 3691 | `3b48092f40201c6e71343f2d8a1b50aceb520b4939d09fb96c25672189142859` |

The native result records `baseline_exit=1`, `candidate_exit=0`,
`verification_failures=0`, `capture_failed=0`, `interrupted=0`, and final
exit 0. The worker stream records baseline-worktree closure after evidence
emission. Complete classified stdout/stderr, TAP/stderr, runner manifests,
commands, exit statuses, raw scanner records, per-file counts and comparison
artifacts remain among the collected files; an empty stderr is retained as an
empty artifact rather than silently omitted.

Root independently reviewed the frozen checker, resolver, tests and record,
then accepted the completed component-proof condition after inspecting these
native results and the identical-input comparison. This author records that
verdict without substituting self-review for it. Root still owns review of this
documentation follow-up, generated metadata, applicability to the collected
integration candidate, integration and exact-candidate final gates. No final
gate, merge, publication, product-service readiness, GCP measurement, or release
acceptance is claimed here. No local project test, audit, build or generator
was executed for this follow-up.
