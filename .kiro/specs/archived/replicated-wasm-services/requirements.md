# Requirements Document

## Introduction

This feature introduces replicated WASM service groups — a third Raft group type alongside partitions (data storage) and message groups (communication). Each WASM service group is a persistent Raft consensus group that hosts WASI/WASM functions with a replicated key-value store for session context, configurable read/write consistency, persistent timers, communication port allocation, and resource budgets. Services are long-lived, single-tenant, and externally discoverable via a service endpoints table.

## Glossary

- **WASM_Service_Group**: A persistent Raft consensus group that hosts a single WASI/WASM service, including its handler function, replicated KV store, timers, and configuration.
- **Session_Context**: An opaque key-value store replicated through Raft within a WASM_Service_Group, keyed by session identifier, storing arbitrary bytes per key.
- **Handler_Function**: A WASM function stored in the `code` table that processes incoming messages for a WASM_Service_Group, receiving injected session context.
- **Safety_Interval**: A CockroachDB-style closed-timestamp mechanism where the leader periodically broadcasts its committed log index and timestamp, allowing followers to serve reads when their apply lag falls within a configurable staleness bound.
- **Service_Definition**: A row in the `service_definitions` table describing a WASM service's configuration including handler function reference, consistency modes, resource limits, and protocol.
- **Service_Endpoint**: A row in the `service_endpoints` table describing an externally reachable address for a WASM service replica, suitable for gateway integration.
- **Timer_Entry**: A persistent timer stored in the Raft-replicated state of a WASM_Service_Group, with exactly-once firing semantics, reconstructed by the leader on election.
- **Module_Mirror**: The process of ensuring a WASM binary is available on a node before a WASM_Service_Group replica on that node can serve requests.
- **Resource_Budget**: Configurable per-service limits on CPU time, memory usage, per-session context size, and total context size.
- **Port_Allocation**: The process by which a WASM_Service_Group replica requests a communication port from its host node for external connectivity.
- **Read_Consistency_Mode**: One of three modes — leader_only, strong (Safety_Interval-based), or eventual — controlling how read requests are served.
- **Write_Consistency_Mode**: One of two modes — strong (response after Raft commit) or async (response before Raft commit) — controlling write acknowledgment.

## Requirements

### Requirement 1: Service Definition Management

**User Story:** As a developer, I want to define and register WASM services with their configuration, so that the system can create and manage replicated service groups.

#### Acceptance Criteria

1. WHEN a service definition is inserted into the `service_definitions` table, THE System SHALL validate that the referenced handler function exists in the `code` table.
2. WHEN a valid service definition is created, THE System SHALL create a WASM_Service_Group Raft group with the configured replica count (odd number, minimum 3).
3. THE System SHALL store service definitions in the `service_definitions` table with fields for service_id, handler_function_id, read_consistency_mode, write_consistency_mode, replica_count, resource_budget, and protocol.
4. IF a service definition references a nonexistent handler function, THEN THE System SHALL reject the definition and return a descriptive error.
5. IF a service definition specifies an even replica count, THEN THE System SHALL reject the definition and return an error indicating odd replica counts are required.

### Requirement 2: WASM_Service_Group Raft Lifecycle

**User Story:** As a system operator, I want WASM service groups to be managed as Raft consensus groups, so that they benefit from the same replication and fault tolerance as partitions and message groups.

#### Acceptance Criteria

1. THE System SHALL register WASM_Service_Group replicas in the `services` table with service_type set to `wasm_service`.
2. WHEN a WASM_Service_Group is created, THE System SHALL initialize a Raft group using the liferaft library with the configured replica count.
3. WHEN a WASM_Service_Group replica becomes leader, THE System SHALL update the `services` table with the new raft_role via CDC.
4. WHEN a WASM_Service_Group replica is removed, THE System SHALL clean up its Raft state, timers, and allocated ports.
5. THE UnifiedRebalancer SHALL manage WASM_Service_Group replica placement using the same policy-based approach as partitions and message groups.

### Requirement 3: Replicated Session Context KV Store

**User Story:** As a developer, I want each WASM service to have a replicated key-value store for session context, so that handler functions can access session state on any replica.

#### Acceptance Criteria

1. WHEN a write to the Session_Context KV store is requested, THE System SHALL replicate the write through the WASM_Service_Group's Raft log before acknowledging (under strong write consistency).
2. WHEN a handler function executes, THE System SHALL load the session context for the referenced session from the local KV store and inject it into the function.
3. THE System SHALL store session context as opaque bytes keyed by session identifier within the WASM_Service_Group's replicated state.
4. WHEN a session context key is read, THE System SHALL serve the read according to the configured Read_Consistency_Mode.
5. IF a session context write exceeds the per-session size limit from the Resource_Budget, THEN THE System SHALL reject the write and return a size limit error.
6. IF the total context size for a service exceeds the per-service size limit from the Resource_Budget, THEN THE System SHALL reject the write and return a capacity error.

### Requirement 4: Read Consistency Modes

**User Story:** As a developer, I want to choose between read consistency levels, so that I can trade off between latency and staleness for my service's reads.

#### Acceptance Criteria

1. WHEN Read_Consistency_Mode is set to leader_only, THE System SHALL route all read requests to the Raft leader of the WASM_Service_Group.
2. WHEN Read_Consistency_Mode is set to strong, THE System SHALL use a Safety_Interval mechanism where the leader periodically broadcasts its committed log index and timestamp to followers.
3. WHILE Read_Consistency_Mode is strong, THE System SHALL allow a follower to serve a read only when the follower's applied log index is within the Safety_Interval of the leader's last broadcast.
4. WHEN Read_Consistency_Mode is set to eventual, THE System SHALL allow any replica to serve reads from its local state without staleness checks.
5. IF a follower receives a strong read request but its apply lag exceeds the Safety_Interval, THEN THE System SHALL forward the request to the leader.

### Requirement 5: Write Consistency Modes

**User Story:** As a developer, I want to choose between write consistency levels, so that I can trade off between durability guarantees and write latency.

#### Acceptance Criteria

1. WHEN Write_Consistency_Mode is set to strong, THE System SHALL send the write response to the caller only after the Raft group commits the entry.
2. WHEN Write_Consistency_Mode is set to async, THE System SHALL send the write response to the caller immediately after the leader accepts the entry, before Raft commit.
3. WHILE Write_Consistency_Mode is async, THE System SHALL still replicate the write through Raft consensus (fire-and-forget from the caller's perspective).

### Requirement 6: WASM Function Execution

**User Story:** As a developer, I want my WASM handler functions to execute with injected session context and be able to call other functions, so that I can build composable services.

#### Acceptance Criteria

1. WHEN a message arrives for a WASM_Service_Group, THE System SHALL load the referenced session context, instantiate the WASM module, inject the context, and invoke the handler function.
2. WHEN a handler function calls another function from the `code` table during execution, THE System SHALL dispatch the call asynchronously via the MessageRouter.
3. IF a handler function exceeds its CPU time limit from the Resource_Budget, THEN THE System SHALL terminate the execution and return a timeout error.
4. IF a handler function exceeds its memory limit from the Resource_Budget, THEN THE System SHALL terminate the execution and return a memory limit error.
5. THE System SHALL register a `wasm_service` executor type with the FunctionRegistry for executing WASM handler functions.

### Requirement 7: Persistent Timers

**User Story:** As a developer, I want to schedule persistent timers within my WASM service, so that I can implement time-based logic that survives leader elections and restarts.

#### Acceptance Criteria

1. WHEN a timer is created, THE System SHALL replicate the timer entry through the WASM_Service_Group's Raft log.
2. WHILE a replica is the Raft leader, THE System SHALL run all active timers for that WASM_Service_Group.
3. WHEN a new leader is elected, THE System SHALL reconstruct all active timers from the replicated KV store and resume them.
4. WHEN a timer fires, THE System SHALL invoke the associated handler function with the timer's payload exactly once under normal operation.
5. WHEN a timer fires, THE System SHALL replicate a timer-fired event through Raft to mark the timer as completed before invoking the handler.
6. IF a leader fails after replicating the timer-fired event but before completing the handler invocation, THEN THE System SHALL detect the completed marker and skip re-firing on the new leader.

### Requirement 8: Communication Port Allocation

**User Story:** As a developer, I want my WASM service replicas to obtain communication ports from the host node, so that external clients can connect to the service.

#### Acceptance Criteria

1. WHEN a WASM_Service_Group replica starts, THE System SHALL request a communication port from the host node's port allocator.
2. WHEN a port is allocated, THE System SHALL register the endpoint in the `service_endpoints` table with the service_id, node_id, protocol, address, and port.
3. WHEN a WASM_Service_Group replica shuts down, THE System SHALL release the allocated port and remove the endpoint from the `service_endpoints` table.
4. THE System SHALL support WebSocket as the communication protocol for service endpoints.

### Requirement 9: WASM Module Mirroring

**User Story:** As a system operator, I want WASM modules to be available on all nodes hosting replicas, so that replicas can serve requests without cross-node module fetches.

#### Acceptance Criteria

1. WHEN a WASM_Service_Group replica is assigned to a node, THE System SHALL verify that the required WASM module is available locally before the replica can serve requests.
2. IF the WASM module is not available on the target node, THEN THE System SHALL pull the module from a node that has it before marking the replica as ready.
3. WHEN a new version of a WASM module is deployed, THE System SHALL distribute the updated module to all nodes hosting replicas of the affected service.

### Requirement 10: Resource Budget Enforcement

**User Story:** As a system operator, I want to configure resource limits per service, so that no single service can consume excessive cluster resources.

#### Acceptance Criteria

1. THE System SHALL enforce CPU time limits per handler function invocation as specified in the Service_Definition's Resource_Budget.
2. THE System SHALL enforce memory limits per handler function invocation as specified in the Service_Definition's Resource_Budget.
3. THE System SHALL enforce per-session context size limits as specified in the Service_Definition's Resource_Budget.
4. THE System SHALL enforce per-service total context size limits as specified in the Service_Definition's Resource_Budget.
5. WHEN a resource limit is exceeded, THE System SHALL terminate the offending operation and return a descriptive error identifying which limit was breached.

### Requirement 11: Service Endpoints and Gateway Integration

**User Story:** As a system operator, I want service endpoints to be discoverable in a standard format, so that I can integrate with external gateways like Kubernetes services or nginx upstreams.

#### Acceptance Criteria

1. THE System SHALL store service endpoints in the `service_endpoints` table with fields for endpoint_id, service_id, node_id, protocol, address, port, health_status, and metadata.
2. WHEN a service endpoint's health status changes, THE System SHALL update the `service_endpoints` table via CDC.
3. THE System SHALL update the `service_endpoints` table via CDC so that all nodes have a consistent view of available endpoints.
4. THE System SHALL include sufficient metadata in service endpoint records (service name, version, protocol) to support OpenAPI-style service discovery.

### Requirement 12: System Table and Constant Integration

**User Story:** As a developer, I want the new service type and tables to integrate with the existing system table infrastructure, so that WASM services are first-class citizens in the cluster.

#### Acceptance Criteria

1. THE System SHALL add `wasm_service` to the SERVICE_TYPE constant enum.
2. THE System SHALL add `service_definitions`, `service_endpoints`, and `service_timers` to the TABLES constant.
3. THE System SHALL create system table schemas for `service_definitions`, `service_endpoints`, and `service_timers` during bootstrap.
4. THE System SHALL update the SystemTableCache to track the new system tables via CDC events.
5. WHEN a joining node bootstraps, THE System SHALL include snapshots of the new system tables in the bootstrap response.

### Requirement 13: Architecture and Documentation Updates

**User Story:** As a developer, I want the architecture documentation and README to reflect the new WASM service group type, so that the codebase documentation stays accurate and complete.

#### Acceptance Criteria

1. WHEN the WASM_Service_Group feature is implemented, THE System SHALL update `architecture.md` to document the new service type, its Raft group lifecycle, and its relationship to existing components.
2. WHEN the WASM_Service_Group feature is implemented, THE System SHALL update the main `README.md` to describe the WASM service capability.
3. THE System SHALL document the new system tables (`service_definitions`, `service_endpoints`, `service_timers`) in the system tables section of `architecture.md`.
4. THE System SHALL document the Safety_Interval read consistency mechanism in `architecture.md`.
5. THE System SHALL document the timer persistence and exactly-once semantics in `architecture.md`.

### Requirement 14: Serialization Round-Trip for Service Configuration

**User Story:** As a developer, I want service definitions and resource budgets to be reliably serialized and deserialized, so that configuration is never corrupted during storage or transmission.

#### Acceptance Criteria

1. FOR ALL valid Service_Definition objects, serializing to a table row and deserializing back SHALL produce an equivalent Service_Definition object (round-trip property).
2. FOR ALL valid Resource_Budget objects, serializing to JSON and deserializing back SHALL produce an equivalent Resource_Budget object (round-trip property).
3. FOR ALL valid Timer_Entry objects, serializing to the Raft log and deserializing back SHALL produce an equivalent Timer_Entry object (round-trip property).
