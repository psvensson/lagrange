// A loopback connect with a bound and a typed outcome. On a host that
// provides the loopback-refusal host requirement
// (test/shards/host-loopback-refusal.txt) a connect to a port nobody listens
// on is refused at once, and the bound never decides anything. On one that
// does not - a WSL2 host with mirrored networking drops such connects and
// they end ETIMEDOUT after about 130 s (measured 2026-11-11) - the bound ends
// the connect as CONNECT_UNANSWERED in seconds, so a test fails naming the
// host property instead of running into its own timeout.

// Refusal is the kernel's answer on loopback, not work a busy host does
// slowly: the bound is not a work budget and does not scale by machine factor.
export const LOOPBACK_CONNECT_BOUND_MS = 5000;
export const CONNECT_UNANSWERED = 'CONNECT_UNANSWERED';
export const LOOPBACK_SILENT_DROP_MESSAGE =
  'a connect to a loopback port nobody listens on went unanswered for ' +
  `${LOOPBACK_CONNECT_BOUND_MS} ms: this host does not provide the loopback-refusal host ` +
  'requirement (test/shards/host-loopback-refusal.txt), which this test requires';

/**
 * Arm the bound on a socket that is still connecting. If neither a connect,
 * an error nor a close settles it within the bound, `unanswered` is called
 * once. The decision waits one turn past the timer, so a connect or refusal
 * the kernel already delivered while the event loop was busy is read first.
 * A socket already connected (a reused keep-alive socket) is not armed.
 * @param {import('node:net').Socket} socket
 * @param {Function} unanswered
 */
export function boundLoopbackConnect(socket, unanswered) {
  if (!socket.connecting) return;
  let settled = false;
  const timer = setTimeout(() => setImmediate(() => {
    if (settled) return;
    settled = true;
    unanswered();
  }), LOOPBACK_CONNECT_BOUND_MS);
  const settle = () => {
    settled = true;
    clearTimeout(timer);
  };
  socket.once('connect', settle);
  socket.once('error', settle);
  socket.once('close', settle);
}

/**
 * The error a bounded request is destroyed with when its connect went
 * unanswered, typed by its code.
 * @return {Error}
 */
export function unansweredConnectError() {
  return Object.assign(new Error(LOOPBACK_SILENT_DROP_MESSAGE), {code: CONNECT_UNANSWERED});
}
