# U1 static formatting correction: independent byte rebind

Date: 2026-10-19. Reviewer: subagent:/root/physical_lifecycle_review.

**APPROVE the two-file formatting delta against 25cb5b1fb487485f2789d63d9b0fcb150788890c. It preserves production behavior and all test assertions.** This is a separate append-only rebind; it does not rewrite the nine-path production verdict or any earlier oracle approval.

The reviewer read the exact working diff, inspected the affected expressions, and independently computed both old and new complete-file hashes. The source change wraps the existing no-operation return at src/control-plane/replica-dispatch-service.js:63–66 in mandatory braces. The condition, returned object, deferredOutcome test, UNAVAILABLE/CONTENT_CONFLICT alternatives, and following exact-operation comparison are unchanged. Adding this block introduces no declaration, alternate branch, new return value, or asynchronous boundary.

The only test changes are indentation of the existing assertion-message arguments at test/node/runtime-service-bound-route.test.js:547 and :715. Test setup, actions, assertion expressions, expected values, messages, and execution order are byte-identical except for that leading whitespace. The first assertion still requires no origin before first start; the second still requires the retired memo and terminal original journal to remain terminal after a late duplicate.

| File | Base SHA256 | Approved SHA256 |
| --- | --- | --- |
| src/control-plane/replica-dispatch-service.js | 385217923b84a9981204398d25b434453d01df709aa09daf429f24c378e04352 | bd4bedd19c06e0ffea3b2c7e03d23a4d31f1cd5c61f30b847866a5a701021398 |
| test/node/runtime-service-bound-route.test.js | 2f85d7a2891b66b90261b510452bbf9f717f3710dad983739c413957b2a967be | 66e7f0a7ffcdeb0a94f3d05762f513c455435c794127830e8a3498fc520e5dc4 |

The source half of u1-nine-path-source-independent-review-ac092686-a55ab412-20261019.md applies to the rehashed dispatch file because this is exactly a braces-only correction to its already reviewed return. The test correction adds no new oracle and cannot support a stronger behavioral claim. This approval does not certify any unrelated source or test difference in the base checkpoint, the separate generic REMOVE guard correction, or the whole U1 candidate.

Root reported that the complete U1 scoped static run found these three ESLint formatting violations while its other thirteen checks passed. That is provenance for the edit, not a test result executed or independently retrieved by this reviewer. I ran no behavioral test, static gate, metadata producer, commit, or lab submission. The fresh immutable-candidate static and behavioral receipts remain root's separate responsibility.
