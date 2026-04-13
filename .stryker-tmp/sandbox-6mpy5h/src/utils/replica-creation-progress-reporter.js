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
import { NUM } from '../constants/index.js';
const REPLICA_CREATION_PROGRESS_DEFAULT = Object.freeze(stryMutAct_9fa48("160302") ? {} : (stryCov_9fa48("160302"), {
  TICK_MS: 120,
  SPINNER_FRAMES: Object.freeze(stryMutAct_9fa48("160303") ? [] : (stryCov_9fa48("160303"), [stryMutAct_9fa48("160304") ? "" : (stryCov_9fa48("160304"), '|'), stryMutAct_9fa48("160305") ? "" : (stryCov_9fa48("160305"), '/'), stryMutAct_9fa48("160306") ? "" : (stryCov_9fa48("160306"), '-'), stryMutAct_9fa48("160307") ? "" : (stryCov_9fa48("160307"), '\\')]))
}));
const REPLICA_CREATION_PROGRESS_STATUS = Object.freeze(stryMutAct_9fa48("160308") ? {} : (stryCov_9fa48("160308"), {
  OK: stryMutAct_9fa48("160309") ? "" : (stryCov_9fa48("160309"), 'ok'),
  FAIL: stryMutAct_9fa48("160310") ? "" : (stryCov_9fa48("160310"), 'fail')
}));

/**
 * ReplicaCreationProgressReporter renders a single-line spinner when running in
 * an interactive terminal, and falls back to structured logger output in
 * non-interactive environments.
 */
class ReplicaCreationProgressReporter {
  /**
   * @param {Object} options - Reporter options.
   * @param {Object} [options.logger=console] - Logger with info() method.
   * @param {Object} [options.stdout=process.stdout] - Writable stdout target.
   * @param {number} [options.tickMs] - Spinner tick interval in ms.
   * @param {Array<string>} [options.spinnerFrames] - Spinner frame sequence.
   * @param {boolean} [options.enableSpinner=true] - Enable interactive spinner rendering.
   * @param {Function} options.formatLine - Function to format line text.
   * @param {Function} [options.buildContext] - Function to build structured context.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("160311")) {
      {}
    } else {
      stryCov_9fa48("160311");
      this.logger = stryMutAct_9fa48("160314") ? options.logger && console : stryMutAct_9fa48("160313") ? false : stryMutAct_9fa48("160312") ? true : (stryCov_9fa48("160312", "160313", "160314"), options.logger || console);
      this.stdout = stryMutAct_9fa48("160317") ? options.stdout && process.stdout : stryMutAct_9fa48("160316") ? false : stryMutAct_9fa48("160315") ? true : (stryCov_9fa48("160315", "160316", "160317"), options.stdout || process.stdout);
      this.tickMs = Number.isFinite(options.tickMs) ? options.tickMs : REPLICA_CREATION_PROGRESS_DEFAULT.TICK_MS;
      this.spinnerFrames = (stryMutAct_9fa48("160320") ? Array.isArray(options.spinnerFrames) || options.spinnerFrames.length > NUM.ZERO : stryMutAct_9fa48("160319") ? false : stryMutAct_9fa48("160318") ? true : (stryCov_9fa48("160318", "160319", "160320"), Array.isArray(options.spinnerFrames) && (stryMutAct_9fa48("160323") ? options.spinnerFrames.length <= NUM.ZERO : stryMutAct_9fa48("160322") ? options.spinnerFrames.length >= NUM.ZERO : stryMutAct_9fa48("160321") ? true : (stryCov_9fa48("160321", "160322", "160323"), options.spinnerFrames.length > NUM.ZERO)))) ? options.spinnerFrames : REPLICA_CREATION_PROGRESS_DEFAULT.SPINNER_FRAMES;
      this.enableSpinner = stryMutAct_9fa48("160326") ? options.enableSpinner === false : stryMutAct_9fa48("160325") ? false : stryMutAct_9fa48("160324") ? true : (stryCov_9fa48("160324", "160325", "160326"), options.enableSpinner !== (stryMutAct_9fa48("160327") ? true : (stryCov_9fa48("160327"), false)));
      this.formatLine = options.formatLine;
      this.buildContext = stryMutAct_9fa48("160330") ? options.buildContext && (() => null) : stryMutAct_9fa48("160329") ? false : stryMutAct_9fa48("160328") ? true : (stryCov_9fa48("160328", "160329", "160330"), options.buildContext || (stryMutAct_9fa48("160331") ? () => undefined : (stryCov_9fa48("160331"), () => null)));
      this.activeSpinner = stryMutAct_9fa48("160332") ? true : (stryCov_9fa48("160332"), false);
    }
  }

  /**
   * Start progress tracking.
   * @param {Object} details - Initial progress details.
   * @return {Object} Mutable progress context.
   */
  start(details) {
    if (stryMutAct_9fa48("160333")) {
      {}
    } else {
      stryCov_9fa48("160333");
      const progress = stryMutAct_9fa48("160334") ? {} : (stryCov_9fa48("160334"), {
        ...details,
        spinnerIndex: NUM.ZERO,
        spinnerFrame: this.spinnerFrames[NUM.ZERO],
        timer: null,
        spinnerEnabled: this.shouldRenderSpinner(),
        previousLineLength: NUM.ZERO
      });
      if (stryMutAct_9fa48("160336") ? false : stryMutAct_9fa48("160335") ? true : (stryCov_9fa48("160335", "160336"), progress.spinnerEnabled)) {
        if (stryMutAct_9fa48("160337")) {
          {}
        } else {
          stryCov_9fa48("160337");
          this.activeSpinner = stryMutAct_9fa48("160338") ? false : (stryCov_9fa48("160338"), true);
          this.render(progress, null, null, stryMutAct_9fa48("160339") ? true : (stryCov_9fa48("160339"), false));
          progress.timer = setInterval(() => {
            if (stryMutAct_9fa48("160340")) {
              {}
            } else {
              stryCov_9fa48("160340");
              progress.spinnerIndex = stryMutAct_9fa48("160341") ? (progress.spinnerIndex + NUM.ONE) * this.spinnerFrames.length : (stryCov_9fa48("160341"), (stryMutAct_9fa48("160342") ? progress.spinnerIndex - NUM.ONE : (stryCov_9fa48("160342"), progress.spinnerIndex + NUM.ONE)) % this.spinnerFrames.length);
              progress.spinnerFrame = this.spinnerFrames[progress.spinnerIndex];
              this.render(progress, null, null, stryMutAct_9fa48("160343") ? true : (stryCov_9fa48("160343"), false));
            }
          }, this.tickMs);
          return progress;
        }
      }
      this.log(progress, null, null);
      return progress;
    }
  }

  /**
   * Update progress details.
   * @param {Object|null} progress - Progress context from start().
   * @param {Object} updates - Updated fields.
   */
  update(progress, updates = {}) {
    if (stryMutAct_9fa48("160344")) {
      {}
    } else {
      stryCov_9fa48("160344");
      if (stryMutAct_9fa48("160347") ? false : stryMutAct_9fa48("160346") ? true : stryMutAct_9fa48("160345") ? progress : (stryCov_9fa48("160345", "160346", "160347"), !progress)) {
        if (stryMutAct_9fa48("160348")) {
          {}
        } else {
          stryCov_9fa48("160348");
          return;
        }
      }
      Object.assign(progress, updates);
      if (stryMutAct_9fa48("160350") ? false : stryMutAct_9fa48("160349") ? true : (stryCov_9fa48("160349", "160350"), progress.spinnerEnabled)) {
        if (stryMutAct_9fa48("160351")) {
          {}
        } else {
          stryCov_9fa48("160351");
          this.render(progress, null, null, stryMutAct_9fa48("160352") ? true : (stryCov_9fa48("160352"), false));
        }
      }
    }
  }

  /**
   * Mark progress as completed.
   * @param {Object|null} progress - Progress context from start().
   * @param {Object} [updates] - Updated fields applied before final render.
   */
  finish(progress, updates = {}) {
    if (stryMutAct_9fa48("160353")) {
      {}
    } else {
      stryCov_9fa48("160353");
      this.stop(progress, REPLICA_CREATION_PROGRESS_STATUS.OK, null, updates);
    }
  }

  /**
   * Mark progress as failed.
   * @param {Object|null} progress - Progress context from start().
   * @param {Error|string|null} error - Error value.
   * @param {Object} [updates] - Updated fields applied before final render.
   */
  fail(progress, error, updates = {}) {
    if (stryMutAct_9fa48("160354")) {
      {}
    } else {
      stryCov_9fa48("160354");
      this.stop(progress, REPLICA_CREATION_PROGRESS_STATUS.FAIL, error, updates);
    }
  }

  /**
   * Stop progress tracking and flush final output.
   * @param {Object|null} progress - Progress context from start().
   * @param {string} status - Final status string.
   * @param {Error|string|null} error - Optional error.
   * @param {Object} [updates] - Updated fields applied before final render.
   */
  stop(progress, status, error, updates = {}) {
    if (stryMutAct_9fa48("160355")) {
      {}
    } else {
      stryCov_9fa48("160355");
      if (stryMutAct_9fa48("160358") ? false : stryMutAct_9fa48("160357") ? true : stryMutAct_9fa48("160356") ? progress : (stryCov_9fa48("160356", "160357", "160358"), !progress)) {
        if (stryMutAct_9fa48("160359")) {
          {}
        } else {
          stryCov_9fa48("160359");
          return;
        }
      }
      Object.assign(progress, updates);
      if (stryMutAct_9fa48("160361") ? false : stryMutAct_9fa48("160360") ? true : (stryCov_9fa48("160360", "160361"), progress.timer)) {
        if (stryMutAct_9fa48("160362")) {
          {}
        } else {
          stryCov_9fa48("160362");
          clearInterval(progress.timer);
          progress.timer = null;
        }
      }
      if (stryMutAct_9fa48("160364") ? false : stryMutAct_9fa48("160363") ? true : (stryCov_9fa48("160363", "160364"), progress.spinnerEnabled)) {
        if (stryMutAct_9fa48("160365")) {
          {}
        } else {
          stryCov_9fa48("160365");
          this.render(progress, status, error, stryMutAct_9fa48("160366") ? false : (stryCov_9fa48("160366"), true));
          this.activeSpinner = stryMutAct_9fa48("160367") ? true : (stryCov_9fa48("160367"), false);
          return;
        }
      }
      this.log(progress, status, error);
    }
  }

  /**
   * @return {boolean} True when spinner rendering is supported and idle.
   * @private
   */
  shouldRenderSpinner() {
    if (stryMutAct_9fa48("160368")) {
      {}
    } else {
      stryCov_9fa48("160368");
      return Boolean(stryMutAct_9fa48("160371") ? this.enableSpinner && this.stdout && this.stdout.isTTY || !this.activeSpinner : stryMutAct_9fa48("160370") ? false : stryMutAct_9fa48("160369") ? true : (stryCov_9fa48("160369", "160370", "160371"), (stryMutAct_9fa48("160373") ? this.enableSpinner && this.stdout || this.stdout.isTTY : stryMutAct_9fa48("160372") ? true : (stryCov_9fa48("160372", "160373"), (stryMutAct_9fa48("160375") ? this.enableSpinner || this.stdout : stryMutAct_9fa48("160374") ? true : (stryCov_9fa48("160374", "160375"), this.enableSpinner && this.stdout)) && this.stdout.isTTY)) && (stryMutAct_9fa48("160376") ? this.activeSpinner : (stryCov_9fa48("160376"), !this.activeSpinner))));
    }
  }

  /**
   * Render line in-place.
   * @param {Object} progress - Progress context.
   * @param {string|null} status - Optional terminal status.
   * @param {Error|string|null} error - Optional error.
   * @param {boolean} finalize - Add trailing newline when true.
   * @private
   */
  render(progress, status, error, finalize) {
    if (stryMutAct_9fa48("160377")) {
      {}
    } else {
      stryCov_9fa48("160377");
      const line = this.formatLine(progress, status, error);
      const padded = line.padEnd(progress.previousLineLength, stryMutAct_9fa48("160378") ? "" : (stryCov_9fa48("160378"), ' '));
      progress.previousLineLength = padded.length;
      this.stdout.write(stryMutAct_9fa48("160379") ? `` : (stryCov_9fa48("160379"), `\r${padded}`));
      if (stryMutAct_9fa48("160381") ? false : stryMutAct_9fa48("160380") ? true : (stryCov_9fa48("160380", "160381"), finalize)) {
        if (stryMutAct_9fa48("160382")) {
          {}
        } else {
          stryCov_9fa48("160382");
          this.stdout.write(stryMutAct_9fa48("160383") ? "" : (stryCov_9fa48("160383"), '\n'));
        }
      }
    }
  }

  /**
   * Emit line via logger.info with optional structured context.
   * @param {Object} progress - Progress context.
   * @param {string|null} status - Optional terminal status.
   * @param {Error|string|null} error - Optional error.
   * @private
   */
  log(progress, status, error) {
    if (stryMutAct_9fa48("160384")) {
      {}
    } else {
      stryCov_9fa48("160384");
      const line = this.formatLine(progress, status, error);
      const context = this.buildContext(progress, status, error);
      if (stryMutAct_9fa48("160387") ? context || Object.keys(context).length > NUM.ZERO : stryMutAct_9fa48("160386") ? false : stryMutAct_9fa48("160385") ? true : (stryCov_9fa48("160385", "160386", "160387"), context && (stryMutAct_9fa48("160390") ? Object.keys(context).length <= NUM.ZERO : stryMutAct_9fa48("160389") ? Object.keys(context).length >= NUM.ZERO : stryMutAct_9fa48("160388") ? true : (stryCov_9fa48("160388", "160389", "160390"), Object.keys(context).length > NUM.ZERO)))) {
        if (stryMutAct_9fa48("160391")) {
          {}
        } else {
          stryCov_9fa48("160391");
          this.logger.info(line, context);
          return;
        }
      }
      this.logger.info(line);
    }
  }
}
export { ReplicaCreationProgressReporter, REPLICA_CREATION_PROGRESS_DEFAULT, REPLICA_CREATION_PROGRESS_STATUS };