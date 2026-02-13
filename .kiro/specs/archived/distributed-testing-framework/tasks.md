# Implementation Plan: Distributed Testing Framework

## Overview

Build a Docker-based distributed testing framework in `test/distributed/` that provides cluster lifecycle management, chaos primitives, load generation, convergence assertions, and a CLI runner. Implementation proceeds bottom-up: Docker provider → cluster abstraction → chaos/load/assertions → scenarios → CLI runner.

## Tasks

- [x] 1. Set up project structure and constants
  - Create `test/distributed/` directory structure: `harness/`, `scenarios/`, `config/`, `harness/__tests__/`, `harness/__integration__/`
  - Create `test/distributed/harness/constants.js` with all framework constants (ports, timeouts, labels, defaults)
  - Create `Dockerfile` at project root for building the node image (Node.js 22 base, copy source, install deps, entrypoint `node src/index.js`)
  - _Requirements: 10.2, 11.5_

- [x] 2. Implement Docker Provider
  - [x] 2.1 Implement `test/distributed/harness/docker-provider.js`
    - Wrap `dockerode` for container lifecycle: createNetwork, createContainer, stopContainer, killContainer, pauseContainer, unpauseContainer, restartContainer, removeContainer
    - Implement execInContainer, getContainerLogs, streamContainerLogs
    - Implement network operations: disconnectFromNetwork, connectToNetwork, removeNetwork
    - Implement listContainers with label filtering and inspectContainer
    - Support both local (socketPath) and remote (host TCP) Docker daemon connections
    - Implement buildImage for building the node Docker image with tag support
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 10.1, 10.3, 10.4_

  - [x] 2.2 Write property test for container environment configuration
    - **Property 2: Container Environment Configuration**
    - **Validates: Requirements 1.2, 3.2**

  - [x] 2.3 Write unit tests for Docker Provider
    - Test container creation with correct env vars
    - Test error handling for container start timeout (Req 1.4)
    - Test container removal and cleanup (Req 1.5)
    - Test build image error reporting (Req 10.4)
    - _Requirements: 1.4, 1.5, 10.4_

- [x] 3. Implement Configuration Parser
  - [x] 3.1 Implement `test/distributed/harness/config-parser.js`
    - Parse JSON configuration files into validated config objects
    - Merge partial configs with sensible defaults from constants
    - Support local, gcp-small, gcp-large profiles
    - _Requirements: 11.1, 11.5_

  - [x] 3.2 Create configuration files
    - Create `test/distributed/config/local.json` (5-node local, Docker socket path)
    - Create `test/distributed/config/gcp-small.json` (10-20 node GCP)
    - Create `test/distributed/config/gcp-large.json` (50+ node GCP, multiple VMs, nodesPerHost)
    - _Requirements: 11.2, 11.3, 11.4_

  - [x] 3.3 Write property tests for configuration
    - **Property 18: Configuration Defaults**
    - **Validates: Requirements 11.5**
    - **Property 20: Configuration Parsing Round Trip**
    - **Validates: Requirements 11.1**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement Cluster Abstraction
  - [x] 5.1 Implement `test/distributed/harness/cluster.js`
    - Implement `createCluster(config)` factory function
    - Implement Cluster class with start/stop lifecycle
    - Start sequence: create network → start seed → wait for bootstrap API → start joiners sequentially → wait for all ACTIVE
    - Stop sequence: stop all containers → remove containers → remove network
    - Implement getNode, getNodes, randomNonSeed
    - Implement multi-host container distribution (round-robin across docker.hosts respecting nodesPerHost)
    - Implement NodeHandle class with query, getStatus, getLogs, isReachable methods
    - Implement best-effort cleanup using container labels on unexpected exit
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4_

  - [x] 5.2 Write property test for multi-host distribution
    - **Property 5: Multi-Host Container Distribution**
    - **Validates: Requirements 2.3**

  - [x] 5.3 Write unit tests for Cluster
    - Test createCluster returns object with all required methods (Req 2.4)
    - Test local vs remote Docker connection routing (Req 2.2)
    - Test startup failure error reporting with logs (Req 3.4)
    - Test best-effort cleanup via labels (Req 2.6)
    - _Requirements: 2.1, 2.2, 2.4, 2.6, 3.4_

- [x] 6. Implement Chaos Primitives
  - [x] 6.1 Implement `test/distributed/harness/chaos.js`
    - Implement killNode (docker kill), stopNode (docker stop), pauseNode (docker pause), unpauseNode (docker unpause), restartNode (docker restart)
    - Implement partitionNetwork using docker network disconnect/connect with secondary isolation networks
    - Implement healPartition to restore full connectivity
    - Implement slowNetwork using tc qdisc netem exec inside container
    - Implement corruptDisk using exec to corrupt specified file path
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

  - [x] 6.2 Write unit tests for Chaos Primitives
    - Test each primitive delegates to correct Docker Provider method
    - Test partitionNetwork creates correct network topology
    - Test healPartition restores connectivity
    - Test slowNetwork generates correct tc commands
    - _Requirements: 4.1, 4.2, 4.7, 4.8_

- [x] 7. Implement Convergence and Consistency Assertions
  - [x] 7.1 Implement `test/distributed/harness/assertions.js`
    - Implement waitForConvergence: poll Admin API on all reachable nodes, check partition leaders, voter counts, quiet window
    - Reuse SLO pattern from existing `node-join-convergence-slo.integration.test.js` (voter counting, over-target tracking, leader change tracking)
    - Implement assertConsistency: query all nodes, compare active nodes, partition assignments, leader identities
    - Implement assertDataIntegrity: read from multiple replicas, compare results
    - Accept configurable thresholds with defaults from constants
    - Throw descriptive errors on convergence timeout with diagnostic details
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 7.2 Write property test for convergence threshold configuration
    - **Property 9: Convergence Threshold Configuration**
    - **Validates: Requirements 5.2**

  - [x] 7.3 Write unit tests for assertions
    - Test convergence timeout throws descriptive error (Req 5.3)
    - Test custom thresholds override defaults
    - _Requirements: 5.2, 5.3_

- [x] 8. Implement Load Generator
  - [x] 8.1 Implement `test/distributed/harness/load-generator.js`
    - Implement LoadGenerator class: connect to nodes via Admin API WebSocket, drive SQL operations at target rate
    - Implement rate limiting with configurable opsPerSec and duration
    - Implement LoadRun class with waitComplete, getMetrics, cancel
    - Track metrics: total, success, failed, errors, latency percentiles (p50, p95, p99), opsPerSec
    - Implement node failover: on connection drop, retry against other available nodes, record failure
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 8.2 Write property test for load metrics accuracy
    - **Property 11: Load Metrics Accuracy**
    - **Validates: Requirements 6.3**

  - [x] 8.3 Write unit tests for Load Generator
    - Test waitComplete resolves after duration (Req 6.4)
    - Test node failover records failure and retries (Req 6.5)
    - _Requirements: 6.4, 6.5_

- [x] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement Log Collector (Live Query-Based)
  - [x] 10.1 Implement `test/distributed/harness/log-collector.js`
    - Implement `startLiveSubscription(node, filter)`: connect to Admin API WebSocket on a cluster node, subscribe with `LIVE SELECT * FROM logs` (or filtered variant with WHERE clause)
    - Implement `buildSubscriptionQuery(filter)`: construct the subscription SQL string
    - Implement `collectFinalSnapshot(node)`: execute `SELECT * FROM logs ORDER BY timestamp` via Admin API before teardown
    - Implement `collectContainerFallback(dockerProvider, nodes)`: fall back to Docker container stdout/stderr when cluster is unreachable
    - Implement `getBuffer()` and `getTail(n)` for accessing buffered log events
    - Implement `writeOutput(scenarioName, logEntries, nodeIds)`: write per-node logs to `{outputDir}/{scenarioName}/{nodeId}.log` and unified timeline to `{outputDir}/{scenarioName}/_timeline.log`
    - Implement `stopSubscription()` to clean up WebSocket connection
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [x] 10.2 Write property tests for Log Collector
    - **Property 12: Log Output Directory Structure**
    - **Validates: Requirements 7.5**
    - **Property 21: Log Event Buffering Completeness**
    - **Validates: Requirements 7.2**
    - **Property 22: Filtered Subscription Query Construction**
    - **Validates: Requirements 7.3**
    - **Property 23: Buffer Tail Extraction**
    - **Validates: Requirements 7.7**

  - [x] 10.3 Write unit tests for Log Collector
    - Test live subscription connects and buffers events (Req 7.1, 7.2)
    - Test fallback to Docker container logs when cluster unreachable (Req 7.6)
    - Test final snapshot query execution (Req 7.4)
    - _Requirements: 7.1, 7.4, 7.6_

- [x] 10A. Implement Log Analyzer
  - [x] 10A.1 Implement `test/distributed/harness/log-analyzer.js`
    - Implement `runAnalyticalQueries(node)`: execute analytical SQL queries against logs table via Admin API (leader election events, grouped election counts, error summary)
    - Implement `detectSplitBrain(leaderEvents)`: identify two nodes claiming leadership for same partition simultaneously
    - Implement `detectElectionStorms(leaderCounts, partitionCount)`: identify partitions with leader changes exceeding `partitionCount * 4` threshold
    - Implement `detectStuckRebalancing(logEntries)`: identify replica operations not completing within configurable timeout
    - Implement `detectMessageDeliveryFailures(errorEntries)`: identify repeated routing errors to same address
    - Implement `detectCDCDelays(logEntries)`: identify CDC propagation events exceeding configurable threshold
    - Implement `analyze(logEntries, queryResults, partitionCount)`: produce complete analysis with timeline, errors, patterns, and summary
    - Implement `writeAnalysis(scenarioName, analysis)`: write `_timeline.log` and `_analysis.json` to output directory
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8, 13.9_

  - [x] 10A.2 Write property tests for Log Analyzer
    - **Property 24: Analysis Structure Completeness**
    - **Validates: Requirements 13.1, 13.9**
    - **Property 25: Anomaly Pattern Detection**
    - **Validates: Requirements 13.3, 13.4, 13.5, 13.6, 13.7**

  - [x] 10A.3 Write unit tests for Log Analyzer
    - Test split-brain detection with known overlapping leader claims (Req 13.3)
    - Test election storm detection at threshold boundary (Req 13.4)
    - Test stuck rebalancing detection with timed-out operations (Req 13.5)
    - Test analysis JSON output structure matches expected format (Req 13.8, 13.9)
    - _Requirements: 13.3, 13.4, 13.5, 13.8, 13.9_

- [x] 11. Implement Report Writer
  - [x] 11.1 Implement `test/distributed/harness/report-writer.js`
    - Implement addResult to accumulate scenario results
    - Implement write to produce structured JSON report
    - Include per-scenario: name, passed, duration, loadMetrics, convergenceTiming, error, stackTrace
    - Include summary: total, passed, failed, duration
    - Include latency percentiles and throughput when load metrics present
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

  - [x] 11.2 Write property tests for report generation
    - **Property 15: Report Completeness**
    - **Validates: Requirements 9.5, 12.2**
    - **Property 16: Report Summary Accuracy**
    - **Validates: Requirements 12.3**
    - **Property 17: Report Load Metrics Inclusion**
    - **Validates: Requirements 12.4**

- [x] 12. Implement Scenario Discovery and CLI Runner
  - [x] 12.1 Implement scenario discovery in `test/distributed/harness/scenario-discovery.js`
    - Scan `test/distributed/scenarios/` for JS modules exporting `run(cluster)`
    - Support `--scenario` filtering by name
    - _Requirements: 9.1, 9.2_

  - [x] 12.2 Implement CLI runner `test/distributed/run.js`
    - Parse CLI args: `--config`, `--scenario`, `--output`, `--verbose`
    - Load config via config-parser
    - Discover scenarios via scenario-discovery
    - Execute each scenario in isolation: createCluster → run → collectLogs → teardown
    - Catch unhandled errors, mark failed, continue to next scenario
    - Write JSON report via report-writer
    - _Requirements: 9.3, 9.4, 9.5, 9.6, 12.1_

  - [x] 12.3 Write property tests for scenario discovery and filtering
    - **Property 13: Scenario Discovery**
    - **Validates: Requirements 9.1**
    - **Property 14: Scenario Filtering**
    - **Validates: Requirements 9.2**

  - [x] 12.4 Write unit tests for CLI runner
    - Test unhandled scenario error is caught and marked failed (Req 9.6)
    - Test --config flag loads correct file (Req 9.3)
    - _Requirements: 9.3, 9.6_

- [x] 13. Implement GCP Provisioner
  - [x] 13.1 Implement `test/distributed/harness/gcp-provisioner.js`
    - Use Pulumi with `@pulumi/gcp` to provision Compute Engine VMs
    - Configure Docker daemon on VMs to listen on TCP port 2376
    - Create VPC network with firewall rules for inter-node and harness-to-Docker communication
    - Support preemptible VMs for cost savings
    - Implement destroy() to run `pulumi destroy`
    - Return Docker daemon connection targets as `tcp://ip:port` strings
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [x] 13.2 Write unit tests for GCP Provisioner
    - Test preemptible VM configuration (Req 8.4)
    - Test returned address format matches `tcp://{ip}:{port}` (Req 8.6)
    - _Requirements: 8.4, 8.6_

- [x] 14. Implement Test Scenarios
  - [x] 14.1 Implement `test/distributed/scenarios/node-join-under-load.js`
    - Start cluster, begin sustained write load, add a new node, verify rebalancing completes within SLO
    - Use LogCollector live subscription during scenario, run LogAnalyzer before teardown
    - _Requirements: 5.1, 6.1_

  - [x] 14.2 Implement `test/distributed/scenarios/node-failure-rebalance.js`
    - Start cluster under load, SIGKILL a non-seed node, verify automatic failover and data consistency
    - Use LogCollector live subscription during scenario, run LogAnalyzer before teardown
    - _Requirements: 4.1, 5.1, 5.4_

  - [x] 14.3 Implement `test/distributed/scenarios/network-partition-split-brain.js`
    - Start cluster, partition into two groups, verify Raft leader election, heal partition, verify convergence
    - Use LogCollector live subscription during scenario, run LogAnalyzer before teardown to check for split-brain patterns
    - _Requirements: 4.5, 4.6, 5.1_

  - [x] 14.4 Implement `test/distributed/scenarios/rolling-restart.js`
    - Start cluster under load, restart nodes one at a time, verify zero errors during restarts
    - Use LogCollector live subscription during scenario, run LogAnalyzer before teardown
    - _Requirements: 4.4, 6.1_

  - [x] 14.5 Implement `test/distributed/scenarios/wasm-service-failover.js`
    - Start cluster with WASM services, kill a node hosting WASM replicas, verify WASM service rebalancing
    - Use LogCollector live subscription during scenario, run LogAnalyzer before teardown
    - _Requirements: 4.1, 5.1_

  - [x] 14.6 Implement `test/distributed/scenarios/sustained-write-throughput.js`
    - Start cluster, run sustained write load for extended duration, measure and assert steady-state performance
    - Use LogCollector live subscription during scenario, run LogAnalyzer before teardown
    - _Requirements: 6.1, 6.3_

- [x] 15. Wire everything together and final integration
  - [x] 15.1 Wire Cluster to use Chaos, LoadGenerator, Assertions, LogCollector, LogAnalyzer
    - Connect all Cluster methods to delegate to the appropriate component
    - Ensure cluster.stop() performs full cleanup including log collection via live query and analysis
    - Wire LogCollector to start live subscription on cluster start and collect final snapshot before teardown
    - Wire LogAnalyzer to run analytical queries and produce _analysis.json before teardown
    - _Requirements: 2.4, 2.5, 7.1, 7.4, 13.2_

  - [x] 15.2 Wire CLI Runner to use all components end-to-end
    - Ensure run.js orchestrates: config parse → image build → scenario discovery → execution → log analysis → reporting
    - Include analysis summary from LogAnalyzer in each scenario's report entry
    - _Requirements: 9.4, 9.5, 13.10_

- [x] 16. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties using fast-check with `{numRuns: 10}`
- Unit tests validate specific examples and edge cases
- Integration tests (in `__integration__/`) require a running Docker daemon and are run separately
- The GCP provisioner (task 13) can be deferred if only local testing is needed initially
- `dockerode` must be added as a devDependency; `@pulumi/gcp` and `@pulumi/pulumi` are needed only for GCP provisioning
