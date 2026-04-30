import {EventEmitter} from 'node:events';

const LOCAL_STR_SOCKET_IS_NOT_OPEN = 'Socket is not open';
const LOCAL_STR_MESSAGE = 'message';

// queueMicrotask is a global in Node.js, but ESLint doesn't know about it
const queueMicrotaskFn = globalThis.queueMicrotask;

// Minimal in-process WebSocket pair for tests.
// Each socket is an EventEmitter with ws-like `send()`/`close()` APIs.
export function createInProcWebSocketPair() {
  const clientSocket = new EventEmitter();
  const serverSocket = new EventEmitter();

  const OPEN = 1;
  const CLOSED = 3;
  clientSocket.readyState = OPEN;
  serverSocket.readyState = OPEN;

  const deliver = (target, event, ...args) => {
    queueMicrotaskFn(() => target.emit(event, ...args));
  };

  const closeBoth = (code = 1000, reason = '') => {
    if (clientSocket.readyState === CLOSED && serverSocket.readyState === CLOSED) return;
    clientSocket.readyState = CLOSED;
    serverSocket.readyState = CLOSED;
    deliver(clientSocket, 'close', code, reason);
    deliver(serverSocket, 'close', code, reason);
  };

  clientSocket.send = (data) => {
    if (clientSocket.readyState !== OPEN) throw new Error(LOCAL_STR_SOCKET_IS_NOT_OPEN);
    deliver(serverSocket, LOCAL_STR_MESSAGE, data);
  };
  serverSocket.send = (data) => {
    if (serverSocket.readyState !== OPEN) throw new Error(LOCAL_STR_SOCKET_IS_NOT_OPEN);
    deliver(clientSocket, LOCAL_STR_MESSAGE, data);
  };

  clientSocket.close = closeBoth;
  serverSocket.close = closeBoth;
  // ws compatibility shims
  clientSocket.terminate = closeBoth;
  serverSocket.terminate = closeBoth;

  return {clientSocket, serverSocket};
}

