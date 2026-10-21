---
audience: development
documentClass: evidence
---

# Independent construction-audit review

Date: 2026-10-21. Reviewer: `subagent:/root/control_source_review`.
Round: design and test-only witness, before classifier implementation.

Verdict: APPROVE the bounded design in principle and the frozen test witness
for old-classifier red measurement. No classifier implementation, census
delta, static gate, landing or runtime acceptance is approved. No tests,
production edits, staging or commits were performed by this reviewer.

This record preserves the review originally delivered to root before moving
the audit unit to its isolated worktree. The destination HEAD was verified as
`92ae06ef40df6610cb2163edd7d6476cd65bb3ef`. The unchanged reviewed witness is
`test/scripts/check-guideline-decision-boundaries.test.js`, SHA256
`540ca8f5ad43343b0c16e513630c18e1a574cecd9a1ea86724a9c37dfe8c1850`.
The reviewed diff adds 205 lines and removes none; original tests remain.
The reviewer read this Quest's declaration and design, both verification
templates in full, the existing classifier and the real bridge acquisition.

## Harness fidelity: all six items

1. **Correct red.** Witness lines 660-703 require the actual bridge, renamed
   equivalent construction and syntax-label cases to produce no mixed-source
   finding. The existing identifier-only classifier at
   `scripts/check-guideline-decision-boundaries.js:387-420` should fail these
   assertions. This is an expected source-bound false-positive discriminator;
   import, parsing, setup or unrelated failures are not acceptable evidence.
2. **Honest seam.** The witness calls the actual exported collector. Lines
   663-671 read `src/bootstrap/owners/seed-runtime-bridge-owner.js`, verify its
   named method and unique publication anchor, and require absence of a
   mixed-source finding. Lines 673-679 inject actual cache and query reads
   into that same source method and require detection. No mock classifier or
   alternate expected-result implementation is used.
3. **Time fidelity.** These are parser witnesses. No clocks, budgets, retry
   cadence, timing compression or runtime scheduling changes are introduced.
4. **Field fidelity.** The construction cases use the actual relevant AST
   distinctions: const binding, NewExpression, static property labels,
   publication fields, optional/computed calls and known accessors. The real
   source's construction and publication occur at bridge lines 46-66.
5. **Nonvacuity.** Both substantive construction positives are paired with
   injected actual reads. Eighteen adversarial cases at witness lines 705-815
   and the getter-bearing field case at lines 818-837 require a finding.
   These cover constructor/publication arguments and callbacks, computed
   expressions, read-through access, aliases/destructuring, shadowed or
   reassigned bindings, overwritten fields and raw row alternatives.
6. **Live-binding ceiling.** This demonstrates audit behavior, not runtime
   SQL safety. Old and repaired classifier execution, preserved output and
   independent review of the complete finding-identity delta remain required.
   No measured result is inferred from this code review.

## Owner interaction: all ten items

1. **Single semantic owner.** The existing mixed-cache-and-SQL classifier is
   the audit authority. The design introduces no parallel checker, runtime
   dependency owner or new interpretation of cleanup permission.
2. **Typed boundary.** The witness filters the existing
   `VIOLATION_KIND.MIXED_CACHE_AND_SQL` and named function through the actual
   collector (lines 652-657). All other finding kinds and existing tests remain
   unchanged. This approval does not authorize modifying their behavior.
3. **Paired invariant.** Construction without a local truth read must stop
   producing the false positive while actual or unclassified mixed reads stay
   detected by the same classifier. The two positive/read-injected pairs and
   the adversarial table bind both sides; merely deleting the old finding
   without preserving the negative cases is insufficient.
4. **Stale-then-fresh analogue.** The paired source cases append real reads
   after otherwise identical construction/publication. Earlier recognition of
   construction must not exempt subsequent access. There is no runtime
   temporal replay or recovery claim in this parser-only unit.
5. **Pressure/backoff.** Runtime pressure, backoff and retry owners are not
   changed. This synchronous parser change provides no such runtime proof.
   The separate release-loop ownership decision remains outside this Quest.
6. **Re-evaluation path.** Each source sample is parsed again by the canonical
   collector. No cached construction verdict, persistent permission or local
   fallback is introduced; an actual added read must change the finding.
7. **Projection-authority attack.** Type names and property labels alone are
   not truth reads. Conversely, wiring-looking syntax cannot prove absence of
   access: constructor arguments, computed expressions, receivers, callbacks
   and publication arguments continue to be inspected. Naming is not an
   authorization to suppress evidence.
8. **Controlled negative.** The old classifier must first execute the frozen
   new witness and fail at the intended construction positives. Repaired
   measurements must use identical witness bytes. The complete before/after
   finding census must identify and explain every lost finding; a green
   focused test or expected nonzero exit is not sufficient.
9. **No local escape hatch.** The proposed change filters individual AST
   occurrences only. No file/function allowlist, whole constructor/setter
   exclusion, baseline increase or renamed-variable evasion is permitted.
   Unresolved binding provenance and unsupported forms retain conservative
   evidence. Scope-aware shadowing and mutation checks are necessary.
10. **Contract/registry/proof alignment.** The sealed
    `decision-audit-dependency-construction` Quest separates audit repair from
    runtime cleanup and release-loop consolidation, preserves other-kind
    negatives and requires full census review without baseline growth. Actual
    implementation, applicable metadata, guideline audits and exact measured
    proof must remain aligned before final approval. No completed receipt is
    inferred or edited here.

## Approved design boundary

The author's five proposed predicates are acceptable in principle:

1. Keep existing Identifier evidence by default. Ignore only the occurrence
   serving as a static constructor label or noncomputed, non-shorthand object
   key; never skip the enclosing expression's descendants or arguments.
2. A candidate handle is a direct const binding initialized by construction
   in the current function. Shadowing, reassignment, duplicate/unsupported
   binding shape or use inside a nested function cannot inherit an unproved
   passive-handle exemption.
3. A candidate field is a proved exact publication of that handle on the
   current plain class. Known accessors, unsupported dynamic fields, other
   non-null assignments, updates/deletes and unproved receiver aliases make
   the field conservative evidence. A null clear is not a data read.
4. Omit only proved passive occurrences: declaration/storage target, direct
   returned handle, exact null identity memoization guard, or the exact
   publication's RHS. Invocation, read-through properties, destructuring,
   alias initialization, raw row alternatives and unclassified uses remain
   evidence.
5. Omit a publication method-name occurrence only when a direct member call
   publishes exactly the proved constructed binding associated with its
   proved field. A setX spelling alone is insufficient. The receiver,
   computed selection and arguments remain traversed; query/execute access
   cannot qualify. Optional syntax does not weaken these requirements.

The implementation must enforce these occurrence and scope boundaries.
These predicates are not a proof of arbitrary dynamic JavaScript effects,
inherited accessors or proxies. If implementation broadens class, alias or
mutation support, that added support requires corresponding negative cases
and independent review. Known unsupported behavior must not silently become
an accepted construction case. No script implementation has yet been
approved by this record.

## Follow-up: narrower key role and added delegated-policy control

The author's provisional census identified losses outside construction,
including `readNodeSnapshot`'s delegated cacheFallbackPredicate labels beside
actual SQL evidence. Those losses must not be accepted merely because they
are property keys. Preserve that provisional census and its superseding
decision as evidence.

Design revision approved: omit a noncomputed, non-shorthand property-key
occurrence only when its object literal is a DIRECT argument to a
NewExpression. Do not find permission through an ancestor chain crossing
callbacks or other expressions. Nonconstructor delegated-policy keys remain
conservative evidence. This narrows the earlier design and does not waive a
file, method or finding identity. Full implementation/census review is pending.

Added witness at test lines 839-848 constructs a nonconstructor
cacheFallbackPredicate options object and passes it to db.query; the actual
collector must retain one mixed-source finding. The new exact test SHA256 is
`49895c1c463bc91c52233767b4bcd684941e594a7d4021b39d90de5ed8474f18`.
The addition changes no prior assertion. APPROVE this revised witness for
refreshed old-classifier measurement, with the same 6+10 category assessment
and proof ceilings above. No test execution or source approval by reviewer.

## Final source and census review before candidate measurement

Date: 2026-10-21. Reviewer: `subagent:/root/control_source_review`.
Verdict: APPROVE the following exact source/test bytes for candidate
measurement. This is independent implementation review within this bounded
audit scope, conditional on actual candidate results and remaining gates;
it is not landing or a claim that the full decision audit passes.

| Path | SHA256 |
| --- | --- |
| scripts/check-guideline-decision-boundaries.js | c79c7888cd423d1420e6ffaa8a6957fd321332f467915de95095b79fbb63bc6a |
| scripts/checks/decision-boundary-construction.js | 33dfb3a8b035620934981881316f26b93ccdbb3b7a8f062bf7f4621755ead180 |
| test/scripts/check-guideline-decision-boundaries.test.js | 49895c1c463bc91c52233767b4bcd684941e594a7d4021b39d90de5ed8474f18 |
| scripts/check-guideline-decision-boundaries-baseline.json | f38ebcf505e7c73ac57c59184f2a0a4005d32d9b46614c7ffbf84c5fe786eebf |

The checker change is limited to constructing the passive-occurrence set for
the mixed-source check and retaining its existing identifier classification
for every occurrence not in that set. Parent/ancestor AST context is supplied
by the existing traversal. Other finding collectors are unchanged. The helper
contains no path/function allowlist or baseline adjustment. Its final private
NODE_TYPE/SYNTAX constants and module-load intrinsic captures preserve the
reviewed predicates; the earlier source hashes remain superseded evidence.

All five implementation predicates were inspected:

1. Syntax labels are individually marked in a WeakSet. Computed constructor
   selection is not treated as a static label. Noncomputed/non-shorthand keys
   qualify only in a direct NewExpression argument object. The collector still
   walks every child, argument, callback and computed expression.
2. Constructed bindings require direct top-level const declarations initialized
   by NewExpression. Binding conflicts scan declarations, parameters, catches,
   assignments and updates; shadowing or unsupported binding forms cannot
   obtain the passive-use proof. Handle proof is not propagated into nested
   function/class scopes.
3. Field proof requires the enclosing nonstatic/noncomputed method of a plain,
   noninherited class. The complete visible class is checked for accessors,
   unsupported definitions, other non-null field writes, updates/deletes and
   unsafe receiver escape/computed use. This intentionally errs conservatively.
4. Only exact passive occurrences are omitted: declaration/storage, direct
   return, null equality/inequality guard and proved publication. Invocation,
   read-through, alias initialization and unclassified use remain identifier
   evidence; the helper never skips their expression subtrees.
5. Publication omission requires exactly one argument naming the proved
   constructed binding and the matching proved field's setter name. Receiver
   and computed/argument expressions remain traversed. A setter spelling or
   optional call alone grants no exemption.

Known static labels and proved wiring are not assertions about arbitrary
constructor/setter effects, external prototype mutation or proxies. Those
whole-program limits remain explicit. No broader binding or receiver support
was inferred from this bounded implementation.

### Independent census and gate checks

The reviewer independently compared the full violations arrays in
evidence/before/canonical-raw.json and evidence/after-final/raw-census.json as
multisets of file/function/kind identities, including occurrence counts. Raw
findings change from 791 to 790. The only removal is one
mixed_cache_and_sql_decision at
src/bootstrap/owners/seed-runtime-bridge-owner.js/acquireSqlQueryEngine.
There are no added identities or other-kind/count changes. This independently
matches evidence/after-final/delta.json; every hash in that delta was recomputed
and matched. The baseline file is unchanged from the old-source checkpoint.

The earlier broader ten-removal census is preserved in evidence/after and
was not accepted. The narrowed implementation preserves the nine unrelated
nonconstructor-key findings, including delegated cache fallback policy. The
single removed bridge finding is justified by its actual construction and
publication body, not by merely preferring a smaller count.

The refreshed old-source packet evidence/baseline-f0084d02a binds
f0084d02ac421ea85f36be3de28eaf29dc49b019 on lenovo-laptop, retry disabled.
The controller and ledger show attempt 1, retriedOnce false and the intended
three construction-positive failures. Paired real-read cases, adversarial
controls and the new delegated-policy negative pass. The ledger reports 146
assertions including case results; these must not be confused with the
author's 99 leaf assertions or 47 cases. No setup/import failure supplies red.

evidence/gates-final/results.json records successful lint, helper/test strict
metrics, scoped literal/decision/ambient/catch checks and impact-contracts.
The full decision audit remains exit 1, with 37 unresolved new findings and
753 inherited findings. This review does not approve those findings, increase
their baseline or turn that full gate green. No candidate behavioral run has
yet been reviewed in this round.

### Checklist disposition

The six harness items above remain binding: exact original-source red is now
observed; the real collector and source-injected pair remain unchanged;
there is no timing treatment; AST fields and all negative seams are retained;
no positive is vacuous; runtime authority remains outside the proof ceiling.

The ten owner-interaction items remain binding: (1-2) one existing classifier
and existing finding kind; (3-4) paired construction/read and post-construction
access controls; (5) no runtime pressure/retry changes; (6) fresh parsing;
(7) occurrence roles, not naming, justify omissions; (8) preserved old red and
independently checked complete census; (9) no subtree/path/baseline escape;
(10) separately sealed scope and applicable metadata, with candidate result
and final composed-gate review still pending. No blocking implementation or
census finding was identified in the frozen bytes above.

## Independent candidate-result review

Date: 2026-10-21. Reviewer: `subagent:/root/control_source_review`.
The reviewer inspected evidence/candidate-575138446/input.json, controller.txt,
result.json and ledger.ndjson. The controller placed exact candidate
575138446abcde520b8474ee24faa938f8ca8fa4 on lenovo-laptop through the classified
ordinary runner. Input disables retry, placement reports retry:0, and the
ledger records attempt 1 with retriedOnce false. Result status is 0; one
selected file passes with 146 runner-reported assertions and no failed files.
These are the same 47 cases in the unchanged witness; runner assertion counts
include case results and must not be called 146 leaf assertions.

Each of the three input hashes was independently recomputed from the exact
candidate Git blob and matches the approved checker/helper/test hashes above.
Git comparison with old-classifier f0084d02ac421ea85f36be3de28eaf29dc49b019
confirms the witness file, entire runtime src tree and audit baseline file
are unchanged. Both compared measurements used lenovo-laptop without retry.
Automatic placement factor changed from 2 to 2.2; this parser-only comparison
does not make a timing-performance claim.

The old-source run failed exactly the three intended construction positives
while retaining read controls. The candidate now passes that same witness,
including its paired source-injected reads, adversarial uses and delegated
nonconstructor fallback negative. Together with the independently checked
complete census and exact source review, this supports the bounded audit fix.
No physical runtime, SQL truth-source, startup or distributed-safety claim
is inferred from these parser results.

Receipt recommendation for this exact unit:

1. engaged-classifier-red: **true**.
2. construction-positive-and-adversarial-mixed-reads: **true**.
3. reviewed-census-delta-without-baseline-growth: **true**.
4. independent-review-and-applicable-gates: **false / HOLD**. This independent
   code/census/result review is complete, but the full decision audit still
   reports 37 unresolved findings and is not green. No owner waiver or
   terminal landing decision is supplied here.

Verdict: APPROVE the measured bounded classifier behavior and finding delta.
Overall Quest status remains fail/open pending its applicable gates. The
reviewer ran no tests, changed no receipt/source/test, and did not independently
verify a remote push; this result assessment binds local Git objects and the
preserved runner packet. Later preservation-only commits must identify the
measured candidate rather than claim execution at their own SHA.
