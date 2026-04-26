function createDistributedRunRuntimeBundle(deps = {}) {
  const {
    LIVE_LOG_PREFIX,
    LIVE_LOG_NODE_EXCLUDED,
    ERROR_PATTERN,
    FAIL_PATTERN,
    TIMEOUT_PATTERN,
    EMBEDDED_JSON_START,
    EMBEDDED_LEVEL_WARN,
    LEVEL_FATAL,
    LEVEL_ERROR,
    LEVEL_WARN,
    LEVEL_INFO,
    LEVEL_DEBUG,
    CONTROL_CHAR_MAX_CODE,
    DELETE_CHAR_CODE,
    DOCKER_COMMAND_LOG_PREFIX,
    BUILD_PROGRESS_ID_KEY,
    BUILD_PROGRESS_STATUS_KEY,
    BUILD_PROGRESS_PROGRESS_KEY,
    BUILD_PROGRESS_STREAM_KEY,
    BUILD_PROGRESS_ERROR_KEY,
    DOCKER_OP_UNKNOWN,
    DOCKER_OP_IMAGE_BUILD,
    DOCKER_OP_NETWORK_CREATE,
    DOCKER_OP_NETWORK_REMOVE,
    DOCKER_OP_CONTAINER_CREATE,
    DOCKER_OP_CONTAINER_START,
    DOCKER_OP_CONTAINER_STOP,
    DOCKER_OP_CONTAINER_REMOVE,
    DOCKER_OP_NETWORK_CONNECT,
    DOCKER_OP_NETWORK_DISCONNECT,
    DOCKER_LINE_EMPTY,
    TRACE_ASSERTION_ERROR_PREFIX,
    TRACE_ASSERTION_MISSING_ARTIFACT,
    TRACE_ASSERTION_NO_EVENTS,
    TRACE_ASSERTION_LINEAGE_PREFIX_MISSING,
    MEMORY_ASSERTION_ERROR_PREFIX,
    CLEANLINESS_ASSERTION_ERROR_PREFIX,
    MEMORY_ASSERTION_SAMPLES_MISSING,
    MEMORY_ASSERTION_LEAK_DETECTED_PREFIX,
    MEMORY_ASSERTION_ANALYSIS_INSUFFICIENT,
    MEMORY_ANALYSIS_WARNING_SAMPLES_PATH_MISSING,
    MEMORY_ANALYSIS_WARNING_SAMPLES_READ_FAILED,
    SCENARIO_ASSERTION_POLICY,
    BENCHMARK_GATE_DEFAULTS,
    BENCHMARK_GATE_PARITY_POLICY,
    SUMMARY_HEADER,
    SUMMARY_FOOTER,
    SUMMARY_RESULT_PASS,
    SUMMARY_RESULT_FAIL,
    SUMMARY_LABEL_DURATION,
    SUMMARY_LABEL_CLUSTER,
    SUMMARY_LABEL_LOAD,
    SUMMARY_LABEL_LATENCY,
    SUMMARY_LABEL_VS_PREV,
    SUMMARY_LABEL_PG_BASE,
    SUMMARY_NODES_SUFFIX,
    SUMMARY_OPS_SUFFIX,
    SUMMARY_SUCCESS_RATE_SUFFIX,
    SUMMARY_OPS_PER_SEC_SUFFIX,
    SUMMARY_MS_SUFFIX,
    SUMMARY_LATENCY_P50,
    SUMMARY_LATENCY_P95,
    SUMMARY_LATENCY_P99,
    SUMMARY_PREV_PASS_CHANGED,
    SUMMARY_PREV_SAME,
    SUMMARY_PREV_OPS_PREFIX,
    SUMMARY_PREV_P99_PREFIX,
    SUMMARY_PG_THROUGHPUT_PREFIX,
    SUMMARY_PG_THROUGHPUT_SUFFIX,
    SUMMARY_PG_SUT_PREFIX,
    SUMMARY_PG_BASELINE_PREFIX,
    SUMMARY_PG_CLOSE_PAREN,
    SUMMARY_NO_PREV,
    SUMMARY_NO_PG,
    SUMMARY_PERCENT_MULTIPLIER,
    SUMMARY_FIXED_DECIMALS_RATE,
    SUMMARY_FIXED_DECIMALS_RATIO,
    SUMMARY_FIXED_DECIMALS_OPS,
    ReportWriter,
    analyzeMemoryLeakFromPlayback,
    buildPerformanceDiagnostics,
    createCluster,
    createScenarioPhaseEventSink,
    formatLogEntry,
    installScenarioPhaseEventSink,
    resolveClusterSize,
    dirname,
    pathToFileURL,
    resolve,
    normalizeFiniteNumber,
    formatStateMachinePressurePreflightSummary,
    runStateMachinePressurePreflight,
  } = deps;

  const STATE_MACHINE_PRESSURE_PREFLIGHT_METADATA_KEY =
    'stateMachinePressurePreflight';
  const STATE_MACHINE_PRESSURE_PREFLIGHT_ERROR_PREFIX =
    'State-machine pressure preflight failed';

  function resolveBenchmarkGateConfig(config) {
    const configuredGate = config?.benchmarkGate &&
    typeof config.benchmarkGate === 'object' ?
      config.benchmarkGate :
      {};
    const configuredMaxRegression = normalizeFiniteNumber(
      configuredGate.maxThroughputRegressionRatio,
    );
    const configuredBaselineProvider = String(
      configuredGate.baselineProvider || '',
    ).trim().toLowerCase();
    const configuredMitigationId = String(
      configuredGate.approvedMitigationId || '',
    ).trim();
    const configuredMinimumThroughputRatio = normalizeFiniteNumber(
      configuredGate.minimumThroughputRatioSutToBaseline,
    );
    const configuredParityPolicy = String(
      configuredGate.parityMismatchPolicy || '',
    ).trim().toLowerCase();
    const defaultMinimumThroughputRatio = normalizeFiniteNumber(
      BENCHMARK_GATE_DEFAULTS.minimumThroughputRatioSutToBaseline,
    );
    const defaultParityPolicy = String(
      BENCHMARK_GATE_DEFAULTS.parityMismatchPolicy ||
      BENCHMARK_GATE_PARITY_POLICY.WARN,
    ).trim().toLowerCase();
    const parityMismatchPolicy = configuredParityPolicy ===
    BENCHMARK_GATE_PARITY_POLICY.FAIL ||
    configuredParityPolicy === BENCHMARK_GATE_PARITY_POLICY.WARN ||
    configuredParityPolicy === BENCHMARK_GATE_PARITY_POLICY.IGNORE ?
      configuredParityPolicy :
      (defaultParityPolicy === BENCHMARK_GATE_PARITY_POLICY.FAIL ||
      defaultParityPolicy === BENCHMARK_GATE_PARITY_POLICY.WARN ||
      defaultParityPolicy === BENCHMARK_GATE_PARITY_POLICY.IGNORE ?
        defaultParityPolicy :
        BENCHMARK_GATE_PARITY_POLICY.WARN);

    return {
      enabled: configuredGate.enabled === true,
      maxThroughputRegressionRatio:
      configuredMaxRegression !== null &&
      configuredMaxRegression >= 0 ?
        configuredMaxRegression :
        BENCHMARK_GATE_DEFAULTS.maxThroughputRegressionRatio,
      minimumThroughputRatioSutToBaseline:
      configuredMinimumThroughputRatio !== null &&
      configuredMinimumThroughputRatio >= 0 ?
        configuredMinimumThroughputRatio :
        (defaultMinimumThroughputRatio !== null &&
          defaultMinimumThroughputRatio >= 0 ?
          defaultMinimumThroughputRatio :
          null),
      baselineProvider: configuredBaselineProvider ||
      BENCHMARK_GATE_DEFAULTS.baselineProvider,
      failIfBaselineMissing: configuredGate.failIfBaselineMissing === true ||
      BENCHMARK_GATE_DEFAULTS.failIfBaselineMissing === true,
      approvedMitigationId: configuredMitigationId || null,
      parityMismatchPolicy,
    };
  }

  function buildHistoricalBaselineIndex(historyReports, baselineProvider) {
    const bySimilarityKey = new Map();

    for (const historicalReport of historyReports) {
      const reportProvider = String(
        historicalReport?.metadata?.raftProvider || '',
      ).trim().toLowerCase();
      if (reportProvider !== baselineProvider) {
        continue;
      }

      const scenarioSummaries = Array.isArray(
        historicalReport?.standardSummary?.scenarios,
      ) ?
        historicalReport.standardSummary.scenarios :
        [];

      for (const scenarioSummary of scenarioSummaries) {
        const similarityKey = String(
          scenarioSummary?.similarityKey || '',
        ).trim();
        if (!similarityKey || bySimilarityKey.has(similarityKey)) {
          continue;
        }

        const baselineOpsPerSec = normalizeFiniteNumber(
          scenarioSummary?.current?.opsPerSec,
        );
        if (baselineOpsPerSec === null || baselineOpsPerSec <= 0) {
          continue;
        }

        bySimilarityKey.set(similarityKey, {
          provider: reportProvider,
          reportPath: historicalReport?.path || null,
          reportTimestamp: historicalReport?.timestamp || null,
          scenario: scenarioSummary?.scenario || null,
          opsPerSec: baselineOpsPerSec,
        });
      }
    }

    return bySimilarityKey;
  }


  function dockerActionLine(action, details) {
    return `${action} ${details}`.trim();
  }

  function formatDockerOperationEvent(event) {
    const operation = String(event?.operation || DOCKER_OP_UNKNOWN);
    const stage = String(event?.stage || DOCKER_LINE_EMPTY);
    const statusSuffix = stage ? `[${stage}]` : DOCKER_LINE_EMPTY;
    switch (operation) {
    case DOCKER_OP_IMAGE_BUILD:
      return dockerActionLine(
        `image.build${statusSuffix}`,
        `tag=${String(event?.tag || '-')}` +
        ` dockerfile=${String(event?.dockerfile || '-')}` +
        ` context=${String(event?.contextPath || '.')}`,
      );
    case DOCKER_OP_NETWORK_CREATE:
      return dockerActionLine(
        `network.create${statusSuffix}`,
        `name=${String(event?.name || '-')}` +
        ` id=${String(event?.networkId || '-')}`,
      );
    case DOCKER_OP_NETWORK_REMOVE:
      return dockerActionLine(
        `network.remove${statusSuffix}`,
        `id=${String(event?.networkId || '-')}`,
      );
    case DOCKER_OP_CONTAINER_CREATE:
      return dockerActionLine(
        `container.create${statusSuffix}`,
        `name=${String(event?.name || '-')}` +
        ` image=${String(event?.image || '-')}` +
        ` network=${String(event?.network || '-')}` +
        ` id=${String(event?.containerId || '-')}`,
      );
    case DOCKER_OP_CONTAINER_START:
      return dockerActionLine(
        `container.start${statusSuffix}`,
        `name=${String(event?.name || '-')}` +
        ` id=${String(event?.containerId || '-')}`,
      );
    case DOCKER_OP_CONTAINER_STOP:
      return dockerActionLine(
        `container.stop${statusSuffix}`,
        `id=${String(event?.containerId || '-')}`,
      );
    case DOCKER_OP_CONTAINER_REMOVE:
      return dockerActionLine(
        `container.remove${statusSuffix}`,
        `id=${String(event?.containerId || '-')}`,
      );
    case DOCKER_OP_NETWORK_CONNECT:
      return dockerActionLine(
        `network.connect${statusSuffix}`,
        `network=${String(event?.networkId || '-')}` +
        ` container=${String(event?.containerId || '-')}`,
      );
    case DOCKER_OP_NETWORK_DISCONNECT:
      return dockerActionLine(
        `network.disconnect${statusSuffix}`,
        `network=${String(event?.networkId || '-')}` +
        ` container=${String(event?.containerId || '-')}`,
      );
    default: {
      const error = String(event?.error || DOCKER_LINE_EMPTY).trim();
      const errorSuffix = error ? ` error=${error}` : DOCKER_LINE_EMPTY;
      return `${operation}${statusSuffix}${errorSuffix}`.trim();
    }
    }
  }

  function createDockerOperationSink(verbose) {
    if (!verbose) {
      return null;
    }
    return (event) => {
      const line = formatDockerOperationEvent(event);
      if (!line) {
        return;
      }
      process.stdout.write(DOCKER_COMMAND_LOG_PREFIX + line + '\n');
    };
  }

  function extractBuildProgressLine(event) {
    if (!event || typeof event !== 'object') {
      return '';
    }
    if (event[BUILD_PROGRESS_STREAM_KEY]) {
      return String(event[BUILD_PROGRESS_STREAM_KEY]).trim();
    }
    if (event[BUILD_PROGRESS_ERROR_KEY]) {
      return String(event[BUILD_PROGRESS_ERROR_KEY]).trim();
    }
    const status = String(event[BUILD_PROGRESS_STATUS_KEY] || '').trim();
    const id = String(event[BUILD_PROGRESS_ID_KEY] || '').trim();
    const progress = String(event[BUILD_PROGRESS_PROGRESS_KEY] || '').trim();
    const parts = [id, status, progress].filter((part) => Boolean(part));
    return parts.join(' ').trim();
  }

  const ERROR_DIAGNOSTICS_FIELD_QUIESCENCE = 'quiescence';

  function extractScenarioFailurePartialResult(errorDiagnostics) {
    const partialResult = errorDiagnostics?.partialResult;
    if (!partialResult || typeof partialResult !== 'object' ||
        Array.isArray(partialResult)) {
      return null;
    }
    return partialResult;
  }

  function resolveErrorQuiescence(error) {
    const quiescence = error &&
      typeof error === 'object' &&
      error.quiescence &&
      typeof error.quiescence === 'object' &&
      !Array.isArray(error.quiescence) ?
      error.quiescence :
      null;
    return quiescence;
  }

  function mergeErrorDiagnostics(errorDiagnostics, errorQuiescence) {
    const diagnostics = errorDiagnostics && typeof errorDiagnostics === 'object' ?
      {...errorDiagnostics} :
      {};
    if (errorQuiescence) {
      diagnostics[ERROR_DIAGNOSTICS_FIELD_QUIESCENCE] = errorQuiescence;
    }
    return Object.keys(diagnostics).length > 0 ? diagnostics : null;
  }

  function mergeFailedScenarioDetails(errorDiagnostics, partialResult) {
    const diagnostics = errorDiagnostics && typeof errorDiagnostics === 'object' ?
      {...errorDiagnostics} :
      {};
    if (partialResult) {
      diagnostics.partialResult = partialResult;
    }
    const detailEntries = partialResult &&
      typeof partialResult === 'object' &&
      !Array.isArray(partialResult) ?
      Object.entries(partialResult).filter(([field]) => field !== 'loadMetrics') :
      [];
    const details = Object.fromEntries(detailEntries);
    if (Object.keys(diagnostics).length > 0) {
      details.diagnostics = diagnostics;
    }
    return Object.keys(details).length > 0 ? details : null;
  }

  /**
   * Run discovered scenarios sequentially.
   * Each scenario runs in isolation: createCluster → run → teardown.
   * Unhandled errors are caught, marked failed, and execution continues.
   *
   * @param {Object} config - Parsed cluster configuration
   * @param {Array<{name: string, path: string}>} scenarios
   * @param {{
   *   output: string,
   *   verbose: boolean,
   *   historyReports?: Array<Object>,
   *   dockerOperationSink?: Function|null,
   *   clusterFactory?: Function|null,
   *   reportMetadata?: Object|null,
   * }} options
   * @returns {Promise<{report: ReportWriter, hasFailures: boolean}>}
   */
  async function runScenarios(config, scenarios, options) {
    const providedStateMachinePressurePreflight =
      options?.stateMachinePressurePreflight &&
      typeof options.stateMachinePressurePreflight === 'object' ?
        options.stateMachinePressurePreflight :
        null;
    const stateMachinePressurePreflight =
      providedStateMachinePressurePreflight ||
      (typeof runStateMachinePressurePreflight === 'function' ?
        runStateMachinePressurePreflight() :
        null);
    if (
      stateMachinePressurePreflight &&
      stateMachinePressurePreflight.ready !== true
    ) {
      const summary =
        typeof formatStateMachinePressurePreflightSummary === 'function' ?
          formatStateMachinePressurePreflightSummary(
            stateMachinePressurePreflight,
          ) :
          STATE_MACHINE_PRESSURE_PREFLIGHT_ERROR_PREFIX;
      throw new Error(
        STATE_MACHINE_PRESSURE_PREFLIGHT_ERROR_PREFIX + ': ' + summary,
      );
    }
    const reportMetadata =
      options?.reportMetadata && typeof options.reportMetadata === 'object' ?
        options.reportMetadata :
        {};
    const report = new ReportWriter(options.output, {
      historyReports: options?.historyReports,
      metadata: {
        ...reportMetadata,
        ...(stateMachinePressurePreflight ?
          {
            [STATE_MACHINE_PRESSURE_PREFLIGHT_METADATA_KEY]:
              stateMachinePressurePreflight,
          } :
          {}),
      },
    });
    let hasFailures = false;
    const dockerOperationSink = typeof options?.dockerOperationSink === 'function' ?
      options.dockerOperationSink :
      null;
    const clusterFactory = typeof options?.clusterFactory === 'function' ?
      options.clusterFactory :
      createCluster;

    for (const scenario of scenarios) {
      const startedAt = new Date().toISOString();
      const startMs = Date.now();
      let scenarioResult = null;

      if (options.verbose) {
        process.stdout.write(
          'Running scenario: ' + scenario.name + '\n',
        );
      }

      let cluster = null;
      try {
        const clusterConfig = dockerOperationSink ?
          {...config, dockerOperationSink} :
          config;
        cluster = clusterFactory(clusterConfig);
        if (typeof cluster.setScenarioName === 'function') {
          cluster.setScenarioName(scenario.name);
        }
        await cluster.start();
        installScenarioPhaseEventSink(
          cluster,
          scenario.name,
          createScenarioPhaseEventSink(options.verbose, scenario.name),
        );

        if (options.verbose) {
          const collector = cluster.getLogCollector();
          collector.setEntrySink((entry) => {
            if (!shouldPrintLiveLogEntry(entry)) {
              return;
            }
            process.stderr.write(
              LIVE_LOG_PREFIX + formatLiveLogEntry(entry) + '\n',
            );
          });
        }

        const scenarioModule = await loadScenarioModule(scenario.path);
        const scenarioPayload = normalizeScenarioPayload(
          await scenarioModule.run(cluster),
        );

        // Run log analysis before teardown
        const analyzer = cluster.getLogAnalyzer();
        const collector = cluster.getLogCollector();
        let analysisSummary = null;
        let performanceDiagnostics = null;
        try {
          const seedNode = cluster.getNodes()[0];
          const logEntries = collector.getBuffer();
          performanceDiagnostics = buildPerformanceDiagnostics(logEntries);
          const queryResults =
            await analyzer.runAnalyticalQueries(seedNode);
          const analysis = analyzer.analyze(
            logEntries,
            queryResults,
            config.partitionCount || 0,
          );
          analysisSummary = analysis.summary || null;
          await analyzer.writeAnalysis(
            scenario.name, analysis,
          );
          const nodeIds = cluster.getNodes().map((n) => n.id);
          await collector.writeOutput(
            scenario.name, logEntries, nodeIds,
          );
        } catch (_analysisErr) {
          // Analysis is best-effort
        }

        const duration = Date.now() - startMs;
        scenarioResult = {
          ...(scenarioPayload || {}),
          passed: true,
          duration,
          startedAt,
          analysisSummary,
          clusterSize: resolveClusterSize(config),
          performanceDiagnostics,
        };
        if (scenarioPayload) {
          scenarioResult.details = scenarioPayload;
        }

        if (options.verbose) {
          process.stdout.write(
            'Scenario passed: ' + scenario.name +
            ' (' + duration + 'ms)\n',
          );
        }
      } catch (err) {
        const duration = Date.now() - startMs;
        hasFailures = true;
        const errorDiagnostics = err &&
          typeof err === 'object' &&
          err.diagnostics &&
          typeof err.diagnostics === 'object' ?
          err.diagnostics :
          null;
        const mergedErrorDiagnostics = mergeErrorDiagnostics(
          errorDiagnostics,
          resolveErrorQuiescence(err),
        );
        const partialResult = extractScenarioFailurePartialResult(
          mergedErrorDiagnostics,
        );
        let performanceDiagnostics = null;

        // Attempt fallback log collection on failure
        const analysisSummary = null;
        if (cluster) {
          try {
            const collector = cluster.getLogCollector();
            const provider =
              cluster._providers[cluster._hostAssignment[0]];
            const nodes = cluster.getNodes();
            await collector.collectContainerFallback(
              provider, nodes,
            );
            const nodeIds = nodes.map((n) => n.id);
            await collector.writeOutput(
              scenario.name,
              collector.getBuffer(),
              nodeIds,
            );
            performanceDiagnostics = buildPerformanceDiagnostics(
              collector.getBuffer(),
            );
          } catch (_fallbackErr) {
            // Best-effort fallback
          }
        }

        scenarioResult = {
          passed: false,
          duration,
          startedAt,
          error: err.message,
          stackTrace: err.stack || null,
          analysisSummary,
          details: mergeFailedScenarioDetails(
            mergedErrorDiagnostics,
            partialResult,
          ),
          convergenceTiming: partialResult?.convergenceTiming || null,
          loadMetrics: partialResult?.loadMetrics || null,
          clusterSize: resolveClusterSize(config),
          performanceDiagnostics,
        };

        if (options.verbose) {
          process.stderr.write(
            'Scenario failed: ' + scenario.name +
            ' — ' + err.message + '\n',
          );
        }
      } finally {
        let playback = null;
        let playbackWarning = null;
        let trace = null;
        if (cluster) {
          try {
            await cluster.stop();
          } catch (_stopErr) {
            playbackWarning = 'Cluster teardown failed';
          }
          try {
            if (typeof cluster.getPlaybackManifest === 'function') {
              playback = cluster.getPlaybackManifest();
            }
          } catch (_manifestErr) {
            playbackWarning = 'Unable to read playback manifest';
          }
          try {
            if (typeof cluster.getTraceManifest === 'function') {
              trace = cluster.getTraceManifest();
            }
          } catch (_traceErr) {
            trace = {warning: 'Unable to read trace manifest'};
          }
        }

        if (!scenarioResult) {
          scenarioResult = {
            passed: false,
            duration: Date.now() - startMs,
            startedAt,
            error: 'Scenario result missing',
            stackTrace: null,
            analysisSummary: null,
            clusterSize: resolveClusterSize(config),
            performanceDiagnostics: null,
          };
        }

        if (playbackWarning) {
          scenarioResult.playback = {
            warning: playbackWarning,
          };
        } else {
          scenarioResult.playback = playback;
        }
        scenarioResult.trace = trace;

        if (scenarioResult?.details?.diagnostics?.rootCauseBundle &&
            playback && typeof playback === 'object') {
          const files = playback.files && typeof playback.files === 'object' ?
            playback.files :
            {};
          const manifestPath = typeof files.manifest === 'string' &&
            files.manifest.length > 0 ?
            files.manifest :
            null;
          const viewerPath = typeof files.viewer === 'string' &&
            files.viewer.length > 0 ?
            files.viewer :
            null;
          const manifestDir = manifestPath ? dirname(manifestPath) : null;
          const bundle = scenarioResult.details.diagnostics.rootCauseBundle;
          const existingPlayback = bundle.playback && typeof bundle.playback === 'object' ?
            bundle.playback :
            {};
          bundle.playback = {
            ...existingPlayback,
            ...(manifestDir ? {manifestDir} : {}),
            ...(manifestPath ? {manifestPath} : {}),
            ...(viewerPath ? {viewerPath} : {}),
          };
        }

        const scenarioMemoryLeakConfig = resolveScenarioMemoryLeakConfig(
          scenario.name,
          config,
        );
        scenarioResult.memoryLeak = await analyzeMemoryLeakFromPlayback(
          scenarioResult.playback,
          scenarioMemoryLeakConfig,
        );

        const traceAssertion = evaluateTraceAssertions(
          trace,
          config.debugTrace,
        );
        if (traceAssertion) {
          scenarioResult.traceAssertion = traceAssertion;
          if (scenarioResult.passed && !traceAssertion.passed) {
            scenarioResult.passed = false;
            scenarioResult.error = `${TRACE_ASSERTION_ERROR_PREFIX}${traceAssertion.error}`;
            hasFailures = true;
          }
        }

        const memoryLeakAssertion = evaluateMemoryLeakAssertions(
          scenarioResult.memoryLeak,
          scenarioMemoryLeakConfig,
        );
        if (memoryLeakAssertion) {
          scenarioResult.memoryLeakAssertion = memoryLeakAssertion;
          if (scenarioResult.passed && !memoryLeakAssertion.passed) {
            scenarioResult.passed = false;
            scenarioResult.error = MEMORY_ASSERTION_ERROR_PREFIX +
              memoryLeakAssertion.error;
            hasFailures = true;
          }
        }
        const cleanlinessAssertion = evaluateScenarioCleanlinessAssertions(
          scenario.name,
          scenarioResult,
        );
        if (cleanlinessAssertion) {
          scenarioResult.cleanlinessAssertion = cleanlinessAssertion;
          if (scenarioResult.passed && !cleanlinessAssertion.passed) {
            scenarioResult.passed = false;
            scenarioResult.error = CLEANLINESS_ASSERTION_ERROR_PREFIX +
              cleanlinessAssertion.error;
            hasFailures = true;
          }
        }
        report.addResult(scenario.name, scenarioResult);
      }
    }

    return {report, hasFailures};
  }

  function shouldPrintLiveLogEntry(entry) {
    const nodeId = String(entry?.node_id || '').toLowerCase();
    if (nodeId === LIVE_LOG_NODE_EXCLUDED) {
      return false;
    }

    const topLevel = normalizeSeverity(entry?.level);
    if (topLevel >= EMBEDDED_LEVEL_WARN) {
      return true;
    }

    const embedded = parseEmbeddedLogPayload(entry?.message);
    if (embedded) {
      const embeddedLevel = normalizeSeverity(embedded.level);
      if (embeddedLevel >= EMBEDDED_LEVEL_WARN) {
        return true;
      }
      const embeddedMsg = String(
        embedded.msg || embedded.message || '',
      ).toLowerCase();
      return hasProblemPattern(embeddedMsg);
    }

    const message = String(entry?.message || '').toLowerCase();
    return hasProblemPattern(message);
  }

  /**
   * Normalize scenario payload returned by run(cluster).
   * Non-object payloads are ignored.
   * @param {*} payload
   * @returns {Object|null}
   */
  function normalizeScenarioPayload(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null;
    }
    return payload;
  }

  /**
   * Evaluate required trace assertions for a scenario run.
   * @param {Object|null} traceArtifact
   * @param {Object} debugTraceConfig
   * @return {Object|null}
   */
  function evaluateTraceAssertions(traceArtifact, debugTraceConfig) {
    if (!debugTraceConfig ||
      debugTraceConfig.enabled !== true ||
      debugTraceConfig.required !== true) {
      return null;
    }

    const assertion = {
      required: true,
      passed: true,
      eventCount: Number(traceArtifact?.eventCount || 0),
      requiredLineagePrefix: debugTraceConfig.requiredLineagePrefix || null,
      matchedRequiredLineagePrefix: true,
      error: null,
    };

    if (!traceArtifact || typeof traceArtifact !== 'object') {
      assertion.passed = false;
      assertion.matchedRequiredLineagePrefix = false;
      assertion.error = TRACE_ASSERTION_MISSING_ARTIFACT;
      return assertion;
    }

    if (!Number.isInteger(assertion.eventCount) ||
      assertion.eventCount <= 0) {
      assertion.passed = false;
      assertion.matchedRequiredLineagePrefix = false;
      assertion.error = TRACE_ASSERTION_NO_EVENTS;
      return assertion;
    }

    const requiredPrefix = assertion.requiredLineagePrefix;
    if (requiredPrefix) {
      const lineageIds = Array.isArray(traceArtifact.lineageIds) ?
        traceArtifact.lineageIds :
        [];
      const matched = lineageIds.some((lineageId) =>
        String(lineageId || '').startsWith(requiredPrefix),
      );
      assertion.matchedRequiredLineagePrefix = matched;
      if (!matched) {
        assertion.passed = false;
        assertion.error =
          TRACE_ASSERTION_LINEAGE_PREFIX_MISSING + requiredPrefix;
      }
    }

    return assertion;
  }

  function resolveScenarioAssertionPolicy(scenarioName) {
    const normalizedScenarioName = String(scenarioName || '').trim();
    if (!normalizedScenarioName) {
      return null;
    }
    return SCENARIO_ASSERTION_POLICY[normalizedScenarioName] || null;
  }

  function resolveScenarioMemoryLeakConfig(scenarioName, config = {}) {
    const scenarioPolicy = resolveScenarioAssertionPolicy(scenarioName);
    const baseConfig = config?.memoryLeak &&
      typeof config.memoryLeak === 'object' ?
      config.memoryLeak :
      {};
    if (!scenarioPolicy?.memoryLeak ||
        typeof scenarioPolicy.memoryLeak !== 'object') {
      return baseConfig;
    }
    return {
      ...baseConfig,
      ...scenarioPolicy.memoryLeak,
    };
  }

  function collectPlaybackWarningMessages(playbackArtifact) {
    if (!playbackArtifact || typeof playbackArtifact !== 'object') {
      return [];
    }
    const warnings = [];
    if (typeof playbackArtifact.warning === 'string' &&
        playbackArtifact.warning.length > 0) {
      warnings.push(playbackArtifact.warning);
    }
    if (Array.isArray(playbackArtifact.warnings)) {
      for (const warning of playbackArtifact.warnings) {
        const message = typeof warning?.message === 'string' ?
          warning.message :
          (typeof warning === 'string' ? warning : null);
        if (message) {
          warnings.push(message);
        }
      }
    }
    return [...new Set(warnings)];
  }

  function evaluateScenarioCleanlinessAssertions(
    scenarioName,
    scenarioResult,
  ) {
    const scenarioPolicy = resolveScenarioAssertionPolicy(scenarioName);
    if (!scenarioPolicy) {
      return null;
    }

    const playbackWarnings = collectPlaybackWarningMessages(
      scenarioResult?.playback,
    );
    const assertion = {
      enabled: true,
      required: true,
      playbackWarnings,
      passed: true,
      error: null,
    };

    if (scenarioPolicy.failOnPlaybackWarnings === true &&
        playbackWarnings.length > 0) {
      assertion.passed = false;
      assertion.error = 'playback warnings present: ' +
        playbackWarnings.join('; ');
    }

    return assertion;
  }

  /**
   * Evaluate required memory leak assertions for a scenario run.
   * @param {Object|null} memoryLeakAnalysis
   * @param {Object} memoryLeakConfig
   * @return {Object|null}
   */
  function evaluateMemoryLeakAssertions(memoryLeakAnalysis, memoryLeakConfig) {
    if (!memoryLeakConfig || memoryLeakConfig.enabled !== true) {
      return null;
    }

    const leakingNodes = Array.isArray(memoryLeakAnalysis?.leakingNodes) ?
      memoryLeakAnalysis.leakingNodes :
      [];
    const warnings = Array.isArray(memoryLeakAnalysis?.warnings) ?
      memoryLeakAnalysis.warnings.map((warning) => String(warning)) :
      [];
    const sampleCount = Number(memoryLeakAnalysis?.sampleCount || 0);
    const samplesUnavailable = sampleCount <= 0 ||
      warnings.includes(MEMORY_ANALYSIS_WARNING_SAMPLES_PATH_MISSING) ||
      warnings.includes(MEMORY_ANALYSIS_WARNING_SAMPLES_READ_FAILED);
    const assertion = {
      enabled: true,
      required: memoryLeakConfig.failOnDetection === true ||
        memoryLeakConfig.requireSamples === true,
      analyzed: memoryLeakAnalysis?.analyzed === true,
      leakDetected: memoryLeakAnalysis?.leakDetected === true,
      leakingNodeCount: Number(memoryLeakAnalysis?.leakingNodeCount || 0),
      leakingNodes,
      sampleCount,
      passed: true,
      error: null,
    };

    if (memoryLeakConfig.requireSamples === true &&
        assertion.analyzed !== true) {
      if (samplesUnavailable) {
        assertion.passed = false;
        assertion.error = MEMORY_ASSERTION_SAMPLES_MISSING;
        return assertion;
      }
      assertion.sampleCoverage = 'present';
      assertion.analysisDeferred = true;
      assertion.warning = MEMORY_ASSERTION_ANALYSIS_INSUFFICIENT;
      return assertion;
    }

    if (memoryLeakConfig.failOnDetection === true &&
        assertion.leakDetected === true) {
      assertion.passed = false;
      assertion.error = MEMORY_ASSERTION_LEAK_DETECTED_PREFIX +
        leakingNodes.join(',');
    }

    return assertion;
  }

  function formatLiveLogEntry(entry) {
    const embedded = parseEmbeddedLogPayload(entry?.message);
    if (embedded) {
      const timestamp = entry?.timestamp || '';
      const nodeId = entry?.node_id || '';
      const level = severityLabel(embedded.level);
      const message = sanitizeMessage(
        String(embedded.msg || embedded.message || ''),
      );
      return `${timestamp} [${nodeId}] ${level}: ${message}`;
    }

    const sanitized = {
      ...entry,
      message: sanitizeMessage(String(entry?.message || '')),
    };
    return formatLogEntry(sanitized);
  }

  function parseEmbeddedLogPayload(message) {
    if (typeof message !== 'string') {
      return null;
    }
    const start = message.indexOf(EMBEDDED_JSON_START);
    if (start < 0) {
      return null;
    }
    const candidate = message.slice(start);
    try {
      const parsed = JSON.parse(candidate);
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }
      return parsed;
    } catch (_err) {
      return null;
    }
  }

  function normalizeSeverity(level) {
    if (typeof level === 'number' && Number.isFinite(level)) {
      return level;
    }

    const normalized = String(level || '').toLowerCase();
    if (normalized === LEVEL_FATAL) {
      return 60;
    }
    if (normalized === LEVEL_ERROR) {
      return 50;
    }
    if (normalized === LEVEL_WARN) {
      return 40;
    }
    if (normalized === LEVEL_INFO) {
      return 30;
    }
    if (normalized === LEVEL_DEBUG) {
      return 20;
    }
    return 0;
  }

  function severityLabel(level) {
    if (typeof level === 'number' && Number.isFinite(level)) {
      if (level >= 60) return LEVEL_FATAL;
      if (level >= 50) return LEVEL_ERROR;
      if (level >= 40) return LEVEL_WARN;
      if (level >= 30) return LEVEL_INFO;
      return LEVEL_DEBUG;
    }
    const normalized = String(level || '').toLowerCase();
    return normalized || LEVEL_INFO;
  }

  function sanitizeMessage(message) {
    let sanitized = '';
    for (let i = 0; i < message.length; i++) {
      const charCode = message.charCodeAt(i);
      const isControl = charCode <= CONTROL_CHAR_MAX_CODE ||
        charCode === DELETE_CHAR_CODE;
      if (isControl) {
        continue;
      }
      sanitized += message[i];
    }
    return sanitized;
  }

  function hasProblemPattern(message) {
    if (!message) {
      return false;
    }
    return message.includes(ERROR_PATTERN) ||
      message.includes(FAIL_PATTERN) ||
      message.includes(TIMEOUT_PATTERN);
  }

  /**
   * Load a scenario module path as a file URL so both absolute and
   * workspace-relative paths resolve correctly.
   * @param {string} scenarioPath
   * @returns {Promise<Object>}
   */
  async function loadScenarioModule(scenarioPath) {
    const scenarioUrl = pathToFileURL(resolve(scenarioPath)).href;
    return import(scenarioUrl);
  }

  /**
   * Format a signed delta string with + or - prefix.
   * @param {number|null} value
   * @param {string} suffix
   * @returns {string}
   */
  function formatSignedDelta(value, suffix) {
    if (value === null || !Number.isFinite(value)) {
      return 'n/a';
    }
    const sign = value >= 0 ? '+' : '';
    return sign + value.toFixed(SUMMARY_FIXED_DECIMALS_OPS) + suffix;
  }

  /**
   * Print a concise run summary to stdout after the report is
   * written. Shows per-scenario metrics, delta vs previous run,
   * and postgres baseline comparison.
   *
   * @param {Object} reportPreview - { summary, standardSummary }
   * @param {Array<Object>} scenarioEntries - report.scenarios
   */
  function formatRunSummary(reportPreview, scenarioEntries) {
    const lines = [SUMMARY_HEADER];
    const summary = reportPreview.summary;
    const stdScenarios = Array.isArray(
      reportPreview.standardSummary?.scenarios,
    ) ? reportPreview.standardSummary.scenarios : [];

    lines.push(
      'Run: ' + summary.passed + '/' + summary.total +
      ' passed, ' + summary.failed + ' failed' +
      ' (' + (summary.duration / 1000).toFixed(
        SUMMARY_FIXED_DECIMALS_OPS,
      ) + 's)\n',
    );

    for (let i = 0; i < stdScenarios.length; i++) {
      const std = stdScenarios[i];
      const entry = scenarioEntries[i] || null;
      const current = std.current;
      const result = current.passed ?
        SUMMARY_RESULT_PASS : SUMMARY_RESULT_FAIL;

      lines.push('\n' + result + ' ' + std.scenario + '\n');
      lines.push(
        SUMMARY_LABEL_DURATION +
        (current.durationMs / 1000).toFixed(
          SUMMARY_FIXED_DECIMALS_OPS,
        ) + 's\n',
      );
      lines.push(
        SUMMARY_LABEL_CLUSTER + current.clusterSize +
        SUMMARY_NODES_SUFFIX + '\n',
      );

      const loadMetrics = entry?.loadMetrics;
      if (loadMetrics && typeof loadMetrics === 'object') {
        const total = Number(loadMetrics.total || 0);
        const success = Number(loadMetrics.success || 0);
        const rate = total > 0 ?
          (success / total * SUMMARY_PERCENT_MULTIPLIER)
            .toFixed(SUMMARY_FIXED_DECIMALS_RATE) :
          '0.0';
        lines.push(
          SUMMARY_LABEL_LOAD +
          total + SUMMARY_OPS_SUFFIX +
          ', ' + rate + '%' + SUMMARY_SUCCESS_RATE_SUFFIX +
          ', ' + Number(loadMetrics.opsPerSec || 0)
            .toFixed(SUMMARY_FIXED_DECIMALS_OPS) +
          SUMMARY_OPS_PER_SEC_SUFFIX + '\n',
        );
        const lat = loadMetrics.latency;
        if (lat && typeof lat === 'object') {
          lines.push(
            SUMMARY_LABEL_LATENCY +
            SUMMARY_LATENCY_P50 + (lat.p50 || 0) +
            SUMMARY_MS_SUFFIX +
            SUMMARY_LATENCY_P95 + (lat.p95 || 0) +
            SUMMARY_MS_SUFFIX +
            SUMMARY_LATENCY_P99 + (lat.p99 || 0) +
            SUMMARY_MS_SUFFIX + '\n',
          );
        }
      }

      const delta = std.deltaVsPrevious;
      const prev = std.previousSimilarRun;
      if (prev) {
        const statusPart = delta.passedChanged ?
          SUMMARY_PREV_PASS_CHANGED : SUMMARY_PREV_SAME;
        const opsDelta = formatSignedDelta(
          delta.opsPerSec,
          SUMMARY_OPS_PER_SEC_SUFFIX,
        );
        const p99Delta = formatSignedDelta(
          delta.p99LatencyMs,
          SUMMARY_MS_SUFFIX,
        );
        lines.push(
          SUMMARY_LABEL_VS_PREV + statusPart +
          SUMMARY_PREV_OPS_PREFIX + opsDelta +
          SUMMARY_PREV_P99_PREFIX + p99Delta + '\n',
        );
      } else {
        lines.push(SUMMARY_NO_PREV);
      }

      const pg = std.postgresBaseline;
      if (pg && pg.throughputRatioSutToBaseline !== null) {
        const ratio = pg.throughputRatioSutToBaseline
          .toFixed(SUMMARY_FIXED_DECIMALS_RATIO);
        const sutOps = pg.sutOpsPerSec !== null ?
          pg.sutOpsPerSec.toFixed(SUMMARY_FIXED_DECIMALS_OPS) : '?';
        const pgOps = pg.baselineTps !== null ?
          pg.baselineTps.toFixed(SUMMARY_FIXED_DECIMALS_OPS) : '?';
        lines.push(
          SUMMARY_LABEL_PG_BASE +
          SUMMARY_PG_THROUGHPUT_PREFIX + ratio +
          SUMMARY_PG_THROUGHPUT_SUFFIX +
          SUMMARY_PG_SUT_PREFIX + sutOps +
          SUMMARY_PG_BASELINE_PREFIX + pgOps +
          SUMMARY_OPS_PER_SEC_SUFFIX +
          SUMMARY_PG_CLOSE_PAREN + '\n',
        );
      } else {
        lines.push(SUMMARY_NO_PG);
      }
    }

    lines.push('\n' + SUMMARY_FOOTER);
    return lines.join('');
  }

  /**
   * Main entry point. Parses args, loads config, discovers
   * scenarios, runs them, writes report, and exits.
   */

  return {
    dockerActionLine,
    formatDockerOperationEvent,
    createDockerOperationSink,
    extractBuildProgressLine,
    extractScenarioFailurePartialResult,
    mergeFailedScenarioDetails,
    runScenarios,
    shouldPrintLiveLogEntry,
    normalizeScenarioPayload,
    evaluateTraceAssertions,
    resolveScenarioAssertionPolicy,
    resolveBenchmarkGateConfig,
    buildHistoricalBaselineIndex,
    resolveScenarioMemoryLeakConfig,
    collectPlaybackWarningMessages,
    evaluateScenarioCleanlinessAssertions,
    evaluateMemoryLeakAssertions,
    formatLiveLogEntry,
    parseEmbeddedLogPayload,
    normalizeSeverity,
    severityLabel,
    sanitizeMessage,
    hasProblemPattern,
    loadScenarioModule,
    formatSignedDelta,
    formatRunSummary,
  };
}

export {createDistributedRunRuntimeBundle};
