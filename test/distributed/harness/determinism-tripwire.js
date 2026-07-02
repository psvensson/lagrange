// DT determinism tripwire.
//
// During a virtual-clock drive, any raw Date.now()/Math.random() reached
// from src/ silently runs on the wall clock / real entropy — the
// wall-clock-leak class in the DT limits table
// (docs/deterministic-directed-testing-plan.md). A static lint can't police
// this: the sanctioned seam idiom is a `now = Date.now()` fallback-default
// (byte-identical in production), and the regression class is dominated by
// unseamed DEPENDENCIES of hosted modules, not the seamed files themselves.
// This runtime instrument catches exactly the exercised-path leaks instead:
// install it around a drive, and every Date.now/Math.random invocation whose
// stack crosses src/ is recorded (report mode) or thrown (fail mode).
//
// Usage in a DT test:
//   const tripwire = installDeterminismTripwire();       // report mode
//   ... drive the virtual network ...
//   tripwire.uninstall();
//   console.log(tripwire.violations());  // dedup'd by offending src frame
//
// Expect findings on today's substrate: only ~15 of ~330 Date.now()-using
// src files are seamed. Report mode exists precisely to make that visible
// per exercised path; fail mode ({mode: 'fail'}) is for locking an
// already-clean path against regression.

const SRC_FRAME_PATTERN = /(?:^|[/(])(src\/[^)\s]*:\d+)/;

function firstSrcFrame(stack) {
  for (const line of String(stack).split('\n').slice(1)) {
    // Dependencies ship their own src/ trees (tap's bundled
    // src/test-base.ts, for one) — only the repo's src/ is policed.
    if (line.includes('node_modules')) {
      continue;
    }
    const match = line.match(SRC_FRAME_PATTERN);
    if (match) {
      return match[1];
    }
  }
  return null;
}

/**
 * Instrument global Date.now and Math.random for src/-reached invocations.
 * @param {object} [options]
 * @param {string} [options.mode='report'] - 'report' collects, 'fail' throws
 *   on the first src/-reached call.
 * @return {{uninstall: Function, violations: Function, assertClean: Function}}
 */
export function installDeterminismTripwire({mode = 'report'} = {}) {
  const realDateNow = Date.now;
  const realMathRandom = Math.random;
  // Dedup'd by (api, first offending src frame) with a hit count — a hot
  // loop must not accumulate unbounded records.
  const violationsByKey = new Map();
  let installed = true;

  const record = (api) => {
    // Error.stack via the REAL machinery; the wrapper frames are skipped by
    // firstSrcFrame walking until a src/ path.
    const frame = firstSrcFrame(new Error().stack);
    if (!frame) {
      return;
    }
    const key = `${api} @ ${frame}`;
    const existing = violationsByKey.get(key);
    if (existing) {
      existing.count += 1;
      return;
    }
    violationsByKey.set(key, {api, frame, count: 1});
    if (mode === 'fail') {
      uninstall();
      throw new Error(
        `determinism tripwire: raw ${api} reached from ${frame} during a ` +
        'virtual-clock drive — thread the TimeSource/RandomSource seam ' +
        '(see the DT limits table, row f)',
      );
    }
  };

  Date.now = function tripwiredDateNow() {
    record('Date.now');
    return realDateNow();
  };
  Math.random = function tripwiredMathRandom() {
    record('Math.random');
    return realMathRandom();
  };

  function uninstall() {
    if (!installed) {
      return;
    }
    installed = false;
    Date.now = realDateNow;
    Math.random = realMathRandom;
  }

  function violations() {
    return [...violationsByKey.values()];
  }

  function assertClean() {
    const found = violations();
    if (found.length > 0) {
      const summary = found
        .map((violation) =>
          `${violation.api} x${violation.count} @ ${violation.frame}`)
        .join('; ');
      throw new Error(`determinism tripwire: ${summary}`);
    }
  }

  return {uninstall, violations, assertClean};
}
