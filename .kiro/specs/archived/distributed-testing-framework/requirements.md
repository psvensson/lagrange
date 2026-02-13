# Requirements Document

## Introduction

A Docker-based distributed testing framework for running real-world distributed system tests at both local and cloud (GCP) scale. The framework provides a unified cluster abstraction over Docker containers, chaos engineering primitives, load generation, convergence assertions, and a CLI runner. Locally, containers run on the developer's Docker daemon; on GCP, the same containers run on Compute Engine VMs provisioned by Pulumi. The test harness talks to Docker (via dockerode), never to bare processes or VMs directly.

## Glossary

- **Cluster**: A set of Docker containers, each running one database node, connected via a Docker bridge network.
- **Harness**: The test orchestration layer that manages cluster lifecycle, chaos primitives, load generation, and assertions.
- **Scenario**: A JavaScript module that receives a Cluster handle and exercises a specific distributed behavior (e.g., node failure under load).
- **Docker_Provider**: The dockerode-based component that manages container lifecycle (create, start, stop, kill, pause, unpause, exec, logs).
- **GCP_Provisioner**: The Pulumi-based component that provisions Compute Engine VMs with Docker pre-installed and returns remote Docker daemon connection targets.
- **Chaos_Primitives**: Operations that inject faults into the cluster: kill, stop, pause, unpause, restart, network partition, slow network, disk corruption.
- **Load_Generator**: A component that drives SQL or admin API traffic against the cluster at a configurable rate.
- **Convergence_Assertion**: A check that the cluster has settled into a stable state within bounded time, reusing the SLO pattern from the existing `node-join-convergence-slo.integration.test.js`.
- **CLI_Runner**: The command-line entry point (`test/distributed/run.js`) that discovers, filters, and executes scenarios.
- **Node_Image**: The Docker image built from the project source that runs a single database node.
- **Admin_API**: The WebSocket API on port 8081 (`/api/admin/stream`) exposed by each node for administrative queries.
- **Bootstrap_API**: The HTTP endpoint (`/bootstrap`) used by joining nodes to contact the seed node.
- **Log_Collector**: The component that collects cluster logs via live query subscription to the `logs` system table, with Docker container stdout as fallback.
- **Log_Analyzer**: The component that processes collected logs to produce a unified timeline and detect distributed system anomalies (split-brain, election storms, stuck rebalancing, message delivery failures, CDC propagation delays).
- **Live_Query**: The system's real-time query subscription mechanism where clients subscribe via `LIVE SELECT` SQL statements over the Admin_API WebSocket and receive matching CDC events as they occur.

## Requirements

### Requirement 1: Docker-Based Node Isolation

**User Story:** As a developer, I want each database node to run in its own Docker container, so that all nodes can bind the same ports without conflicts and the test environment mirrors production deployment.

#### Acceptance Criteria

1. THE Docker_Provider SHALL create containers from the Node_Image with each container receiving its own IP address on a Docker bridge network.
2. WHEN a container is created, THE Docker_Provider SHALL assign environment variables for NODE_ID, NODE_ADDRESS, SEED_NODE_ADDRESS, and DATA_DIR to configure the database node.
3. WHEN multiple containers are created on the same host, THE Docker_Provider SHALL ensure all containers bind identical ports (8080 for REST, 8081 for Admin_API, 9080 for WebSocket transport) without conflict by relying on per-container IP isolation.
4. IF a container fails to start within a configurable timeout, THEN THE Docker_Provider SHALL report the failure with container logs and clean up the failed container.
5. WHEN a container is no longer needed, THE Docker_Provider SHALL remove the container and its associated volumes.

### Requirement 2: Unified Cluster Abstraction

**User Story:** As a developer, I want a single `createCluster` API that works identically for local Docker and remote GCP Docker daemons, so that scenarios are portable across environments.

#### Acceptance Criteria

1. THE Harness SHALL expose a `createCluster({size, docker, nodesPerHost})` function that returns a Cluster handle.
2. WHEN `docker.socketPath` is provided, THE Harness SHALL connect to the local Docker daemon at that path.
3. WHEN `docker.hosts` is provided, THE Harness SHALL connect to remote Docker daemons at those TCP addresses and distribute containers across hosts respecting the `nodesPerHost` limit.
4. THE Cluster handle SHALL expose methods: `start()`, `stop()`, `waitForConvergence(options)`, `getNode(id)`, `getNodes()`, `randomNonSeed()`, `startLoad(options)`, and all Chaos_Primitives.
5. WHEN `cluster.stop()` is called, THE Harness SHALL stop and remove all containers, networks, and volumes created for that cluster.
6. IF the test process exits unexpectedly, THEN THE Harness SHALL attempt best-effort cleanup of Docker resources using container labels for identification.

### Requirement 3: Cluster Lifecycle Management

**User Story:** As a developer, I want the cluster to bootstrap automatically with a seed node and joining nodes, so that I can focus on writing test scenarios rather than manual setup.

#### Acceptance Criteria

1. WHEN `cluster.start()` is called, THE Harness SHALL create a Docker bridge network, start the seed node container first, wait for the seed node's Bootstrap_API to become available, and then start joining node containers sequentially.
2. WHEN a joining node container starts, THE Harness SHALL configure it with the seed node's address so it can join the cluster via the Bootstrap_API.
3. WHEN all nodes have started, THE Harness SHALL wait for all nodes to reach ACTIVE state by polling the Admin_API on each node.
4. IF any node fails to reach ACTIVE state within a configurable timeout, THEN THE Harness SHALL collect logs from all containers and report a descriptive startup failure.

### Requirement 4: Chaos Primitives

**User Story:** As a developer, I want built-in chaos engineering primitives, so that I can simulate real-world failures like node crashes, network partitions, and slow networks.

#### Acceptance Criteria

1. WHEN `cluster.killNode(id)` is called, THE Harness SHALL send SIGKILL to the specified container using `docker kill`.
2. WHEN `cluster.stopNode(id)` is called, THE Harness SHALL send SIGTERM to the specified container using `docker stop` for graceful shutdown.
3. WHEN `cluster.pauseNode(id)` is called, THE Harness SHALL freeze the container process using `docker pause` (SIGSTOP), and WHEN `cluster.unpauseNode(id)` is called, THE Harness SHALL resume it using `docker unpause` (SIGCONT).
4. WHEN `cluster.restartNode(id)` is called, THE Harness SHALL stop and restart the specified container, preserving its data volume.
5. WHEN `cluster.partitionNetwork(groupA, groupB)` is called, THE Harness SHALL use `docker network disconnect` and `docker network connect` to isolate the two groups from each other while maintaining intra-group connectivity.
6. WHEN `cluster.healPartition()` is called, THE Harness SHALL restore full network connectivity among all nodes.
7. WHEN `cluster.slowNetwork(nodeId, {latency, jitter})` is called, THE Harness SHALL execute `tc qdisc` commands inside the target container to add network delay.
8. WHEN `cluster.corruptDisk(nodeId, path)` is called, THE Harness SHALL execute commands inside the target container to corrupt the specified file.

### Requirement 5: Convergence and Consistency Assertions

**User Story:** As a developer, I want reusable convergence and consistency assertions, so that I can verify the cluster recovers correctly after faults.

#### Acceptance Criteria

1. WHEN `cluster.waitForConvergence(options)` is called, THE Harness SHALL poll the Admin_API on all reachable nodes and wait until all partitions have elected leaders, voter counts are at target, and no leadership changes occur within a quiet window.
2. THE Convergence_Assertion SHALL accept configurable thresholds: `settleTimeoutMs`, `quietWindowMs`, `maxSustainedOverTargetMs`, and `targetVoterCount`.
3. IF convergence is not reached within `settleTimeoutMs`, THEN THE Convergence_Assertion SHALL throw an error with diagnostic details including current voter counts, leadership state, and recent leadership changes.
4. THE Harness SHALL provide a `cluster.assertConsistency()` method that queries all nodes and verifies they agree on the set of active nodes, partition assignments, and leader identities.
5. THE Harness SHALL provide a `cluster.assertDataIntegrity(table, expectedRows)` method that reads data from multiple replicas and verifies all replicas return consistent results.

### Requirement 6: Load Generation

**User Story:** As a developer, I want to generate sustained read/write load against the cluster, so that I can test behavior under realistic traffic conditions.

#### Acceptance Criteria

1. WHEN `cluster.startLoad(options)` is called with `opsPerSec` and `duration`, THE Load_Generator SHALL drive SQL operations against the cluster at the specified rate for the specified duration.
2. THE Load_Generator SHALL connect to nodes via the Admin_API WebSocket endpoint and execute SQL INSERT, SELECT, UPDATE, and DELETE operations.
3. THE Load_Generator SHALL track metrics: total operations, successful operations, failed operations, latency percentiles (p50, p95, p99), and operations per second.
4. WHEN `load.waitComplete()` is called, THE Load_Generator SHALL wait for the load run to finish and return the collected metrics.
5. IF a node becomes unreachable during load generation, THEN THE Load_Generator SHALL retry operations against other available nodes and record the failure in metrics.

### Requirement 7: Live Query-Based Log Collection

**User Story:** As a developer, I want cluster logs collected via the system's own live query mechanism against the `logs` table, so that I get a real-time unified timeline of all cluster-wide logs already merged and ordered.

#### Acceptance Criteria

1. WHEN a scenario starts, THE Log_Collector SHALL connect to the Admin_API WebSocket on one cluster node and subscribe with `LIVE SELECT * FROM logs` to receive real-time log events.
2. WHILE a scenario is executing, THE Log_Collector SHALL buffer all received log events locally in memory.
3. WHEN a filtered subscription is requested, THE Log_Collector SHALL subscribe with a filtered query (e.g., `LIVE SELECT * FROM logs WHERE level = 'error'`).
4. WHEN a scenario completes (before cluster teardown), THE Log_Collector SHALL execute `SELECT * FROM logs ORDER BY timestamp` via the Admin_API to capture the complete log history.
5. THE Log_Collector SHALL write collected logs to a structured output directory organized by scenario name: `{outputDir}/{scenarioName}/{nodeId}.log` per node and `{outputDir}/{scenarioName}/_timeline.log` for the unified timeline.
6. IF the cluster is unreachable for live query subscription, THEN THE Log_Collector SHALL fall back to collecting Docker container stdout and stderr via the Docker_Provider.
7. WHEN a scenario fails, THE Log_Collector SHALL include the last N lines from the collected log buffer in the error report.

### Requirement 8: GCP Provisioning

**User Story:** As a developer, I want to provision GCP Compute Engine VMs with Pulumi, so that I can run large-scale distributed tests in the cloud using the same Docker-based approach.

#### Acceptance Criteria

1. THE GCP_Provisioner SHALL use Pulumi with `@pulumi/gcp` to create Compute Engine instances with Docker pre-installed.
2. WHEN provisioning VMs, THE GCP_Provisioner SHALL configure Docker daemon to listen on a TCP port for remote access by the Harness.
3. THE GCP_Provisioner SHALL create a VPC network with firewall rules that allow inter-node communication and Harness-to-Docker communication.
4. THE GCP_Provisioner SHALL support preemptible VMs for cost savings.
5. WHEN `destroy()` is called, THE GCP_Provisioner SHALL run `pulumi destroy` to tear down all provisioned infrastructure.
6. THE GCP_Provisioner SHALL return Docker daemon connection targets (host:port pairs) that the Harness uses via the `docker.hosts` parameter of `createCluster`.

### Requirement 9: Scenario Execution and CLI Runner

**User Story:** As a developer, I want a CLI runner that discovers and executes test scenarios, so that I can run distributed tests from the command line with filtering and reporting.

#### Acceptance Criteria

1. THE CLI_Runner SHALL discover scenario files in the `test/distributed/scenarios/` directory by scanning for JavaScript modules that export a `run(cluster)` function.
2. WHEN invoked with a `--scenario` flag, THE CLI_Runner SHALL filter execution to only the named scenario.
3. WHEN invoked with a `--config` flag, THE CLI_Runner SHALL load cluster configuration from the specified JSON file (e.g., `local.json`, `gcp-small.json`).
4. THE CLI_Runner SHALL execute each scenario in isolation: create cluster, run scenario, collect results, tear down cluster.
5. WHEN all scenarios complete, THE CLI_Runner SHALL produce a structured JSON report containing per-scenario pass/fail status, duration, load metrics, and failure details.
6. IF a scenario throws an unhandled error, THEN THE CLI_Runner SHALL catch the error, mark the scenario as failed, collect logs, and continue to the next scenario.

### Requirement 10: Docker Image Build

**User Story:** As a developer, I want the framework to build the database node Docker image from the project source, so that tests always run against the current code.

#### Acceptance Criteria

1. THE Harness SHALL provide a `buildImage(options)` function that builds a Docker image from the project root using a Dockerfile.
2. THE Dockerfile SHALL use a Node.js 22 base image, copy the project source, install dependencies, and set the entry point to `node src/index.js`.
3. WHEN `buildImage` is called with a tag, THE Harness SHALL tag the built image with that name for use by `createCluster`.
4. IF the image build fails, THEN THE Harness SHALL report the build error with the Docker build output.

### Requirement 11: Test Configuration

**User Story:** As a developer, I want predefined configuration profiles for different test scales, so that I can quickly run tests locally or on GCP at various cluster sizes.

#### Acceptance Criteria

1. THE Harness SHALL support configuration files in JSON format that specify: cluster size, Docker connection parameters, node resource limits, timeouts, and load generation parameters.
2. THE Harness SHALL provide a `local.json` configuration for 5-node local testing with default Docker socket path.
3. THE Harness SHALL provide a `gcp-small.json` configuration for 10-20 node GCP testing.
4. THE Harness SHALL provide a `gcp-large.json` configuration for 50+ node GCP testing with multiple VMs and `nodesPerHost` distribution.
5. WHEN a configuration value is not specified, THE Harness SHALL use sensible defaults (e.g., 30-second convergence timeout, 3 target voter count).

### Requirement 12: Structured Test Reporting

**User Story:** As a developer, I want structured JSON test reports, so that I can integrate distributed test results into CI pipelines and track performance over time.

#### Acceptance Criteria

1. WHEN a test run completes, THE CLI_Runner SHALL write a JSON report to a configurable output path.
2. THE report SHALL include for each scenario: name, pass/fail status, duration in milliseconds, load metrics (if applicable), convergence timing, and failure details with stack traces.
3. THE report SHALL include a summary section with total scenarios, passed count, failed count, and total duration.
4. WHEN a scenario includes load generation, THE report SHALL include latency percentiles (p50, p95, p99) and throughput metrics.

### Requirement 13: Log Analysis and Pattern Detection

**User Story:** As a developer, I want automated log analysis that detects known distributed system anomalies, so that I can quickly identify split-brain, election storms, stuck rebalancing, and other issues without manually reading logs.

#### Acceptance Criteria

1. WHEN a scenario completes, THE Log_Analyzer SHALL process the collected log entries and produce a unified timeline file at `{outputDir}/{scenarioName}/_timeline.log`.
2. WHEN a scenario completes (before cluster teardown), THE Log_Analyzer SHALL run analytical SQL queries against the `logs` table via the Admin_API to detect patterns.
3. THE Log_Analyzer SHALL detect split-brain conditions by identifying two nodes claiming leadership for the same partition simultaneously.
4. THE Log_Analyzer SHALL detect election storms by identifying partitions with leader changes exceeding a threshold of `partitionCount * 4` within the scenario duration.
5. THE Log_Analyzer SHALL detect stuck rebalancing by identifying replica operations that do not complete within a configurable expected time.
6. THE Log_Analyzer SHALL detect message delivery failures by identifying repeated routing errors to the same address.
7. THE Log_Analyzer SHALL detect CDC propagation delays by identifying events that take longer than a configurable threshold to reach all nodes.
8. THE Log_Analyzer SHALL produce an analysis file at `{outputDir}/{scenarioName}/_analysis.json` containing detected patterns and anomalies.
9. THE analysis JSON SHALL include: `timeline` (all log entries sorted by timestamp), `errors` (error-level entries), `patterns` (detected anomalies with type, details, and severity), and `summary` (counts by level, by node, by subsystem).
10. WHEN a test report is generated, THE CLI_Runner SHALL include the analysis summary from the Log_Analyzer in each scenario's report entry.
