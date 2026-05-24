export function createDistributedRunPhaseEventHelpers({
  SCENARIO_PHASE_LOG_PREFIX,
  SCENARIO_PHASE_EVENT_TYPE_START,
  SCENARIO_PHASE_EVENT_TYPE_END,
  SCENARIO_PHASE_EVENT_TYPE_PROGRESS,
  SCENARIO_PHASE_EVENT_TYPE_LAST_MEANINGFUL_CHANGE,
  SCENARIO_PHASE_EVENT_TYPE_NO_PROGRESS_WARNING,
  SCENARIO_PHASE_EVENT_TYPE_FAILED_NO_PROGRESS,
}) {
  function formatScenarioPhaseEventValue(value) {
    if (Array.isArray(value)) {
      return JSON.stringify(value);
    }
    if (value && typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  }

  function formatScenarioPhaseEventDetails(details) {
    if (!details || typeof details !== 'object' || Array.isArray(details)) {
      return '';
    }
    return Object.entries(details)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}=${formatScenarioPhaseEventValue(value)}`)
      .join(' ');
  }

  function formatScenarioPhaseEventLine(scenarioName, event) {
    if (!event || typeof event !== 'object') {
      return '';
    }
    const scenario = String(scenarioName || 'scenario');
    const phase = String(event.phase || 'unknown');
    const type = String(event.type || '');
    const message = typeof event.message === 'string' ? event.message : '';
    const detailSuffix = formatScenarioPhaseEventDetails(event.details);

    switch (type) {
    case SCENARIO_PHASE_EVENT_TYPE_START:
      return `${SCENARIO_PHASE_LOG_PREFIX}${scenario} ${phase} start`;
    case SCENARIO_PHASE_EVENT_TYPE_END:
      return `${SCENARIO_PHASE_LOG_PREFIX}${scenario} ${phase} end: ` +
        `status=${String(event.status || 'unknown')} ` +
        `durationMs=${Number(event.durationMs || 0)}`;
    case SCENARIO_PHASE_EVENT_TYPE_PROGRESS:
      return `${SCENARIO_PHASE_LOG_PREFIX}${scenario} ${phase} progress: ` +
        `${message}` +
        (detailSuffix ? ` ${detailSuffix}` : '');
    case SCENARIO_PHASE_EVENT_TYPE_LAST_MEANINGFUL_CHANGE:
      return `${SCENARIO_PHASE_LOG_PREFIX}${scenario} ${phase} change: ` +
        `${message}` +
        (detailSuffix ? ` ${detailSuffix}` : '');
    case SCENARIO_PHASE_EVENT_TYPE_NO_PROGRESS_WARNING:
      return `${SCENARIO_PHASE_LOG_PREFIX}${scenario} ${phase} warning: ` +
        `${message}` +
        (detailSuffix ? ` ${detailSuffix}` : '');
    case SCENARIO_PHASE_EVENT_TYPE_FAILED_NO_PROGRESS:
      return `${SCENARIO_PHASE_LOG_PREFIX}${scenario} ${phase} stalled: ` +
        `${message}` +
        (detailSuffix ? ` ${detailSuffix}` : '');
    default:
      return '';
    }
  }

  function composeScenarioPhaseEventSinks(existingSink, nextSink) {
    if (typeof existingSink !== 'function') {
      return typeof nextSink === 'function' ? nextSink : null;
    }
    if (typeof nextSink !== 'function') {
      return existingSink;
    }
    return (event) => {
      try {
        existingSink(event);
      } catch (_error) {
        // Progress sinks must not affect scenario execution.
      }
      nextSink(event);
    };
  }

  function createScenarioPhaseEventSink(verbose, scenarioName) {
    if (!verbose) {
      return null;
    }
    return (event) => {
      const line = formatScenarioPhaseEventLine(scenarioName, event);
      if (!line) {
        return;
      }
      process.stdout.write(line + '\n');
    };
  }

  function installScenarioPhaseEventSink(cluster, scenarioName, sink) {
    if (!cluster || typeof sink !== 'function') {
      return;
    }
    const scenarioOverrides =
      cluster._scenarioOverrides && typeof cluster._scenarioOverrides ===
        'object' ?
        cluster._scenarioOverrides :
        {};
    const benchmarkOverrides =
      scenarioOverrides.postgresBaselineComparison &&
        typeof scenarioOverrides.postgresBaselineComparison === 'object' ?
        scenarioOverrides.postgresBaselineComparison :
        {};

    cluster._scenarioOverrides = {
      ...scenarioOverrides,
      postgresBaselineComparison: {
        ...benchmarkOverrides,
        phaseEventSink: composeScenarioPhaseEventSinks(
          benchmarkOverrides.phaseEventSink,
          sink,
        ),
      },
    };
  }

  function resolveClusterSize(config) {
    return Number.isInteger(config?.size) && config.size > 0 ?
      config.size :
      null;
  }

  return {
    createScenarioPhaseEventSink,
    formatScenarioPhaseEventLine,
    installScenarioPhaseEventSink,
    resolveClusterSize,
  };
}
