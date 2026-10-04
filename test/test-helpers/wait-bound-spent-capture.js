/**
 * A site logger that records every line, for the wait_bound_spent witness
 * tests: `errors()` are the ERROR lines, `spent()` the ERROR lines whose
 * context is a wait_bound_spent event.
 */

import {WAIT_BOUND_SPENT_EVENT as SPENT_EVENT} from
  '../../src/logging/wait-bound-spent.js';

const ERROR_LEVEL = 'error';

function captureLogger() {
  const lines = [];
  const record = (level) => (message, context) => {
    lines.push({level, message, context});
  };
  const errors = () => lines.filter((line) => line.level === ERROR_LEVEL);
  return {
    lines,
    errors,
    warns: () => lines.filter((line) => line.level === 'warn'),
    spent: () => errors().filter(
      (line) => line.context?.event === SPENT_EVENT),
    logger: {
      error: record(ERROR_LEVEL),
      warn: record('warn'),
      info: record('info'),
      debug: record('debug'),
    },
  };
}

export {captureLogger};
