# Native V12 synchronous before-exit diagnostic freeze

Binding: worktree HEAD `b0ee13255b265c61672283df73214baef3f5969c`, unchanged source tree `7cf388f79e6afccf3d4311a475147147106e15a5`, and preserved V11 witness SHA-256 `775d81bb256787a75adba839f3e68ce9e2201000ecdb165ead38c783bed26c03`.

The sole tracked change remains `test/partition/participant-release-native-application-order.test.js`. The `beforeExit` listener is now installed inside the existing owned `try`, immediately before `router.initialize`, so the existing cleanup removes it for every subsequent setup failure. Scalar phase markers precede router initialization, group formation, settled-position observation, release-owner attachment, and every retained V11 body await. Nullable setup flags and retained owner counters remain safe before each owner exists.

The callback no longer depends on the completed `node:test` context. It performs one synchronous `writeSync` to existing stderr descriptor 2. Its JSON contains only fixed strings, booleans, numbers, nulls, and bounded retained test counters. A 4,096-byte check replaces an unexpectedly oversized payload with a fixed overflow record before the single write. A thrown serialization/write error or a partial write is retained through the existing independent cleanup-error custody. There is no installation marker and no second output path.

No production-facing operation changed. The listener invokes no runtime owner, status/facts/database read, delegate, promise settlement, timer, ref, subscription, proposal, tick, sleep, retry, or additional await. Release ordering, exact Promise identity, fault physics, budgets, acceptance assertions, and cleanup order are unchanged. A missing line in a later attempt would not prove listener installation or any runtime stage.

Syntax, exact ESLint, scoped strict metrics, strict file-size, and diff whitespace checks all exited zero. The witness is 1,481 lines, below the existing 1,500-line test ratchet. No behavior, lab, metadata, source, fixture, Quest, Git history, commit, or push operation was run.
