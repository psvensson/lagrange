// Counting what escapes a containment boundary.
//
// A containment witness asserts that a throw stays inside the port: no port
// call rethrows into its caller, and nothing escapes to the process as an
// uncaught exception or unhandled rejection. These are the two measuring
// halves of that claim, shared by every witness that makes it.

import process from 'node:process';

const ESCAPE_EVENTS = Object.freeze(['uncaughtException',
  'unhandledRejection']);

/**
 * What one synchronous call answered: its value, or that it threw.
 * @param {Function} call - The call to measure.
 * @return {{threw: (string|null), value: *}} The answer.
 */
export function answerOf(call) {
  try {
    return {threw: null, value: call()};
  } catch (error) {
    return {threw: String(error?.message || error), value: null};
  }
}

/**
 * Every exception and rejection that escapes to the process while counted.
 * The counter is the process's only listener meanwhile, so an escape is
 * counted (and asserted on) rather than ending the test where it happened.
 * @return {{escaped: string[], stop: Function}} The count and its stop.
 */
export function countEscapes() {
  const escaped = [];
  const onEscape = (error) => escaped.push(String(error?.message || error));
  const displaced = ESCAPE_EVENTS.map((event) => {
    const listeners = process.listeners(event);
    process.removeAllListeners(event);
    process.on(event, onEscape);
    return [event, listeners];
  });
  return {
    escaped,
    stop: () => {
      for (const [event, listeners] of displaced) {
        process.off(event, onEscape);
        for (const listener of listeners) {
          process.on(event, listener);
        }
      }
    },
  };
}
