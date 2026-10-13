# C2 harness V2: final generated-input binding

Verdict: **APPROVE bounded harness and generated-metadata content**, with final measured receipts/Quest closure/main/full-cutover **HOLD**. Review is after the canonical attempt at `log.ndjson` timestamp `2026-10-13T14:29:47.645Z`; final metadata was read at `2026-10-13 14:31:00 UTC` and subsequently inspected. No tests/labs, implementation/metadata/Git changes or Quest disposition by this reviewer.

This new report incorporates the complete44-item V1 review SHA256 `046d871be706243cb6adcd219fea942bdcaf4a29da275214d51a56386511d795`, and the incremental V2 I1/I2/content review `evidence/harness-implementation-review-v2.md` SHA256 `6c292d71ff8d354db8ff42463cec1c94636b8f0efb8f05edeba7545ed05912ce`. Neither earlier file is overwritten. The latter sampled generated metadata before root's final V2 refresh completed; its metadata hashes are superseded by the exact binding below. Its source/test content findings and resolved I1/I2 remain unchanged.

## Final frozen fingerprints

Baseline/worktree HEAD d35d8828c630d1b9675b47f511c477b3cc9ee991; approved addendum f475f261c45c37c7041d435ad36f248e0738b233194dd0c8cff10d32fdcb7e2d. Independently computed four-test binary diff e2bca0cb79119472ecff113bdaa1c1414b6b9115c1ac496a32b71d6cf6e3602b; C2 production diff d982b26235430dfbfa92fa594c5d3b9d0b6d849682de5b02e143818f88b6c603 unchanged and separately source-reviewed.

| Path | SHA256 |
| --- | --- |
| test/rebalancer/message-group-membership-branch-authorization.test.js | ea98ca5fb883a66ba42595bcb7332b210dc4937031175b40bb5c5c95b30bfcaa |
| test/convergence/dt6-learner-promotion-progress-proof.test.js | d187747cf606f6c79fa6f05286967c9a448a519a3d7697677516d4d03082bfc0 |
| test/integration/helpers/cluster-test-helpers.js | 7c0a270c24c39f67b56bad6707fd9b0fbeb59b10d650c982bc4abb55380fa031 |
| test/bootstrap/node-bootstrap-consistency.property.test.js | df78abc52898eb758433956a84cf459ca80ebfd27da7e3b08b43bb1dc45ddab3 |
| test/shards/subsystem-classes.json | 49b4e048d2213ffdbbd40620d380f3bdec613cbbafa633c64da4094f7355937d |
| test/shards/impact-graph-seal.json | a80f6f31423fc46b2340ad8cc79fe687d330800328eef7296be3175e04ca8300 |

## Final metadata disposition

Read-only comparison against committed d35 JSON confirms only observationDigest/observations change in subsystem classification; all2366 class assignments, counts, census size, class digest and schema stay identical. No test key or observed file is removed.63 observation records add `src/bootstrap/rejoin-hints.js`; the direct property witness additionally observes `src/node/participant-release-authorization-owner.js` and, now correctly, `src/diagnostics/runtime-build-provenance.js`. Every changed record changes only its files field. These additions match actual shared-helper and direct-witness owner calls; they do not loosen classification or selector policy. Final observationDigest is `fnv1a32-84129bda`.

The final graph seal retains its schemas and changes only fingerprints: sourceDigest `1fb138c21ea21d5e42f48b441e8eb020990a3cfcb171dfbb39d0bc98eadeed9d`, producerInputDigest `10576aca81e7c0e5fa86ce1206e823ce0efb78d294654ab9cfc659e00e7205a8`, resolverStateDigest `87fcb64936233d77aad278c7b02964cf0a8722ad448a7048361838ece0ada2f5`, snapshotDigest `3ef38f968e4c7dd2bb26a1e3ddf3865b726d47dbe04afe5c9b08a59a8c3ef442`. Content/hash review does not make a generated seal its own authority: final canonical producer/selection/impact audit receipts remain required.

## All category dispositions retained

Every item is **APPROVE for bounded content**, with the exact per-item source/test/evidence paths incorporated from the unchanged complete V1 report and the V2 correction report. No new checklist or unrelated source review was introduced.

- Harness H1-H6: actual baseline causes/seams and unchanged budgets retained; canonical measured build binding I1 and actual own-present await falsifier I2 resolved; physical proof ceiling remains HOLD.
- Transport D1-D5: unchanged ACK/noHandler/late-response/response grammar/gate and same-inner exact-handler retirement delegates retained.
- Admission A1-A7: actual owner default, explicit null/undefined/invalid refusal, captured identity/own choice, canonical token shape and current release gate preserved; live release proof pending.
- Recovery R1-R5: no live/durable mutation or alternate replay; current virgin/durable/unreadable/conflicting/history distinctions remain owner-held.
- Concurrency C1-C5: unique directories, synchronous capture before actual awaits, one decision, no timers and exact cleanup custody preserved; both absent and present temporal controls now present.
- Owner O1-O10: sole typed owners and paired controls preserved; final metadata O10 and input binding O8 now exact, without projection authority or duplicate helper/classifier. Actual registered T1 release/body proof remains outstanding.
- Formation F1-F5: actual local read-only resolver, no probe/CDC dependency or fresh synthesis, unchanged startup window and first-client release gate retained.
- Scoped intrinsic J1: exact own presence/value captured before await; own and inherited controls exercised, with no broader arbitrary-JS hardening claim.

Root's reported V1 claim-cache `release_drain_pending` remains a real refusal before T1 engagement; it is not fixed by these direct witness changes and cannot be counted as T1 green. V1 green cohorts and rejected pre-test placement remain their own exact inputs. Final raw result/manifest review, unchanged-budget current proof, honest same-host failure classification, canonical metadata/static/impact gates, and full required receipt evidence remain pending. Shared-helper43 direct consumers/full corpus, FreshMG and main/full cutover remain uncertified. Content approval is not a terminal action.
