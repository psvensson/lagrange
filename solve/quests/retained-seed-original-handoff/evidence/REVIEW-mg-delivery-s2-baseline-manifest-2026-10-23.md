# Independent review — S2 frozen baseline manifest, 2026-10-23

Reviewer: `subagent:/root/retained_effects_review`.

**Verdict: APPROVE this exact eleven-file scope for non-main test-candidate preservation and baseline lab measurement only. No additional blocking source finding was identified.** This does not approve a production change, assert runtime engagement, certify the full W7 interaction, close the Quest or authorize merge.

This review is independent of both test authoring and the preceding premise/source review. I changed no test, production source, metadata, root Quest log or lab evidence; this new review is my only repository write for the task. I ran no local test/native runtime or lab workload.

## Frozen identity and authority

The worktree base is `4ce8fbd31b7c44129a3431752313b2e9c0ae19ab`. I checked all eleven working-tree file hashes at entry and completion against `MANIFEST-mg-delivery-s2-baseline-2026-10-23.json`, SHA256 `abfc68bc84df91515100915dca7ec6b85aed3e6222ab6a1c0916076459e7b30c`; the repository copy equals `/tmp/mg-delivery-s2-baseline-manifest-2026-10-23.json` byte-for-byte. The frozen files comprise two new test/support JavaScript files, six registry/generated files and three existing approved evidence documents.

| Authored executable file | SHA256 |
| --- | --- |
| `test/message-group/message-group-native-provisional-route-fixture.js` | `0ad1ba30c274779fddbbf57a199e2a8d4f4ce377f2fc16b62743454d54f71673` |
| `test/message-group/message-group-native-provisional-route.test.js` | `128995ce2c8002b1266ba4eaad14c6f66c1919f43db89c274eba9465887543ab` |

The governing `CONTRACT-mg-source-occurrence-delivery-2026-10-23.md` is independently hash-checked at `474182126c3c985feceadb9a1b72d7de9975e1b4c3280af52be884c6c095f383`. Its F3 native-route release and F2-P complete weak-coverage rules remain the authority. The corrected S2 plan explicitly permits a one-critical-target prerequisite before full multi-window W7; it does not reinterpret that larger acceptance boundary. Its earlier incoming-only F1 cut is superseded by its preserved two-direction correction.

The three manifested PLAN/REVIEW documents preserve their earlier findings and corrections. In particular, the test observer now forwards the identical private third `deliveryContext` argument to the real seed bridge; it does not mint, serialize or replace that context. The preceding missing-context REVISE remains in history. No existing RF1/RF3 or canonical-validator test is weakened by this scope.

Production `src` is unchanged in this worktree, and the committed source tree remains identical to `21cfd917d8ceb2f0c1435cade117c0c44a91a03a`. Root's separate moving production draft, unrelated Quest log updates and #1026 artifacts are excluded.

## Material source correspondence

**Source authority is real and separate from row construction.** Fixture `prepareProducer` at line 281 uses the actual admitted RF3 partition fixture and release owners and requires CUT_OVER. Test `writeOrdinarySource` at line 54 calls ordinary sessionless `executeQuery`; on all three voters it binds retained QUERY bytes/parameters, exact index/term/entry ID, settled APPLIED outcome, physical SERVICES row, durable obligation and producer HLC. A precedes B in the same ledger. `registrationInsert` at fixture line 356 uses the existing row owner and SQL builder only to construct canonical STOPPED bytes. It neither grants registration/activation authority nor manufactures an INSERT result, native opening grant or source debt.

**The recipient prerequisite consumes actual native state.** Fixture lines 227–279 form all five G voters and require the same native configuration, leader and applied frontier. F1/F2 then undergo exact handler retirement, ordinary shutdown and same-file reopening through `closeReplica`/`reopen` at lines 178/204; the assertions compare native record, identity reservations, peer ID, configuration, inode and replacement port/handler. F1's cut is bound to its actual retained peer identity and G, covers both native directions, and leaves application traffic on the real router. It does not inject a role, readiness result, relay depth, join flag or native receipt. F1 may become a real pre-candidate/candidate while isolated; only nonleadership and no native leader route are required.

F2's entire L row and bootstrap hints are absent, preventing both address and node-id reconstruction. The native owner must nevertheless observe it as FOLLOWER of L with an unavailable location. The healthy L/H1/H2 quorum remains available. `tick` at fixture line 122 drives **every** hosted native port, then the unchanged finite pump; this does not repeat the separate #1026 loss loop's frozen-survivor lease schedule.

**The paired A/B operation stays intact.** The complete six-service operational selector chooses the real RF1 source MG, while safe target enumeration captures distinct G through F1. Real tree/topology initialization is performed at test line 144. The source subscriber is the production factory result; the selection, seed-bridge and router observers delegate to their actual owners and preserve arguments.

The real router holds B at its first addressed send without changing B's payload or substituting a result. Test lines 265–294 require A's actual provisional F2 answer, actual depth-0/depth-1 ingress, native S application, no native G occurrence, all source debt still owed, no appended ACK, the real provisional topology aggregate and later B reached by that same scan. A fabricated ordinary success or absent handler cannot satisfy the canonical result predicate.

After release, test lines 296–320 require B's actual CDC/cache application and reconciliation wake to resolve L on the **same F2 port/lifecycle/configuration while it stays FOLLOWER**. STOPPED B supplies the configured location without replacing ACTIVE F1 in the captured target set; the actual peer resolver accepts location independently of safe topology eligibility. No cache/peer resolver is patched to make B's effect happen.

Test lines 322–377 redrive through the existing source owner. The actual F2 and L results must be canonical committed answers; L receives the remaining depth-2 hop. The receipt resolves to retained native bytes at result time, with matching index/term, complete exact source envelope and committed/applied frontier. All source replicas eventually must apply actual CDC_DELIVERED positions for both A and B, and each has a corresponding L receipt. The old always-local-after-B behavior is rejected by a concrete provisional/native outcome and frontier difference, rather than by declaring a timeout itself a semantic kill.

The held-B read does not await a fabricated source completion. Existing `partition-cdc-delivery.js:674–678` starts its ledger drive and returns the handshake; the actual source driver, not this fixture, advances the owed cursor. Native setup or source handshake failures must still be reported as prerequisite failures if they occur in the lab.

## Bounds, cleanup and unmeasured risks

The new fixture uses its declared setup budget 10000 ms, 200 setup rounds, 64 pump rounds and 16 microtask steps. No production budget, relay-depth limit, acceptance predicate, ratchet baseline or prior test bound is changed. Its real next-turn yield allows existing cache notification work to run; it does not override the cache scheduler. These source checks do not establish measured end-to-end latency or that every future invocation fits its budget.

Cleanup at fixture line 295 stops subscription/topology admission, releases the test-owned B hold, pumps retained work, attempts exact handler/port/database closure for every hosted service, awaits tracked application settlements, and closes router/release/source owners. Native held envelopes are never flushed into a reopened successor and are discarded only after cleanup succeeds. Failure retains directory custody and is surfaced. Pending-callback settlement remains a runtime obligation; source review cannot certify that every such wait terminates.

The baseline source is known to lose occurrence metadata and return early/noncanonical delivery outcomes. Therefore a red job is expected, but its **actual first failure must be reconciled**. RF5 formation, retained reopen, missing route, source admission, module/import, timeout or no-handler failures are not the intended S2 semantic red. The named `S2_PROVISIONAL_A` assertion is meaningful only after actual F2 handler return and the earlier setup gates; later F3/ACK assertions need their own engagement. Full original worker output and native/source cuts must be retained even when the baseline fails early.

## Category-complete review

| Category | Evidence and bounded disposition |
| --- | --- |
| Admission/gating | Fixture `prepareProducer`; test `writeOrdinarySource` and `assertPartialRouteSetup`: real CUT_OVER/ordinary QUERY/readiness/native observations; no opening or activation bypass. Runtime setup unexecuted. |
| Retry/redrive | Test lines 283–294 and 322–377: actual later-row traversal, same source wrapper/tenure, canonical source redrive and source ACK owner. Multi-budget fairness, expiry and storm bounds are not covered by this small prerequisite. |
| Transport/delivery | Fixture `pump`/`deliverApplication`; test `requireReturn`, `assertActualIngress`, `assertNativeReceipt`: exact G/F1 native custody, transparent real application delivery, actual relay depth and native receipt. Transport ACK alone never passes. No physical WebSocket/network claim. |
| Sweep/timer | Fixture constants/pump/tick and cleanup: explicit finite actuation, all live native cores ticked, real next-turn cache notifications, no timer or threshold change. No periodic production owner changed. |
| Recovery/replay | Fixture `reopen`, test envelope and receipt comparisons: retained exact file/record/identity with a new live port, fresh canonical A redrive, no cache reset pretending durable loss. This is ordinary native reopen, not original-seed recovery proof. |
| Concurrency/serialization | Real source lane retains scan/ACK ownership; unchanged subscriber wrapper/tenure and F2 lifetime checks; transparent private context; tracked application settlements. Replaced-subscriber/late-answer/multi-caller pressure cases remain outside this scope. |
| Formation circularity | A stays owed while its real provisional result releases the scan to B; B supplies F2's native route without election or ACTIVE publication; fresh A must reach L. One critical target/subscriber only, not the full W7 population. |
| Harness fidelity | Real source/recipient/router owners, explicit source vs target groups, canonical STOPPED row bytes, guarded preconditions and result-time durable reads. Partial-route setup has not yet been measured; no acceptance result is claimed. |
| Owner interaction | Existing `cdc-source-native-delivery` registry/pair gains this exact witness. Canonical outcome owner decides semantics, topology composes, source ledger owns debt/ACK, native owner proves application. No parallel semantic decision store or fallback is added. |

Hostile canonical-validator vectors are unchanged and remain a separate witness. This two-file addition introduces no production hostile-input validator.

## Static and generated correspondence

All 24 local imports in the support file and 45 in the test resolve to actual source exports by independent AST parsing, including barrel exports. Neither source module initialization nor a native test was executed for this check.

I verified the hashes and read the seven supplied static logs named in `/tmp/mg-delivery-s2-baseline-static-summary-2026-10-23.json`. They record normal pre-commit regeneration, scoped complexity 0 at threshold 12, scoped cognitive complexity 0 at threshold 20, current classification at 2445 tests/22 subsystems and impact-contract audit PASS for 71 contracts/44 coupled pairs. Exit 0 is the author's recorded command result; the preserved output and metadata agree. The normal hook reports inherited global complexity/duplication debt, not global quality clearance.

Independent metadata comparison shows:

- The only impact-contract and coupled-pair changes append S2 to `tests` and `witnessTests` of `cdc-source-native-delivery`; existing owners, witnesses and semantics remain.
- The only primary/resource/subsystem classification addition is S2 as `unit`/`ordinary`/`transport-messaging`; census advances 2444 to 2445. The support helper is not a runnable leaf.
- Import graph adds the two modules and their edges; the seal/subsystem observations follow the generated graph. Inherited debt counts remain unchanged: complexity 1811, cognitive 152, duplication signals 511, file-size 45, lint exclusions 39; source duplication 47 groups/1462 lines and test duplication 701 groups/26618 lines. No baseline or exclusion was raised.

**Approval scope:** preserve the exact eleven manifested files plus this review on the already authorized non-main candidate, then measure its exact committed source. Preserve any failure honestly. Required full W7 multi-window/multi-budget/subscriber controls, pressure/fallback and late-answer negatives, production implementation review, historical classification, R1/R2 activation/transfer, original startup, two-start acceptance, Quest landing and merge remain unsatisfied by this source-only approval.
