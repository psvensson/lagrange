# External canonical controller: final bounded review

**APPROVE** exact external controller SHA256 `0abad2b9ecbb448a5137a34256ccbdc563057673601a6f3b7b6519e2e15ab7a9` for the reviewed single-controller writer invocation. This is not a product gate or canonical receipt result. Repository integration source was clean at `9e026a011a2368853926f602abc300acb75aed67`. No repository source or live controller was changed by the reviewer.

The prior rejected source, probe, raw result and `REVIEW-b3f80e10.md` remain unchanged. Its concrete ENOSPC escape and omitted HUP route are corrected. The revised `child-started` log occurs within the cleanup-protected try. Cleanup first drains the exact retained group and then awaits the already-registered direct-child close, including when the startup log throws while the leader remains alive. Child-event, stop and cleanup logs cannot synchronously escape on evidence-write failure; they retain the error and fail the operation after cleanup. INT/TERM/HUP share the same stop path. A failed stop/observation does not release the hold. No elapsed cleanup deadline asserts absence.

The outer hold release follows completed group-absence observation and direct closure. The group observer accepts only ESRCH as absence; EPERM or other observation errors retain custody. Ordinary command failure and a terminated leader both pass through the same cleanup. The actual group termination operation remains the existing repository `killGroup`; there is no second general runner or native runtime policy added here.

Local placement uses the exported existing owner constants, so the classified runner's automatic detached local/remote placement path is disabled for this explicitly single-controller claim. The reviewed writer's direct witness fork is not detached; its normal cleanup still awaits its actual child. This source-level containment assumption and the existing killGroup owner are reused, not represented as a new native descendant experiment.

Sealed invocation is unchanged: thermal gate first, then `node scripts/quest-evidence/fresh-seed-activation.js --output <evidence-directory>/receipt.json`; 60000 ms lock wait, 900000 ms expected duration, retries zero, full file-backed stdout/stderr. The expected duration remains metadata, not a cleanup deadline. Exact clean SHA is checked initially, after custody acquisition, and now enforced again after the writer. The writer, receipt definitions and product bytes were not changed.

Independent non-native `probe-r2.mjs` extracts the exact helper bytes from the frozen controller, uses actual Node subprocesses and the actual repository killGroup, and passes five cases:

1. Ordinary exit 0 and exit 7 both drain before return/rejection.
2. The exact prior ENOSPC discriminator now rejects only after killing its real live group, observing ESRCH and closing the child.
3. A child-exit event logging failure is retained and reported after cleanup.
4. Controlled EPERM observation plus an evidence-write failure does not settle or report absence. After restoring actual observation, actual ESRCH allows settlement with the evidence error.
5. A real SIGHUP delivered to the probe process uses the installed handler, terminates its actual detached child, confirms absence and rejects with controllerStop=SIGHUP.

The tests do not acquire a machine hold, run native code, execute the sealed writer or broaden the test window. They test the exact helpers and infer the unchanged outer release ordering from source. All owned test groups are confirmed gone. `probe-r2.log` preserves events and the helper's deliberate nonzero evidence-failure state; the probe resets only its own final exit code after asserting those expected failures.

Frozen source was rehashed after execution and is unchanged. This approval is bounded to the reviewed writer/fixture process topology and ordinary caught failures/signals; it does not assert survival of an externally SIGKILLed controller or replace canonical execution evidence.
