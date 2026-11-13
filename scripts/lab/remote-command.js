// Exact serialization of the lab's existing local and SSH command transports.
const SSH = 'ssh';
const SSH_OPTION = '-o';
const SSH_BATCH_MODE = 'BatchMode=yes';
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

function shellQuote(value) {
  return `${SHELL_SINGLE_QUOTE}${String(value).split(SHELL_SINGLE_QUOTE)
    .join(SHELL_ESCAPED_SINGLE_QUOTE)}${SHELL_SINGLE_QUOTE}`;
}

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

export {
  ERROR_TEXT_CAPABILITY, PLACEMENT_SHELL, PLACEMENT_SHELL_COMMAND,
  SSH, SSH_BATCH_MODE, SSH_BOUNDED_OPTIONS, SSH_OPTION, SSH_OPTION_PREFIX,
  commandLine, remoteCommand, shellQuote,
};
