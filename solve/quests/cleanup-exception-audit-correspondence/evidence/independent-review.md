---
audience: development
documentClass: evidence
---

# Independent exception-collection audit review

Date: 2026-10-21. Reviewer: `subagent:/root/control_source_review`.
Round: sealed design and test-only witness before classifier/product edits.

Verdict: APPROVE this design in principle and the frozen witness for the
old-classifier red measurement. No classifier implementation, product change,
complete census delta, measured result, gate, landing or release is approved.
No tests, source edits, staging or commits were performed by this reviewer.

Reviewed witness: `test/scripts/check-guideline-decision-boundaries.test.js`,
SHA256 `37bcb6ee2837c3bf7b1f7eae0f345ed921f2277877b924b832965fdd0fd97e02`.
The diff adds 84 lines and removes none; prior assertions remain unchanged.
The review read this Quest and design, the complete harness-fidelity and
owner-interaction templates, the existing classifier, the actual message-group
cleanup path and the WASM settlement producer/consumer. Work is separately
sealed against `a0dc88427b61a51d3cea7fc2ff8cdaa7fbdf7ec5`; it does not amend
the test-only exact-handler-fixture-custody seal.

## Owner judgment and approved scope

`src/bootstrap/shared/message-group-transport-handler.js:81-104` uses its
array to accumulate caught shutdown/retirement exceptions. The only inserts
at lines 85 and 92 append the caught cleanup values. The array is aggregated
into a thrown cleanup error at lines 101-102; otherwise the original primary
is rethrown at line 104. Retained service-map identity, lines 97-99, owns
cleanup custody. The local array is diagnostic exception data, not an unnamed
runtime outcome. The existing name-based declaration detector at
`scripts/check-guideline-decision-boundaries.js:310-330` lacks that distinction.

The proposed repair must establish the complete role of a particular local
const binding. No shadowing, aliases, assignment, unsupported mutation or
escape may inherit permission. A push must append the actual binding of an
enclosing catch. A permitted length use is the exact nonemptiness guard for
throwing the aggregate, not an arbitrary read/decision somewhere in a catch.
The vector's aggregate use must occur in the thrown error expression. Other
uses remain findings. A caught value need not be an Error instance: thrown
undefined or another primitive is still exception data.

This is occurrence/role classification within the existing checker, not a
name, filename, catch-body or array exemption. It must preserve conservative
findings for unsupported forms. Renaming the vector, replacing [] with an
array constructor, moving the same vector or inventing an outcome enum is
not the proposed repair.

The product-side normalization is independently bounded to naming the existing
MG aggregate message and error code, and the WASM settlement field. Keep the
exact values and local ownership. For WASM, preserve the producer's error
variant and the `in` presence test at
`src/wasm-service/wasm-service-replica-lifecycle.js:276-291`; truthiness would
incorrectly change handling of a thrown undefined. Final source bytes require
independent inspection. No cleanup ordering or authority changes are approved.

## Harness fidelity: all six items

1. **Correct red.** The new actual-source case reads the unchanged MG owner
   and proves exactly one original `const failures = [];` anchor before
   expecting no RAW_NULL_OR_EMPTY_STATE finding for
   initializeRegisteredMessageGroup. The current detector should fail at this
   declaration classification, not setup/import. The renamed local-collection
   positive is expected to fail the same old rule. Preserve named assertion
   output; a nonzero exit alone is insufficient.
2. **Honest seam.** `emptyStateFindings` invokes the real exported collector
   and filters the existing finding kind and function name. The paired source
   mutation publishes the actual vector as outcome data in the same owner;
   there is no fake classifier or separate pass criterion.
3. **Time fidelity.** This is a synchronous parser witness with filesystem
   source loading only. It changes no clock, timeout, sleep or runtime cadence.
4. **Field fidelity.** Fixtures contain the AST roles the proposed proof uses:
   const declaration, enclosing catch parameters, direct push, nonempty length
   condition and AggregateError inside a throw. The real source case keeps its
   map-retention effects and original exception wrapper. Unsupported shapes
   are explicit negative controls rather than silently normalized inputs.
5. **Nonvacuity.** The actual-source anchor is asserted before mutation. Both
   positive names still contain semantic substrings recognized by the old
   detector. Ten cases add publication, unknown consumer, alias, closure,
   shadowing, length mutation, splice, nonexception insertion, derived-state
   decision and indexed access. Additional mutable, returned-vector and raw
   empty-outcome cases require the finding to remain.
6. **Binding ceiling.** These tests bind the classifier, not native cleanup
   safety. Identical witness bytes must execute against old and repaired
   classifiers. Existing exact-owner/native evidence and product-byte review
   remain separate requirements for the private literal normalizations.

## Owner interaction: all ten items

1. **Single semantic owner.** The existing raw-null/empty-state checker remains
   the audit owner. The MG service map and lifecycle owners still own cleanup
   obligations; no audit projection becomes runtime permission.
2. **Typed boundary.** Tests retain the existing RAW_NULL_OR_EMPTY_STATE kind.
   The distinction is exception data versus a semantic outcome, not a new
   result vocabulary or a reinterpretation of MG cleanup refusal.
3. **Paired invariant.** One source must accept the local caught collection
   and reject that same collection after publication as runtime state. The
   named positive and ten mutation controls prevent blanket acceptance of
   arrays with familiar-looking names or catch placement.
4. **Stale-then-fresh analogue.** Appending an escape invalidates the complete
   declaration proof, even though the earlier construction/pushes remain.
   A previously recognized accumulator must not permanently exempt later use.
   This is source re-evaluation, not a runtime recovery claim.
5. **Pressure/backoff.** No retry, timer, resource-pressure or scheduling
   policy changes. This parser witness cannot certify those runtime concerns.
6. **Re-evaluation path.** Each original/mutated source is freshly parsed by
   the real collector. Unknown use causes conservative rejection rather than
   a fallback classification or stale cached exemption.
7. **Projection authority.** The exception list carries failures to a thrown
   aggregate. Only the service-map/lifecycle paths retain cleanup custody.
   The explicit published-status/outcome controls forbid silently treating
   an escaping list as proven diagnostic-only data.
8. **Controlled negative.** Old-classifier execution must fail the intended
   positive assertions while preserving escape controls. Repaired measurements
   must use the same frozen witness. The complete raw finding census,
   including previously baselined findings, must be compared and every removal
   independently justified. Expected red samples are not positive evidence.
9. **No escape hatch.** No path/name allowlist, renamed variable, array
   constructor substitution, broad catch exemption or baseline growth is
   allowed. The mutable/alias/closure/shadowed-use cases are explicit controls
   against weakening the role proof. Unsupported cases remain findings.
10. **Contract/registry/proof alignment.** The new separately sealed unit
    records the classifier change plus three byte-preserving private literal
    owners; the fixture's test-only seal remains intact. Final source review,
    complete census, applicable owner/static gates and composition metadata
    remain pending. No receipt was changed by this reviewer.

No blocking defect was identified in the frozen test-only witness or bounded
design. The approval ends at old-source measurement and design intent. A later
implementation review must verify actual binding resolution, all allowed-use
checks, the complete removed-finding census and the exact product literal diff.

## Witness extension before implementation

The revised frozen detector test SHA256 is
`8cdab7b8760dd413ecd6a824225793aa01595282b2b67797886747d22358b35e`.
The additive diff keeps prior assertions and adds three required conservative
controls: a visible local AggregateError constructor shadow, reassignment of
the caught value before insertion, and moving the aggregate throw into a
deferred callback. All use the same real collector and existing finding kind.
They invalidate, respectively, known aggregation semantics, catch-value
provenance and immediate current-function settlement. The source transformation
anchors correspond to the preserved positive fixture.

APPROVE this revised witness for refreshed old-classifier red measurement.
The six harness and ten owner-interaction assessments above remain applicable;
these cases strengthen the complete-use proof and no-escape requirements.
The earlier baseline remains separate historical evidence and must not be
relabeled as execution of these revised bytes. No implementation or measured
result approval is given by this extension.
