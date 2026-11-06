# Independent planning implementation review

Verdict: **HOLD final package approval for two bounded proof corrections.** No new production defect was found in the two-file implementation. The explicit R09 supersession is correct. This review is bound to five-path manifest `15d577a50c41b27ca4647c927bdb75d5a629f0ea556eca476e6b8d00749feb22`, base `3bd7e2e8875c5ff32fd94162a3775aea991a35df`; every file hash matches. It is not Quest/formation acceptance.

## Sound source and scope

The sync DIRECT branch marks only the final answer through the existing context owner; the async contract and AVAILABLE branch are unchanged. Raw representation reuse requires the exact current frozen diagnostics object and exact membership in its frozen published-node domain. Entries live only on that diagnostics memo, target-specific keys remain separate, unowned/mutable/out-of-domain inputs still use the full canonical protocol builder, and every call still runs the normalizer. The normalizer's generation/cache/owner/fence guards remain intact. No new permission source, alternate readiness path, deadline, scheduler, or production fallback was introduced.

The old descriptor matches its prior review hash, its log ends `superseded` pointing to the successor, and both receipts remain fail/all-false. The successor explicitly seals complete 3+2*N accounting and downward whole-rig limits. The redundant predecessor design artifacts were removed to satisfy the closed-Quest minimal-proof owner; their exact bytes remain in the successor and original ignored evidence. This preserves the old claim and its evidence rather than rewriting its outcome.

## H1 — count completed observations and exercise the actual omission

`tracePublicationPlanningWork` records an `observation` before calling the real fresh-node builder (identity test near line 990). The accounting can therefore prove invocation, not that the expected node's readiness result was actually produced. The new negative vectors correctly reject removed/extra/unknown recorded events, but none runs the actual legacy omission against this oracle. The cold-phase work is also discarded without applying the full accounting oracle.

Record the observation after the actual builder returns, retain/validate the returned snapshot's node identity, and assert the complete cold-phase accounting before clearing it. Keep the all-event counter and exact expected fixture node set. Add one controlled omission of the real fresh-evaluation branch and verify the same oracle rejects it even when only three candidate builds remain. Keep the useful corrupt-vector negatives as measurement controls. This fulfills the approved work-accounting design without changing production, declared node domain, or bounds.

## H2 — validate semantic results at invalidation boundaries

The new lifecycle test mostly asserts a rebuild count or a null memo (around lines 950–985). In particular, the admission-fence provider allocates a new object on every call and the assertion only checks that the build count grew. That does not prove the reused raw input yields the current blocked/admitted answer. The approved design required fresh-result equivalence at these boundaries.

Compare the reused-input result to the canonical full protocol construction plus existing normalizer under the same current owner inputs. With one stable fence object per phase, assert the actual blocked admission state/reason, then valid recovery, while raw representation reuse remains allowed. Exercise semantic-generation and source/cache/publication-owner replacement against fresh derivation too. A cache-only replacement must not override an unchanged publication owner's answer; changed publication contents should come from the actual replacement owner, with fresh protocol identity and value checked. Keep the existing clear/identity/counter assertions as additional evidence.

While strengthening these controls, include the requested different-readiness-owner context case and assert that the retained-evidence arm actually engages its declared retained snapshot path. Resetting the context WeakMap isolates the marker's node/time/publication comparisons; label that scope accurately rather than claiming all unrelated memo histories are audited. No broader context-cache redesign is requested by this review.

## Existing evidence and ceiling

The 28-file current caller log is 27 pass/1 fail with 2729 reported assertions. The sole file failure is the retained missing-both-row self-grace concern (four TAP assertion failures inside that file); it remains open and is not waived by this bounded repair. The repaired identity/cost and required-domain files pass. The rehashed prior-source collection `74fb92b80518c13a3c5d7191e82ce525581602ba9373453d816f9abef4f4567c` preserves the original two planning witnesses red on exact 3bd, first attempt on Lenovo; its copied runtime-25-file prose is explicitly corrected by the adjacent collection scope.

The static aggregate originally passed 31/33, failing only one long test line and two redundant predecessor evidence files. The final test-line wrap and closed-shape cleanup are mechanically bounded; full lint and closed-Quest shape then pass. This accounts for all 33 static obligations on the reviewed input, but the proof corrections above will need applicable reruns and a new manifest. No static ratchet was raised.

No tracked changes, tests, or lab jobs were made by this reviewer. Inputs: `independent-planning-implementation-hold-inputs.json`, SHA256 `a3b0a4f3de72c9582d42ac4d9e457b270421ea91436bc25f54320ec7ea78ed7d`. Full affected-source proof, committed frozen verification, Quest receipt/land, E8, and E9 remain separate obligations.
