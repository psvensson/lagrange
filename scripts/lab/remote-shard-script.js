// Exact remote shell assembly delegated by probe; no runtime placement decisions.
import {CHECK_BASE_ENV, WORKSPACE_INJECTION_ENV} from '../checks/change-selection-constants.js';
import {LANE_JOBS_CAP_ENV} from '../checks/test-resource-classification-constants.js';
import {ARTIFACT_COLLECTOR_PATH, ARTIFACT_LIMITS,
  MODE as ARTIFACT_COLLECTOR_MODE} from './placement-artifact-custody.js';
import {shellQuote} from './shell-transport.js';
import {LAB_LOCK_LINE, LAB_LOCK_PATHS, LAB_LOCK_TAKE, LAB_LOCK_RECORD} from './machine-lock.js';
import {PLACEMENT_EXIT} from './placement-contract.js';
import {PLACEMENT_NEWLINE} from './process-output.js';
import {PLACEMENT_PARENT, PLACEMENT_IMPORT_GRAPH} from './proof-source.js';


const PLACEMENT_ENV = 'LAGRANGE_PLACEMENT';
const PLACEMENT_LOCAL = 'local';
// How the workspace injections a placement declares are joined: the
// separator the change taxonomy's reader splits on (scripts/checks/changed-paths.js).
const PLACEMENT_INJECTION_SEPARATOR = ',';
const PLACEMENT_SHELL_LINE = /^placement-shell=(\d+)$/mu;
// A bundle upload that has not finished by this is a stalled machine.
const PLACEMENT_UPLOAD_DEADLINE_SECONDS = 300;
// What the controller's own run policy hands a lab machine's runner, and the
// base its history walks measure from: the controller's, resolved to a
// commit, since a lab checkout's own origin/main is whatever it last fetched.
const PLACEMENT_FORWARDED_ENV = Object.freeze({
  RETRY: 'LAGRANGE_RETRY_FAILED_ONCE',
  TAP_TIMEOUT: 'TAP_TIMEOUT',
  CHECK_BASE: CHECK_BASE_ENV,
});
const PLACEMENT_RUNNER = 'scripts/run-classified-test-files.js';
const PLACEMENT_RUNNER_STDIN = '--stdin';
const PLACEMENT_WRAPPER_HEAD = Object.freeze([
  'set -u',
  'status=0',
  'if command -v timeout >/dev/null 2>&1; then ' +
    // --foreground keeps timeout, and so the upload, in the wrapper's group.
    `bound="timeout --foreground ${PLACEMENT_UPLOAD_DEADLINE_SECONDS}"; else bound=; fi`,
]);
const PLACEMENT_WRAPPER_UPLOAD_FAILED = 'echo "placement: the bundle upload failed" >&2;';
const PLACEMENT_WRAPPER_EXIT = 'exit "$status";';
const PLACEMENT_FILES_MARK = 'LAGRANGE_PLACEMENT_FILES';
const PLACEMENT_MACHINE_FACTOR_ENV = 'LAGRANGE_TEST_MACHINE_FACTOR';
const PLACEMENT_UPLOAD_SCRIPT = 'mkdir -p "${1%/*}" && cat > "$1"';

// The lab machine's half: take the commit from the bundle (when one was
// needed), prove it in a throwaway worktree with the workspace links the
// publisher's gate checkout gets, run the controller-chosen files through the
// same classified runner, and remove the worktree, ref, bundle and file list
// on every exit. One heavy run per machine at a time, whoever starts it: the
// lab convention's machine-wide lock, waited for no longer than the shard's
// budget, with the holder record beside it for as long as it is held; and
// inside it this checkout's own lock, which a run placed from another clone
// by an older wrapper takes alone. Exit 97 is a setup failure and 98 a
// machine held by another run: the controller then places the shard on the
// next ready host, or runs it itself. The runner leads its own process group,
// so the controller's deadline can stop everything it started.
const PLACEMENT_RESULTS_PREFIX = 'placement-results=';
const PLACEMENT_CLEANUP_TRAP = 'trap cleanup EXIT';
const PLACEMENT_ARTIFACT_UNSUPPORTED =
  'placement artifacts require remote shares; controller artifact custody is unsupported';
const PLACEMENT_SCRIPT_HEAD = [
  'set -u',
  'repo="$1"; sha="$2"; node_major="$3"; factor="$4"; run="$5"; bundle="$6"',
  'retry="$7"; tap_timeout="$8"; check_base="$9"; results="${10}"; lock_wait="${11}"',
  'holder_head="${12}"; expected_minutes="${13}"',
  // Before nvm, which reads its arguments (see the capability script).
  'set --',
  'pid=""; holding=""',
  ...LAB_LOCK_PATHS,
  // The controller stops a shard by signalling this shell, whose trap stops
  // the runner's group and whose exit removes everything below.
  'echo "placement-shell=$$"',
  `cd "$repo" || exit ${PLACEMENT_EXIT.SETUP}`,
  `parent="$repo/${PLACEMENT_PARENT}"`,
  'wt="$parent/$run"; list="$parent/$run.files"; ref="refs/lagrange-placement/$run"',
  // Installed before anything that can fail or be interrupted, so every exit
  // - busy, a failed fetch, a signal - removes what this run was given, and
  // last the holder record, if this shell wrote one.
  'cleanup() { if cd "$repo"; then git worktree remove --force "$wt" >/dev/null 2>&1; ' +
    'rm -rf "$wt"; git worktree prune >/dev/null 2>&1; git update-ref -d "$ref" >/dev/null 2>&1; ' +
    'rm -f "$list"; if [ -n "$bundle" ]; then rm -f "$bundle"; fi; fi; ' +
    'if [ -n "$holding" ]; then rm -f "$lab_holder"; fi; }',
  PLACEMENT_CLEANUP_TRAP,
  // Stop the runner's whole group and wait for the runner, so cleanup never
  // races a dying test writing into the worktree. The runner and its tests
  // install no TERM handler, so the wait ends with them.
  'stop() {',
  '  if [ -n "$pid" ]; then',
  '    kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null',
  '    wait "$pid"',
  '  fi',
  `  exit ${PLACEMENT_EXIT.TERMINATED}`,
  '}',
  'trap stop HUP INT TERM',
  // One run per machine and a stoppable runner group are what this relies
  // on: a machine without flock or setsid runs nothing placed.
  'if ! command -v flock >/dev/null 2>&1 || ! command -v setsid >/dev/null 2>&1; then',
  '  echo "placement needs flock and setsid on this machine" >&2',
  `  exit ${PLACEMENT_EXIT.SETUP}`,
  'fi',
  'NVM_DIR="${NVM_DIR:-$HOME/.nvm}"',
  '[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1 && ' +
    '[ -n "$node_major" ] && nvm use "$node_major" >/dev/null 2>&1',
  `common="$(git rev-parse --git-common-dir 2>/dev/null)" || exit ${PLACEMENT_EXIT.SETUP}`,
  'case "$common" in /*) ;; *) common="$repo/$common";; esac',
  ...LAB_LOCK_TAKE,
  'exec 8>"$common/lagrange-placement.lock"',
  `flock -n 8 || { echo "${LAB_LOCK_LINE.BUSY}"; exit ${PLACEMENT_EXIT.BUSY}; }`,
  ...LAB_LOCK_RECORD,
  `mkdir -p "$parent" || exit ${PLACEMENT_EXIT.SETUP}`,
  // Under the lock nothing else is placed here, so anything left by an
  // earlier run - a connection lost after its upload, an interrupted one -
  // is stale and goes (verifier round 1).
  'for stale in "$parent"/* "$parent"/.[!.]*; do',
  '  [ -e "$stale" ] || continue',
  '  [ "$stale" = "$bundle" ] || rm -rf "$stale"',
  'done',
  'git worktree prune >/dev/null 2>&1',
  'for stale in $(git for-each-ref --format="%(refname)" refs/lagrange-placement/); do',
  '  [ "$stale" = "$ref" ] || git update-ref -d "$stale" >/dev/null 2>&1',
  'done',
  'if [ -n "$bundle" ]; then ' +
    'bundle_ref=$(git bundle list-heads "$bundle" 2>/dev/null | awk \'NR==1 {print $2}\'); ' +
    `[ -n "$bundle_ref" ] && git fetch --quiet "$bundle" "$bundle_ref:$ref" >/dev/null 2>&1 || exit ${PLACEMENT_EXIT.SETUP}; fi`,
  `git worktree add --detach --quiet "$wt" "$sha" >/dev/null 2>&1 || exit ${PLACEMENT_EXIT.SETUP}`,
  `[ "$(git -C "$wt" rev-parse HEAD)" = "$sha" ] || exit ${PLACEMENT_EXIT.SETUP}`,
  // What the worktree actually is, for the controller's log.
  'echo "placement-head=$(git -C "$wt" rev-parse HEAD)"',
  // The workspace links the publisher's gate checkout gets - but only for
  // what this checkout ignores: an older checkout's copy of a tracked path
  // the placed commit deleted must not reappear in it (verifier round 1).
  // tools/ holds only fetched model checkers (tla2tools.jar, alloy), each
  // ignored on its own: linked entry by entry, as data/ is. Every link made is
  // declared a workspace injection, the publisher's own contract, so none is
  // ever repository content to the change taxonomy: an ignore rule written
  // for a directory (tools/alloy-*/) does not match a link to one.
  'injected=""',
  'for dir in node_modules data tools; do',
  '  [ -e "$repo/$dir" ] || continue',
  '  if [ ! -e "$wt/$dir" ] && git -C "$repo" check-ignore -q "$dir"; then',
  '    ln -s "$repo/$dir" "$wt/$dir" && echo "placement-link=$dir" && ' +
    `injected="\${injected:+$injected${PLACEMENT_INJECTION_SEPARATOR}}$dir"`,
  '    continue',
  '  fi',
  '  mkdir -p "$wt/$dir"',
  '  for entry in "$repo/$dir"/* "$repo/$dir"/.[!.]*; do',
  '    [ -e "$entry" ] || continue',
  '    name="$dir/${entry##*/}"',
  '    [ -e "$wt/$name" ] && continue',
  '    git -C "$repo" check-ignore -q "$name" || continue',
  '    ln -s "$entry" "$wt/$name" && echo "placement-link=$name" && ' +
    `injected="\${injected:+$injected${PLACEMENT_INJECTION_SEPARATOR}}$name"`,
  '  done',
  'done',
  `cat > "$list" <<'${PLACEMENT_FILES_MARK}'`,
];
const PLACEMENT_SCRIPT_TAIL = [
  PLACEMENT_FILES_MARK,
  `cd "$wt" || exit ${PLACEMENT_EXIT.SETUP}`,
  // The generated import graph a fresh checkout lacks (CI's "Prepare
  // generated test metadata"), produced for this commit by its own producer:
  // without it the tests that read the sealed graph are red only here.
  `if [ -f ${PLACEMENT_IMPORT_GRAPH.PRODUCER} ]; then`,
  `  node ${PLACEMENT_IMPORT_GRAPH.PRODUCER} ${PLACEMENT_IMPORT_GRAPH.FLAG} >/dev/null || ` +
    `{ echo "placement: the import graph could not be generated" >&2; exit ${PLACEMENT_EXIT.SETUP}; }`,
  // A producer that rewrote tracked metadata means the commit's generated
  // metadata is stale: refused, as the local materializer refuses it.
  '  stale="$(git status --porcelain --untracked-files=no | cut -c4- | tr \'\\n\' \' \')"',
  '  if [ -n "$stale" ]; then',
  '    echo "placement: the commit\'s generated metadata is stale; regenerate and commit $stale" >&2; ' +
    `exit ${PLACEMENT_EXIT.SETUP}`,
  '  fi',
  `  echo "placement-prepared=${PLACEMENT_IMPORT_GRAPH.NAME}"`,
  'fi',
  // Its own budgets scaled by its measured speed, the controller's retry and
  // timeout policy, and never placed again.
  `export ${PLACEMENT_MACHINE_FACTOR_ENV}="$factor" ${PLACEMENT_ENV}=${PLACEMENT_LOCAL} ` +
    `${WORKSPACE_INJECTION_ENV}="$injected"`,
  `if [ -n "$retry" ]; then export ${PLACEMENT_FORWARDED_ENV.RETRY}="$retry"; fi`,
  `if [ -n "$tap_timeout" ]; then export ${PLACEMENT_FORWARDED_ENV.TAP_TIMEOUT}="$tap_timeout"; fi`,
  // The controller's check base, or none: never this checkout's own.
  `if [ -n "$check_base" ]; then export ${PLACEMENT_FORWARDED_ENV.CHECK_BASE}="$check_base"; ` +
    `else unset ${PLACEMENT_FORWARDED_ENV.CHECK_BASE}; fi`,
  // Every lane capped at this host's own processors less one, counted here at
  // run time: never a per-host constant, never a host's name.
  `unset ${LANE_JOBS_CAP_ENV}`,
  'cores="$(getconf _NPROCESSORS_ONLN 2>/dev/null || nproc 2>/dev/null)"',
  `case "$cores" in ""|*[!0-9]*) ;; 0|1) export ${LANE_JOBS_CAP_ENV}=1;; ` +
    `*) export ${LANE_JOBS_CAP_ENV}=$((cores - 1));; esac`,
  `echo "placement-env=factor:$${PLACEMENT_MACHINE_FACTOR_ENV} mode:$${PLACEMENT_ENV} ` +
    `retry:\${${PLACEMENT_FORWARDED_ENV.RETRY}:-} timeout:\${${PLACEMENT_FORWARDED_ENV.TAP_TIMEOUT}:-} ` +
    `lanecap:\${${LANE_JOBS_CAP_ENV}:-} base:\${${PLACEMENT_FORWARDED_ENV.CHECK_BASE}:-}"`,
  // Both locks (fds 8 and 9) stay with this shell: a test process that
  // outlived its run must not hold the machine busy after it.
  'setsid node scripts/run-classified-test-files.js --stdin < "$list" 8>&- 9>&- &',
  'pid=$!',
  'echo "placement-pid=$pid"',
  'wait "$pid"; status=$?',
  // A results ledger the runner left in the worktree comes back on this
  // relay, one prefixed line per record, before cleanup removes it.
  'if [ -n "$results" ] && [ -f "$wt/$results" ]; then ' +
    `sed 's/^/${PLACEMENT_RESULTS_PREFIX}/' "$wt/$results"; fi`,
  'exit "$status"',
];

function artifactCollectionBody(custody) {
  const request = shellQuote(JSON.stringify(custody.request));
  const unavailable = shellQuote(custody.unavailableLine);
  const lines = [
    'wt="$1"; artifact_status="$2"',
    // Every added write is inside the external bound, including this first
    // separator: the runner may have left both a partial line and a full pipe.
    'printf \'\\n\'',
    `if [ -f "$wt/${ARTIFACT_COLLECTOR_PATH}" ]; then`,
    `  node "$wt/${ARTIFACT_COLLECTOR_PATH}" ${ARTIFACT_COLLECTOR_MODE.SUPERVISE} ` +
      `"$wt" ${request} "$artifact_status" || printf '\\n%s\\n' ${unavailable}`,
    `else printf '%s\\n' ${unavailable}; fi`,
  ];
  return lines.join(PLACEMENT_NEWLINE);
}

function artifactCleanupTrap(custody) {
  const collect = shellQuote(artifactCollectionBody(custody));
  const lines = [
    'artifact_cleanup() {',
    '  artifact_status=$?',
    // The runner has settled before EXIT. A repeated interrupt cannot race
    // the bounded collector with removal of its source worktree.
    '  trap \'\' HUP INT TERM',
    // Without the external bound, even printing an unavailable frame could
    // hang cleanup. Missing terminal custody is the controller's refusal.
    '  if command -v timeout >/dev/null 2>&1; then',
    '    setsid timeout --signal=KILL ' +
      `${ARTIFACT_LIMITS.ENTRY_SECONDS}s sh -c ${collect} sh "$wt" "$artifact_status" ` +
      '</dev/null 2>/dev/null 8>&- 9>&- &',
    '    collector_pid=$!',
    '    wait "$collector_pid" 2>/dev/null',
    // A worker or supervisor can end before its descendants. This shell
    // retains group custody until every possible exit has discharged them.
    '    kill -KILL "-$collector_pid" 2>/dev/null || :',
    '  fi',
    '  cleanup',
    '  exit "$artifact_status"',
    '}',
    'trap artifact_cleanup EXIT',
  ];
  return lines.join(PLACEMENT_NEWLINE);
}

function placementScriptHead(custody = null) {
  return custody?.request ? PLACEMENT_SCRIPT_HEAD.map((line) =>
    line === PLACEMENT_CLEANUP_TRAP ? artifactCleanupTrap(custody) : line) : PLACEMENT_SCRIPT_HEAD;
}

function placementScript(files, ...options) {
  return [...placementScriptHead(options[0]), ...files, ...PLACEMENT_SCRIPT_TAIL]
    .join(PLACEMENT_NEWLINE) + PLACEMENT_NEWLINE;
}

// The local half of one shard, as one shell: upload the bundle (bounded, so a
// machine that accepts the connection and then stalls cannot hold anything),
// then run the lab-side script. Its own process group, its output in files:
// nothing about it needs this process's event loop.
function shardWrapper({upload, bundleFile, run, scriptFile}) {
  const script = shellQuote(scriptFile);
  const lines = [...PLACEMENT_WRAPPER_HEAD];
  if (upload) {
    const bundle = shellQuote(bundleFile);
    lines.push(`$bound ${upload} < ${bundle} || status=${PLACEMENT_EXIT.SETUP}`,
      `rm -f ${bundle}`,
      `if [ "$status" != 0 ]; then ${PLACEMENT_WRAPPER_UPLOAD_FAILED} rm -f ${script}; ` +
        `${PLACEMENT_WRAPPER_EXIT} fi`);
  }
  lines.push(`${run} < ${script} || status=$?`, `rm -f ${script}`, PLACEMENT_WRAPPER_EXIT);
  return lines.join(PLACEMENT_NEWLINE);
}

export {PLACEMENT_ENV, PLACEMENT_LOCAL, PLACEMENT_SHELL_LINE, PLACEMENT_FORWARDED_ENV,
  PLACEMENT_RUNNER, PLACEMENT_RUNNER_STDIN, PLACEMENT_MACHINE_FACTOR_ENV, PLACEMENT_UPLOAD_SCRIPT,
  PLACEMENT_RESULTS_PREFIX, PLACEMENT_ARTIFACT_UNSUPPORTED, placementScript, shardWrapper};
