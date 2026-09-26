// The application side of a public-seam acceptance test.
//
// This process IS the consumer: it imports only the public package entry
// (src/public-api.js) and Node built-ins, starts one embedded runtime with
// createEmbeddedLagrange({configuration}).start(), and drives
// openApplicationDatabase / db.query / db.transaction on behalf of the parent
// test over the fork IPC channel. A structural test pins that this file
// imports nothing else under src/, so everything asserted through it is what
// a real application can reach.
//
// Every value the consumer receives (results, rows, thrown errors and their
// cause chains) is returned to the parent as an exposure snapshot: every own
// property, enumerable or not, with bytes carried as base64. The parent
// decodes values for equality and walks the snapshot for leaks, so nothing
// the application could see is lost in transit.

import {createEmbeddedLagrange} from '../../../src/public-api.js';
import {
  EMBEDDED_HOLD_DECISION as HOLD_DECISION,
  EMBEDDED_STEP_OUTCOME as STEP_OUTCOME,
  EMBEDDED_WORKER_EVENT as WORKER_EVENT,
  EMBEDDED_WORKER_OP as WORKER_OP,
  decodeParams,
  expose,
} from './embedded-node-protocol.js';

const UNKNOWN_OP_MESSAGE = 'unknown embedded worker op: ';
const UNKNOWN_SESSION_MESSAGE = 'unknown embedded worker session: ';
const RUNTIME_NOT_STARTED_MESSAGE = 'embedded worker runtime not started';
const UNKNOWN_HOLD_MESSAGE = 'unknown held transaction: ';
const HOLD_ROLLBACK_MESSAGE = 'held transaction rolled back by the test';

let runtime = null;
const sessions = new Map();
let nextSessionKey = 1;
const holds = new Map();
let nextHoldKey = 1;

function requireSession(sessionKey) {
  const db = sessions.get(sessionKey);
  if (!db) throw new Error(`${UNKNOWN_SESSION_MESSAGE}${sessionKey}`);
  return db;
}

async function settle(run) {
  try {
    return {outcome: STEP_OUTCOME.FULFILLED, value: expose(await run())};
  } catch (error) {
    return {outcome: STEP_OUTCOME.REJECTED, value: expose(error)};
  }
}

async function runTransaction(db, steps) {
  const stepOutcomes = [];
  const transactionOutcome = await settle(() => db.transaction(async (tx) => {
    for (const step of steps) {
      const statement = settle(() => tx.query(step.sql, decodeParams(step.params)));
      const recorded = await statement;
      stepOutcomes.push(recorded);
      if (recorded.outcome === STEP_OUTCOME.REJECTED && !step.swallow) {
        throw new Error(`transaction step failed: ${step.sql}`);
      }
    }
    return steps.length;
  }));
  return {steps: stepOutcomes, transaction: transactionOutcome};
}

async function runSteps(tx, steps) {
  const outcomes = [];
  for (const step of steps) {
    outcomes.push(await settle(() => tx.query(step.sql, decodeParams(step.params))));
  }
  return outcomes;
}

// A transaction left ACTIVE: its steps run, then its callback waits for the
// test's decision. The reply carries the step outcomes; the transaction's own
// outcome is answered by RELEASE_TRANSACTION.
function holdTransaction(db, steps) {
  const holdKey = nextHoldKey++;
  let decide;
  const decision = new Promise((resolve) => {
    decide = resolve;
  });
  let stepsDone;
  const staged = new Promise((resolve) => {
    stepsDone = resolve;
  });
  const transaction = settle(() => db.transaction(async (tx) => {
    stepsDone(await runSteps(tx, steps));
    if (await decision === HOLD_DECISION.ROLLBACK) {
      throw new Error(HOLD_ROLLBACK_MESSAGE);
    }
    return steps.length;
  }));
  // A transaction that ends before its steps report still answers the hold.
  transaction.then(() => stepsDone(null));
  holds.set(holdKey, {decide, transaction});
  return staged.then((stepOutcomes) => ({holdKey, steps: stepOutcomes}));
}

async function releaseTransaction(holdKey, decision) {
  const hold = holds.get(holdKey);
  if (!hold) throw new Error(`${UNKNOWN_HOLD_MESSAGE}${holdKey}`);
  holds.delete(holdKey);
  hold.decide(decision);
  return {transaction: await hold.transaction};
}

function requireRuntime() {
  if (!runtime) throw new Error(RUNTIME_NOT_STARTED_MESSAGE);
  return runtime;
}

const handlers = {
  async [WORKER_OP.START](message) {
    runtime = createEmbeddedLagrange({configuration: message.configuration});
    await runtime.start();
    return {started: true};
  },
  async [WORKER_OP.OPEN_SESSION](message) {
    const db = requireRuntime().openApplicationDatabase(message.options);
    const sessionKey = nextSessionKey++;
    sessions.set(sessionKey, db);
    return {sessionKey};
  },
  async [WORKER_OP.QUERY](message) {
    const db = requireSession(message.sessionKey);
    const extra = Array.isArray(message.extraArgs) ? message.extraArgs : [];
    return settle(() =>
      db.query(message.sql, decodeParams(message.params), ...extra));
  },
  async [WORKER_OP.TRANSACTION](message) {
    return runTransaction(requireSession(message.sessionKey), message.steps);
  },
  async [WORKER_OP.HOLD_TRANSACTION](message) {
    return holdTransaction(requireSession(message.sessionKey), message.steps);
  },
  async [WORKER_OP.RELEASE_TRANSACTION](message) {
    return releaseTransaction(message.holdKey, message.decision);
  },
  async [WORKER_OP.STOP]() {
    if (runtime) await runtime.stop();
    return {stopped: true};
  },
};

process.on('message', async (message) => {
  const handler = handlers[message?.op];
  let reply;
  try {
    if (!handler) throw new Error(`${UNKNOWN_OP_MESSAGE}${message?.op}`);
    reply = {event: WORKER_EVENT.REPLY, id: message.id, ok: true,
      value: await handler(message)};
  } catch (error) {
    reply = {event: WORKER_EVENT.REPLY, id: message.id, ok: false,
      error: expose(error)};
  }
  if (process.connected) process.send(reply);
});

process.on('disconnect', () => {
  // The parent owns this process's lifetime; losing it means the test is over.
  process.exit(0);
});
