# rs-raft seed deadline boundary — 2026-10-14

**WIP, not merge acceptance.** All original Quest receipts remain subject to independent review and physical multi-host validation. Main is unchanged.

## Timeout policy versus correctness

The inherited 1s budget came from a fast-election test fixture but governed 45 Raft partitions. Actual release cost on 4-vCPU CI is about 10s wall and 11–13 process CPU-seconds. That is too much CPU work for a 1s correctness target. Wider fanout also worsened contention. Repeatedly restructuring protocol safety to pass that number would be a ping-pong regression.

The source now supports an optional separate `seedParticipantReleaseBudgetMs`, retaining the old fallback. Its full claim/cache test uses 1s for leader election, 20s for release and 90s for the complete integration case. The actual 45-partition / 1041-delivery test passed 3/3 at Actions `38548439462`. Original 1s RED remains historical evidence, not an accepted green gate.

## One owner for late delivery

Pre-fix `7d0042659daaed7d38e9e586454861c21df3d838` could report bounded success after a release result arrived past the original deadline. The existing client now checks expiry after awaiting delivery and returns typed `UNAVAILABLE/release_deadline`, not a false rollback of committed Raft work. No extra timer, renewed deadline, second execution driver or new permission path.

Original red: `38560193352`. Identical-test same-host old RED/new GREEN: `38562595465`. Latest exact candidate tests: 52/52 `38562048120`. Trace-envelope test was moved into existing `test/scripts` ownership; canonical taxonomy/impact generation passed 2374 tests / 22 subsystems at `38561672573`; scoped static passed `38562408845`.

## Remaining merge blockers

Repository-wide unused exports, file-size, duplication and lint ratchets still fail (`38561972191`); no thresholds changed. Independent source review, multi-host native startup/restart and seed loss, TX1/TX2, FreshMG, CDC/snapshot, plus complete strict static certification remain mandatory. WIP source is preserved off main.
