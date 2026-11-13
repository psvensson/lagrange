// Formation hold acquisition, holder records and bounded release under the lab lock.
import {spawn} from 'node:child_process';
import os from 'node:os';
import {
  LAB_AGENT_ENV, LAB_AGENT_SEPARATOR, LAB_HOLD, LAB_HOLD_CLOSURE_UNCONFIRMED,
  LAB_HOLD_REASON_SEPARATOR, LAB_HOLD_RELEASE_GRACE_MS, LAB_HOLDER_UNKNOWN,
  LAB_LOCK_EXIT, LAB_LOCK_LINE, LAB_LOCK_PATHS, LAB_LOCK_RECORD, LAB_LOCK_STATE,
  LAB_LOCK_TAKE, LAB_LOCK_TEXT, LAB_LOCK_WAIT_MAX_MS, LAB_LOCK_WAIT_MIN_SECONDS,
  LAB_PROJECT, LAB_PURPOSE_SEPARATOR, LAB_TEST_PURPOSE, MS_PER_MINUTE, MS_PER_SECOND,
} from './machine-lock-constants.js';
import {PLACEMENT_STDIO_PIPE, PLACEMENT_STREAM}
  from './placement-constants.js';
import {PLACEMENT_GIT_HEAD, gitAt} from './placement-source.js';
import {PLACEMENT_CHILD_EVENT, closeOf, killGroup, streamLines} from './process.js';
import {remoteCommand} from './remote-command.js';

// A formation's hold on one node: the lock taken and recorded as above, then
// kept for as long as the controller keeps this session's input open. Its
// end - a release, or the session's own - lets the shell exit, which removes
// the record and frees the machine.
const LAB_HOLD_SCRIPT = [
  'set -u',
  'lock_wait="$1"; holder_head="$2"; expected_minutes="$3"',
  'set --',
  'waiter_pid=""; holding=""',
  ...LAB_LOCK_PATHS,
  'trap \'if [ -n "$holding" ]; then rm -f "$lab_holder"; fi\' EXIT',
  'trap \'if [ -n "$waiter_pid" ]; then kill "$waiter_pid" 2>/dev/null; fi; ' +
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
export function labHolderText(holder) {
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
export function holdLabMachine(machine, {waitMs, purpose, expectedMs, env = process.env,
  root = process.cwd()}) {
  const sha = gitAt(root, PLACEMENT_GIT_HEAD).stdout?.trim() || LAB_HOLDER_UNKNOWN;
  const [command, args] = remoteCommand(machine, LAB_HOLD_SCRIPT,
    labLockArgs({waitMs, purpose, expectedMs, sha, env}));
  const child = spawn(command, args, {env, stdio: PLACEMENT_STDIO_PIPE, detached: true});
  const lines = [];
  const errors = [];
  const session = {held: false, failure: {observed: false}};
  const closed = closeOf(child);
  child.once(PLACEMENT_CHILD_EVENT.EXIT, (code, signal) => {
    if (session.held && code !== 0 && !session.failure.observed) {
      Object.assign(session.failure,
        {observed: true, error: holdSessionFailure(child, code, signal)});
    }
  });
  const outcome = new Promise((resolve) => {
    streamLines(child.stdout, PLACEMENT_STREAM.OUT, (line) => {
      lines.push(line);
      if (line === LAB_LOCK_LINE.HELD) {
        session.held = true;
        resolve({state: LAB_HOLD.HELD});
      }
    });
    streamLines(child.stderr, PLACEMENT_STREAM.ERR, (line) => errors.push(line));
    closed.then((code) => resolve(holdEnded(code, lines, errors)));
  });
  let released = null;
  const release = () => {
    if (!released) released = releaseLabHold(child, closed, session);
    return released;
  };
  return {outcome, release};
}

function holdSessionFailure(child, code, signal) {
  return Object.assign(new Error(`lab hold session closed unavailable: ` +
    `exit=${code} signal=${signal} group=${child.pid}`),
  {exitCode: code, signal, group: child.pid});
}

// Release has one deadline and one result, including when a second caller
// asks about the same hold. A timed-out release is unavailable even if the
// local session can be cut; that signal does not prove remote cleanup.
function releaseLabHold(child, closed, session) {
  return new Promise((resolve, reject) => {
    const inputFailed = (error) => {
      if (!session.failure.observed) Object.assign(session.failure, {observed: true, error});
      try {
        killGroup(child);
      } catch (cleanupError) {
        process.stderr.write(`lab hold cleanup unavailable for group ${child.pid}: ` +
          `${cleanupError.message}\n`);
      }
    };
    child.stdin.once(PLACEMENT_CHILD_EVENT.ERROR, inputFailed);
    const cut = setTimeout(() => {
      const timeout = new Error(`lab hold release timed out after ${LAB_HOLD_RELEASE_GRACE_MS} ms`);
      if (!session.failure.observed) {
        Object.assign(session.failure, {observed: true, error: timeout});
      } else process.stderr.write(`${timeout.message}\n`);
      try {
        killGroup(child);
      } catch (error) {
        session.failure.error.cause = error;
        process.stderr.write(`lab hold cleanup unavailable for group ${child.pid}: ` +
          `${error.message}\n`);
      }
      child.stdin?.destroy();
      child.stdout?.destroy();
      child.stderr?.destroy();
      child.unref();
      session.failure.error.groupClosure = LAB_HOLD_CLOSURE_UNCONFIRMED;
      process.stderr.write(`lab hold cleanup unavailable: group ${child.pid} closure unconfirmed\n`);
      reject(session.failure.error);
    }, LAB_HOLD_RELEASE_GRACE_MS);
    closed.then((code) => {
      clearTimeout(cut);
      child.stdin.removeListener(PLACEMENT_CHILD_EVENT.ERROR, inputFailed);
      if (!session.failure.observed && session.held && code !== 0) {
        Object.assign(session.failure,
          {observed: true, error: holdSessionFailure(child, code, child.signalCode)});
      }
      if (session.failure.observed) reject(session.failure.error);
      else resolve();
    });
    try {
      child.stdin.end();
    } catch (error) {
      inputFailed(error);
    }
  });
}

// A hold whose session ended before it held: busy, naming the holder, or
// failed with what its shell said.
function holdEnded(code, lines, errors) {
  if (code === LAB_LOCK_EXIT.BUSY) return {state: LAB_HOLD.BUSY, holder: busyHolder(lines)};
  return {state: LAB_HOLD.FAILED,
    reason: [`exit ${code}`, ...errors].join(LAB_HOLD_REASON_SEPARATOR)};
}

export {busyHolder, labLockArgs, labLockText, labTestPurpose, parseLabHolder};
