# Verification: query executor no-handler quarantine on one clock

Verifier: independent subagent (not the author), 2026-11-22. Read-only: `git show` / `git diff` /
`git grep` at the named shas and the lab files; no test executed, nothing written in any worktree.
Subject: `504e2c9895926ba94a5586e0262f99c3599aff29` (parent `d5698f2252a4…`, whose parent is base
`23344cddc5f0…`). `b76d50c68` ignored. Line numbers are at `504e2c989` unless stated.
Markers: [V] verified by reading or from a lab file, [I] inferred, not traced to the end.

## Verdict

**APPROVE-WITH-CONDITIONS** for merging `504e2c989` (with its parent witness commit `d5698f225`, and
nothing later) into the integration candidate.

Conditions:

1. Regenerate the generated metadata at the merge result; do not take the branch's digests.
   `solve/changes/global-owner-debt-inventory/inventory.json`, `test/shards/impact-graph-seal.json` and
   the `test/shards/*-classes.json` entries are content digests of this branch's tree [V, diff].
2. The lab evidence is 12 files. Before the candidate is accepted, its ordinary gate must run the
   impact cone of the two source files, in particular every multi-node harness that supplies a node
   clock (finding F4): those were not run at `504e2c989` and their quarantine window changes clock.

No finding blocks the change itself.

## Findings

**F1 [V] Every time read of the quarantine goes through the resolved clock.**
The module has exactly two time reads, both `this.timeSource.now()`:
`src/query/query-executor-temporary-unroutable-addresses.js:29` (mark) and `:132` (expiry check). No
`Date.now`, `performance.now`, `new Date` or `hrtime` remains in the module. Consumers
(`query-executor-base.js:317`, `query-executor-partition-candidate-state.js:21, 182`,
`query-executor-partition-failure.js:224`, `query-executor-partition-routing-candidates.js:143`,
`query-executor-write-retry-routing.js:75`) pass no time and none of those files other than
`query-executor-base.js` contains a host-clock read. No source outside `src/query/query-executor*.js`
references the quarantine methods or its map.

**F2 [V] One clock object, shared by the HLC and the quarantine.**
`query-executor-base.js:83-87`: `this.timeSource = resolveTimeSource({timeSource: nowFn ? {now: nowFn} :
undefined})`, then `new HLCClockService(nodeId, {timeSource: this.timeSource})`.
`src/hlc/hlc-clock-service.js:35` resolves the given object to itself, so
`executor.hlcClock.timeSource === executor.timeSource`. The HLC's behaviour is identical to base: base
passed `{now: nowFn}` or `undefined` (which the HLC resolved to a `RealTimeSource`). No source reads or
reassigns `executor.timeSource`, `executor.nowFn` or `executor.hlcClock` after construction (grep over
`src`), and `timeSource` was not a pre-existing executor property.

**F3 [V] The executor's "else the host clock" default is not what production runs on.**
The only production construction of the executor is
`src/query/sql-query-engine-instance-initializer.js:227-229`, which always passes `nowFn:
engine.nowFn`, and `engine.nowFn = options.nowFn || (() => Date.now())` (`:166`). So the executor's own
default (`RealTimeSource`) is reached only by tests and `scripts/quest-evidence/retry-recovery-window.js`
that construct the executor directly. The default production does rely on is the engine's, one level
up, unchanged by this commit. Production engine constructions:

| Construction | `nowFn` passed | Clock in a real node |
| --- | --- | --- |
| `src/bootstrap/owners/seed-runtime-bridge-owner.js:51-52` | `resolveHostedNodeClock(d)` (`hosted-replica-authorities.js:49-54`: the node service's time source, else `Date.now`) | wall (`node-service.js:564-566` resolves a `RealTimeSource` unless one was supplied) |
| `src/bootstrap/node-joining-publication-activation.js:625-637` | none | wall (engine default) |
| `src/entrypoint-runtime-admin-composition.js:370` | none | wall (engine default) |

**F4 [V code, I consequence] Sibling, not introduced here: two of three engines never receive the node
clock.** On a node that was supplied a non-host clock (a multi-node harness), the seed engine's
executor now quarantines on node time while the joiner and admin-composition engines' executors stay on
the host clock. In a real node all three are wall time. Before this commit all three quarantined on the
host clock, so harness runs that hit `NO_HANDLER` on a seed-path executor now see a 5 s / 30 s window of
virtual time instead of real time. That is the intended semantics, but it was not exercised by the lab
run (condition 2).

**F5 [V] Marks cannot mix clocks.** The map is per executor instance
(`query-executor-base.js:137`), in memory only, never persisted, never shared between executors or
processes. A mark is written and checked by the same object's `timeSource`, fixed at construction. The
clock's epoch is therefore irrelevant (a virtual clock starting at 0 works).

**F6 [V] No remaining host-clock read is compared with a quarantine timestamp.**
- SERVICES fingerprint release: `query-executor-shared.js:180-213` is string inequality of a fingerprint
  that contains `updated_at` as text; no time arithmetic.
- Log throttles (`query-executor-partition-routing-snapshot.js:362, 623`,
  `query-executor-partition-service-resolution.js:656`): separate maps (`noServiceWarnLastAt`,
  `canonicalLeaderWarnLastAt`); they gate log lines only.
- Request deadline (`query-executor-base.js:697`, host clock) and the attempt budget
  (`query-executor-partition-attempt-budget.js:96-99`, `query-executor-partition-delivery.js:73`, node
  clock): neither is compared with `expiresAt`. The budget that bounds a read's in-read retries was
  already on `nowFn`, so the quarantine moved onto the budget's clock: the change removes a mixed pair.
- Retry delay (`query-executor-cancellation-routing-install.js:19-26`): a host `setTimeout`. Under a
  virtual clock that is not advanced, a retry loop waits real time while neither the budget nor the
  quarantine progresses; before, real time alone released the mark. Harness-only, and it is the
  behaviour the second witness case asserts [I for any harness depending on the old release].

**F7 [V] Production behaviour is unchanged when the injected clock is wall time.** The diff changes two
expressions (`Date.now()` to `this.timeSource.now()`) and one comment in the module; durations
(`resolveNoHandlerAddressQuarantineMs`), key, the `expiresAt > now` comparison, clear-on-success,
fingerprint release and lazy expiry are untouched. With F3, `timeSource.now()` evaluates `Date.now()`
at call time in every production construction.

**F8 [V, minor, not blocking] An injected clock that returns a non-finite value disables the
quarantine.** `expiresAt` becomes `NaN`, and `:109-117` deletes a non-finite entry and reports the
address routable. `Date.now()` could not do that. No production clock returns non-finite [V, F3].

**F9 [V, minor] Three spellings of the same clock remain** (`this.nowFn` read live at
`query-executor-partition-delivery.js:73`, `query-executor-partition-attempt-budget.js:98`,
`query-executor-partition-routing-snapshot.js:213-217`, the last returning `null`, not the host clock,
when none was given). They agree with `timeSource` unless `executor.nowFn` is reassigned after
construction, which only two tests do (`router-envelope-lost-write-answer`, and per the author
`readiness-routing-denial-observability`); neither names a no-handler case [V grep]. The author records
this as a follow-up.

**F10 [V] Tests that construct an executor with an injected clock do not exercise the quarantine.**
Files with both `new QueryExecutor(` and `nowFn` other than the new fixture and
`query-executor-recovery-owned-routing` (green in the head run): none contains a no-handler literal
[V grep; I that no router double returns `noHandler` under another name].
`test/rebalancer/application-write-formation-authority.test.js:165, 314, 400` marks addresses directly
but injects no clock, so it stays on the host clock [V]; it was not in the lab run.
`test/query/query-executor-session-pin-state.test.js:5-7` builds the executor without its constructor
but overrides `isTemporarilyUnroutableAddress`, so the missing `timeSource` is not reached [V].

## Lab evidence [V, from the files]

| Run | Directory under `lab/` | `placement-head` | Result |
| --- | --- | --- | --- |
| red | `quarantine-clock-red-d5698f225-tv-dator` | `d5698f2252a4b0a2d6fa19d6522f0ccdf68254e5` | exit 1; TAP `total: 8, pass: 4, fail: 4` |
| head | `quarantine-head-504e2c989-tv-dator` | `504e2c9895926ba94a5586e0262f99c3599aff29` | exit 0; `total=12 pass=12 fail=0 assertions=406` |
| base | `quarantine-base-23344cddc-tv-dator` | `23344cddc5f07a597b93f8cd0f4f69a69be937c3` | exit 0; `total=11 pass=11 fail=0 assertions=396` |

- Red, case 1: `quarantineMs` 30000; one millisecond before expiry refused (ok 4); at mark + 30 s of
  node time `atExpiry` is `success:false, "Partition service not found"` and the hop list holds only
  the first unhandled hop (not ok 5, not ok 6).
- Red, case 2: node clock frozen, host clock advanced by 60 s: `success:true` with a second, handled
  hop to the leader (not ok 1, not ok 2).
- Head: the witness file is ok (10 assertions by the runner's count); the per-file counts sum to 406.
  Base runs the same 11 pre-existing files with identical per-file counts; 406 - 10 = 396.
- All three ran on check base `0dbed1718c2d…`, `retry:0`.

## Not verified

- No test was run by this verification; green rests on the lab files.
- The full impact cone and the multi-node harnesses at `504e2c989` (condition 2).
- The integration candidate's tip was not identified; the checked-out
  `candidate/reconciliation-20261119` differs from base in `query-executor-base.js` by one unrelated
  line (`:67` at base, `partitionReadShutdownController`), away from the changed hunk.
- The witness fixture starts its virtual clock at `Date.now()`; a different-epoch clock is covered by
  reading (F5), not by a test.
