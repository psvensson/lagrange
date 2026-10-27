# U1 lifetime continuation — retained lab evidence

These are original executor receipts and recovered logs for separate immutable source candidates. They do not record U1 acceptance, independent implementation approval, or merge certification.

## Source results

| Lab issue | Exact source commit | Result | Measured scope |
| --- | --- | --- | --- |
| [382](https://github.com/psvensson/lagrange-lab/issues/382) | `610ae6c2b192f0432ac95e7326973458d6956b07` | FAIL | Handler file: 38 TAP tests, 36 passed, 2 failed; 45 runner assertions. |
| [383](https://github.com/psvensson/lagrange-lab/issues/383) | `a55ab41296faf30a4c404c56117eacbaa993c903` | PASS | Twelve selected files; 339 runner assertions on tv-dator. |
| [387](https://github.com/psvensson/lagrange-lab/issues/387) | `f1fc732f22de834c4bce064ac8f6bad213ddf20c` | FAIL | Handler file: 39 TAP tests, 37 passed, 2 failed; 46 runner assertions on lenovo-laptop. |

The twelve-file PASS predates the additional gate witnesses in #387. These measurements must not be combined into a current-candidate pass.

## Executed first failures

At #382, both failures are in `test/node/runtime-service-handler.test.js`:

- Subtest 8, `does not STOP a successor installed after admitted legacy REMOVE but before queued STOP`: first failing assertion at line 662 is `STALE_REMOVE_REPLACED_SUCCESSOR_MEMO`. The actual memo is removed and loses the successor operation ID.
- Subtest 9, `does not publish stale generic REMOVE after STOP settles behind a successor`: first failing assertion at line 703 is `OLD_STOP_SETTLED_AND_OVERWROTE_SUCCESSOR_MEMO`. The actual memo is removed and loses the successor operation ID.

At #387, both failures are in the same test file:

- Subtest 8, `does not STOP a successor installed after admitted legacy REMOVE but before queued STOP`: first failing assertion at line 666 is `SUPERSEDED_QUEUED_REMOVE_RETAINED_EXECUTION_GATE`, actual 1, expected 0.
- Subtest 10, `admits successor cleanup after a superseded queued REMOVE releases its gate`: first failing assertion at line 742 is `SUPERSEDED_REMOVE_GATE_BLOCKED_SUCCESSOR_CLEANUP`, actual `in_progress`, expected `initiated`.

Subtest 9, `does not publish stale generic REMOVE after STOP settles behind a successor`, passes at #387.

Failed tests stop at their first failing assertion. This evidence does not claim that subsequent STOP or publication assertions within those failed tests executed.

## Complete log integrity

| Source issue | Bytes | Full log SHA256 | Evidence chunks |
| --- | ---: | --- | --- |
| 382 | 19570 | `2891344208ba4859be2849e7150d75dc0179233df408442827d9d2a8517b56b6` | 388, 389, 390 |
| 383 | 2386 | `000b85ea7fff593647eac5291ead584bf36b952dfc10ed570a8b6610351f6844` | Complete untruncated terminal log |
| 387 | 18583 | `72b6013ae4ac1c9a08937a325d3eba6ec2de290b536b1c8c6c80b1a605994038` | 391, 392, 393 |

Every evidence request binds to the original job request ID, not its GitHub issue number. Canonical request SHA256, controller and request identities, source/host bindings where applicable, chunk offsets, returned lengths, each chunk hash, and each complete log hash were checked. Returned evidence text matches the raw chunk hashes even though the controller marks the display as redacted.

## Controller observations

- #384: original v0.2.0 ping completed at 2026-10-19T15:30:50Z; standing Lagrange repository authority, pause false and uncertain execution false.
- #385: original fleet observation completed at 2026-10-19T15:34:32Z; four allowed remote hosts observed ready/free and the observer scope closed. A fleet observation is not a source reservation.

## Files

Original request JSON, original issue/comment snapshots, parsed terminal receipts, exact available log bytes and verification records are retained as individual files. `lab-382.reconstructed-executor.log` and `lab-387.reconstructed-executor.log` reconstruct the complete logs in offset order. The #383 `.executor.log` is its complete terminal log.

`FILE-SHA256.json` records the byte length and SHA256 of every other retained file. All retained files are smaller than one megabyte. No archive, source execution, gate change, or history rewrite was performed to retain this evidence.
