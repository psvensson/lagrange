# Requirements Document

> **Document Hierarchy**: This is the authoritative requirements document. See [design.md](./design.md) for architecture and design decisions, and [tasks.md](./tasks.md) for implementation status.

## Introduction

A scalable distributed database system that stores all non-transient information about itself within its own database structure. 

**Core Architectural Truth:**
- ALL persistent information is stored in tables
- ALL tables (system and user) are implemented as partitions
- ALL partitions are Raft consensus groups with odd-numbered replicas (minimum 3)
- ALL partition replicas use SQLite for storage
- The ONLY exceptions are: messages in transit and in-memory caches

The system uses Raft consensus for both data partitions and message routing, with automatic replica placement and rebalancing across nodes. The system provides SQL access with distributed query execution across partitions.

## Glossary

- **System**: The distributed database system
- **Node**: A physical or virtual machine that hosts services
- **Service**: A component running on a node (partition replica, message group replica, or node service)
- **Partition**: A subset of table data implemented as a SQLite Raft group
- **Partition_Key**: The PRIMARY KEY column(s) of a table, automatically used by the system to distribute data across partitions
- **Message_Group**: A three-replica Raft group handling inter-service communication with in-memory storage
- **Node_Service**: The administrative service present on every node
- **Replica**: An instance of a partition or message group service
- **CDC**: Change Data Capture - notifications of data changes
- **Seed_Node**: The first node in the system that creates initial system tables
- **System_Tables**: Core tables (tables, partitions, indices, message-groups, nodes, services)
- **Table_Policy**: Configuration rules governing partition behavior (splitting, merging, replication)
- **Message_Group_Policy**: Configuration rules governing message group replica placement and count
- **Rebalancer**: The unified component that manages replica placement for both partitions and message groups
- **Index**: A data structure for fast data retrieval within partitions
- **System_Table_Cache**: In-memory cache of system table data maintained in each message group replica, synchronized via CDC
- **Admin_CLI_Tool**: The command-line interface application for administering and monitoring the distributed database system
- **Serializable_Isolation**: The strongest SQL isolation level where concurrent transactions produce results equivalent to some serial execution
- **Linearizability**: A consistency guarantee where operations appear to execute atomically at a single point in time between invocation and response
- **External_Consistency**: A guarantee that if transaction T1 commits before T2 starts (in real time), T2 observes all effects of T1
- **HLC**: Hybrid Logical Clock - a timestamp mechanism combining physical and logical clocks to establish global ordering without clock synchronization
- **Keycloak**: An open-source identity and access management solution providing OAuth 2.0, OpenID Connect, and SAML 2.0 protocols
- **JWT**: JSON Web Token - a compact, URL-safe token format used for authentication and authorization
- **Service_Account**: A Keycloak identity representing a service (not a human user) for inter-service authentication
- **RBAC**: Role-Based Access Control - an authorization model where permissions are assigned to roles, and roles are assigned to users or services

## Requirements

### Requirement 1: Node Management

**User Story:** As a system administrator, I want to manage nodes in the distributed system, so that I can scale the database horizontally.

#### Acceptance Criteria

1. WHEN a node starts without a seed node address, THE System SHALL create it as the first node with all system tables
2. WHEN a node starts with a seed node address, THE System SHALL bootstrap from the seed node's REST API
3. THE Node_Service SHALL be present on every node for service administration
4. WHEN a new node joins, THE System SHALL trigger replica rebalancing across nodes
5. THE System SHALL assign unique node addresses to each physical or virtual machine

### Requirement 2: Service Architecture

**User Story:** As a system architect, I want services to be independently manageable, so that the system can scale and maintain high availability.

#### Acceptance Criteria

1. THE System SHALL assign unique service addresses to each service instance
2. WHEN services are created, THE System SHALL place them according to optimal replica placement policies
3. THE Node_Service SHALL start, stop, and administer other services on its node
4. THE System SHALL support partition replicas, message group replicas, and custom user services
5. WHEN calculating replica placement, THE System SHALL consider node CPU and memory statistics

### Requirement 3: Data Storage and Partitioning

**User Story:** As a database user, I want data to be stored reliably across partitions, so that the system can handle large datasets with fault tolerance.

#### Acceptance Criteria

1. THE System SHALL store all non-transient information in tables within itself
2. THE System SHALL implement ALL tables (system tables and user tables) as one or more partitions with NO distinction in implementation
3. THE System SHALL implement each partition as a Raft consensus group using raft-logic
4. THE System SHALL implement each partition replica using SQLite for storage
5. THE System SHALL maintain three replicas (odd number) for each partition by default
6. THE System SHALL support change data capture for all tables
7. WHEN a partition meets split criteria, THE System SHALL split the partition at the median PRIMARY KEY value into two adjacent partitions
8. WHEN two adjacent partitions (by key range) meet merge criteria, THE System SHALL merge them into a single partition
9. THE System SHALL evaluate split criteria based on storage utilization (disk usage per replica) and traffic metrics (queries per time window)
10. THE System SHALL evaluate merge criteria based on combined storage utilization and combined traffic metrics of adjacent partitions
11. THE System SHALL track partition storage size and query traffic for split/merge decisions
12. THE System SHALL define "adjacent partitions" as partitions where one's partition_key_end equals the other's partition_key_start

### Requirement 4: Message Group Communication

**User Story:** As a distributed system component, I want reliable message delivery between services, so that the system maintains consistency across nodes.

#### Acceptance Criteria

1. THE System SHALL implement message groups as three-replica Raft groups with in-memory storage
2. WHEN messages are sent, THE Message_Group SHALL simultaneously attempt direct delivery to the destination AND persist the message to the Raft log
3. THE Message_Group SHALL NOT wait for Raft persistence to complete before attempting delivery (non-blocking persistence)
4. WHEN direct delivery fails OR acknowledgment is not received, THE Message_Group SHALL retry delivery from the persisted Raft log
5. THE System SHALL ensure messages are not lost even if nodes crash, because messages are replicated in the Raft log before delivery completes
6. THE System SHALL ensure every node has at least one local message group replica for communication
7. WHEN system table changes occur, THE Message_Group SHALL receive CDC notifications and update its System_Table_Cache
8. THE Message_Group SHALL maintain a System_Table_Cache and provide an API for local services on the same node to query system information
9. WHEN services communicate, THE System SHALL route all messages through a local message group replica regardless of destination
10. THE System SHALL use message groups as the transport layer for all Raft consensus communication between partition replicas
11. THE System SHALL maintain identical System_Table_Cache contents across all message group replicas via CDC subscription
12. THE System SHALL instantiate MessageGroupService instances as running services (not just metadata entries)
13. THE System SHALL use MessageGroupTransport for ALL partition replica Raft communication with NO fallback to InMemoryTransport
14. THE Message_Group replicas SHALL use MessageGroupTransport for their own Raft communication (message groups communicate through other message groups)
15. THE System SHALL allow ONLY the following exceptions to message group communication: initial node bootstrap (HTTP GET/POST to seed node for cache and message group assignment) and admin CLI tool connections (WebSocket for human operators)
16. WHEN a node completes bootstrap, THE System SHALL route ALL subsequent inter-node communication through a single WebSocket connection per node
17. THE System SHALL route outgoing messages through local message group replicas which guarantee delivery
18. THE System SHALL route incoming messages from remote message group replicas to local services
19. WHEN message groups initialize, THE System SHALL allow them to start with empty caches and populate caches via CDC events from system table partitions
20. THE System SHALL NOT require message groups to have populated caches before system table partitions can be created

### Requirement 5: System Table Cache Integrity

**User Story:** As a distributed system architect, I want the system table cache to be read-only with all writes going through CDC, so that cache consistency is guaranteed across all nodes.

#### Acceptance Criteria

1. THE System_Table_Cache SHALL be read-only for all components except CDC event handlers
2. WHEN any component needs to modify system tables, THE System SHALL write to the actual system table partition (not the cache)
3. THE System SHALL propagate all system table writes through CDC events to update all caches
4. THE System SHALL apply cache updates ONLY through CDC event handlers processing INSERT, UPDATE, and DELETE operations
5. THE System SHALL reject any direct cache write operations that bypass CDC propagation
6. WHEN a node joins the cluster, THE Seed_Node SHALL write the new node entry to the nodes system table (not directly to cache)
7. WHEN a node sends heartbeats, THE Node SHALL update the nodes system table (not directly to cache)
8. WHEN the failure detector marks a node as failed, THE System SHALL update the nodes system table (not directly to cache)
9. THE System SHALL ensure cache consistency by making CDC the single source of truth for all cache updates
10. THE System SHALL provide CDCIntegrationService.insertSystemTableRow(), updateSystemTableRow(), and deleteSystemTableRow() methods for all system table writes

### Requirement 6: System Tables Bootstrap

**User Story:** As a system initializer, I want system tables to be created atomically with proper initialization ordering, so that there are no circular dependencies or race conditions during startup.

#### Acceptance Criteria

1. WHEN the first node starts, THE System SHALL create all system tables as partitions (using the same partition infrastructure as user tables)
2. THE System SHALL create tables for: tables, partitions, indices, message-groups, nodes, services, logs, and config
3. THE System SHALL create initial partitions with three replicas on the seed node
4. THE System SHALL create the first message group with three replicas on the seed node
5. THE System SHALL use hard-coded schemas and initial IDs to avoid circular dependencies during bootstrap
6. WHEN basic tables exist, THE System SHALL allow smooth creation of additional tables
7. THE System SHALL initialize services in four sequential phases: infrastructure setup, message group creation, partition creation, and service registration
8. WHEN each phase begins, THE System SHALL log the phase name and service count at INFO level
9. WHEN each phase completes, THE System SHALL log completion status and duration at INFO level
10. WHEN message group services are created, THE System SHALL register message handlers before starting Raft consensus
11. WHEN partition services are created, THE System SHALL register message handlers with the message group transport before starting partition Raft
12. WHEN message group services are created, THE System SHALL verify all message groups have established leadership before proceeding to partition creation
13. WHEN a message group has not established leadership within 5 seconds, THE System SHALL wait with exponential backoff up to 30 seconds total
14. IF any message group fails to establish leadership within timeout, THE System SHALL fail bootstrap with clear error message indicating which message group failed
15. WHEN partition services are created, THE System SHALL register message handlers with the message group transport before starting partition Raft
16. WHEN any initialization step fails, THE System SHALL stop the bootstrap process, clean up partially initialized services, and exit with non-zero exit code
17. WHEN Raft state changes occur during normal operation, THE System SHALL log them at DEBUG level (not INFO level)
18. WHEN any log message is written, THE System SHALL include relevant identifiers (nodeId, serviceId, partitionId, groupId, tableId, replicaId) in the structured log context

### Requirement 7: SQL Query Processing

**User Story:** As a database client, I want to execute SQL queries against distributed data, so that I can access information regardless of partition location.

#### Acceptance Criteria

1. WHEN a SELECT statement is received, THE System SHALL resolve it to relevant partitions
2. THE System SHALL send queries to replicas of each required partition in parallel
3. THE System SHALL support a simplified SQL dialect similar to CockroachDB
4. THE System SHALL aggregate results from multiple partitions into a single response
5. THE System SHALL route queries through the SQL API interface

### Requirement 8: Node Bootstrap and Discovery

**User Story:** As a new node, I want to join an existing cluster, so that I can participate in the distributed system.

#### Acceptance Criteria

1. WHEN a node starts, THE System SHALL generate a unique node ID using UUID v4
2. WHEN a node receives a seed node address, THE System SHALL contact the seed node's REST API with its self-generated node ID
3. THE Seed_Node SHALL validate the node ID and address for conflicts and register the new node in the nodes table
4. THE Seed_Node SHALL determine message group assignment for the new node before returning the bootstrap response
5. WHEN existing message groups have capacity, THE Seed_Node SHALL assign the new node to join an existing message group
6. WHEN no existing message groups have capacity, THE Seed_Node SHALL instruct the new node to create a new self-hosted message group with 3 replicas on itself
7. THE Seed_Node SHALL return system partition leader addresses, cluster configuration, and message group assignment instructions to the new node
8. THE new node SHALL create or join the assigned message group before proceeding with any other initialization
9. WHEN creating a self-hosted message group, THE new node SHALL create all 3 replicas locally (identical to seed node bootstrap)
10. THE new node SHALL wait for message group leadership establishment before proceeding to query system partitions
11. THE new node SHALL query system partitions directly to retrieve cluster state (nodes, partitions, message groups, tables) after message group is operational
12. THE Rebalancer SHALL eventually rebalance message group replicas across nodes to achieve optimal distribution
13. THE System SHALL make the new node available for replica placement immediately after bootstrap completes
14. THE bootstrap process SHALL NOT complete until the new node has at least one operational local message group replica with established leadership

### Requirement 9: Replica Rebalancing

**User Story:** As a system optimizer, I want replicas to be balanced across nodes, so that the system maintains optimal performance and fault tolerance.

#### Acceptance Criteria

1. THE System SHALL use a single unified Rebalancer for both partition and message group replicas
2. WHEN nodes join or leave, THE Rebalancer SHALL calculate optimal replica placement using policies
3. THE Rebalancer SHALL consider node CPU, memory, and disk statistics during placement decisions
4. THE Rebalancer SHALL support growing replica count in odd increments (3→5→7) based on policy
5. THE Rebalancer SHALL support shrinking replica count in odd decrements (7→5→3) based on policy
6. WHEN rebalancing message groups, THE Rebalancer SHALL ensure every node maintains at least one local replica
7. THE System SHALL use the same rebalancing logic for the second node joining as for the tenth node
8. THE partition or message group leader SHALL make rebalancing decisions independently for its own replicas without coordinating with other partition or message group leaders
9. WHEN multiple leaders make concurrent rebalancing decisions, THE System SHALL allow operations to proceed independently and converge to a stable state through eventual consistency
10. THE Rebalancer SHALL be driven by Table_Policy for partitions and Message_Group_Policy for message groups
11. WHEN non-critical events occur (node joins, load changes), THE System SHALL use periodic checks with jitter to prevent thundering herd
12. WHEN critical events occur (replica count below minimum, node failure), THE System SHALL trigger immediate rebalancing checks
13. THE Rebalancer SHALL make all placement decisions autonomously without operator input or manual override capabilities
14. WHEN calculating current replica state, THE System SHALL exclude replicas with status "failed" or "inactive"
15. WHEN calculating target replica count, THE System SHALL use the policy's replica count regardless of current healthy replica count
16. WHEN current healthy replicas are fewer than policy replica count, THE System SHALL generate "add" moves to create replacement replicas
17. WHEN a replica is on a failed node, THE System SHALL generate a "remove" move for that replica
18. WHEN a node fails, THE System SHALL create replacement replicas on healthy nodes to restore the policy's target replica count
19. THE System SHALL place new replicas on healthy nodes with available capacity according to placement policy constraints

### Requirement 10: Protocol Support

**User Story:** As a system tester, I want multiple protocol options, so that I can test the system in different environments.

#### Acceptance Criteria

1. THE System SHALL support WebSocket-based protocol for inter-node communication
2. WHEN services on the same node communicate, THE System SHALL route messages through the local message group replica
3. WHEN services on different nodes communicate, THE System SHALL route messages through WebSocket connections between message group replicas
4. THE System SHALL abstract protocol details from service logic by using message groups as the unified transport layer
5. WHEN running tests, THE System SHALL use the same message group infrastructure as production

### Requirement 11: Configuration Management

**User Story:** As a developer, I want centralized configuration, so that the system avoids magic numbers and maintains consistency.

#### Acceptance Criteria

1. THE System SHALL use a central configuration system for all constants
2. WHEN code needs literal values, THE System SHALL reference symbolic names from configuration
3. THE System SHALL avoid free-standing string or number literals in code
4. THE System SHALL provide clear configuration categories for different system aspects
5. THE System SHALL validate configuration values at startup

### Requirement 12: Code Quality and Maintainability

**User Story:** As a developer, I want clean and maintainable code, so that the system remains simple and reliable over time.

#### Acceptance Criteria

1. THE System SHALL use flags only for enabling or disabling observability features
2. THE System SHALL maintain exactly one code path for each functionality
3. WHEN functionality is rewritten, THE System SHALL replace it completely without retaining legacy logic
4. THE System SHALL avoid conditional compilation or feature flags for core functionality
5. THE System SHALL follow Google JavaScript lint rules consistently

### Requirement 13: Index Management

**User Story:** As a database user, I want efficient data retrieval through indices, so that queries perform well on large datasets.

#### Acceptance Criteria

1. THE System SHALL support creating indices on table columns
2. WHEN indices are created, THE System SHALL store index metadata in the indices system table
3. THE System SHALL maintain indices automatically when data changes occur
4. WHEN queries are executed, THE System SHALL use appropriate indices for optimization
5. THE System SHALL distribute index data across the same partitions as the base table data

### Requirement 14: Table Policy Management

**User Story:** As a database administrator, I want configurable table policies, so that I can control partition behavior based on system requirements.

#### Acceptance Criteria

1. THE System SHALL support defining table policies for partition splitting thresholds
2. THE System SHALL support defining table policies for partition merging criteria
3. THE System SHALL support defining table policies for replication factors
4. WHEN table policies are defined, THE System SHALL store them in the tables system table
5. THE System SHALL apply table policies automatically during partition operations
6. THE System SHALL store Raft role (leader/follower/candidate) in a raft_role column (TEXT) in the services system table for Raft-based services
7. WHEN Raft state changes for a service, THE System SHALL update the service's raft_role value
8. THE System SHALL propagate raft_role updates via CDC to all message group caches

### Requirement 15: Fault Tolerance and Recovery

**User Story:** As a system operator, I want the system to handle failures gracefully, so that data remains available despite node or network issues.

#### Acceptance Criteria

1. WHEN a node fails, THE System SHALL detect the failure and mark affected replicas as unavailable
2. WHEN replica count falls below minimum, THE System SHALL create replacement replicas on healthy nodes
3. WHEN network partitions occur, THE System SHALL maintain consistency using Raft consensus
4. WHEN failed nodes recover, THE System SHALL reintegrate them and rebalance replicas
5. THE System SHALL maintain data availability as long as a majority of replicas remain accessible

### Requirement 16: SQL Write Operations

**User Story:** As a database client, I want to modify data through SQL commands, so that I can maintain application state in the distributed database.

#### Acceptance Criteria

1. WHEN an INSERT statement is received, THE System SHALL route it to the appropriate partition leader based on the PRIMARY KEY value
2. WHEN an UPDATE statement is received, THE System SHALL identify affected partitions based on WHERE clause and route to partition leaders
3. WHEN a DELETE statement is received, THE System SHALL identify affected partitions and remove data from appropriate partition leaders
4. THE System SHALL ensure write operations are replicated to all partition replicas via Raft before acknowledging
5. WHEN a write operation affects only a single partition, THE System SHALL support transaction semantics as defined in Requirement 21
6. WHEN a write operation would affect multiple partitions outside a transaction, THE System SHALL execute writes independently to each partition

### Requirement 17: Centralized Logging

**User Story:** As a system operator, I want comprehensive logging across all system components, so that I can monitor, debug, and audit system behavior.

#### Acceptance Criteria

1. THE System SHALL use pino as the logging library for all log output
2. THE System SHALL write logs to the logs system table as specified in Requirement 26
3. THE System SHALL support configurable log levels (error, warn, info, debug, trace) via the config system table
4. THE System SHALL include structured logging with consistent metadata (node_id, service_id, timestamp, trace_id)
5. THE System SHALL log all critical operations including node joins, replica movements, partition splits, and authentication events

### Requirement 18: Message Retry and Failure Handling

**User Story:** As a distributed system component, I want failed message deliveries to be retried intelligently, so that the system remains resilient to transient failures and routing changes.

#### Acceptance Criteria

1. WHEN a message delivery fails, THE System SHALL retry with exponential backoff up to a configurable maximum (default 3 retries)
2. WHEN retrying a failed message, THE System SHALL attempt delivery to alternative replicas from the same partition when available
3. WHEN the maximum retry count is exceeded, THE System SHALL return an error to the caller with diagnostic information
4. THE System SHALL use configurable retry parameters (initial delay, backoff multiplier, maximum delay, jitter factor)
5. WHEN multiple consecutive failures occur for the same target, THE System SHALL query system partitions for fresh metadata
6. THE System SHALL maintain local metadata cache with TTL (default 30 seconds) to reduce query overhead
7. WHEN cached metadata expires or is missing, THE System SHALL query system partitions directly and update the cache

### Requirement 19: Single Executable Packaging

**User Story:** As a system administrator, I want both the distributed database system and the admin CLI tool to be available as free-standing single executables, so that I can deploy and run them without managing dependencies.

#### Acceptance Criteria

1. THE System SHALL be buildable as a single executable binary for Linux
2. THE Admin_CLI_Tool SHALL be buildable as a single executable binary for Linux
3. WHEN built as single executables, THE System and Admin_CLI_Tool SHALL include all required dependencies
4. THE single executables SHALL run without requiring Node.js to be installed on the target system
5. THE build process SHALL use Node.js Single Executable Application (SEA) or equivalent packaging technology
6. WHEN the single executable starts, THE System SHALL behave identically to the non-packaged version
7. THE build process SHALL produce executables that can be distributed and run on standard Linux distributions

### Requirement 20: Autonomous Replica Management

**User Story:** As a system architect, I want replica placement and management to be fully autonomous, so that the system optimally manages resources without operator intervention and maintains architectural consistency across all table types.

#### Acceptance Criteria

1. THE System SHALL implement each partition as a Raft group with an odd number of replicas (minimum 3, maximum configurable)
2. THE System SHALL make all replica placement decisions autonomously based on policies, node resources, and system state
3. THE System SHALL NOT provide any APIs, interfaces, or mechanisms for operators to manually specify replica locations or counts
4. WHEN policies change, THE System SHALL automatically adjust replica placement to comply with new policies without operator intervention
5. THE System SHALL ensure replica counts remain odd numbers (3, 5, 7, etc.) at all times for Raft quorum requirements

### Requirement 21: Transparent Partition Key Management

**User Story:** As a database user, I want to use standard SQL without thinking about partitions, so that the system handles data distribution automatically.

#### Acceptance Criteria

1. WHEN a table is created with a PRIMARY KEY, THE System SHALL automatically use the PRIMARY KEY as the partition key
2. WHEN a table is created without a PRIMARY KEY, THE System SHALL require a PRIMARY KEY to be defined for user tables
3. THE System SHALL create an initial partition covering the entire key space with range [NULL, NULL)
4. WHEN a partition is split, THE System SHALL calculate the split point using the median PRIMARY KEY value to ensure balanced distribution
5. THE System SHALL maintain contiguous, non-overlapping partition key ranges for each table
6. WHEN resolving queries with WHERE clauses on the PRIMARY KEY, THE System SHALL route to only those partitions whose key ranges overlap with the query conditions
7. WHEN resolving queries without PRIMARY KEY filters, THE System SHALL route to all partitions and aggregate results
8. WHEN partitions are merged, THE System SHALL only merge adjacent partitions where one's end key equals the other's start key
9. THE System SHALL validate partition range integrity after every split or merge operation
10. THE System SHALL expose partitioning details only in system tables for operators, never in user-facing query results

### Requirement 22: Single-Partition Transaction Semantics

**User Story:** As a database user, I want ACID transactions within a partition, so that my data remains consistent.

#### Acceptance Criteria

1. WHEN a transaction operates on data within a single partition, THE System SHALL provide full ACID guarantees using SQLite's transaction support
2. THE System SHALL support BEGIN TRANSACTION, COMMIT, and ROLLBACK statements
3. WHEN a transaction attempts to modify data in multiple partitions, THE System SHALL return an error indicating cross-partition transactions are not supported
4. THE System SHALL provide READ COMMITTED isolation level for single-partition transactions
5. WHEN a transaction fails or is rolled back, THE System SHALL automatically revert all changes within that partition
6. THE System SHALL ensure transaction durability through Raft replication before acknowledging commits
7. WHEN concurrent transactions access the same partition, THE System SHALL use SQLite's locking mechanisms to prevent conflicts

### Requirement 23: Distributed Read-Only Queries

**User Story:** As a database user, I want to query and join data across partitions, so that I can analyze distributed datasets.

#### Acceptance Criteria

1. WHEN a SELECT query spans multiple partitions, THE System SHALL execute it by querying all relevant partitions in parallel
2. THE System SHALL support JOIN operations between tables that span different partitions
3. THE System SHALL aggregate results from multiple partitions into a single result set
4. WHEN a read-only query is executed, THE System SHALL not block writes to any partition
5. THE System SHALL route read-only queries to any available replica (not just leaders) to distribute load
6. WHEN aggregating results, THE System SHALL preserve SQL semantics for ORDER BY, GROUP BY, and LIMIT clauses
7. THE System SHALL support cross-partition queries for COUNT, SUM, AVG, MIN, and MAX aggregate functions

### Requirement 24: Consistency Guarantees

**User Story:** As a database user, I want strong consistency guarantees equivalent to CockroachDB, so that my application logic is simple and correct without worrying about distributed system anomalies.

#### Acceptance Criteria

1. THE System SHALL provide serializable isolation as the default and only isolation level for all transactions
2. THE System SHALL ensure that the execution of concurrent transactions produces results equivalent to some serial execution of those transactions
3. THE System SHALL provide linearizability for single-key read and write operations
4. THE System SHALL ensure external consistency where if transaction T1 commits before transaction T2 starts, T2 SHALL observe all effects of T1
5. THE System SHALL ensure causality where if a client observes the effects of transaction T1, all subsequent transactions from that client SHALL observe T1's effects
6. THE System SHALL prevent all standard isolation anomalies including dirty reads, non-repeatable reads, phantom reads, write skew, and read skew
7. THE System SHALL use timestamp-based ordering to establish a global transaction order across all partitions
8. WHEN a transaction reads data, THE System SHALL ensure the read reflects a consistent snapshot as of the transaction's start timestamp
9. WHEN conflicts are detected between concurrent transactions, THE System SHALL abort one transaction and automatically retry it
10. THE System SHALL provide these consistency guarantees even in the presence of network partitions, node failures, and clock skew

### Requirement 25: Authentication and Authorization

**User Story:** As a system administrator, I want secure authentication and authorization using Keycloak, so that only authorized services and users can access the system.

#### Acceptance Criteria

1. THE System SHALL integrate with Keycloak for authentication and authorization using OAuth 2.0 and OpenID Connect protocols
2. WHEN a node joins the cluster, THE System SHALL authenticate the node using a service account token from Keycloak
3. WHEN services communicate, THE System SHALL validate JWT tokens issued by Keycloak for inter-service authentication
4. THE System SHALL support TLS/SSL for all inter-node communication to ensure confidentiality and integrity
5. WHEN a SQL client connects, THE System SHALL require authentication via Keycloak-issued JWT tokens
6. THE System SHALL validate JWT token signatures using Keycloak's public keys
7. THE System SHALL support role-based access control (RBAC) where permissions are defined in Keycloak and enforced by the system
8. WHEN a JWT token expires, THE System SHALL reject requests and require re-authentication
9. THE System SHALL support configurable Keycloak realm and client settings via environment variables or configuration files
10. THE System SHALL log all authentication and authorization events for security auditing

### Requirement 26: Performance and Scalability Limits

**User Story:** As a system architect, I want clear performance targets and scalability limits, so that I can design applications that meet user expectations and understand when to scale the system.

#### Acceptance Criteria

1. THE System SHALL execute partition queries in parallel with total latency determined by the slowest partition response
2. THE System SHALL support querying up to 1,000 partitions in parallel without coordinator resource exhaustion
3. THE System SHALL limit result buffering to 1GB per query to prevent memory exhaustion at the coordinator
4. THE System SHALL achieve p50 query latency ≤ 100ms for queries spanning any number of partitions when executed in parallel
5. THE System SHALL achieve p99 query latency ≤ 500ms for queries spanning up to 100 partitions
6. THE System SHALL achieve p99 query latency ≤ 1000ms for queries spanning up to 1,000 partitions
7. WHEN tail latency exceeds targets, THE System SHALL identify and log slow partitions for investigation
8. THE System SHALL limit concurrent partition connections per query to 10,000 to prevent coordinator overload
9. THE System SHALL implement streaming aggregation to reduce memory footprint for large result sets
10. THE System SHALL detect slow partitions (latency > 2× median) and log warnings for operator attention
11. THE System SHALL support speculative execution where slow partitions are re-queried on different replicas to reduce tail latency
12. THE System SHALL implement timeout mechanisms to prevent indefinite waiting on straggler partitions
13. THE System SHALL target 100-1,000 partitions per large table for optimal query parallelism
14. THE System SHALL support tables with up to 10,000 partitions for extreme scale requirements
15. THE System SHALL provide warnings when partition count is suboptimal for the workload (too few reduces parallelism, too many increases overhead)

### Requirement 28: Observability and Monitoring

**User Story:** As a system operator, I want comprehensive observability through structured logging to system tables, so that I can monitor, debug, and analyze system behavior using SQL queries.

#### Acceptance Criteria

1. THE System SHALL create a logs system table to store all log entries with structured data
2. DURING bootstrap, THE System SHALL log to stdout and buffer log entries until the logs table is available
3. WHEN bootstrap completes, THE System SHALL flush buffered log entries to the logs table
4. THE System SHALL support log levels: ERROR, WARN, INFO, DEBUG, and TRACE
5. THE System SHALL include structured metadata in log entries (node_id, service_id, timestamp, trace_id, custom fields)
6. THE System SHALL provide SQL interface for querying logs with filtering, aggregation, and time-range queries
7. THE System SHALL support Grafana integration by allowing direct SQL queries against the logs table
8. THE System SHALL implement log retention policies using table policies to automatically remove old log entries
9. THE System SHALL derive metrics from structured log data rather than maintaining separate metrics storage
10. THE System SHALL log all critical operations including queries, transactions, node joins, replica movements, and errors

### Requirement 29: Bootstrap Initialization State Tracking

**User Story:** As a system operator, I want clear visibility into bootstrap initialization progress, so that I can diagnose startup failures and understand which services are initializing.

#### Acceptance Criteria

1. WHEN each initialization phase begins, THE System SHALL log the phase name, node ID, and relevant context at INFO level
2. WHEN each initialization step completes, THE System SHALL log completion status and duration at INFO level
3. WHEN an initialization step fails, THE System SHALL log the error with full context including which step failed, service IDs, and error details at ERROR level
4. WHEN the bootstrap process completes successfully, THE System SHALL log a summary including total services created, partition count, and message group count at INFO level
5. WHEN Raft state changes occur during normal operation, THE System SHALL log them at DEBUG level (not INFO level)
6. WHEN any log message is written, THE System SHALL include relevant identifiers (nodeId, serviceId, partitionId, groupId, tableId, replicaId) in the structured log context
7. WHEN initialization fails, THE System SHALL provide a clear error message indicating what failed, why it failed, and which services were affected
8. THE System SHALL track initialization state through phases: not_started, infrastructure, message_groups, partitions, registration, complete
9. WHEN viewing logs, THE System SHALL use consistent log levels: ERROR for failures, WARN for recoverable issues, INFO for phase transitions, DEBUG for detailed operations
10. WHEN a critical initialization step fails, THE System SHALL clean up all partially initialized services before exiting

### Requirement 30: Dynamic Configuration Management

**User Story:** As a system administrator, I want dynamic configuration management through a system table, so that I can update settings without restarting the system and track configuration changes over time.

#### Acceptance Criteria

1. THE System SHALL create a config system table to store all configuration key-value pairs
2. WHEN the system starts, THE System SHALL seed the config table from environment variables if keys do not already exist
3. THE System SHALL support configuration value types: string, number, boolean, and JSON
4. THE System SHALL allow configuration updates via SQL UPDATE statements
5. THE System SHALL implement configuration watchers that notify components when config values change
6. THE System SHALL support hot reload for configuration changes that do not require restart
7. THE System SHALL mark configuration keys that require system restart with a requires_restart flag
8. THE System SHALL audit configuration changes by recording who made the change and when
9. THE System SHALL provide default values for all configuration keys
10. THE System SHALL validate configuration values before applying changes to prevent invalid configurations

### Requirement 31: Partition Split and Merge Thresholds

**User Story:** As a system administrator, I want configurable thresholds for partition splitting and merging based on storage and traffic, so that the system automatically optimizes partition sizes for performance and resource utilization.

#### Acceptance Criteria

1. THE System SHALL track storage utilization (bytes used) for each partition replica
2. THE System SHALL track query traffic (queries per minute) for each partition over a configurable time window
3. THE System SHALL store partition size in a size_bytes column (INTEGER NOT NULL DEFAULT 0) in the partitions system table
4. THE System SHALL store partition leader node in a leader_node_id column (TEXT) in the partitions system table
5. WHEN partition data changes, THE System SHALL update the partition's size_bytes value
6. WHEN Raft leadership changes for a partition, THE System SHALL update the partition's leader_node_id value
7. THE System SHALL propagate size_bytes and leader_node_id updates via CDC to all message group caches
7. THE System SHALL define split criteria as: storage utilization ≥ split_storage_threshold OR traffic ≥ split_traffic_threshold
8. THE System SHALL define merge criteria as: combined storage utilization ≤ merge_storage_threshold AND combined traffic ≤ merge_traffic_threshold
9. THE System SHALL use default split thresholds: split_storage_threshold = 10GB, split_traffic_threshold = 1000 queries/minute
10. THE System SHALL use default merge thresholds: merge_storage_threshold = 2GB (20% of split storage), merge_traffic_threshold = 200 queries/minute (20% of split traffic)
11. THE System SHALL allow split and merge thresholds to be configured per table via table policies
12. THE System SHALL evaluate split criteria periodically (every 5 minutes by default) for each partition
13. THE System SHALL evaluate merge criteria for adjacent partition pairs (by key range) periodically
14. WHEN a partition meets split criteria, THE System SHALL split it at the median PRIMARY KEY value
15. WHEN two adjacent partitions meet merge criteria, THE System SHALL merge them into a single partition with combined key range
16. THE System SHALL store partition metrics (storage size, query count) in a partition_metrics system table for monitoring and decision-making
17. THE System SHALL calculate partition size using SQLite's page_count and page_size pragmas
18. THE System SHALL update size information asynchronously after data modifications complete
19. THE System SHALL provide query interfaces for partition and table sizes through the admin CLI


## Future Enhancements

The following requirements are planned for future releases to achieve the consistency guarantees specified in Requirement 23.

### Future Requirement 31: Distributed Write Transactions

**User Story:** As a database user, I want to modify data across partitions atomically, so that distributed updates are consistent.

#### Acceptance Criteria

1. WHEN a transaction writes to multiple partitions, THE System SHALL use two-phase commit protocol to ensure atomicity
2. THE System SHALL designate one partition as the transaction coordinator for each distributed transaction
3. WHEN any partition fails to prepare during the prepare phase, THE System SHALL abort the entire transaction across all participants
4. THE System SHALL support distributed deadlock detection across partitions
5. WHEN a transaction coordinator fails, THE System SHALL recover the transaction state and complete or abort appropriately
6. THE System SHALL automatically retry transactions that encounter transient failures
7. THE System SHALL maintain transaction logs for recovery and auditing purposes

### Future Requirement 32: Serializable Isolation Implementation

**User Story:** As a database user, I want serializable isolation implemented, so that the consistency guarantees in Requirement 23 are fully realized.

#### Acceptance Criteria

1. THE System SHALL implement serializable isolation using timestamp-based concurrency control
2. THE System SHALL detect read-write conflicts across partitions using read and write set tracking
3. WHEN conflicts are detected, THE System SHALL abort conflicting transactions and retry automatically with exponential backoff
4. THE System SHALL use hybrid logical clocks (HLC) to establish global transaction order without relying on synchronized physical clocks
5. THE System SHALL provide linearizability for single-key operations by routing them through partition leaders with timestamp validation
6. THE System SHALL ensure external consistency by assigning commit timestamps that respect real-time ordering
7. WHEN a transaction reads data, THE System SHALL track the read set to detect conflicts with concurrent writes
8. THE System SHALL validate read sets at commit time to ensure serializability
9. THE System SHALL support optimistic concurrency control to minimize coordination overhead during transaction execution
10. THE System SHALL handle clock skew gracefully using HLC's logical component to maintain correctness


### Requirement 33: Live Queries

**User Story:** As a database client, I want to subscribe to live queries that stream matching changes in real-time, so that I can build reactive applications without polling.

#### Acceptance Criteria

1. THE System SHALL support LIVE SELECT statements that return initial results and then stream matching changes
2. WHEN a LIVE SELECT is executed, THE System SHALL return an initial snapshot of matching rows
3. WHEN data changes match the LIVE SELECT predicate, THE System SHALL stream INSERT, UPDATE, or DELETE events to subscribed clients
4. THE System SHALL use partition-aware CDC subscriptions based on the WHERE clause and partition key
5. WHEN the WHERE clause contains the partition key, THE System SHALL subscribe only to affected partitions (not all partitions)
6. WHEN a partition splits or merges, THE System SHALL recalculate and update CDC subscriptions for affected live queries
7. THE System SHALL group clients with identical live queries to share a single CDC subscription and predicate evaluation
8. WHEN multiple clients subscribe to the same live query, THE System SHALL evaluate the predicate once and fan-out results to all clients
9. THE System SHALL use lease-based lifecycle management for live query subscriptions
10. WHEN a live query is created, THE System SHALL assign a configurable TTL (default 30 seconds)
11. THE Client SHALL renew the live query lease before expiration to maintain the subscription
12. WHEN a client misses renewal (TTL expires), THE System SHALL clean up the subscription and remove the client from query groups
13. THE System SHALL support cursor-based resumption where renewal messages include the last seen HLC timestamp
14. WHEN a client reconnects with a cursor, THE System SHALL resume streaming from the cursor position if within retention window
15. THE System SHALL detect WebSocket close events for immediate cleanup in addition to lease expiry
16. THE System SHALL compile WHERE clause predicates into efficient evaluation functions
17. WHEN an UPDATE occurs, THE System SHALL evaluate both old and new rows to determine if the change enters, exits, or stays within the predicate
18. THE System SHALL store live query metadata in a live_queries system table for monitoring and debugging
19. THE System SHALL support configurable maximum concurrent live queries per client (default 100)
20. THE System SHALL log live query creation, renewal, and expiration events for observability

### Requirement 34: Function Extensibility Framework

**User Story:** As a system architect, I want extension points for user-defined functions, so that future projects can add programmable logic (such as WASM functions) without modifying core database code.

#### Acceptance Criteria

1. THE System SHALL create a contexts system table for storing named state that can be used by external function executors
2. THE contexts table SHALL support context types including 'function', 'service', and 'user'
3. THE System SHALL propagate context changes via CDC to all message group caches
4. THE System SHALL create a code system table schema for storing function definitions (implementation deferred to external project)
5. THE code table SHALL include fields for function_id, function_name, version, executor_type, code_blob, signature, and permissions
6. THE System SHALL provide a QueryExecutor internal API for programmatic query execution
7. THE QueryExecutor SHALL support executeQuery for direct query execution with results
8. THE QueryExecutor SHALL support executeQueryWithCallback for streaming results to a callback function
9. THE QueryExecutor SHALL support executeQueryThenInvoke for continuation-passing to a named function
10. THE System SHALL provide a FunctionRegistry service with plugin architecture for registering function executors
11. THE FunctionRegistry SHALL support registering executors by type (e.g., 'wasm', 'javascript')
12. THE FunctionRegistry SHALL provide an invoke method that looks up functions and delegates to the appropriate executor
13. WHEN no executor is registered for a function type, THE FunctionRegistry SHALL return an error indicating no executor available
14. THE System SHALL provide a CDCSubscriptionManager API for programmatic CDC subscriptions
15. THE CDCSubscriptionManager SHALL support subscribeWithInvoke that triggers a named function when CDC events match
16. THE System SHALL log function invocations, context updates, and executor registrations for observability
17. THE System SHALL enforce that context writes go through CDC (not direct cache writes) to maintain consistency
18. THE code table SHALL NOT be implemented in this project - only the schema is reserved for future use

### Requirement 32: Admin WebSocket API

**User Story:** As an admin CLI user, I want to connect to database nodes via WebSocket, so that I can receive real-time system state updates and execute administrative queries.

#### Acceptance Criteria

1. THE Node_Service SHALL expose a WebSocket endpoint at `/api/admin/stream` for admin CLI connections
2. WHEN a client connects to the admin stream, THE Node_Service SHALL send a full System_Table_Cache dump
3. THE Cache_Dump message SHALL contain all six System_Table contents: nodes, services, partitions, tables, message_groups, and indices
4. EACH System_Table in the Cache_Dump SHALL be an array of record objects
5. THE Node_Service SHALL send the Cache_Dump within 5 seconds of connection establishment
6. WHEN a System_Table record is inserted, THE Node_Service SHALL send a CDC_Event with operation `insert`
7. WHEN a System_Table record is updated, THE Node_Service SHALL send a CDC_Event with operation `update`
8. WHEN a System_Table record is deleted, THE Node_Service SHALL send a CDC_Event with operation `delete`
9. EACH CDC_Event message SHALL have type `cdc_event`
10. EACH CDC_Event SHALL contain: table name, operation type, record data, and timestamp
11. THE Node_Service SHALL broadcast CDC_Events to all connected admin clients
12. THE Node_Service SHALL support multiple concurrent CLI connections
13. WHEN a client disconnects, THE Node_Service SHALL clean up associated resources without affecting other connections
14. WHEN the Node_Service receives a message with type `query`, THE Node_Service SHALL execute the SQL statement
15. THE Query_Message SHALL contain: queryId, sql statement, and optional parameters
16. THE Node_Service SHALL respond with a message of type `query_result` containing the same queryId
17. WHEN a SELECT query succeeds, THE Query_Result SHALL contain: results array, count, and affected partitions
18. WHEN an INSERT/UPDATE/DELETE query succeeds, THE Query_Result SHALL contain: operation type, affected row count, and affected partitions
19. WHEN a query fails, THE Query_Result SHALL contain an error field with the error message
20. THE Node_Service SHALL execute queries within 30 seconds or return a timeout error
21. THE Query_Result for SELECT queries SHALL include a `results` array of row objects
22. THE Query_Result for SELECT queries SHALL include a `count` field with the total row count
23. THE Query_Result for write operations SHALL include an `operation` field (insert/update/delete)
24. THE Query_Result for write operations SHALL include an `affectedRows` field
25. THE Query_Result SHALL include a `partitions` array listing involved partition IDs
26. THE Query_Result SHALL include a `tableName` field identifying the queried table
27. IF a query produces an error, THE Query_Result SHALL include an `error` field with the message
28. WHEN a query has invalid SQL syntax, THE Node_Service SHALL return an error with code `SYNTAX_ERROR`
29. WHEN a query references a non-existent table, THE Node_Service SHALL return an error with code `TABLE_NOT_FOUND`
30. WHEN a query times out, THE Node_Service SHALL return an error with code `TIMEOUT`
31. WHEN the server encounters an internal error, THE Node_Service SHALL return an error with code `INTERNAL_ERROR`
32. EACH error response SHALL include a human-readable message describing the problem
33. IF available, THE error response SHOULD include a hint for resolving the issue
34. ALL messages SHALL be JSON-encoded
35. ALL messages SHALL have a `type` field identifying the message type
36. THE Node_Service SHALL support these incoming message types: `query`, `refresh`
37. THE Node_Service SHALL send these outgoing message types: `cache_dump`, `cdc_event`, `query_result`
38. WHEN the Node_Service receives an unknown message type, THE Node_Service SHALL ignore it without error
39. THE Node_Service SHALL validate incoming messages and reject malformed JSON with an error response


### Requirement 35: Persistent Partition Storage

**User Story:** As a system administrator, I want partition replicas to always use physical files on disk with a configurable base directory, so that data persists across restarts and I can control where data is stored.

#### Acceptance Criteria

1. THE System SHALL store all partition replica data in physical SQLite files on disk (never in-memory)
2. THE System SHALL support a `--data-dir` command-line parameter to specify the base directory for partition storage
3. WHEN `--data-dir` is not specified, THE System SHALL use a default directory of `./data` relative to the working directory
4. THE System SHALL create the data directory if it does not exist
5. THE System SHALL organize partition files using the pattern `{data-dir}/partitions/{partition-id}/{replica-id}.db`
6. THE System SHALL validate that the data directory is writable at startup
7. IF the data directory is not writable, THE System SHALL fail startup with a clear error message
8. THE System SHALL support the `DATA_DIR` environment variable as an alternative to the command-line parameter
9. WHEN both `--data-dir` and `DATA_DIR` are specified, THE command-line parameter SHALL take precedence
10. THE System SHALL log the configured data directory at startup at INFO level
