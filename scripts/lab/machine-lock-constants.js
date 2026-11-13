// The machine-wide lab lock convention, shared by discovery, holds and placement.
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
const LAB_HOLD_CLOSURE_UNCONFIRMED = 'unconfirmed';
const LAB_HOLD_SESSION_UNAVAILABLE = 'lab hold session closed unavailable: ';
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
  'flock -w "$lock_wait" 9 & waiter_pid=$!',
  'wait "$waiter_pid"; locked=$?; waiter_pid=""',
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

export {
  LAB_AGENT_ENV, LAB_AGENT_SEPARATOR, LAB_HOLD, LAB_HOLD_CLOSURE_UNCONFIRMED,
  LAB_HOLD_REASON_SEPARATOR, LAB_HOLD_RELEASE_GRACE_MS, LAB_HOLD_SESSION_UNAVAILABLE,
  LAB_HOLDER_UNKNOWN,
  LAB_LOCK_EXIT, LAB_LOCK_LINE, LAB_LOCK_PATHS, LAB_LOCK_PROBE, LAB_LOCK_PROBED,
  LAB_LOCK_RECORD, LAB_LOCK_STATE, LAB_LOCK_TAKE, LAB_LOCK_TEXT,
  LAB_LOCK_WAIT_MAX_MS, LAB_LOCK_WAIT_MIN_SECONDS, LAB_PROJECT,
  LAB_PURPOSE_SEPARATOR, LAB_TEST_PURPOSE, MS_PER_MINUTE, MS_PER_SECOND,
};
