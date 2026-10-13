# Applied-position controls V4 frozen batch

Status: TEST-ONLY bytes frozen for independent content review. No behavioral test or lab command was run in this worktree. The source at `ad23d75d58e320ca2fe58f8baa9b0a941a8158e2` does not provide the approved future action, so setup/import absence is not used as a behavioral negative.

The implementation binds design approval `24a5cad687e4137ce73f4c5a7eb9b66c713ed3a735d5e4a833cc9d696c247257` and changes exactly:

- `test/test-helpers/participant-transaction-fixture.js`: canonical leader identity in the observation request, raw registered-response seam for generic ingress proof, and the already-existing single `setImmediate` checkpoint export.
- `test/partition/participant-release-protocol.test.js`: client/recipient budget and clock controls, strict shared-ingress grammar, coherent join/nonrenewal/immutable intent, real older-origin plus accepted work and durable zero-row application, producer-generation refusal, fresh-first-read and final-control controls.
- `test/node/replica-handler-release-recovery.test.js`: prompt registry/service/handler cancellation, current-context changes, synchronous subscription/timer acquisition cancellation, exact installing scheduler, bounded seven-resource cleanup debt, retained settled join and cleanup retry.

The four late source findings have direct control dispositions:

1. Negative registration time is sent directly through the registered recipient and must return the typed reply-dependency UNAVAILABLE without a timer. A separately installed timer samples a valid but backward later time while facts remain held; one existing checkpoint must observe the existing RPC timeout terminal answer. This exercises the no-rearm/no-stranded-record fallback without changing a budget.
2. The first-Raft-subscription cancellation deletes the real tracked service before the first unsubscribe closure returns. It requires exactly one acquired/released subscription and unchanged registry-listener, service-listener, timer and facts-read baselines. The timer-acquisition companion requires four real Raft subscriptions, the registry and service lifetime owners, and retirement of the late exact timer handle.
3. The first acquired Raft release synchronously performs real registry set/delete reentry while that slot is releasing. The active slot must be invoked once; later exact join cleanup may retry each retained slot at most once and cannot renew resources or replace the stored answer.
4. The captured-scheduler timer cleanup throws `null`; the same typed cleanup-debt answer must result, and the existing handler shutdown `AggregateError` must retain that exact thrown value once alongside each distinct Error sentinel. This detects truthiness-based loss of an actual cleanup failure.

The older-origin control uses current full release, a real accepted pre-pause DELETE proposal, an existing controllable term transition, a direct actual OBS fact, canonical full DRAIN/CLOSED, actual proposal commit, settled committed-outcome row/cursor/term/zero changes, and fresh full release. It does not claim native election certification.

Static results on the frozen bytes:

- `node --check` on each of the three files: PASS.
- exact ESLint on the three files: PASS.
- scoped cyclomatic/cognitive strict ratchets: PASS, thresholds 12/20.
- explicit strict file-size check: PASS; fixture 1119, protocol 1497, recovery 1307 lines, all below 1500.
- `git diff --check` on the three paths: PASS.

Behavioral state: UNRUN. Native captured-N/current-K, final-query composition, actual startup, candidate/source-treatment comparison, generated metadata, corpus, Quest and landing remain separate obligations.
