# Development observations

These observations drove the bounded source change. They are not acceptance logs; the exact final command outputs are retained separately.

1. The first focused test-first run could not import the not-yet-created in-process send error code. The implementation subsequently kept that code module-private and the test now checks the wire-visible `error.code` using local expected literals. The final slice adds no export.
2. With an asynchronous `sendControl()` fake but the old adapter, the delayed-control guard observed `closeCount` as 1 where 0 was expected: the adapter inspected the Promise as if it were a synchronous result and immediately treated it as non-SENT.
3. A queued-cancellation guard initially exposed that the chunk signal had been passed to the control helper. The call site was corrected so `sendControl()` has no chunk signal and `sendChunkFrame()` revalidates its signal at the physical-write turn.
4. Final audit exposed a late IDENTIFY cancellation interval between native callback settlement and the `await` continuation. The final source rechecks the signal before attach and terminates the identified socket on cancellation.

All four cases are covered by the final 305-assertion run in `focused-tests.txt`.
