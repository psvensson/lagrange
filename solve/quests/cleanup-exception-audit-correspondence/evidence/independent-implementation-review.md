---
audience: development
documentClass: evidence
---

# Independent exception-collection implementation review

Date: 2026-10-21. Reviewer: `subagent:/root/release_recovery_writer`.
Reviewed worktree HEAD: `0e003dc89c808ac23a7c1fe18e70342f058486b0` plus the
explicit candidate files below. This is a dirty-worktree, exact-byte review,
not a claim that HEAD already contains the implementation.

**Verdict: APPROVE these exact source bytes for the declared locked candidate
measurement.** No actionable implementation blocker was found. The original
red is engaged, the sole census removal is justified, and the product edits
preserve the existing values and control flow. Candidate execution, applicable
canonical changed-path/change-proof gates, exact composed validation and final
Quest acceptance remain pending. This verdict does not approve landing, main,
publication, U1, bootstrap recovery or a release.

The reviewer read the sealed Quest/design, the earlier independent design/test
review, the current classifier and helper, both product files, frozen tests,
both raw censuses, baseline output and the complete harness-fidelity and
owner-interaction templates. Only this evidence document was written. The
reviewer ran no tests, native work, staging or commits; independent calculations
below read files and Git blobs without modifying them.

## Frozen inputs

| Path | SHA256 |
| --- | --- |
| `scripts/check-guideline-decision-boundaries.js` | `2fb94d4f1a0091e630b5b88538fe6bc1f19e09933974a62a81cfa5446040380b` |
| `scripts/checks/decision-boundary-exception-collection.js` | `2054984db6c8fd64864fa10697b1b2839fc2c5e5902055146fae1c45481bb7d1` |
| `src/bootstrap/shared/message-group-transport-handler.js` | `52485b9bc111a047ddc69c47065ca8c0e8563bee14fcc49260ff1fd1107a9847` |
| `src/wasm-service/wasm-service-replica-lifecycle.js` | `620d226b2ea71c51b56b38435ec5965e036a6ee48688c0f280a03d60dea63a74` |
| `test/scripts/check-guideline-decision-boundaries.test.js` | `8cdab7b8760dd413ecd6a824225793aa01595282b2b67797886747d22358b35e` |
| `scripts/check-guideline-decision-boundaries-baseline.json` | `f38ebcf505e7c73ac57c59184f2a0a4005d32d9b46614c7ffbf84c5fe786eebf` |

All six current hashes independently match the candidate census input manifest.
The test and baseline are byte-identical to their Git blobs at the HEAD above.
The old census was captured against `a0dc88427b61a51d3cea7fc2ff8cdaa7fbdf7ec5`;
its checker and both product-source hashes also match the later old-classifier
HEAD. Its older test hash is historical: the revised witness was subsequently
measured at `0e003dc89c808ac23a7c1fe18e70342f058486b0` and is not retroactively
attributed to the earlier census capture.

## Source assessment

The helper recognizes a declaration only through all of its uses. At
`scripts/checks/decision-boundary-exception-collection.js:55`, the candidate is
a direct block-local `const` identifier initialized with an empty array.
Lines 63-79 reject uses outside that block, before the declaration, under a
deferred function/class scope, or involving another use of the inserted catch
binding. The proof scans every same-named identifier occurrence, including
shadow declarations and unsupported aliases; it is deliberately conservative
rather than an alias-analysis claim.

The allowed push at lines 81-90 must be a direct, nonoptional `.push` statement
with one argument that is the unchanged identifier of the enclosing catch.
The exact `.length > 0` condition at lines 93-114 must guard a block with no
alternate whose terminal statement is a throw. Lines 116-149 require the
candidate as the first argument of `new AggregateError` within that same
guard's terminal throw. At least one caught push, exactly one length guard
and the matching aggregate guard must be engaged. Any unrecognized reference
invalidates the whole declaration proof; a catch body or familiar variable
name does not grant exemption.

Lines 44-52 conservatively refuse proof for direct eval/with and visible
AggregateError bindings or nonconstructor uses anywhere in the program.
Computed/global mutation, hostile prototype replacement and arbitrary dynamic
runtime behavior are not proved; the helper states that limitation at lines
152-154. The role proof does not prove the implementation of a surrounding
error-wrapper function. It proves the vector's restricted exception-data uses.

The collector integration at
`scripts/check-guideline-decision-boundaries.js:855` computes the declaration
set through the existing parser/AST. Only the existing raw-empty check skips
those exact declaration nodes at line 312. No AST subtree, other finding kind,
function, filename or baseline is skipped. The shared walker continues visiting
all descendants; the parser supplies the ranges required by the proof at
`scripts/guideline-check-shared.js:110`.

At `src/bootstrap/shared/message-group-transport-handler.js:84`, caught shutdown
and retirement exceptions still feed the original array. The existing host map
at lines 100-102 retains exact cleanup custody; the vector only constructs the
secondary exception at lines 104-105. The only changes in this file are two
private constants and their original use sites. Independently reversing those
literal substitutions in memory reproduces the old file byte for byte.

At `src/wasm-service/wasm-service-replica-lifecycle.js:279`, the error settlement
still creates the same own string-keyed field. Line 292 still tests its presence
with `in` and throws the stored value, including undefined. The new private
constant does not replace presence with truthiness or change early settlement
capture, await ordering, handler identity or cleanup-state transitions.
Independently reversing only this constant normalization in memory likewise
reproduces the old file byte for byte.

## Harness fidelity: all six items

1. **Red for the right reason.** The preserved
   `exception-baseline-0e003dc89/controller.log` shows the actual-source anchor
   passing, then the intended raw-state finding for the real MG declaration
   failing the assertion at test line 713. The paired publication mutation
   passes. The only other two leaf failures are the original and renamed
   accumulator positives at lines 723 and 726. The run has 39 cases and 94 leaf
   assertions: 91 pass, 3 fail; the runner counts 133 assertions including case
   results. Setup/import/timeouts are not the failure mechanism. Its input
   names the exact old SHA, adam-laptop and retries disabled; its result ledger
   records attempt 1 and `retriedOnce: false`.
2. **Honest seam.** Test lines 686-690 invoke the real exported collector and
   filter its existing finding kind/function. Lines 709-718 read the actual MG
   source and introduce one explicit semantic-state escape. The synthetic
   renamed fixture supplies parser input, not a substituted audit implementation
   or a simulated native cleanup owner.
3. **Time fidelity.** This parser/source witness has no compressed clock,
   retry, deadline or shutdown double. None of the three product literal edits
   changes time or scheduling. Runtime timing behavior is outside this audit
   witness's claim.
4. **Field fidelity.** Lines 693-705 include the exact declaration, catch
   bindings, push, length guard and thrown aggregate roles used by the proof.
   Lines 730-781 explicitly attack state publication, unknown consumer, aliases,
   closure/shadow binding, mutation, nonexception insertion, extra state guard,
   computed read, shadowed AggregateError, reassigned catch value and deferred
   throw. Raw returned/mutable semantic arrays remain controlled negatives.
5. **Vacuity.** The actual-source anchor requires exactly one original
   declaration, and the old run proves that positive cases reach and fail the
   detector. Both the real and renamed positives have caught pushes and a
   coupled aggregate guard. Actual-source publication and all negative cases
   are required to keep their finding; an empty result everywhere cannot pass.
6. **Live binding.** The live observable here is the existing source-audit
   collector's finding. The actual-source case binds to the MG owner bytes.
   It does not execute native MG/WASM cleanup or prove startup/recovery; those
   unchanged owner interactions still need the applicable candidate witnesses.

## Owner interaction: all ten items

1. **Single semantic owner.** The existing decision-boundary checker decides
   whether this declaration encodes unnamed state. Its helper only supplies a
   restricted AST-role proof. MG custody remains the existing service map and
   cleanup owners at product lines 84-107, not the vector or audit output.
2. **Typed boundary.** The helper returns a Set of exact declaration-node
   identities. The checker retains its existing finding schema and kind; the
   skip cannot grant runtime authority. MG error code/message and WASM settlement
   key keep identical values. No new boolean policy or runtime outcome appears.
3. **Paired invariant.** Test lines 707-718 require both acceptance of the real
   caught collection and rejection when that same source publishes its vector
   as outcome. Renamed and escape cases exercise the same collector. The old
   run fails only the three intended positives while the escape controls pass;
   candidate execution of identical tests is still required.
4. **Stale then fresh.** Each fixture invokes fresh parsing; no previous
   finding or exemption is cached across source revisions. The actual-source
   positive and its edited escape are independently evaluated. This is a source
   re-evaluation claim, not temporal runtime recovery evidence.
5. **Pressure/backoff.** The repair adds synchronous AST inspection and no
   scheduling, retry, single-flight or backpressure policy. Exact reverse
   normalization proves the product control-flow bytes are otherwise unchanged.
   No performance or concurrent runtime pressure measurement is claimed.
6. **Wake/release path.** A changed source is re-evaluated through the same
   canonical collector. The audit exemption cannot wake, resume, cancel or
   discharge cleanup. MG and WASM release ordering remains unchanged by the
   literal substitutions; candidate owner witnesses remain a separate gate.
7. **Projection authority.** The raw/report JSON and this review are audit
   evidence only. Nothing feeds them into a runtime decision. The host map still
   retains cleanup obligation; the exception collection is never promoted into
   a competing state owner by this classification.
8. **Controlled treatment.** The frozen test matches the exact old-red Git blob.
   Treatment changes the classifier/helper plus the three literal owners;
   pass criteria and baseline are unchanged. The full census comparison below
   binds the observed removal. Expected old-red samples are not positive
   certification, and the future candidate run must name its committed SHA.
9. **No local escape hatch.** The complete diff contains no name/path exemption,
   baseline change, catch-body suppression or subtree skip. All-reference proof
   rejects unsupported use, and visible eval/with/constructor ambiguity fails
   closed. No direct native reads, force flags, fallback success or new retry
   owner was added to product source.
10. **Contract/registry/proof alignment.** The sealed Quest names this bounded
    classifier change and exact literal invariants. Existing impact contracts
    cover bootstrap sources and the WASM lifecycle/custody pairs in
    `test/shards/impact-contracts.json`. The detector remains primary `unit`
    and resource `ordinary` in the current classification files; the existing
    MG custody and WASM lifecycle witnesses remain registered. No runtime
    interaction contract is changed here. Generated dependency/impact metadata
    and canonical applicable guards must be refreshed/verified at the actual
    candidate checkpoint; this dirty-tree review is not their substitute.

## Independent census and preserved evidence

The reviewer recomputed the complete identity multiset from both preserved raw
JSON files using `(filePath, functionName, kind)`, retaining missing function
names as null and counting duplicates. Raw findings change **791 to 790**, with
one and only one count delta:

`src/bootstrap/shared/message-group-transport-handler.js` /
`initializeRegisteredMessageGroup` / `raw_null_empty_state_outcome`: 1 to 0.

No identity is added and no other identity count changes. The only kind count
change is raw-empty-state 421 to 420. Scanned files change 2260 to 2261 because
the new helper is included. Inherited findings remain 753, the unchanged
baseline count remains 806, and unbaselined findings change 38 to 37. The
candidate still has those 37 unresolved full-census findings. They are preserved
obligations, not waived findings and not silently added to this bounded unit.
The earlier independently owned SQL-construction correction is not composed
into these source bytes or this census.

All entries in the old-census, candidate-census, candidate-gates and revised
baseline `sha256.json` manifests were independently recomputed: respectively
3, 4, 3 and 4 files, with no mismatches. All six candidate input hashes match
the current files. Evidence is in the adjacent
`exception-audit-old-census`, `exception-audit-candidate-census`,
`exception-audit-candidate-gates` and `exception-baseline-0e003dc89` directories.

The supplied scoped owner-statics artifact reports no problems for its five
named source/test paths, and the helper strict-metrics artifact reports no
cyclomatic/cognitive violations. The fast-static artifact reports success
with proof range `0e003dc89..HEAD`; it is not promoted here into a completed
exact-candidate guard receipt. The candidate is not yet committed at this
review, and its locked test/owner-witness execution is pending.

The approval is therefore exact-source permission to measure, with no request
to change a baseline, relax a contract or repair all unrelated global findings
inside this Quest. Final applicable guard/change-proof and composed checks
remain explicit. Any implementation byte change requires checking this review's
scope and evidence binding again.
