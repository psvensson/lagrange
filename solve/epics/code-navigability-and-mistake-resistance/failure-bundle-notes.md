# failure-bundle-evidence-completeness: implementer notes (append-only)

## 2026-11-08: corrective round after the independent REJECT

Base: branch work/nav-failure-bundle-evidence-completeness-20261108, HEAD
1ad04d21a, candidate = the staged tree. Verdict answered:
scratchpad verify-bundle/verdict.md (B1, B2 blocking; N1-N9).

### Findings -> change -> test

- B1(i) readable source with 0 bytes acquitted. Change:
  failure-bundle-log-window.js returns a missing-class record
  (missingReason `full_node_log_empty`, withheldBytes null, complete false)
  for any readable source with totalBytes 0, in both modes (two-pass and
  byte-tail). LOG_WINDOW_COVERAGE.MISSING_REASON.FULL_LOG_EMPTY added.
  Test: failure-bundle-log-window-coverage.test.js "a readable source with
  no bytes is a missing-class record" (in-memory and gzip);
  container-log-window.test.js "an empty output is a missing-class record".
- B1(ii) the bundle re-derived capture completeness from file length (R03).
  Change: the capture owner's verdict now travels to the bundle:
  full-node-log-capture.js names its states (CAPTURE_COMPLETENESS_REASON:
  no-lines-captured, stale-tail, capture-completeness-not-recorded;
  CAPTURE_COMPLETENESS_NOT_RECORDED) -> cluster-class-lifecycle-base.js
  `_finalizeFullNodeLogStreams` records each node's verdict and exposes
  `getCaptureCompletenessByNodeId()` -> run-runtime-helpers.js reads it after
  `cluster.stop()` into `scenarioResult.captureCompletenessByNodeId` ->
  report-writer.js `buildScenarioEntry` copies it to the report entry ->
  failure-bundle-scenario-log-artifacts.js passes each node's verdict (or
  NOT_RECORDED) into the window; the record carries `captureCompleteness`
  and `complete` = capture complete AND withheldBytes === 0. The summary
  names `captureIncompleteNodeIds`; the verdict line says "capture
  incomplete per the capture owner". R02: no coupled pair in
  test/shards/impact-contracts.json covers any touched file (checked by
  name over all 60 pairs); `npm run -s audit:impact-contracts` PASS.
  Tests: "a no-lines-captured / stale-tail / not recorded capture makes a
  fully retained window non-measuring" (three cases).
- B1(iii) fixture honesty. Change: failure-bundle-full-log-fixture.js
  `writeRunFullNodeLogs(scenarioDir, entry, nodeIds, {content,
  captureCompleteness})` writes a non-empty stamped capture spanning the
  run (boot line at epoch 0, the node's curated sample when present, a
  teardown line stamped at write time) and records the owner's verdict on
  the entry (default COMPLETE_CAPTURE). All 13 legacy call sites pass the
  entry. `writeFailureBundlesForCompleteRun` serves the classification
  suites (failure-bundle.test.js context, active-gate-tail,
  publication-closure-tail, report-writer.test.js): a failing scenario with
  neither its own event stream nor a recorded capture first gets the
  evidence of a complete run (event stream creating node-1, its capture,
  the complete verdict). Without it those 40+1 fixtures are, correctly,
  non-measuring (N3).
- B2 unplaceable bytes dropped. Change: pass 1 tracks `lastBeforeEnd` (byte
  after the most recent line stamped strictly before divergence); the
  window starts there when the first line at/after divergence is found and
  when none is; no stamps at all -> byte 0 (whole log). An unterminated
  last line stamped before divergence sets the start to EOF. Tests: "keeps
  an unstamped crash trailer after a quiet node's last line before
  divergence", "counts an unstamped trailer beyond the bound as withheld",
  "starts the window after the last line stamped before divergence ...",
  "a divergence after the end is an empty, complete window only when the
  last stamped line ends the log".
- N2 partial withhold. Change: failure-bundle-scenario-assembly.js
  `withholdVerdictForIncompleteCoverage` is the one function deciding what a
  non-measuring bundle publishes: LOG_WINDOW_COVERAGE.WITHHELD
  (`withheld_log_window_coverage_incomplete`) in summary.rootCauseClass,
  summary.dominantReason, summary.failureClassification.{failureClass,
  rootCauseClass, dominantReason} (signals []), diagnostics.failure.
  {dominantReason, rootCauseClass, firstFault.reason}, empty
  diagnostics.failure.reasonCounts and topFailures.{reasonCounts,
  topReasons}. The scenario entry copies these (the writer copies any
  non-empty string / record), so fields set before the bundle are
  overwritten with the named state. Test: "withholds every verdict field,
  including ones set before the bundle".
- N3 zero node ids. Decision: LOG_WINDOW_COVERAGE.NO_NODES_NAMED.
  RUN_CREATED_NO_NODE (the run's own event stream was read and created no
  node: nothing to examine, nothing withheld, complete) vs NODE_IDS_UNKNOWN
  (no event stream and nothing else names a node: absence proves nothing,
  non-measuring). `summarizeLogWindowCoverage` always returns a record with
  `noNodesNamed`; null coverage remains only on the passing path (no
  windows retained, no verdict published). A missing scenario dir still
  windows the nodes the entry names. Tests: "a run whose own event stream
  created no node has nothing to examine", "a run with no event stream and
  no named node is non-measuring".
- N4 artifact growth. Change: nodeDiagnostics[node].logExcerpt removed (the
  window lives once, logs.excerptsByNodeId); new
  failure-bundle-log-window-markdown.js renders per node the whole window
  when <= MARKDOWN_EXCERPT_BYTES, else head and tail halves around "N bytes
  of the window omitted here", with "Whole window: failure-bundle.json
  logs.excerptsByNodeId["<node>"] (source bytes a..b of <source>)". The
  record gains windowStartByte/windowEndByte. Verifier row
  e-5-nodes-4MiB-default: markdown 20,974,044 -> 331,915 bytes; JSON
  23,809,303 -> 23,810,940 (the window kept once by design). Test: "keeps
  the window once in JSON and a bounded head and tail in markdown".
- N5 acquisition bound (R12/R13). Change: container-log-window.js dials the
  Docker logs route as a stream (isStream, follow:false so the daemon ends
  it), demultiplexes with docker-modem synchronously into
  `createLogTailWindow` (a ring of the last MAX bytes, counting all bytes);
  DockerProvider.readContainerLogWindow, NodeHandle.getLogWindow;
  `collectContainerFallback`, `_collectFailureLogs` (cluster stderr dump)
  and `_cleanupFailedContainer` use it. The byte-tail mode of the window
  module is now this one ring (the in-memory and gzip tail paths use it
  too). CONTAINER_LOG_TOO_LARGE stays only on getContainerLogs (whole-buffer
  readers: unexpected-node-exit.js tail, captureFullNodeLog). Tests:
  container-log-window.test.js (streams + counts; 256 MiB through a 1 MiB
  window with peak external memory < 128 MiB, measured 52 MiB; failed
  container echo names the withheld count); log-collector.test.js now
  drives the real reader + docker-modem demux through fake daemon streams.
  Evidence ceiling: no live daemon was dialled (modem.dial with isStream +
  follow:false is traced in docker-modem source, not executed against
  Docker).
- N7 none vs unknown. Change: one formatter `formatCoverageField` with
  NULL_FIELD_MEANING (none: missingReason, source, windowStart/EndByte;
  unknown: firstDivergenceAt, windowStart/EndAt, withheldBytes,
  captureCompleteness). Test: "renders a legitimately absent field as none
  and an unknowable one as unknown".
- N8 stale ambient-intrinsics rows for sliceLogTail: the checker's only
  lowering path (`--update-baseline`) regenerates the whole baseline (3896 ->
  3711 rows, a 6048-line diff over unrelated owners' files). Not applied;
  left for the guideline-audits owner. No hand edit.
- N9 `npm run -s test:metadata:refresh` run (test/shards primary/resource/
  subsystem classes + impact-graph-seal staged); duplication baseline
  tightened 24346 -> 24333 per the checker's hint in
  scripts/check-duplication.js.

### N1 prerequisite disposition (for the lead to record)

The quest premise "uncommitted retainContainerLogLines and terminal-status
set on work/composed-05-comparison-readiness-20261103" is stale: those
changes are COMMITTED on that branch (16ffd532f: `retainContainerLogLines` +
`_retainedContainerNodeIds`, used by
test/distributed/scenarios/fresh-formation-user-table-routability.js:394
there). Disposition: SUPERSEDED by this quest's byte window (the fallback no
longer truncates to 50 lines; the collector keeps a byte-bounded streamed
window and the bundle reads the full capture). On the composed-05 merge,
delete `retainContainerLogLines`, `_retainedContainerNodeIds` and the
scenario call; they must not coexist with the byte window. The terminal-status
set on that branch (failure-bundle-playback-insights.js
TERMINAL_REPLICA_OPERATION_STATUS_SET / _WORKFLOW_STEP_SET) is a playback
concern this quest neither carries nor supersedes.

### R17 routes (recorded, not absorbed)

- distributed-harness owner: N6 line-bounded node-log readers outside the
  bundle: unexpected-node-exit.js (`tail: 80`, 8192 chars, content-keyed
  fatalLines, feeds reattribution) and tidb-reference-lifecycle.js (80
  lines / 6000 chars).
- analyzers owner: scripts/analyze-latent-blockers.js,
  analyze-topology-convergence.js, analyze-priority-recovery-residuals.js,
  summarize-representative-evidence.js read dominantReason with no
  non-measuring filter; a non-measuring bundle now publishes
  `withheld_log_window_coverage_incomplete` there.
- distributed-harness owner: cluster test fakes (cluster.test.js,
  cluster-publication-diagnostics-selection, cluster-active-gate-*,
  cluster-control-plane-quiescence-lifecycle, cluster-snapshot-replay-*,
  cluster-active-probe-resample) still model `getLogs()` for
  `_collectFailureLogs`, which now calls `getLogWindow`; the echo is
  best-effort and no test asserts it, so the fakes are inert there.
- guideline-audits owner: N8 above.

### Design constants (side by side, failure-bundle-artifact-foundation.js)

- LOG_WINDOW_COVERAGE.MAX_RETAINED_BYTES = 4 MiB per node: the evidence kept
  once in failure-bundle.json; minutes of pino output after divergence,
  ~20 MB for a 5-node bundle.
- LOG_WINDOW_COVERAGE.MARKDOWN_EXCERPT_BYTES = 64 KiB per node (head and
  tail halves): what the human-read markdown shows; the record and JSON
  path point at the whole window.
- FAILURE_STDERR_LOG_TAIL_BYTES = 16 KiB (constants.js): a failure echo to
  stderr.
- LOG_LINE_TIMESTAMP_PROBE_BYTES = 256: leading bytes a line's timestamp is
  read from; a stamp beyond it reads as unplaceable, which keeps the bytes.

### Verification run by the implementer (2026-11-08, this machine, no cluster)

- Direct `node <file>` runs, all green: failure-bundle-log-window-coverage
  30/30, container-log-window 4/4, failure-bundle 101/101, docker-provider
  31/31, log-collector 17/17, cluster 26/26, validation-matrix 9/9,
  constants 2/2, scenario-certification 31/31,
  certification-evidence-archive 17/17, run-report-metadata 2/2,
  scenario-run-artifact-hygiene 7/7, failure-bundle-dominant-reason-denoise
  5/5, failure-bundle-playback-load-metrics-fallback 4/4,
  full-node-log-capture 22/22, report-writer 41/41, run 73/73,
  failure-bundle-fallback 1/1, trace-artifact-recorder 2/2,
  test/solve/probes.test.js 6/6. `docker ps -q | wc -l` 0 before and after.
- Mutations (each reverted): window start at EOF when divergence found,
  trailer start at EOF, `complete` ignoring the capture verdict, empty
  source acquitting, unknown node ids acquitting, firstFault reason kept,
  whole window in markdown: each turns the coverage suite red at the
  named test.
- Complexity: scanFailureWindow, retainNodeLogWindowFromGzip and
  summarizeLogWindowCoverage split under the threshold (12);
  `npm run -s test:complexity` 1731/1731.
- Not run here: the lab suites (`scripts/lab.js test changed`), any live
  cluster; the Docker stream dial is traced, not executed.

## 2026-11-08: second follow-up (verdict-delta.md: B3, N-A, N-B, N-D, N-E)

- B3 harness-stopped nodes judged stale-tail. Change at the capture owner:
  `assessCaptureCompleteness` (and `finalizeFileBasedCapture`) take
  `quietSinceMs` and `stoppedByHarness`; the gap is measured to
  min(teardown, quietSinceMs) and every verdict names `stoppedByHarness`
  (null when the node ran to teardown). The lifecycle owns the actions:
  constants.js `NODE_LIFECYCLE_ACTION` and `HARNESS_STOP_ACTIONS`
  (killNode, stopNode, pauseNode); cluster-class-lifecycle-base.js uses the
  constants for every mark and chaos action, and `_captureJudgement` passes
  the expected-down `sinceMs` and action for a harness-stopped node on both
  the streamed and the file-logged finalize. restart/start/unpause clear the
  mark, so such nodes are judged at teardown. The lifecycle records no
  container exit time, so `sinceMs` (the mark) is the bound. Markdown renders
  `complete:stopped-by-harness:<action>`. Tests (new
  __tests__/capture-completeness-handoff.test.js; cluster.test.js is at 1499
  lines, so the cases live in their own file): killNode/stopNode/pauseNode
  200 s before teardown -> complete + action; quiet with no action ->
  stale-tail; quiet long before the kill -> stale-tail with the action;
  killed-then-restarted / stopped-then-started judged at teardown from the
  new streamer; file-logged killed node -> complete. Bundle level
  (coverage test): the victim of a kill with a whole window keeps the
  measured verdict and dominant reason.
- N-A handoff tests (same new file), each killing its survivor mutant:
  report-writer dropping the field -> "buildScenarioEntry carries the map,
  and null when absent" (and the runner test); run-runtime-helpers setting
  it null -> "the runner reads the map after cluster.stop() on the failing
  path" (the fake returns the map only after stop()); lifecycle not
  recording -> every `_finalizeFullNodeLogStreams` verdict test.
- N-B decision: withhold. `withholdVerdictForIncompleteCoverage` also sets
  `diagnostics.rootCauseBundle.rootCauseCode/rootCauseClass` to WITHHELD,
  and the entry writer copies the bundle's rootCauseBundle back (identical
  to the entry's own when measuring). No consumer was found that needs the
  values of a non-measuring bundle. Test: "withholds the root-cause
  bundle's code and class too ...".
- N-D: a missing record's excerpt header names `no window: <missingReason>`
  instead of `source bytes none..none of none` (same test).
- N-E: the lead records the N1 prerequisite disposition and the R17 routes
  above in the quest log (`solve.js note`); this file is the implementer's
  working record only.

## 2026-11-08: round 4 (verdict-r3.md REJECT: B4, N-F, N-G, N-H, N-I, N-J)

Root, stated once: the capture owner judged completeness by the gap between
a node's last captured line and a quiet bound that was teardown unless a
harness stop mark existed. The bound is now THE EARLIEST OBSERVED EVENT
AFTER WHICH THE NODE COULD PRODUCE NO OUTPUT, with a named source; teardown
only when nothing earlier was observed.

### Findings -> change -> test

- B4 / N-H / N-G (self-exit, failed restart, failed start judged against the
  wrong bound). Change: new owner test/distributed/harness/capture-quiet-bound.js
  (`resolveCaptureQuietBound({teardownWallMs, expectedDown, observedExitMs})`
  -> `{atMs, source, action}`, earliest of {stop mark for HARNESS_STOP_ACTIONS,
  observed container exit} else teardown; `parseObservedExitMs` parses Docker
  FinishedAt once, absent/unparseable/zero-time -> null, never acquits).
  constants.js `CAPTURE_QUIET_BOUND_SOURCE` {harness-stop, container-exit,
  teardown}. Lifecycle: `_captureJudgement` consults that one function for
  both finalize paths; `sweepUnexpectedNodeExits` passes an observer that
  retains every exited container's FinishedAt (expected-down or not, so a
  failed restart's/start's new incarnation exit is seen) in
  `_observedNodeExitMsById`; restartNode and startNode drop it when the
  transition begins (the next incarnation's exit is a new observation);
  startNode now marks `startNode` (replacing the stop mark: a failed start is
  judged to its observed exit or teardown, not to the earlier stop). Ordering:
  the runner sweeps in the failure catch before `cluster.stop()` in finally
  (comment added in run-runtime-helpers.js). unexpected-node-exit.js inspects
  every node and calls `onContainerExited(nodeId, finishedAt)` for every
  exited one; it still reports only non-expected-down exits (split into
  inspectExitedContainer/buildUnexpectedExit for the complexity ratchet).
  Streamer stream-end: NOT used as an observation (handleStreamClosed fires
  on onEnd and onError alike; a daemon/transport fault is indistinguishable
  from container exit, and that fault is what stale-tail exists to catch).
- Verdict shape (R08, one version): `{complete, reason?, gapMs?, quietBound:
  {atMs, source, action}}`; `stoppedByHarness`, `quietSinceMs` and
  `teardownWallMs` removed from assessCaptureCompleteness /
  finalizeFileBasedCapture (quietBound required; absent -> TypeError, which
  the finalize catch turns into no verdict -> NOT_RECORDED, never acquits).
- N-F: gapMs = max(0, bound - lastLine).
- N-J: the owner comments state the claim's bound: complete relative to what
  reached the container's stdout (pino async sonic-boom can lose queued lines
  at SIGKILL; file-logging mode is sync); the loss is not counted.
- Markdown: `captureCompleteness=<complete|incomplete:reason>:<source>[:<action>]`.
- Fixture helper: COMPLETE_CAPTURE is now produced by the real owner
  (assessCaptureCompleteness + resolveCaptureQuietBound at a fixed teardown,
  source teardown); `captureCompleteness` option overrides.
- N-I: pure-function cases in full-node-log-capture.test.js (each source,
  clamp, no-lines names its bound, refusal without a bound) and the new
  __tests__/capture-quiet-bound.test.js (parse, each source, restart/start
  marks ignored, earliest wins, never later than teardown, missing never
  acquits).

### Coverage model -> test (handoff = capture-completeness-handoff.test.js)

| cell | expected | test |
|---|---|---|
| harness-stop kill/stop/pause, line before bound, streamed | complete, harness-stop:<action> | handoff 1-3 |
| harness-stop, line after bound (shutdown lines) | complete, gapMs 0 | handoff 4 |
| harness-stop, quiet > 60 s before the mark | stale-tail, harness-stop:killNode | handoff 6 |
| container-exit, single incarnation, line before exit (185 s before teardown) | complete, container-exit | handoff 7 |
| container-exit, line after exit | complete, gapMs 0 | handoff 8 |
| container-exit, quiet > 60 s before exit | stale-tail, container-exit | handoff 9 |
| exit FinishedAt null / unparseable / zero-time | stale-tail, teardown | handoff 10-12 |
| exit earlier than a later kill (min) | complete, container-exit | handoff 13 |
| none captured | no-lines-captured, names the bound | handoff 14 |
| none -> teardown, quiet | stale-tail, teardown | handoff 5 |
| kill -> restart succeeded, drained | complete, teardown | handoff 15 |
| stop -> start succeeded, then quiet | stale-tail, teardown | handoff 16 |
| restart / stop->start succeeded drops an earlier exit | stale-tail, teardown | handoff 17-18 |
| restart failed / stop->start failed, new incarnation exited | complete, container-exit (sweep reports no unexpected exit) | handoff 19, 21 |
| restart failed / stop->start failed, no exit observed, quiet | stale-tail, teardown | handoff 20, 22 |
| pause -> unpause then quiet | stale-tail, teardown | handoff 23 |
| file-logged kill | complete, harness-stop:killNode | handoff 24 |
| file-logged self-exit | complete, container-exit | handoff 25; full-node-log-capture "judges a file-logged node to its observed container exit" |
| file-logged unparseable exit, quiet | stale-tail, teardown | handoff 26 |
| bundle: kill victim | measured, markdown complete:harness-stop:killNode | coverage "the victim of a kill ..." |
| bundle: self-exited node, FATAL trailer | measured, dominant reason published, not LOG_WINDOW_COVERAGE_INCOMPLETE, probe P,F,P done:false | coverage "a node that exited on its own ..." |
| bundle: same node with no observation | non-measuring, probe done:true (honest for a stalled capture) | coverage "the same node judged at teardown ..." |
| sweep observes expected-down exits | observer called for both, report only the unexpected | unexpected-node-exit-sweep "sweep tells the observer ..." |

### R17 routes carried (recorded, not absorbed)

- N-K (distributed-harness, owner decision): an alive-but-silent node at
  teardown (no observed bound) is stale-tail and non-measuring; the streamer
  could distinguish attached-and-idle from detached/reattaching.
- N-L (distributed-harness): mixed clocks: the file-logged verdict compares
  the app's `time` (container clock) with harness Date.now(), the mark's
  sinceMs and Docker's FinishedAt (daemon clock); equal on one host, skewed
  across lab hosts.
- N6 (distributed-harness): line-bounded readers in unexpected-node-exit.js
  (tail 80 / 8192 chars) and tidb-reference-lifecycle.js.
- N8 (guideline-audits): stale ambient-intrinsics baseline rows.
- analyzers owner: scripts/analyze-latent-blockers.js,
  analyze-topology-convergence.js, analyze-priority-recovery-residuals.js,
  summarize-representative-evidence.js read dominantReason with no
  non-measuring filter.
- N-C (this quest / lead): `run_created_no_node` acquits when early event
  lines were lost.

## 2026-11-08: round-4 lab cone (snapshot efc56cc9b, carinas-windows): two red leaves

- test/distributed/harness/__tests__/cluster-start-node-lifecycle.test.js
  "Unit: _collectFailureLogs collects from all nodes" (0 !== 2): CAUSED BY
  THIS QUEST (N5: `_collectFailureLogs` reads `node.getLogWindow`, and the
  test's provider fake offered only `getContainerLogs`). The round-1 R17
  note that such fakes were inert was wrong for this test. Fixed at the
  fixture, no fallback in production: new shared
  __tests__/fake-docker-daemon.js (DOCKER_STREAM, dockerLogFrame,
  fakeDockerDaemon: a fake daemon dial + docker-modem's own demux) is now the
  one fake for container-log reads; the test uses a real DockerProvider over
  it through the real NodeHandle.getLogWindow and asserts both containers'
  log routes were dialled. container-log-window.test.js and
  log-collector.test.js now use the same fixture (their private copies of
  the frame builder and fake daemon removed).
- test/distributed/reference-client/lagrange-scenario-a-slices.test.js
  "all Lagrange Scenario A runners execute run contract and pass evaluation":
  HOST-ENVIRONMENTAL (timing budget on carinas-windows), not this candidate.
  Evidence: the failure is TAP's file timeout ("timeout!", expired: TAP,
  pending FSReqPromise; file `# time=30054ms`, then "cannot create subtest
  after parent test ends"). On that host the preceding preStart test took
  12.3 s and this one was cut at 15.5 s; on this machine the same staged
  tree passes 8/8 in 4.4 s (those two tests 1.1 s and 1.6 s), and earlier
  lab runs passed it on lenovo-laptop (14.4 s, 14.6 s), adam-laptop (20.8 s)
  and the census unit host (18.4 s). Import graph: the file reaches changed
  modules only by static import (scenario-a-durability-lagrange.js ->
  oltp-scenario-a-lagrange-public-pg-context.js ->
  cluster-node-owner-operations.js -> cluster-base-layer.js ->
  docker-provider.js -> container-log-window.js ->
  failure-bundle-log-window.js); the runners execute against a fakeCluster
  ({getNodes, restartNode}) and no runner module references getLogWindow,
  readContainerLogWindow, captureCompleteness, sweepUnexpectedNodeExits,
  writeFailureBundles or retainNodeLogWindow (grep over
  scenarios/scenario-a-*, harness/oltp-scenario-a-*,
  reference-client/lagrange-*). Route (R17, distributed-harness / lab
  placement owner): the file's run time exceeds TAP's 30 s default on the
  slowest host; a host-scaled budget or placement, not a candidate change.
