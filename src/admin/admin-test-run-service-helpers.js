const LOCAL_STR_RUN_STOPPED = 'Run stopped';
const LOCAL_NUM_100 = 100;
const LOCAL_STR_WVB4L = 'Run completed successfully';
const LOCAL_STR_RUN_FAILED = 'Run failed';

function buildAdminTestRunServiceHelpers(deps = {}) {
  const {
    ADMIN_TEST_ERROR_MSG,
    ADMIN_TEST_RUN_STATUS,
    CONFIG_PRECHECK_STATE,
    FILE_ENCODING,
    GIT_HASH_FALLBACK,
    PROCESS_EXIT_SUCCESS,
    RUN_CONFIG_MODE,
    RUN_FINALIZATION_STATE,
    RUN_ID_SANITIZE_REGEX,
    RUN_PROGRESS_PHASE,
    RUN_TIMESTAMP_CHAR_REGEX,
    RUN_TIMESTAMP_REPLACEMENT,
    readFile,
  } = deps;

  const CONFIG_PRECHECK_ERROR_PREFIX =
    `${ADMIN_TEST_ERROR_MSG.CONFIG_PREFLIGHT_FAILED}: `;

  function buildLocalConfigPrecheck(socketPath) {
    return Object.freeze({
      state: CONFIG_PRECHECK_STATE.LOCAL_READY,
      mode: RUN_CONFIG_MODE.LOCAL,
      socketPath,
      hosts: [],
    });
  }

  function buildRemoteConfigPrecheck(hosts) {
    return Object.freeze({
      state: CONFIG_PRECHECK_STATE.REMOTE_READY,
      mode: RUN_CONFIG_MODE.REMOTE,
      socketPath: null,
      hosts,
    });
  }

  function resolveConfigPrecheckState(observations) {
    const blockingObservation = observations.find((observation) =>
      observation.state !== CONFIG_PRECHECK_STATE.REMOTE_HOST_RESOLVED);
    return blockingObservation?.state || CONFIG_PRECHECK_STATE.REMOTE_READY;
  }

  function buildConfigPrecheckOutcome({
    configName,
    hosts,
    observations,
    precheckState,
  }) {
    const blockingObservation = observations.find((observation) =>
      observation.state === precheckState);
    switch (precheckState) {
    case CONFIG_PRECHECK_STATE.INVALID_DOCKER_HOST:
      return Object.freeze({
        state: precheckState,
        error: new Error(
          `${CONFIG_PRECHECK_ERROR_PREFIX}` +
            `invalid docker host "${blockingObservation.host}" in config "${configName}"`,
        ),
      });
    case CONFIG_PRECHECK_STATE.REMOTE_HOST_UNRESOLVABLE:
      return Object.freeze({
        state: precheckState,
        error: new Error(
          `${CONFIG_PRECHECK_ERROR_PREFIX}` +
            `docker host "${blockingObservation.host}" from config "${configName}"` +
            ` is not resolvable: ${blockingObservation.message}`,
        ),
      });
    case CONFIG_PRECHECK_STATE.REMOTE_READY:
      return Object.freeze({
        state: precheckState,
        precheck: buildRemoteConfigPrecheck(hosts),
      });
    default:
      return Object.freeze({
        state: precheckState,
        error: new Error(
          `${CONFIG_PRECHECK_ERROR_PREFIX}` +
            `unsupported config precheck state "${precheckState}" for config "${configName}"`,
        ),
      });
    }
  }

  function buildRunFinalizationSnapshot(run, exitCode) {
    return Object.freeze({
      priorStatus: run.status,
      exitCode,
    });
  }

  function resolveRunFinalizationState(snapshot) {
    if (snapshot.priorStatus === ADMIN_TEST_RUN_STATUS.STOPPING) {
      return RUN_FINALIZATION_STATE.STOPPED;
    }
    if (snapshot.exitCode === PROCESS_EXIT_SUCCESS) {
      return RUN_FINALIZATION_STATE.PASSED;
    }
    return RUN_FINALIZATION_STATE.FAILED;
  }

  function buildRunFinalizationOutcome(finalizationState) {
    switch (finalizationState) {
    case RUN_FINALIZATION_STATE.STOPPED:
      return Object.freeze({
        state: finalizationState,
        status: ADMIN_TEST_RUN_STATUS.STOPPED,
        progress: Object.freeze({
          phase: RUN_PROGRESS_PHASE.STOPPED,
          message: LOCAL_STR_RUN_STOPPED,
          percent: LOCAL_NUM_100,
        }),
      });
    case RUN_FINALIZATION_STATE.PASSED:
      return Object.freeze({
        state: finalizationState,
        status: ADMIN_TEST_RUN_STATUS.PASSED,
        progress: Object.freeze({
          phase: RUN_PROGRESS_PHASE.COMPLETED,
          message: LOCAL_STR_WVB4L,
          percent: LOCAL_NUM_100,
        }),
      });
    case RUN_FINALIZATION_STATE.FAILED:
    default:
      return Object.freeze({
        state: finalizationState,
        status: ADMIN_TEST_RUN_STATUS.FAILED,
        progress: Object.freeze({
          phase: RUN_PROGRESS_PHASE.FAILED,
          message: LOCAL_STR_RUN_FAILED,
          percent: LOCAL_NUM_100,
        }),
      });
    }
  }

  function buildRunId(scenario, epochMs, gitHash) {
    const safeScenario = String(scenario).replace(RUN_ID_SANITIZE_REGEX, '_');
    const timestamp = new Date(epochMs)
      .toISOString()
      .replace(RUN_TIMESTAMP_CHAR_REGEX, RUN_TIMESTAMP_REPLACEMENT);
    const safeGitHash = String(gitHash || GIT_HASH_FALLBACK).replace(
      RUN_ID_SANITIZE_REGEX,
      '_',
    );
    return `${safeScenario}-${timestamp}-${safeGitHash}`;
  }

  async function tryReadJson(filePath) {
    try {
      const raw = await readFile(filePath, FILE_ENCODING);
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  return {
    buildConfigPrecheckOutcome,
    buildLocalConfigPrecheck,
    buildRemoteConfigPrecheck,
    buildRunFinalizationOutcome,
    buildRunFinalizationSnapshot,
    buildRunId,
    resolveConfigPrecheckState,
    resolveRunFinalizationState,
    tryReadJson,
  };
}

export {buildAdminTestRunServiceHelpers};
