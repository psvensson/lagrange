# A0 checkpoint independent review — APPROVE for checkpoint preservation only

Reviewer: `/root`, independent of `/root/rsraft_a0_readiness` and original witness author. Reviewed 2026-10-18. Subject: `test/service/service-consensus-creation-intent.test.js`, SHA256 `59d3627fdbbd784853ce21df5054ffd9460d59e5156ff0527bb426eae7c89147`, base `a1c3cde54fcb46471791062bcae4a6000ae484e0`, unchanged src tree `97388f76ab4468da91b4a7eb9badc8b3c1804e62`.

This approves preservation of three measured failing reservation-finality witnesses plus one control. It does not approve production behavior, A1 implementation, U1, Quest closure, native/distributed proof or merge to main. U1 REJECT remains binding. The checkpoint ran outside Harnessd and must not be represented as a Harnessd implementation result. Actual normal-hook commit must later be bound to this exact test hash and unchanged production tree.

I inspected the staged test diff, real component fixture, reservation/cancellation owner call sites, raw final TAP, all 33 classified case identities, provenance, and both generated-artifact diffs. Independent hash audit verified all 24 manifest entries, exact original test prefix and empty staged/unstaged src diff (`a0-root-evidence-audit.json`). I did not independently rerun the test. Author's official runner evidence is 33 tests: 30 pass, 3 semantic ERR_ASSERTION failures, zero skipped/cancelled/todo, exit 1. This is expected-red evidence, not a product pass. Dependency sharing and native ABI are explicitly disclosed in provenance. Scoped lint passes; broader 85 inherited lint errors and complexity 1793/1755 remain open and are not waived by this review.

Evidence abbreviations: T = changed test file; F = `test/service/service-consensus-creation-fixture.js`; S = `src/control-plane/owners/service-instance-state.js`; C = `src/service/service-consensus-creation-intent.js`; E = `solve/quests/wasm-creation-genesis/evidence/guidance-20261018/a0/resumed-20261018/`; R = E`format-final/`. The final test lines 369–474 are the append-only checkpoint.

## Owner interaction (10/10 dispositions)
1. Reservation finality belongs to the authoritative resource owner. S reserve/close/selection and C:50–52,339–373 expose the erroneous local refusal interpretation. T observes this defect; it introduces no second production decision.
2. F delegates to actual metadata owner and SQLite. T passes original binding/request and genuine close token, then observes journal/resource mismatch. No new operational boundary or alias.
3. Durable journal obligation and resource admission are demonstrably contradictory in the same three R TAP samples. The checkpoint is deliberately red; paired invariant preservation is an A1 approval requirement, not claimed here.
4. T:373–460 changes genuine blocker/selection state after temporary refusal and resumes the original request. R diagnostics show old cancellation survives newer ADMITTED evidence. This is the required stale-then-fresh counterexample, not proof of its repair.
5. No retry/backoff/liveness change; deterministic promises delay one original request. Pressure/amplification proof is outside this test-only checkpoint. Existing owner calls are not bypassed.
6. Genuine close or exact SELECTED binding is the release event, followed by explicit release of the delayed original owner call. No timer supplies semantic progression. Production event-driven retry remains A1/U1 work.
7. T uses direct state only as a test oracle. F and C remain the operational paths; diagnostics do not drive admission or recovery.
8. R provenance binds exact test/source bytes and raw negative samples. No treatment or passing certification population is claimed. Formatting-only AST reports plus exact prefix audit preserve prior controls.
9. Source diff is empty. Test interception holds the first call and delegates every decision to the captured original reserve; no fallback success or alternate repair loop was added.
10. Existing component classification remains. Generated impact seal/import graph adds the actual dynamic S import edge and updates digests; inspected debt statistics and thresholds are not increased. No production contract changed in this checkpoint.

## Admission gating (7/7 dispositions)
1. No new precheck. Future binding is predicted solely to construct immutable input, then T asserts real selection equals it; prediction grants no authority.
2. Three transient refusals are deliberately misclassified by current C. R has exact TARGET_ALREADY_OWNED, INVALID_EXPECTED_STATE and STALE_BINDING cancellation diagnostics. Classification repair is not approved here.
3. No new wait budget, timeout or raised threshold. Promise gates encode ordering only; existing classified runner bounds execution.
4. T/F consume actual structured owner outcomes and real tokens. R records exact outcome/reason objects; no string/object conversion substitute.
5. Real CLOSED/SELECTED precedes releasing the held reserve. No latency or distributed propagation claim; those require subsequent owner/physical evidence.
6. Actual reserve uses current durable CAS after release, not the earlier diagnostic snapshot; R final resources are ADMITTED.
7. Diagnostics include exact original operation, final resource token, row state and admission JSON. They distinguish blocker setup from original obligation.

## Concurrency serialization (5/5 dispositions)
1. No synchronization implementation added. Promise gate exposes unresolved original work while independent resolver runs, and existing concurrent-delivery control remains unchanged/pass. No claim of complete serialization repair.
2. T intentionally puts an await between original entry and owner reserve; another real owner action changes authority before resume. This attacks rather than excuses the production TOCTOU.
3. Both paths delegate to real resource CAS, and close requires its genuine token. No synthetic second winner. Single-winner correctness beyond measured component controls remains U1 scope.
4. No setInterval/setTimeout callback in added witnesses; reentrancy is explicit deterministic interleaving.
5. Gate targets exact original operation ID and delays it once; blocker is separate. No new mutex or unrelated serialization key.

## Recovery replay (5/5 dispositions)
1. No recovery implementation change or claim to close F2/F6. Existing intent-preservation controls plus new journal-only control are retained; B0/B1 own inventory/lifetime repair.
2. No new restart discriminator. T invokes fresh manager against retained SQLite journal to exercise existing path; component restart simulation is disclosed by F.
3. No participant enlistment in this component fixture; native participants and legitimately-empty formation are outside checkpoint scope.
4. Existing lost-reply, redelivery and concurrent-identical controls remain in exact original prefix and pass in R. No added rollback/dedup mechanism.
5. R shows cancelled row falls out of inventory despite exact owed ADMITTED resource. This proves absence from scan cannot discharge custody; no successful recovery claimed.

## Transport delivery (5/5 dispositions)
1. No message router or transport ACK tested; F is direct component SQLite adapter. Native delivery is explicitly excluded.
2. Delayed response is modelled at original owner-call boundary and reaches semantic assertions. Network SERVICE_RESPONSE handling is not claimed.
3. No transport outcome schema or retry classifier changed. These tests concern owner result objects only.
4. No undeliverable network path exists in fixture. Classified runner bounds test execution; no network liveness claim.
5. No router stub added. F delegates the seam under attack to real resource metadata/SQLite, while journal writes remain explicitly component-local.

## Harness fidelity (6/6 dispositions)
1. R TAP has exactly three named ERR_ASSERTION failures, each reached after required blocker/selection preconditions. No import, setup, timeout or missing-method failure. Independent 33-name audit matches matrix to raw TAP.
2. F retains real reserve implementation, SQL journal and genuine owner CAS. Delay wrapper changes scheduling only; no owner verdict is stubbed. Local SQLite is not replicated SQL.
3. No clock/timeout compression. Promises determine order: durable PENDING → refusal/cancellation → real authority transition → original admission. This is sufficient for the counterexample, not latency evidence.
4. Existing F constructs complete genuine descriptor/binding/request with actual SELECTED result and schema-backed rows. Future selection deep equality prevents a different-binding substitution.
5. ADMITTED blocker, durable PENDING, genuine CLOSED, exact future SELECTED and final diagnostic resource identity exclude setup vacuity on this measured source. A1 must additionally assert retained pending/token and green repaired behavior; weak final absence alone cannot certify the repair.
6. Explicit component-only scope in T/F, provenance and this verdict. No live serving/native/physical proof inferred.

## Formation circularity (5/5 dispositions)
1. F uses component-local SQLite journal and metadata owner; no moving replicated ledger or formation-dependent CDC path is exercised. Source machinery unchanged.
2. No production re-drive/fallback introduced; starvation during distributed formation remains unproven and outside checkpoint.
3. No concurrent client-facing formation operation is claimed. Tests stop at original intent/resource admission.
4. No formation timing window or client budget measured; source/test declaration and provenance explicitly limit scope.
5. No consistency bypass fix exists: actual CAS and genuine close/selection are retained and production bytes unchanged.

## Required continuation

Preserve this evidence and normal-hook outcome without altering historical verdicts or sealed Quest definition. Record independent verification through the existing Quest owner. After successful checkpoint publication verify remote exact SHA and bind it to the test hash/src tree above. Prepare future A1 with ordinary green proof and explicit owner finality/consumer controls; do not retroactively accept an already completed A0 Harnessd task. B0, corrected U1 independent review, U2 and release evidence remain separate gates.
