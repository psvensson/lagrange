/**
 * Constants for the test port allocator.
 */

/**
 * Start of the ephemeral port range.
 * Using IANA-defined ephemeral port range to avoid conflicts.
 */
export const PORT_RANGE_START = 49152;

/**
 * End of the ephemeral port range.
 * Leaving some buffer before 65535.
 */
export const PORT_RANGE_END = 65000;

/**
 * Number of ports allocated per test file.
 * Each test file gets its own range of this many ports.
 */
export const PORTS_PER_TEST_FILE = 100;

/**
 * Default test file identifier when none is provided.
 */
export const DEFAULT_TEST_FILE_ID = 'default';

/**
 * Localhost address for binding test servers.
 */
export const TEST_HOST = '127.0.0.1';

/**
 * How many candidate ports (or port blocks) one bind probe tries.
 */
export const PORT_PROBE_BATCH = 16;

/**
 * The bind probe a reservation runs (synchronously, in a child process)
 * before it hands a port out: every port of a candidate group must accept a
 * listener on the wildcard address (what a runtime listener without a host
 * binds) AND on TEST_HOST, and is closed again. A port held by anything
 * outside the allocator's state file (on WSL2: a port the Windows side holds
 * inside its dynamic range) fails the probe and is skipped. Prints the index
 * of the first fully bindable group, or -1. argv: groups (JSON), host.
 */
export const PORT_PROBE_SCRIPT = `
const net = require('node:net');
const groups = JSON.parse(process.argv[1]);
const host = process.argv[2];
const bindable = (options) => new Promise((resolve) => {
  const server = net.createServer();
  server.once('error', () => resolve(false));
  server.listen({...options, exclusive: true},
    () => server.close(() => resolve(true)));
});
(async () => {
  for (let index = 0; index < groups.length; index += 1) {
    let ok = true;
    for (const port of groups[index]) {
      if (!(await bindable({port})) || !(await bindable({host, port}))) {
        ok = false;
        break;
      }
    }
    if (ok) {
      process.stdout.write(String(index));
      return;
    }
  }
  process.stdout.write('-1');
})();
`;
