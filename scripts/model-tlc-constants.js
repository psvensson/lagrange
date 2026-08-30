// Canonical constants owner for the TLC model-report writer
// (scripts/model-tlc.js) and its output-tail owner
// (scripts/model-tlc-output-tail.js).

// TLC's no-error verdict sentinel: the convergence classifier keys on it, and
// it is the whole `outputTail` of a converged run.
export const TLC_NO_ERROR_VERDICT = 'No error has been found';

// Bounded line budget for the stable `outputTail` of a non-converged run (the
// end of the counterexample plus TLC's state-count summary).
export const TLC_OUTPUT_TAIL_LINE_LIMIT = 12;
