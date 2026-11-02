/**
 * Child process for the RUNNING-derivation cancellation witness. It waits
 * until the derivation worker is actually running (telemetry runs === 1),
 * then either releases the last holder (`release`) or supersedes the
 * holder's digest (`supersede`). It prints the outcome as one JSON line and
 * does NOT call shutdown, so a process that exits by itself proves the
 * running worker was terminated.
 */
import {
  DERIVATION_OUTCOME,
  WasiComponentDerivationOwner,
} from '../../src/runtime/wasi-component-derivation.js';
import {
  STARTUP_WITNESS_COMPONENT_BYTES,
  STARTUP_WITNESS_SECOND_COMPONENT_BYTES,
} from './wasi-component-startup-witness-fixture.js';

const HOLDER = 'running-holder';
const REQUEST_WORLD = 'request-cell';
const MODE_SUPERSEDE = 'supersede';
const POLL_INTERVAL_MS = 1;

function waitUntilRunning(owner) {
  return new Promise((resolve) => {
    const poll = () => {
      if (owner.telemetry().runs === 1) resolve();
      else setTimeout(poll, POLL_INTERVAL_MS);
    };
    poll();
  });
}

const owner = new WasiComponentDerivationOwner();
const first = owner.acquire(HOLDER, {
  bytes: STARTUP_WITNESS_COMPONENT_BYTES,
  world: REQUEST_WORLD,
});
await waitUntilRunning(owner);
const runningAtRelease = owner.telemetry().inFlight;
let successor = null;
if (process.argv[2] === MODE_SUPERSEDE) {
  successor = owner.acquire(HOLDER, {
    bytes: STARTUP_WITNESS_SECOND_COMPONENT_BYTES,
    world: REQUEST_WORLD,
  });
} else {
  owner.release(HOLDER);
}
const cancelled = await first;
const derivedSuccessor = successor === null ? null : await successor;
if (derivedSuccessor !== null) owner.release(HOLDER);
process.stdout.write(`${JSON.stringify({
  cancelledCode: cancelled.error?.code,
  outcome: cancelled.outcome,
  runningAtRelease,
  successorOutcome: derivedSuccessor?.outcome ?? null,
  successorDerived: derivedSuccessor?.outcome === DERIVATION_OUTCOME.DERIVED,
  telemetry: owner.telemetry(),
})}\n`);
