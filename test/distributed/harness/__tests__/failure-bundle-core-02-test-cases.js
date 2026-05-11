export function registerFailureBundleCore02Tests(context) {
  const {
    it,
    assert,
    buildConvergenceDiagnosticsOnlyScenario,
    buildLoadLaneTimeoutFailureScenario,
    buildNoProgressFailureScenario,
    buildStartupSeedContactLogLine,
    ENTRYPOINT_LOG_MSG,
    FAILURE_CLASS_PUBLICATION_CONVERGENCE_BLOCKED,
    FAILURE_CLASS_STARTUP_RECOVERY_BLOCKED,
    FAILURE_CLASS_TOPOLOGY_UNSTABLE,
    join,
    JOINING_LOG_MSG,
    JOINING_PHASE,
    mkdir,
    PRIORITY_RECOVERY_PROGRESS_REASON_FALLBACK,
    readFile,
    ReportWriter,
    resolve,
    ROOT_CAUSE_CLASS_STARTUP,
    ROOT_CAUSE_CLASS_TOPOLOGY,
    STARTUP_JOIN_MODE,
    STARTUP_SEED_CONTACT_ATTEMPT,
    STARTUP_SEED_CONTACT_AUTO_DECISION_TIME,
    STARTUP_SEED_CONTACT_AUTO_MODE,
    STARTUP_SEED_CONTACT_AUTO_SOURCE,
    STARTUP_SEED_CONTACT_AUTO_STATE,
    STARTUP_SEED_CONTACT_BOOTSTRAP_REASON,
    STARTUP_SEED_CONTACT_CLASS_SIGNAL,
    STARTUP_SEED_CONTACT_FAILURE_DURATION_MS,
    STARTUP_SEED_CONTACT_FAILURE_ERROR,
    STARTUP_SEED_CONTACT_FAILURE_TIME,
    STARTUP_SEED_CONTACT_FOLLOWUP_DECISION_TIME,
    STARTUP_SEED_CONTACT_JOIN_DECISION_TIME,
    STARTUP_SEED_CONTACT_JOIN_SESSION_ID,
    STARTUP_SEED_CONTACT_MAX_ATTEMPTS,
    STARTUP_SEED_CONTACT_NODE_ADDRESS,
    STARTUP_SEED_CONTACT_NODE_ID,
    STARTUP_SEED_CONTACT_PEER_ADDRESS_STATE,
    STARTUP_SEED_CONTACT_PHASE_SIGNAL,
    STARTUP_SEED_CONTACT_REASON,
    STARTUP_SEED_CONTACT_RESUME_TIME,
    STARTUP_SEED_CONTACT_RETRY_AFTER_MS,
    STARTUP_SEED_CONTACT_RETRY_SIGNAL,
    STARTUP_SEED_CONTACT_SCENARIO,
    STARTUP_SEED_CONTACT_SEED_ADDRESS,
    UTF8_ENCODING,
    writeFailureBundlesForReport,
    writeFile,
  } = context;
  let tempDir;
  let outputDir;
  let reportPath;
  const refreshState = () => {
    tempDir = context.state.tempDir;
    outputDir = context.state.outputDir;
    reportPath = context.state.reportPath;
  };

  it('keeps final explicit-seed startup decision and seed-contact retry evidence',
    async () => {
      refreshState();
      const scenarioDir = join(outputDir, STARTUP_SEED_CONTACT_SCENARIO);
      await mkdir(scenarioDir, {recursive: true});
      await writeFile(
        join(scenarioDir, STARTUP_SEED_CONTACT_NODE_ID + '.log'),
        [
          buildStartupSeedContactLogLine(
            STARTUP_SEED_CONTACT_AUTO_DECISION_TIME,
            {
              level: 30,
              time: STARTUP_SEED_CONTACT_AUTO_DECISION_TIME,
              nodeId: STARTUP_SEED_CONTACT_NODE_ID,
              nodeAddress: STARTUP_SEED_CONTACT_NODE_ADDRESS,
              explicitSeedNodeAddress: STARTUP_SEED_CONTACT_SEED_ADDRESS,
              state: STARTUP_SEED_CONTACT_AUTO_STATE,
              mode: STARTUP_SEED_CONTACT_AUTO_MODE,
              source: STARTUP_SEED_CONTACT_AUTO_SOURCE,
              startupMode: STARTUP_JOIN_MODE.SEED,
              peerAddressState: STARTUP_SEED_CONTACT_PEER_ADDRESS_STATE,
              peerAddress: null,
              durableStateDetected: false,
              identityMismatch: false,
              msg: ENTRYPOINT_LOG_MSG.AUTO_REJOIN_DECISION,
            },
          ),
          buildStartupSeedContactLogLine(
            STARTUP_SEED_CONTACT_JOIN_DECISION_TIME,
            {
              level: 30,
              time: STARTUP_SEED_CONTACT_JOIN_DECISION_TIME,
              nodeId: STARTUP_SEED_CONTACT_NODE_ID,
              seedNodeAddress: STARTUP_SEED_CONTACT_SEED_ADDRESS,
              startupMode: STARTUP_JOIN_MODE.FRESH_JOIN,
              msg: ENTRYPOINT_LOG_MSG.JOINING_CLUSTER,
            },
          ),
          buildStartupSeedContactLogLine(
            STARTUP_SEED_CONTACT_FAILURE_TIME,
            {
              level: 50,
              time: STARTUP_SEED_CONTACT_FAILURE_TIME,
              nodeId: STARTUP_SEED_CONTACT_NODE_ID,
              state: STARTUP_SEED_CONTACT_AUTO_MODE,
              phase: JOINING_PHASE.CONTACTING_SEED,
              duration: STARTUP_SEED_CONTACT_FAILURE_DURATION_MS,
              error: STARTUP_SEED_CONTACT_FAILURE_ERROR,
              msg: JOINING_LOG_MSG.PHASE_FAILED,
            },
          ),
          buildStartupSeedContactLogLine(
            STARTUP_SEED_CONTACT_RESUME_TIME,
            {
              level: 40,
              time: STARTUP_SEED_CONTACT_RESUME_TIME,
              nodeId: STARTUP_SEED_CONTACT_NODE_ID,
              joinSessionId: STARTUP_SEED_CONTACT_JOIN_SESSION_ID,
              attempt: STARTUP_SEED_CONTACT_ATTEMPT,
              maxAttempts: STARTUP_SEED_CONTACT_MAX_ATTEMPTS,
              retryAfterMs: STARTUP_SEED_CONTACT_RETRY_AFTER_MS,
              phase: JOINING_PHASE.CONTACTING_SEED,
              error: STARTUP_SEED_CONTACT_FAILURE_ERROR,
              msg: JOINING_LOG_MSG.RETRYABLE_FAILURE_RESUMING,
            },
          ),
        ].join('\n') + '\n',
      );

      const scenario = {
        scenario: STARTUP_SEED_CONTACT_SCENARIO,
        passed: false,
        error: STARTUP_SEED_CONTACT_FAILURE_ERROR,
        details: {
          diagnostics: {
            failure: {
              rootCauseClass: ROOT_CAUSE_CLASS_STARTUP,
              dominantReason: STARTUP_SEED_CONTACT_BOOTSTRAP_REASON,
            },
          },
        },
      };

      await writeFailureBundlesForReport({
        scenarios: [scenario],
        reportOutputPath: reportPath,
        outputDir,
        reportSummary: {total: 1, fail: 1, pass: 0},
        standardSummary: {scenarios: []},
        benchmarkRegressionGate: {status: 'skipped'},
        workspaceRoot: tempDir,
      });

      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenario.failureBundle.jsonPath),
          UTF8_ENCODING,
        ),
      );
      const decisionArtifacts =
        scenarioBundle.decisionArtifactsByNodeId[
          STARTUP_SEED_CONTACT_NODE_ID
        ];
      assert.equal(
        decisionArtifacts.latestStartupDecision.startupMode,
        STARTUP_JOIN_MODE.FRESH_JOIN,
      );
      assert.equal(
        decisionArtifacts.latestStartupDecision.seedNodeAddress,
        STARTUP_SEED_CONTACT_SEED_ADDRESS,
      );
      assert.equal(
        decisionArtifacts.latestRetryableJoinResume.phase,
        JOINING_PHASE.CONTACTING_SEED,
      );
      assert.equal(
        scenarioBundle.summary.failureClassification.dominantReason,
        STARTUP_SEED_CONTACT_REASON,
      );
      assert.equal(
        scenarioBundle.summary.failureClassification.signals.includes(
          STARTUP_SEED_CONTACT_CLASS_SIGNAL,
        ),
        true,
      );
      assert.equal(
        scenarioBundle.summary.failureClassification.signals.includes(
          STARTUP_SEED_CONTACT_PHASE_SIGNAL,
        ),
        true,
      );
      assert.equal(
        scenarioBundle.summary.failureClassification.signals.includes(
          STARTUP_SEED_CONTACT_RETRY_SIGNAL,
        ),
        true,
      );
    });

  it(
    'ignores stale seed-contact retry artifacts before the current startup decision',
    async () => {
      refreshState();
      const scenarioDir = join(outputDir, STARTUP_SEED_CONTACT_SCENARIO);
      await mkdir(scenarioDir, {recursive: true});
      await writeFile(
        join(scenarioDir, STARTUP_SEED_CONTACT_NODE_ID + '.log'),
        [
          buildStartupSeedContactLogLine(
            STARTUP_SEED_CONTACT_FAILURE_TIME,
            {
              level: 50,
              time: STARTUP_SEED_CONTACT_FAILURE_TIME,
              nodeId: STARTUP_SEED_CONTACT_NODE_ID,
              state: STARTUP_SEED_CONTACT_AUTO_MODE,
              phase: JOINING_PHASE.CONTACTING_SEED,
              duration: STARTUP_SEED_CONTACT_FAILURE_DURATION_MS,
              error: STARTUP_SEED_CONTACT_FAILURE_ERROR,
              msg: JOINING_LOG_MSG.PHASE_FAILED,
            },
          ),
          buildStartupSeedContactLogLine(
            STARTUP_SEED_CONTACT_RESUME_TIME,
            {
              level: 40,
              time: STARTUP_SEED_CONTACT_RESUME_TIME,
              nodeId: STARTUP_SEED_CONTACT_NODE_ID,
              joinSessionId: STARTUP_SEED_CONTACT_JOIN_SESSION_ID,
              attempt: STARTUP_SEED_CONTACT_ATTEMPT,
              maxAttempts: STARTUP_SEED_CONTACT_MAX_ATTEMPTS,
              retryAfterMs: STARTUP_SEED_CONTACT_RETRY_AFTER_MS,
              phase: JOINING_PHASE.CONTACTING_SEED,
              error: STARTUP_SEED_CONTACT_FAILURE_ERROR,
              msg: JOINING_LOG_MSG.RETRYABLE_FAILURE_RESUMING,
            },
          ),
          buildStartupSeedContactLogLine(
            STARTUP_SEED_CONTACT_FOLLOWUP_DECISION_TIME,
            {
              level: 30,
              time: STARTUP_SEED_CONTACT_FOLLOWUP_DECISION_TIME,
              nodeId: STARTUP_SEED_CONTACT_NODE_ID,
              seedNodeAddress: STARTUP_SEED_CONTACT_SEED_ADDRESS,
              startupMode: STARTUP_JOIN_MODE.FRESH_JOIN,
              msg: ENTRYPOINT_LOG_MSG.JOINING_CLUSTER,
            },
          ),
        ].join('\n') + '\n',
      );

      const scenario = {
        scenario: STARTUP_SEED_CONTACT_SCENARIO,
        passed: false,
        error: STARTUP_SEED_CONTACT_FAILURE_ERROR,
        details: {
          diagnostics: {
            failure: {
              rootCauseClass: ROOT_CAUSE_CLASS_TOPOLOGY,
              dominantReason: PRIORITY_RECOVERY_PROGRESS_REASON_FALLBACK,
            },
          },
        },
      };

      await writeFailureBundlesForReport({
        scenarios: [scenario],
        reportOutputPath: reportPath,
        outputDir,
        reportSummary: {total: 1, fail: 1, pass: 0},
        standardSummary: {scenarios: []},
        benchmarkRegressionGate: {status: 'skipped'},
        workspaceRoot: tempDir,
      });

      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenario.failureBundle.jsonPath),
          UTF8_ENCODING,
        ),
      );
      const decisionArtifacts =
        scenarioBundle.decisionArtifactsByNodeId[
          STARTUP_SEED_CONTACT_NODE_ID
        ];

      assert.equal(
        decisionArtifacts.latestStartupDecision.startupMode,
        STARTUP_JOIN_MODE.FRESH_JOIN,
      );
      assert.equal(decisionArtifacts.latestStartupFailure, null);
      assert.equal(decisionArtifacts.latestRetryableJoinResume, null);
      assert.deepEqual(decisionArtifacts.startupFailures, []);
      assert.deepEqual(decisionArtifacts.retryableJoinResumes, []);
      assert.equal(
        scenarioBundle.summary.failureClassification.failureClass,
        FAILURE_CLASS_TOPOLOGY_UNSTABLE,
      );
    },
  );

  it('writes no-progress diagnostics into failure bundles', async () => {
    refreshState();
    const scenarioDir = join(outputDir, 'postgres-baseline-comparison');
    await mkdir(scenarioDir, {recursive: true});
    await writeFile(join(scenarioDir, 'seed-1.log'), 'progress stalled\n');

    const scenario = buildNoProgressFailureScenario();
    const failureBundle = await writeFailureBundlesForReport({
      scenarios: [scenario],
      reportOutputPath: reportPath,
      outputDir,
      reportSummary: {total: 1, fail: 1, pass: 0},
      standardSummary: {scenarios: []},
      benchmarkRegressionGate: {status: 'skipped'},
      workspaceRoot: tempDir,
    });

    const scenarioBundle = JSON.parse(
      await readFile(resolve(tempDir, scenario.failureBundle.jsonPath), UTF8_ENCODING),
    );
    assert.equal(scenarioBundle.diagnostics.noProgress.reasonCode, 'stalled_no_progress');
    assert.equal(
      scenarioBundle.diagnostics.noProgress.failedNoProgress.details.budgetMs,
      20,
    );

    const markdown = await readFile(
      resolve(tempDir, scenario.failureBundle.markdownPath),
      UTF8_ENCODING,
    );
    assert.match(markdown, /## No Progress/);
    assert.equal(failureBundle.scenarioBundles.length, 1);
  });

  it('removes stale scenario and run failure artifacts when a later rerun passes',
    async () => {
      refreshState();
      const scenarioName = 'postgres-baseline-comparison';
      const scenarioDir = join(outputDir, scenarioName);
      const runBundleDir = join(outputDir, 'failure-bundles');
      await mkdir(scenarioDir, {recursive: true});
      await mkdir(runBundleDir, {recursive: true});
      await writeFile(join(scenarioDir, 'node-1.log'), 'retained log\n');
      await writeFile(
        join(scenarioDir, 'failure-bundle.json'),
        '{"stale":true}\n',
      );
      await writeFile(
        join(scenarioDir, 'failure-bundle.md'),
        'stale failure bundle\n',
      );
      await writeFile(
        join(scenarioDir, 'triage-summary.json'),
        '{"stale":true}\n',
      );
      await writeFile(
        join(scenarioDir, 'triage-summary.md'),
        'stale triage summary\n',
      );
      await writeFile(
        join(runBundleDir, 'run-failure-bundle.json'),
        '{"stale":true}\n',
      );
      await writeFile(
        join(runBundleDir, 'run-failure-bundle.md'),
        'stale run failure bundle\n',
      );

      const passingScenario = {
        scenario: scenarioName,
        passed: true,
        failureBundle: {
          jsonPath: 'artifacts/postgres-baseline-comparison/failure-bundle.json',
        },
      };

      const failureBundle = await writeFailureBundlesForReport({
        scenarios: [passingScenario],
        reportOutputPath: reportPath,
        outputDir,
        reportSummary: {total: 1, fail: 0, pass: 1},
        standardSummary: {scenarios: []},
        benchmarkRegressionGate: {status: 'skipped'},
        workspaceRoot: tempDir,
      });

      assert.equal(failureBundle.runBundle, null);
      assert.equal(failureBundle.scenarioBundles.length, 0);
      assert.equal(
        Object.hasOwn(passingScenario, 'failureBundle'),
        false,
        'passing reruns should clear stale failure-bundle links from the scenario entry',
      );
      assert.equal(
        await readFile(join(scenarioDir, 'node-1.log'), UTF8_ENCODING),
        'retained log\n',
        'passing reruns should preserve non-failure artifacts in the scenario directory',
      );
      await assert.rejects(
        readFile(join(scenarioDir, 'failure-bundle.json'), UTF8_ENCODING),
        {code: 'ENOENT'},
      );
      await assert.rejects(
        readFile(join(scenarioDir, 'failure-bundle.md'), UTF8_ENCODING),
        {code: 'ENOENT'},
      );
      await assert.rejects(
        readFile(join(scenarioDir, 'triage-summary.json'), UTF8_ENCODING),
        {code: 'ENOENT'},
      );
      await assert.rejects(
        readFile(join(scenarioDir, 'triage-summary.md'), UTF8_ENCODING),
        {code: 'ENOENT'},
      );
      await assert.rejects(
        readFile(join(runBundleDir, 'run-failure-bundle.json'), UTF8_ENCODING),
        {code: 'ENOENT'},
      );
      await assert.rejects(
        readFile(join(runBundleDir, 'run-failure-bundle.md'), UTF8_ENCODING),
        {code: 'ENOENT'},
      );
    },
  );

  it('captures load-lane timeout and circuit-open verify failures as targeted diagnostics',
    async () => {
      refreshState();
      const scenarioDir = join(
        outputDir,
        'seven-node-postgres-baseline-partition-split',
      );
      await mkdir(scenarioDir, {recursive: true});
      await writeFile(
        join(
          scenarioDir,
          '11601fe0-72d6-5853-8590-ec2881853e72.log',
        ),
        'load lane timeout\n',
      );

      const scenario = buildLoadLaneTimeoutFailureScenario();
      await writeFailureBundlesForReport({
        scenarios: [scenario],
        reportOutputPath: reportPath,
        outputDir,
        reportSummary: {total: 1, fail: 1, pass: 0},
        standardSummary: {scenarios: []},
        benchmarkRegressionGate: {status: 'skipped'},
        workspaceRoot: tempDir,
      });

      const scenarioBundle = JSON.parse(
        await readFile(resolve(tempDir, scenario.failureBundle.jsonPath), UTF8_ENCODING),
      );
      const nodeId = '11601fe0-72d6-5853-8590-ec2881853e72';

      assert.equal(scenarioBundle.summary.phase, 'verify');
      assert.equal(
        scenarioBundle.summary.rootCauseClass,
        'load',
      );
      assert.equal(
        scenarioBundle.topFailures.topReasons[0].reason,
        'load run completed with failed operations',
      );
      assert.equal(
        scenarioBundle.nodeDiagnostics[nodeId].loadMetrics.attemptErrors,
        73,
      );
      assert.equal(
        scenarioBundle.nodeDiagnostics[nodeId].errors.some((entry) =>
          entry.includes('timeoutClass=timeout'),
        ),
        true,
      );
      assert.equal(
        scenarioBundle.nodeDiagnostics[nodeId].errors.some((entry) =>
          entry.includes('circuit breaker is open'),
        ),
        true,
      );
      assert.equal(
        scenarioBundle.nodeDiagnostics[nodeId].adminQueryTrace[0].timeoutClass,
        'timeout',
      );
      assert.equal(
        scenarioBundle.nodeDiagnostics[nodeId].adminQueryTrace[1].errorCode,
        'circuit_open',
      );
      assert.equal(
        scenarioBundle.controlPlane,
        null,
        'load-lane verify failures should remain diagnosable even without snapshotsByNodeId',
      );

      const markdown = await readFile(
        resolve(tempDir, scenario.failureBundle.markdownPath),
        UTF8_ENCODING,
      );
      assert.match(markdown, /operation=queryLoad/);
      assert.match(markdown, /timeoutClass=timeout/);
      assert.match(markdown, /circuit breaker is open/);
    });

  it('maps direct convergence diagnostics into control-plane bundle fields',
    async () => {
      refreshState();
      const scenarioDir = join(outputDir, 'rolling-restart');
      await mkdir(scenarioDir, {recursive: true});
      await writeFile(join(scenarioDir, 'seed-1.log'), 'convergence timeout\n');

      const scenario = buildConvergenceDiagnosticsOnlyScenario();
      await writeFailureBundlesForReport({
        scenarios: [scenario],
        reportOutputPath: reportPath,
        outputDir,
        reportSummary: {total: 1, fail: 1, pass: 0},
        standardSummary: {scenarios: []},
        benchmarkRegressionGate: {status: 'skipped'},
        workspaceRoot: tempDir,
      });

      const scenarioBundle = JSON.parse(
        await readFile(resolve(tempDir, scenario.failureBundle.jsonPath), UTF8_ENCODING),
      );
      assert.equal(
        scenarioBundle.controlPlane.publicationConvergence.publicationStatus,
        'ack_pending',
      );
      assert.equal(
        scenarioBundle.controlPlane.publicationModeByNodeId['seed-1'].currentMode,
        'recovering',
      );
      assert.equal(
        scenarioBundle.publicationConvergence.pendingAckCount,
        1,
      );
      assert.equal(
        scenarioBundle.publicationConvergence.recoveryProtocolState,
        'publication_pending',
      );
      assert.deepEqual(
        scenarioBundle.publicationConvergence.priorityRecoveryReasonCodes,
        ['priority_partitions_not_spread', 'publication_epoch_pending'],
      );
      assert.equal(
        scenarioBundle.summary.failureClassification.failureClass,
        'publication_convergence_blocked',
      );
      assert.equal(
        scenarioBundle.summary.failureClassification.signals.includes(
          'recoveryProtocolState=publication_pending',
        ),
        true,
      );
      assert.equal(
        scenarioBundle.recoveryReadiness.pendingAckRepairEligibleNodeIds[0],
        'joiner-1',
      );
      assert.equal(
        scenarioBundle.nodeDiagnostics['joiner-1'].readiness.reasons[0].code,
        'control_plane_publication_pending',
      );
    });

  it('treats closed publication closure records and benign startup readiness as non-blocking',
    async () => {
      refreshState();
      const scenarioDir = join(outputDir, 'node-join-under-load');
      await mkdir(scenarioDir, {recursive: true});
      await writeFile(join(scenarioDir, 'seed-1.log'), 'load completed\n');

      const writer = new ReportWriter(reportPath);
      writer.addResult('node-join-under-load', {
        passed: false,
        duration: 100,
        error: 'load completed with admission backoff',
        loadMetrics: {
          total: 12,
          success: 12,
          failed: 0,
          errors: 0,
          attemptErrors: 4,
          latency: {p50: 10, p95: 50, p99: 75},
          opsPerSec: 4,
          waitReasons: {
            nodeAdmissionBlocked: 4,
          },
        },
        details: {
          diagnostics: {
            controlPlaneDiagnostics: {
              publicationConvergence: {
                publicationEpoch: 6,
                publicationStatus: 'PUBLISHED',
                pendingAckNodeIds: [],
                pendingAckCount: 0,
                blockedNodeIds: [],
                blockedNodeCount: 0,
                publishedActiveNodeIds: ['seed-1', 'joiner-1'],
                recoveryProtocolState: 'steady_published',
                priorityRecoveryReasonCodes: [],
                publicationPending: false,
                prioritySpreadPending: false,
                closureRecordId: 'CL-003',
                closureWitnessClass:
                  'publication_converged_priority_spread_pending',
                priorityRecoveryProgressClassCount: 0,
                priorityRecoveryInvariantFailingIds: [],
              },
              activeGate: {
                mode: 'startup',
                state: 'waiting',
                attemptsSinceProgress: 1,
                readinessDelay: {
                  timedOut: false,
                  cause: 'none',
                  source: null,
                  recoverability: null,
                  error: null,
                },
              },
            },
          },
        },
      });

      const {scenarioBundles, runBundle} = await writeFailureBundlesForReport({
        scenarios: writer.scenarios,
        reportOutputPath: reportPath,
        outputDir,
        reportSummary: {total: 1, fail: 1, pass: 0},
        standardSummary: {scenarios: []},
        benchmarkRegressionGate: {status: 'skipped'},
        workspaceRoot: tempDir,
      });
      await writer.write({failureBundle: runBundle});

      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );
      assert.equal(
        scenarioBundle.summary.failureClassification.failureClass,
        'load_pressure',
      );
      assert.equal(
        scenarioBundle.summary.stabilityGates.convergence.status,
        'closed',
      );
      assert.deepEqual(
        scenarioBundle.summary.stabilityGates.convergence.blockers,
        [],
      );
      assert.equal(
        scenarioBundle.summary.stabilityGates.failover.status,
        'closed',
      );
      assert.equal(
        scenarioBundle.summary.readinessFailure?.mode,
        'startup',
      );
      assert.equal(
        scenarioBundle.summary.readinessFailure?.cause,
        'none',
      );

      const triageSummary = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.triageJsonPath),
          UTF8_ENCODING,
        ),
      );
      assert.equal(triageSummary.summary.failureClass, 'load_pressure');

      const reportJson = JSON.parse(
        await readFile(reportPath, UTF8_ENCODING),
      );
      assert.equal(
        reportJson.scenarios[0].dominantReason,
        'nodeAdmissionBlocked',
      );
      assert.equal(
        reportJson.scenarios[0].rootCauseClass,
        'load',
      );
      assert.equal(
        reportJson.scenarios[0].failureClassification.failureClass,
        'load_pressure',
      );
    });

  it('classifies final leader mismatches after closed active readiness',
    async () => {
      refreshState();
      const CLOSED_CLOSURE_TIMEOUT_REPORT_PATH = join(
        tempDir,
        'closed-closure-timeout-report.json',
      );
      const SCENARIO_NAME = 'rolling-restart';
      const LEADER_MISMATCH_ERROR = 'Leader identities disagree';
      const LEADER_MISMATCH_REASON = 'leader_identities_disagree';
      const ROOT_CAUSE_CLASS_STARTUP = 'startup';
      const READINESS_TIMEOUT_REASON =
        'readiness_probe_timeout_fallback=Node readiness probe timed out for seed-1';
      const PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
      const RECOVERY_PROTOCOL_STATE_STEADY = 'steady_published';
      const CLOSURE_RECORD_ID = 'CL-003';
      const CLOSURE_WITNESS_CLASS =
        'publication_converged_priority_spread_pending';
      const STARTUP_READINESS_MODE = 'startup';
      const SNAPSHOT_REACHABILITY_TIMEOUT =
        'snapshot_reachability_timeout';
      const SNAPSHOT_REACHABILITY_SOURCE =
        'selectedSnapshotReachabilityError';
      const TERMINAL_RECOVERABILITY = 'terminal';
      const SNAPSHOT_REACHABILITY_ERROR =
        'Control snapshot reachability probe timed out for seed-1';
      const PUBLICATION_EPOCH = 5;
      const SCENARIO_DURATION_MS = 100;
      const EXPECTED_NODE_COUNT = 5;
      const ACTIVE_NODE_COUNT = 5;
      const SNAPSHOT_COVERAGE_NODE_COUNT = 5;
      const EMPTY_COUNT = 0;
      const SINGLE_COUNT = 1;
      const writer = new ReportWriter(CLOSED_CLOSURE_TIMEOUT_REPORT_PATH);
      writer.addResult(SCENARIO_NAME, {
        passed: false,
        duration: SCENARIO_DURATION_MS,
        error: LEADER_MISMATCH_ERROR,
        details: {
          diagnostics: {
            failure: {
              rootCauseClass: ROOT_CAUSE_CLASS_STARTUP,
              dominantReason: READINESS_TIMEOUT_REASON,
              reasonCounts: {
                [READINESS_TIMEOUT_REASON]: SINGLE_COUNT,
              },
            },
            controlPlaneDiagnostics: {
              mismatch: {
                reasonCode: LEADER_MISMATCH_REASON,
              },
              publicationConvergence: {
                publicationEpoch: PUBLICATION_EPOCH,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                pendingAckNodeIds: [],
                pendingAckCount: EMPTY_COUNT,
                blockedNodeIds: [],
                blockedNodeCount: EMPTY_COUNT,
                publicationPending: false,
                prioritySpreadPending: false,
                publishedActiveNodeIds: [],
                recoveryProtocolState: RECOVERY_PROTOCOL_STATE_STEADY,
                priorityRecoveryReasonCodes: [],
                closureRecordId: CLOSURE_RECORD_ID,
                closureWitnessClass: CLOSURE_WITNESS_CLASS,
                priorityRecoveryProgressClassCount: EMPTY_COUNT,
                priorityRecoveryInvariantFailingIds: [],
              },
              activeGateProgress: {
                expectedNodeCount: EXPECTED_NODE_COUNT,
                activeNodeCount: ACTIVE_NODE_COUNT,
                inactiveNodeCount: EMPTY_COUNT,
                snapshotCoverageNodeCount: SNAPSHOT_COVERAGE_NODE_COUNT,
                snapshotCoverageComplete: true,
                publicationStatus: PUBLICATION_STATUS_PUBLISHED,
                recoveryProtocolState: RECOVERY_PROTOCOL_STATE_STEADY,
                pendingAckCount: EMPTY_COUNT,
                missingPublishedCount: EMPTY_COUNT,
                gateReasonCount: EMPTY_COUNT,
                gateReasons: [],
                prioritySpreadSatisfied: true,
                priorityRecoveryProgressClasses: {
                  unresolvedClassIds: [],
                  unresolvedClassCount: EMPTY_COUNT,
                  unresolvedSemanticStateIds: [],
                  unresolvedSemanticStateCount: EMPTY_COUNT,
                  blockedPartitionIds: [],
                  blockedPartitionCount: EMPTY_COUNT,
                },
                closureRecordId: CLOSURE_RECORD_ID,
                closureWitnessClass: CLOSURE_WITNESS_CLASS,
                readinessDelay: {
                  timedOut: true,
                  cause: SNAPSHOT_REACHABILITY_TIMEOUT,
                  source: SNAPSHOT_REACHABILITY_SOURCE,
                  recoverability: TERMINAL_RECOVERABILITY,
                  error: SNAPSHOT_REACHABILITY_ERROR,
                },
              },
              activeGate: {
                mode: STARTUP_READINESS_MODE,
                state: 'ready',
                attemptsSinceProgress: SINGLE_COUNT,
                readinessDelay: {
                  timedOut: true,
                  cause: SNAPSHOT_REACHABILITY_TIMEOUT,
                  source: SNAPSHOT_REACHABILITY_SOURCE,
                  recoverability: TERMINAL_RECOVERABILITY,
                  error: SNAPSHOT_REACHABILITY_ERROR,
                },
              },
            },
          },
        },
      });
      await writer.write();

      const {scenarioBundles} = await writeFailureBundlesForReport({
        scenarios: JSON.parse(
          await readFile(
            CLOSED_CLOSURE_TIMEOUT_REPORT_PATH,
            UTF8_ENCODING,
          ),
        ).scenarios,
        reportOutputPath: CLOSED_CLOSURE_TIMEOUT_REPORT_PATH,
        outputDir,
        workspaceRoot: tempDir,
      });
      const scenarioBundle = JSON.parse(
        await readFile(
          resolve(tempDir, scenarioBundles[0].links.jsonPath),
          UTF8_ENCODING,
        ),
      );

      assert.equal(
        scenarioBundle.summary.failureClassification.failureClass,
        FAILURE_CLASS_TOPOLOGY_UNSTABLE,
      );
      assert.equal(
        scenarioBundle.summary.failureClassification.dominantReason,
        LEADER_MISMATCH_REASON,
      );
      assert.notEqual(
        scenarioBundle.summary.failureClassification.failureClass,
        FAILURE_CLASS_PUBLICATION_CONVERGENCE_BLOCKED,
      );
      assert.notEqual(
        scenarioBundle.summary.failureClassification.failureClass,
        FAILURE_CLASS_STARTUP_RECOVERY_BLOCKED,
      );
      assert.equal(
        scenarioBundle.summary.stabilityGates.convergence.status,
        'closed',
      );
      assert.deepEqual(
        scenarioBundle.summary.stabilityGates.convergence.blockers,
        [],
      );
    });
}
