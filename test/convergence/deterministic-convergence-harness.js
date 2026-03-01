const CONVERGENCE_ARTIFACT_SCHEMA_VERSION = 1;

const CONVERGENCE_EVENT_KIND = Object.freeze({
  HEARTBEAT: 'heartbeat',
  CDC: 'cdc',
  STALE_READ: 'stale_read',
  CUSTOM: 'custom',
});

class DeterministicConvergenceHarness {
  constructor(options = {}) {
    this.nowMs = Number.isFinite(options.startAtMs) ?
      Math.floor(options.startAtMs) :
      0;
    this.maxSteps = Number.isInteger(options.maxSteps) && options.maxSteps > 0 ?
      options.maxSteps :
      1000;
    this._sequence = 0;
    this._queue = [];
    this._eventLog = [];
    this._invariantChecks = [];
    this._lastArtifact = null;
  }

  schedule(kind, delayMs, handler, metadata = {}) {
    if (typeof handler !== 'function') {
      throw new TypeError('DeterministicConvergenceHarness.schedule requires a handler');
    }
    const normalizedDelayMs = Number.isFinite(delayMs) ?
      Math.max(0, Math.floor(delayMs)) :
      0;
    const event = {
      id: `evt-${this._sequence + 1}`,
      kind: typeof kind === 'string' && kind.length > 0 ?
        kind :
        CONVERGENCE_EVENT_KIND.CUSTOM,
      dueAtMs: this.nowMs + normalizedDelayMs,
      sequence: this._sequence++,
      handler,
      metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata) ?
        {...metadata} :
        {},
    };
    this._queue.push(event);
    this._sortQueue();
    return event.id;
  }

  registerInvariant(invariantId, check, metadata = {}) {
    if (typeof check !== 'function') {
      throw new TypeError('DeterministicConvergenceHarness.registerInvariant requires a check');
    }
    const entry = {
      invariantId: String(invariantId || 'unknown'),
      check,
      metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata) ?
        {...metadata} :
        {},
    };
    this._invariantChecks.push(entry);
    return entry.invariantId;
  }

  getCurrentTime() {
    return this.nowMs;
  }

  getEventLog() {
    return this._eventLog.map((entry) => ({
      ...entry,
      metadata: {...entry.metadata},
    }));
  }

  getLastArtifact() {
    return this._lastArtifact ? structuredClone(this._lastArtifact) : null;
  }

  async runNext() {
    if (this._queue.length === 0) {
      return null;
    }
    const event = this._queue.shift();
    this.nowMs = event.dueAtMs;
    try {
      const result = await event.handler({
        nowMs: this.nowMs,
        eventId: event.id,
        kind: event.kind,
        metadata: {...event.metadata},
        schedule: (kind, delayMs, handler, metadata) =>
          this.schedule(kind, delayMs, handler, metadata),
      });
      const invariantResults = this._evaluateInvariants();
      this._eventLog.push({
        eventId: event.id,
        kind: event.kind,
        dueAtMs: event.dueAtMs,
        executedAtMs: this.nowMs,
        metadata: {...event.metadata},
        invariantResults,
        result: result === undefined ? null : result,
      });
      return event.id;
    } catch (error) {
      const artifact = this._buildFailureArtifact(event, error);
      this._lastArtifact = artifact;
      error.convergenceArtifact = artifact;
      throw error;
    }
  }

  async runUntilIdle() {
    let steps = 0;
    while (this._queue.length > 0) {
      steps += 1;
      if (steps > this.maxSteps) {
        const error = new Error(
          `DeterministicConvergenceHarness exceeded maxSteps=${this.maxSteps}`,
        );
        const syntheticEvent = {
          id: 'runUntilIdle:maxSteps',
          kind: 'scheduler',
          dueAtMs: this.nowMs,
          metadata: {
            pendingEventCount: this._queue.length,
          },
        };
        const artifact = this._buildFailureArtifact(syntheticEvent, error);
        this._lastArtifact = artifact;
        error.convergenceArtifact = artifact;
        throw error;
      }
      await this.runNext();
    }
    return {
      nowMs: this.nowMs,
      executedEvents: this._eventLog.length,
      invariantResults: this._evaluateInvariants(),
    };
  }

  _evaluateInvariants() {
    return this._invariantChecks.map((entry) => {
      const result = entry.check({
        nowMs: this.nowMs,
        eventLog: this.getEventLog(),
      });
      const passed = result === true ||
        (result && typeof result === 'object' && result.passed === true);
      const details = result && typeof result === 'object' && !Array.isArray(result) ?
        {...result} :
        {};
      delete details.passed;
      return {
        invariantId: entry.invariantId,
        passed,
        metadata: {...entry.metadata},
        details,
      };
    });
  }

  _sortQueue() {
    this._queue.sort((left, right) => {
      if (left.dueAtMs !== right.dueAtMs) {
        return left.dueAtMs - right.dueAtMs;
      }
      return left.sequence - right.sequence;
    });
  }

  _buildFailureArtifact(event, error) {
    return {
      schemaVersion: CONVERGENCE_ARTIFACT_SCHEMA_VERSION,
      failedAtMs: this.nowMs,
      failedEvent: {
        eventId: event.id,
        kind: event.kind,
        dueAtMs: event.dueAtMs,
        metadata: {...event.metadata},
      },
      error: {
        name: error?.name || 'Error',
        message: String(error?.message || error),
      },
      pendingEvents: this._queue.map((pendingEvent) => ({
        eventId: pendingEvent.id,
        kind: pendingEvent.kind,
        dueAtMs: pendingEvent.dueAtMs,
        metadata: {...pendingEvent.metadata},
      })),
      eventLog: this.getEventLog(),
      invariantResults: this._evaluateInvariants(),
    };
  }
}

export {
  CONVERGENCE_ARTIFACT_SCHEMA_VERSION,
  CONVERGENCE_EVENT_KIND,
  DeterministicConvergenceHarness,
};
