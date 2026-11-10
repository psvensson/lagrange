// Machine-wide exclusion protocol and bounded hold-session resource owner.
import {spawn} from 'node:child_process';
import os from 'node:os';
import {killGroup, PLACEMENT_GIT_HEAD, gitAt} from './process.js';
import {PLACEMENT_STDIO_PIPE, PLACEMENT_STREAM, closeOf, streamLines} from './process-output.js';
import {remoteCommand} from './shell-transport.js';


// ---------------------------------------------------------------------------
// Sharing the lab between agents and projects (owner directive 2026-09-23:
// runs that could not see each other overwhelmed a lab machine). Every lab
// host has ONE machine-wide lock, `${LAB_LOCK_DIR:-$HOME/.lab}/machine.lock`,
// which whoever runs anything heavy there - a test corpus, a formation, a
// benchmark - takes with flock and a bounded wait, and one holder record
// beside it, `machine.holder.json`, written by the holder under the lock and
// removed by it on exit. flock is the lock; the record is for people and for
// `lab fleet`, and a record whose lock is free is stale evidence, never a
// lock. The convention is plain shell (docs/development/home-lab.md,
// "Sharing the lab between agents and projects"), so another project follows
// it with nothing from here. In this repository the lines below are its one
// owner: discovery reads a machine's lock with them, and the placement
// wrapper and a formation's hold on each node take it with them.

// The convention's exit statuses: 98 is the busy refusal its recipe's
// `flock -w N 9 || exit 98` gives, 97 a host that cannot take part, 143 a
// holder stopped by a signal.
const LAB_LOCK_EXIT = Object.freeze({SETUP: 97, BUSY: 98, TERMINATED: 143});
const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
// No wait is longer, whatever the caller's budget: a host held for longer is
// another run's, and the caller goes elsewhere or refuses.
const LAB_LOCK_WAIT_MAX_MS = 30 * MS_PER_MINUTE;
const LAB_LOCK_WAIT_MIN_SECONDS = 1;
// A released hold's session gets this long to remove its record and end.
const LAB_HOLD_RELEASE_GRACE_MS = 5 * MS_PER_SECOND;
// How a holder names itself: this repository, and who placed the work
// (LAGRANGE_LAB_AGENT, such as claude:SESSION, or this controller's process).
const LAB_PROJECT = 'lagrange';
const LAB_AGENT_ENV = 'LAGRANGE_LAB_AGENT';
const LAB_AGENT_SEPARATOR = ':';
const LAB_TEST_PURPOSE = 'test:';
const LAB_PURPOSE_SEPARATOR = ',';
// What a lab-side shell prints about the lock: busy, with the holder's record
// when there is one, and held.
const LAB_LOCK_LINE = Object.freeze({BUSY: 'machine-lock-busy=', HELD: 'machine-lock-held'});
// What discovery found of a machine's lock, from the probe's answer.
const LAB_LOCK_STATE = Object.freeze({
  FREE: 'free', BUSY: 'busy', STALE: 'stale-record', UNKNOWN: 'unknown',
});
const LAB_LOCK_PROBED = Object.freeze({HELD: 'held', FREE: 'free'});
// What a formation's hold on one node came to.
const LAB_HOLD = Object.freeze({HELD: 'held', BUSY: 'busy', FAILED: 'failed'});
const LAB_HOLDER_UNKNOWN = '?';
const LAB_HOLD_REASON_SEPARATOR = ': ';
const LAB_LOCK_TEXT = Object.freeze({
  FREE: 'free',
  BUSY: 'busy: ',
  STALE_DEAD: 'stale record (pid dead)',
  STALE_LOCK_FREE: 'stale record (lock free)',
  UNKNOWN: 'lock unknown',
  NO_RECORD: 'held (no holder record)',
  UNREADABLE: 'held (unreadable holder record)',
  EXPECTED: ', expected ',
  MINUTES: ' min',
});
const LAB_LOCK_PATHS = Object.freeze([
  'lab_dir="${LAB_LOCK_DIR:-$HOME/.lab}"',
  'lab_lock="$lab_dir/machine.lock"; lab_holder="$lab_dir/machine.holder.json"',
]);
// A record read bounded and onto one line: another project may write it over
// several.
const LAB_HOLDER_READ = 'head -c 4096 "$lab_holder" 2>/dev/null | tr -d \'\\r\\n\'';
// Discovery's view of the lock: whether it is held - asked with `flock -n`,
// which releases at once, and never of a lock file it would have to create -
// and the holder record as written, with whether its pid still runs. The
// probe reads; it never takes the lock. A host that cannot say reports
// nothing, which reads as unknown.
const LAB_LOCK_PROBE = Object.freeze([
  ...LAB_LOCK_PATHS,
  'if [ -f "$lab_holder" ]; then',
  `  say machine_holder "$(${LAB_HOLDER_READ})"`,
  '  holder_pid="$(sed -n \'s/.*"pid"[ ]*:[ ]*\\([0-9][0-9]*\\).*/\\1/p\' "$lab_holder" | ' +
    'head -n 1)"',
  '  if [ -n "$holder_pid" ]; then if ps -p "$holder_pid" >/dev/null 2>&1; then ' +
    'say machine_holder_pid_alive yes; else say machine_holder_pid_alive no; fi; fi',
  'fi',
  'if [ ! -e "$lab_lock" ]; then say machine_lock free',
  'elif command -v flock >/dev/null 2>&1 && [ -r "$lab_lock" ]; then',
  '  flock -n "$lab_lock" true 2>/dev/null',
  '  case $? in 0) say machine_lock free;; 1) say machine_lock held;; esac',
  'fi',
]);
// Take the lock on fd 9, waiting at most $lock_wait seconds - as a job, so a
// stop signal ends the wait at once - and, busy, name the holder's record and
// exit busy without touching it.
const LAB_LOCK_TAKE = Object.freeze([
  `mkdir -p "$lab_dir" || exit ${LAB_LOCK_EXIT.SETUP}`,
  `exec 9>"$lab_lock" || exit ${LAB_LOCK_EXIT.SETUP}`,
  'flock -w "$lock_wait" 9 & pid=$!',
  'wait "$pid"; locked=$?; pid=""',
  `if [ "$locked" != 0 ]; then echo "${LAB_LOCK_LINE.BUSY}$(${LAB_HOLDER_READ})"; ` +
    `exit ${LAB_LOCK_EXIT.BUSY}; fi`,
]);
// Under the lock, the holder record: the caller's fields ($holder_head,
// $expected_minutes) around what only the holder knows - when it started and
// its pid. Whoever sets `holding` removes it on exit.
const LAB_LOCK_RECORD = Object.freeze([
  'printf \'{%s,"startedAt":"%s","expectedMinutes":%s,"pid":%s}\\n\' "$holder_head" ' +
    '"$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$expected_minutes" "$$" > "$lab_holder" || ' +
    `exit ${LAB_LOCK_EXIT.SETUP}`,
  'holding=1',
]);
// A formation's hold on one node: the lock taken and recorded as above, then
// kept for as long as the controller keeps this session's input open. Its
// end - a release, or the session's own - lets the shell exit, which removes
// the record and frees the machine.
const LAB_HOLD_SCRIPT = [
  'set -u',
  'lock_wait="$1"; holder_head="$2"; expected_minutes="$3"',
  'set --',
  'pid=""; holding=""',
  ...LAB_LOCK_PATHS,
  'trap \'if [ -n "$holding" ]; then rm -f "$lab_holder"; fi\' EXIT',
  'trap \'if [ -n "$pid" ]; then kill "$pid" 2>/dev/null; fi; ' +
    `exit ${LAB_LOCK_EXIT.TERMINATED}' HUP INT TERM`,
  'if ! command -v flock >/dev/null 2>&1; then echo "a lab hold needs flock here" >&2; ' +
    `exit ${LAB_LOCK_EXIT.SETUP}; fi`,
  ...LAB_LOCK_TAKE,
  ...LAB_LOCK_RECORD,
  `echo ${LAB_LOCK_LINE.HELD}`,
  'cat >/dev/null 9>&-',
].join('\n');

// Seconds for `flock -w`: the caller's budget, at least a second, never more
// than the lab's cap.
function labLockWaitSeconds(waitMs) {
  return Math.max(LAB_LOCK_WAIT_MIN_SECONDS,
    Math.ceil(Math.min(waitMs, LAB_LOCK_WAIT_MAX_MS) / MS_PER_SECOND));
}

// The arguments a lab shell takes the lock with: its wait, the head of its
// holder record - this project, the agent, the controller, the purpose and
// the commit, as JSON members - and the minutes it expects to hold the
// machine.
function labLockArgs({waitMs, purpose, expectedMs, sha, env}) {
  const controller = os.hostname();
  const agent = env[LAB_AGENT_ENV] ||
    [LAB_PROJECT, controller, process.pid].join(LAB_AGENT_SEPARATOR);
  const head = JSON.stringify({project: LAB_PROJECT, agent, controller, purpose, sha});
  return [String(labLockWaitSeconds(waitMs)), head.slice(1, -1),
    String(Math.ceil(expectedMs / MS_PER_MINUTE))];
}

// What a test run tells other agents it is doing: its lanes.
function labTestPurpose(lanes) {
  return `${LAB_TEST_PURPOSE}${[...new Set(lanes)].join(LAB_PURPOSE_SEPARATOR)}`;
}

// A holder record as its holder wrote it, when it is a JSON object.
function parseLabHolder(text) {
  if (!text) return null;
  try {
    const record = JSON.parse(text);
    return record !== null && typeof record === 'object' && !Array.isArray(record) ?
      record : null;
  } catch {
    return null;
  }
}

// The holder a lab shell named when it refused busy, from its lines.
function busyHolder(lines) {
  const line = lines.find((one) => one.startsWith(LAB_LOCK_LINE.BUSY));
  return parseLabHolder(line?.slice(LAB_LOCK_LINE.BUSY.length));
}

/**
 * Who holds a machine, as a person reads it: `held by AGENT (PROJECT,
 * PURPOSE) since STARTED`, a field the holder left out shown as unknown.
 * @param {Object|null} holder a holder record
 * @return {string}
 */
function labHolderText(holder) {
  if (!holder) return LAB_LOCK_TEXT.NO_RECORD;
  return `held by ${holder.agent ?? LAB_HOLDER_UNKNOWN} (${holder.project ?? LAB_HOLDER_UNKNOWN}` +
    `, ${holder.purpose ?? LAB_HOLDER_UNKNOWN}) since ${holder.startedAt ?? LAB_HOLDER_UNKNOWN}`;
}

// A machine's lock for the fleet: who holds it and for how long they expect
// to, or that it is free, a stale record, or not known.
function labLockText(lock) {
  if (lock.state === LAB_LOCK_STATE.BUSY) return `${LAB_LOCK_TEXT.BUSY}${heldText(lock)}`;
  if (lock.state === LAB_LOCK_STATE.STALE) {
    return lock.holderPidAlive === false ? LAB_LOCK_TEXT.STALE_DEAD :
      LAB_LOCK_TEXT.STALE_LOCK_FREE;
  }
  return lock.state === LAB_LOCK_STATE.FREE ? LAB_LOCK_TEXT.FREE : LAB_LOCK_TEXT.UNKNOWN;
}

function heldText(lock) {
  if (!lock.holder) return lock.record ? LAB_LOCK_TEXT.UNREADABLE : LAB_LOCK_TEXT.NO_RECORD;
  return `${labHolderText(lock.holder)}${LAB_LOCK_TEXT.EXPECTED}` +
    `${lock.holder.expectedMinutes ?? LAB_HOLDER_UNKNOWN}${LAB_LOCK_TEXT.MINUTES}`;
}

function machineLockState(probed, record) {
  if (probed === LAB_LOCK_PROBED.HELD) return LAB_LOCK_STATE.BUSY;
  if (probed !== LAB_LOCK_PROBED.FREE) return LAB_LOCK_STATE.UNKNOWN;
  return record ? LAB_LOCK_STATE.STALE : LAB_LOCK_STATE.FREE;
}

// ---------------------------------------------------------------------------
// A formation's hold on a lab machine, under the lab convention above: the
// same lock and record the placement wrapper takes, in a session of its own
// that the harness keeps open for the whole formation.

/**
 * Hold one lab machine for a formation under the lab convention: its lock
 * taken with a bounded wait and its holder record written, both kept until
 * `release`. `outcome` settles `{state: 'held'}`, `{state: 'busy', holder}`
 * (the holder's record, or null) or `{state: 'failed', reason}`.
 * @param {{name: string, sshTarget: string|null}} machine
 * @param {{waitMs: number, purpose: string, expectedMs: number, env?: Object,
 *   root?: string}} request
 * @return {{outcome: Promise<Object>, release: Function}}
 */
function holdLabMachine(machine, {waitMs, purpose, expectedMs, env = process.env,
  root = process.cwd()}) {
  const sha = gitAt(root, PLACEMENT_GIT_HEAD).stdout?.trim() || LAB_HOLDER_UNKNOWN;
  const [command, args] = remoteCommand(machine, LAB_HOLD_SCRIPT,
    labLockArgs({waitMs, purpose, expectedMs, sha, env}));
  const child = spawn(command, args, {env, stdio: PLACEMENT_STDIO_PIPE});
  const lines = [];
  const errors = [];
  const closed = closeOf(child);
  const outcome = new Promise((resolve) => {
    streamLines(child.stdout, PLACEMENT_STREAM.OUT, (line) => {
      lines.push(line);
      if (line === LAB_LOCK_LINE.HELD) resolve({state: LAB_HOLD.HELD});
    });
    streamLines(child.stderr, PLACEMENT_STREAM.ERR, (line) => errors.push(line));
    closed.then((code) => resolve(holdEnded(code, lines, errors)));
  });
  let released = null;
  const release = () => {
    if (!released) {
      child.stdin.end();
      const cut = setTimeout(() => killGroup(child), LAB_HOLD_RELEASE_GRACE_MS);
      released = closed.then(() => clearTimeout(cut));
    }
    return released;
  };
  return {outcome, release};
}

// A hold whose session ended before it held: busy, naming the holder, or
// failed with what its shell said.
function holdEnded(code, lines, errors) {
  if (code === LAB_LOCK_EXIT.BUSY) return {state: LAB_HOLD.BUSY, holder: busyHolder(lines)};
  return {state: LAB_HOLD.FAILED,
    reason: [`exit ${code}`, ...errors].join(LAB_HOLD_REASON_SEPARATOR)};
}

export {LAB_LOCK_EXIT, MS_PER_SECOND, MS_PER_MINUTE, LAB_LOCK_WAIT_MAX_MS, LAB_LOCK_LINE,
  LAB_LOCK_STATE, LAB_HOLDER_UNKNOWN, LAB_LOCK_PATHS, LAB_LOCK_PROBE, LAB_LOCK_TAKE,
  LAB_LOCK_RECORD, labLockArgs, labTestPurpose, parseLabHolder, busyHolder, labLockText,
  machineLockState, labHolderText, LAB_HOLD, holdLabMachine};
