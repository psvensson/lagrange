
const LOCAL_STR_NEWLINE = '\n';

const REPLICA_CREATION_PROGRESS_DEFAULT = Object.freeze({
  TICK_MS: 120,
  SPINNER_FRAMES: Object.freeze(['|', '/', '-', '\\']),
});

const REPLICA_CREATION_PROGRESS_STATUS = Object.freeze({
  OK: 'ok',
  FAIL: 'fail',
});

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
    this.logger = options.logger || console;
    this.stdout = options.stdout || process.stdout;
    this.tickMs = Number.isFinite(options.tickMs) ?
      options.tickMs :
      REPLICA_CREATION_PROGRESS_DEFAULT.TICK_MS;
    this.spinnerFrames = Array.isArray(options.spinnerFrames) &&
      options.spinnerFrames.length > 0 ?
      options.spinnerFrames :
      REPLICA_CREATION_PROGRESS_DEFAULT.SPINNER_FRAMES;
    this.enableSpinner = options.enableSpinner !== false;
    this.formatLine = options.formatLine;
    this.buildContext = options.buildContext || (() => null);
    this.activeSpinner = false;
  }

  /**
   * Start progress tracking.
   * @param {Object} details - Initial progress details.
   * @return {Object} Mutable progress context.
   */
  start(details) {
    const progress = {
      ...details,
      spinnerIndex: 0,
      spinnerFrame: this.spinnerFrames[0],
      timer: null,
      spinnerEnabled: this.shouldRenderSpinner(),
      previousLineLength: 0,
    };

    if (progress.spinnerEnabled) {
      this.activeSpinner = true;
      this.render(progress, null, null, false);
      progress.timer = setInterval(() => {
        progress.spinnerIndex = (progress.spinnerIndex + 1) % this.spinnerFrames.length;
        progress.spinnerFrame = this.spinnerFrames[progress.spinnerIndex];
        this.render(progress, null, null, false);
      }, this.tickMs);
      return progress;
    }

    this.log(progress, null, null);
    return progress;
  }

  /**
   * Update progress details.
   * @param {Object|null} progress - Progress context from start().
   * @param {Object} updates - Updated fields.
   */
  update(progress, updates = {}) {
    if (!progress) {
      return;
    }
    Object.assign(progress, updates);
    if (progress.spinnerEnabled) {
      this.render(progress, null, null, false);
    }
  }

  /**
   * Mark progress as completed.
   * @param {Object|null} progress - Progress context from start().
   * @param {Object} [updates] - Updated fields applied before final render.
   */
  finish(progress, updates = {}) {
    this.stop(
      progress,
      REPLICA_CREATION_PROGRESS_STATUS.OK,
      null,
      updates,
    );
  }

  /**
   * Mark progress as failed.
   * @param {Object|null} progress - Progress context from start().
   * @param {Error|string|null} error - Error value.
   * @param {Object} [updates] - Updated fields applied before final render.
   */
  fail(progress, error, updates = {}) {
    this.stop(
      progress,
      REPLICA_CREATION_PROGRESS_STATUS.FAIL,
      error,
      updates,
    );
  }

  /**
   * Stop progress tracking and flush final output.
   * @param {Object|null} progress - Progress context from start().
   * @param {string} status - Final status string.
   * @param {Error|string|null} error - Optional error.
   * @param {Object} [updates] - Updated fields applied before final render.
   */
  stop(progress, status, error, updates = {}) {
    if (!progress) {
      return;
    }
    Object.assign(progress, updates);

    if (progress.timer) {
      clearInterval(progress.timer);
      progress.timer = null;
    }

    if (progress.spinnerEnabled) {
      this.render(progress, status, error, true);
      this.activeSpinner = false;
      return;
    }

    this.log(progress, status, error);
  }

  /**
   * @return {boolean} True when spinner rendering is supported and idle.
   * @private
   */
  shouldRenderSpinner() {
    return Boolean(
      this.enableSpinner &&
      this.stdout &&
      this.stdout.isTTY &&
      !this.activeSpinner,
    );
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
    const line = this.formatLine(progress, status, error);
    const padded = line.padEnd(progress.previousLineLength, ' ');
    progress.previousLineLength = padded.length;
    this.stdout.write(`\r${padded}`);
    if (finalize) {
      this.stdout.write(LOCAL_STR_NEWLINE);
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
    const line = this.formatLine(progress, status, error);
    const context = this.buildContext(progress, status, error);
    if (context && Object.keys(context).length > 0) {
      this.logger.info(line, context);
      return;
    }
    this.logger.info(line);
  }
}

export {
  ReplicaCreationProgressReporter,
  REPLICA_CREATION_PROGRESS_DEFAULT,
  REPLICA_CREATION_PROGRESS_STATUS,
};
