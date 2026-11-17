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
