// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { EventEmitter } from 'node:events';

// queueMicrotask is a global in Node.js, but ESLint doesn't know about it
const queueMicrotaskFn = globalThis.queueMicrotask;

// Minimal in-process WebSocket pair for tests.
// Each socket is an EventEmitter with ws-like `send()`/`close()` APIs.
export function createInProcWebSocketPair() {
  if (stryMutAct_9fa48("151933")) {
    {}
  } else {
    stryCov_9fa48("151933");
    const clientSocket = new EventEmitter();
    const serverSocket = new EventEmitter();
    const OPEN = 1;
    const CLOSED = 3;
    clientSocket.readyState = OPEN;
    serverSocket.readyState = OPEN;
    const deliver = (target, event, ...args) => {
      if (stryMutAct_9fa48("151934")) {
        {}
      } else {
        stryCov_9fa48("151934");
        queueMicrotaskFn(stryMutAct_9fa48("151935") ? () => undefined : (stryCov_9fa48("151935"), () => target.emit(event, ...args)));
      }
    };
    const closeBoth = (code = 1000, reason = stryMutAct_9fa48("151936") ? "Stryker was here!" : (stryCov_9fa48("151936"), '')) => {
      if (stryMutAct_9fa48("151937")) {
        {}
      } else {
        stryCov_9fa48("151937");
        if (stryMutAct_9fa48("151940") ? clientSocket.readyState === CLOSED || serverSocket.readyState === CLOSED : stryMutAct_9fa48("151939") ? false : stryMutAct_9fa48("151938") ? true : (stryCov_9fa48("151938", "151939", "151940"), (stryMutAct_9fa48("151942") ? clientSocket.readyState !== CLOSED : stryMutAct_9fa48("151941") ? true : (stryCov_9fa48("151941", "151942"), clientSocket.readyState === CLOSED)) && (stryMutAct_9fa48("151944") ? serverSocket.readyState !== CLOSED : stryMutAct_9fa48("151943") ? true : (stryCov_9fa48("151943", "151944"), serverSocket.readyState === CLOSED)))) return;
        clientSocket.readyState = CLOSED;
        serverSocket.readyState = CLOSED;
        deliver(clientSocket, stryMutAct_9fa48("151945") ? "" : (stryCov_9fa48("151945"), 'close'), code, reason);
        deliver(serverSocket, stryMutAct_9fa48("151946") ? "" : (stryCov_9fa48("151946"), 'close'), code, reason);
      }
    };
    clientSocket.send = data => {
      if (stryMutAct_9fa48("151947")) {
        {}
      } else {
        stryCov_9fa48("151947");
        if (stryMutAct_9fa48("151950") ? clientSocket.readyState === OPEN : stryMutAct_9fa48("151949") ? false : stryMutAct_9fa48("151948") ? true : (stryCov_9fa48("151948", "151949", "151950"), clientSocket.readyState !== OPEN)) throw new Error(stryMutAct_9fa48("151951") ? "" : (stryCov_9fa48("151951"), 'Socket is not open'));
        deliver(serverSocket, stryMutAct_9fa48("151952") ? "" : (stryCov_9fa48("151952"), 'message'), data);
      }
    };
    serverSocket.send = data => {
      if (stryMutAct_9fa48("151953")) {
        {}
      } else {
        stryCov_9fa48("151953");
        if (stryMutAct_9fa48("151956") ? serverSocket.readyState === OPEN : stryMutAct_9fa48("151955") ? false : stryMutAct_9fa48("151954") ? true : (stryCov_9fa48("151954", "151955", "151956"), serverSocket.readyState !== OPEN)) throw new Error(stryMutAct_9fa48("151957") ? "" : (stryCov_9fa48("151957"), 'Socket is not open'));
        deliver(clientSocket, stryMutAct_9fa48("151958") ? "" : (stryCov_9fa48("151958"), 'message'), data);
      }
    };
    clientSocket.close = closeBoth;
    serverSocket.close = closeBoth;
    // ws compatibility shims
    clientSocket.terminate = closeBoth;
    serverSocket.terminate = closeBoth;
    return stryMutAct_9fa48("151959") ? {} : (stryCov_9fa48("151959"), {
      clientSocket,
      serverSocket
    });
  }
}