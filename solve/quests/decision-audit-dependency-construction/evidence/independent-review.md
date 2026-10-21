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
