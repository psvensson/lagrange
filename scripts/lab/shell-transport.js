// SSH vocabulary and shell argument assembly delegated by placement.


const SSH = 'ssh';
const SSH_OPTION = '-o';
const SSH_BATCH_MODE = 'BatchMode=yes';

// ---------------------------------------------------------------------------
// Test capability: what a machine can actually run, measured rather than
// assumed. The owner's rule (2026-09-18) is that no host belongs in any setup
// - the fleet changes - so discovery records FACTS per machine in the
// out-of-repo inventory, and placement chooses from them at run time. One
// POSIX script serves every machine, piped to `sh -s` locally for the
// controller and over ssh for a lab node, so the controller is never a special
// case. Everything it reports is a prerequisite a real run has tripped over: a
// lab node without helm, psql or the pinned MovieLens dataset reds five files
// for setup reasons (measured 2026-09-17), and one without a C++ compiler
// cannot build better-sqlite3 at npm ci.

// Bounded: an address that answers nothing must not hold discovery for two
// minutes (verifier round 1 measured 130 s against a blackholed address).
const SSH_BOUNDED_OPTIONS = Object.freeze([
  SSH_OPTION, 'ConnectTimeout=5',
  SSH_OPTION, 'ServerAliveInterval=5',
  SSH_OPTION, 'ServerAliveCountMax=2',
]);
const SSH_OPTION_PREFIX = '-';
const ERROR_TEXT_CAPABILITY = Object.freeze({
  BAD_TARGET: 'refusing an ssh target that begins with "-": ',
});
const SHELL_SINGLE_QUOTE = '\'';
const SHELL_ESCAPED_SINGLE_QUOTE = '\'\\\'\'';

function shellQuote(value) {
  return `${SHELL_SINGLE_QUOTE}${String(value).split(SHELL_SINGLE_QUOTE)
    .join(SHELL_ESCAPED_SINGLE_QUOTE)}${SHELL_SINGLE_QUOTE}`;
}
const PLACEMENT_WORD_SEPARATOR = ' ';
// Keepalive for a long run: a dead connection is noticed within a minute.
const SSH_RUN_OPTIONS = Object.freeze([
  SSH_OPTION, 'ConnectTimeout=5',
  SSH_OPTION, 'ServerAliveInterval=15',
  SSH_OPTION, 'ServerAliveCountMax=4',
]);
const PLACEMENT_SHELL = 'sh';
const PLACEMENT_SHELL_STDIN = Object.freeze(['-s', '--']);
const PLACEMENT_SHELL_COMMAND = '-c';

// The command that runs a POSIX script on a machine: over ssh for a lab
// machine, here for none (the controller, and the witnesses).
function remoteCommand(machine, script, args, {fromStdin = false} = {}) {
  const quoted = args.map(shellQuote).join(' ');
  if (!machine.sshTarget) {
    return fromStdin ? [PLACEMENT_SHELL, [...PLACEMENT_SHELL_STDIN, ...args]] :
      [PLACEMENT_SHELL, [PLACEMENT_SHELL_COMMAND, script, PLACEMENT_SHELL, ...args]];
  }
  if (String(machine.sshTarget).startsWith(SSH_OPTION_PREFIX)) {
    throw new Error(`${ERROR_TEXT_CAPABILITY.BAD_TARGET}${machine.sshTarget}`);
  }
  const command = fromStdin ? `sh -s -- ${quoted}` :
    `sh -c ${shellQuote(script)} sh ${quoted}`;
  return [SSH, [SSH_OPTION, SSH_BATCH_MODE, ...SSH_RUN_OPTIONS, machine.sshTarget, command]];
}

// The same command as one line for a local shell.
function commandLine([command, args]) {
  return [command, ...args].map(shellQuote).join(PLACEMENT_WORD_SEPARATOR);
}

export {SSH, SSH_OPTION, SSH_BATCH_MODE, SSH_BOUNDED_OPTIONS, SSH_OPTION_PREFIX,
  ERROR_TEXT_CAPABILITY, shellQuote, PLACEMENT_SHELL, PLACEMENT_SHELL_COMMAND, remoteCommand,
  commandLine};
