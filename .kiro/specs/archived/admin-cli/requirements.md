# Requirements Document

## Introduction

A terminal-based curses CLI administration tool for the distributed database system, inspired by K9s for Kubernetes. The tool provides a modern ASCII UI with panels, tables, dialogs, and views that allows system administrators to connect to any node's service API and navigate the system's hierarchical structure: nodes, services, partitions, tables, and their relationships. The CLI includes an interactive SQL query interface and comprehensive metadata display.

## Glossary

- **Admin_CLI**: The terminal-based administration tool
- **Service_API**: REST API endpoint on each node for administrative operations
- **Panel**: A UI region displaying related information (e.g., node list, service details)
- **View**: A screen configuration showing one or more panels with specific data
- **Navigation_Context**: The current position in the entity hierarchy (e.g., viewing services for node-1)
- **Entity**: A system object that can be viewed/managed (node, service, partition, table, message_group)
- **Drill_Down**: Navigation from a parent entity to its related child entities
- **Breadcrumb**: Visual indicator of the current navigation path
- **Status_Bar**: Bottom panel showing connection status, shortcuts, and context
- **Command_Palette**: Quick-access command input for filtering and actions
- **Refresh_Interval**: Configurable polling frequency for fallback data updates
- **CDC_Stream**: WebSocket-based change data capture stream for real-time updates
- **Remote_Cache**: Client-side cache of system table data maintained via CDC subscription
- **Cache_Sync**: Process of synchronizing the Remote_Cache with server-side System_Table_Cache
- **SQL_Query_View**: A view in the Admin CLI for executing SQL queries interactively
- **Query_Input**: A multi-line text input area for entering SQL statements
- **Results_Panel**: A panel displaying query results in tabular format
- **Query_History**: A list of previously executed queries stored for reuse
- **Table_Metadata**: Information about a table including its partitions, replicas, size, and policies
- **Live_Query**: A LIVE SELECT subscription that streams matching changes in real-time via CDC
- **Live_Query_Subscription**: An active subscription to a live query that receives INSERT, UPDATE, DELETE events
- **Logs_View**: A view for querying and filtering the logs system table
- **Config_View**: A view for viewing and editing the config system table
- **Contexts_View**: A view for viewing function execution contexts from the contexts system table

## Requirements

### Requirement 1: Connection Management

**User Story:** As a system administrator, I want to connect to any node in the cluster, so that I can administer the distributed database from any entry point.

#### Acceptance Criteria

1. WHEN the Admin_CLI starts with a node address argument, THE Admin_CLI SHALL connect to that node's Service_API
2. WHEN the Admin_CLI starts without arguments, THE Admin_CLI SHALL prompt for a node address
3. WHEN connection fails, THE Admin_CLI SHALL display an error message and allow retry or exit
4. WHILE connected, THE Admin_CLI SHALL display the connection status in the Status_Bar
5. WHEN the connection is lost, THE Admin_CLI SHALL attempt automatic reconnection with exponential backoff
6. THE Admin_CLI SHALL connect via WebSocket to enable bidirectional CDC streaming
7. WHEN connected, THE Admin_CLI SHALL request initial System_Table_Cache dump and subscribe to CDC_Stream

### Requirement 2: Node List View

**User Story:** As a system administrator, I want to see all nodes in the cluster, so that I can monitor cluster health and select nodes for detailed inspection.

#### Acceptance Criteria

1. WHEN the user selects the Nodes view, THE Admin_CLI SHALL display a table of all nodes with columns: node_id, address, status, CPU%, memory%, disk%, services_count
2. WHEN a node's status changes, THE Admin_CLI SHALL update the display within the configured Refresh_Interval
3. WHEN the user presses Enter on a node row, THE Admin_CLI SHALL drill down to show services on that node
4. THE Admin_CLI SHALL highlight nodes with warning conditions (high resource usage, failed status) using distinct colors
5. WHEN the user types a filter string, THE Admin_CLI SHALL filter the node list to matching entries
6. THE Admin_CLI SHALL support sorting by any column via keyboard shortcuts

### Requirement 3: Service List View

**User Story:** As a system administrator, I want to see all services running on a node or across the cluster, so that I can monitor service health and distribution.

#### Acceptance Criteria

1. WHEN viewing services for a specific node, THE Admin_CLI SHALL display services filtered to that node
2. WHEN viewing all services, THE Admin_CLI SHALL display a table with columns: service_id, type, node_id, status, address
3. WHEN the user presses Enter on a partition service, THE Admin_CLI SHALL drill down to partition details
4. WHEN the user presses Enter on a message_group service, THE Admin_CLI SHALL drill down to message group details
5. THE Admin_CLI SHALL indicate service roles (leader, follower) for Raft-based services
6. THE Admin_CLI SHALL support filtering services by type (partition, message_group, node)
7. WHEN viewing detail panel for a partition service, THE Admin_CLI SHALL display storage_bytes from partition_metrics
8. WHEN viewing detail panel for a message_group service, THE Admin_CLI SHALL display aggregate storage_bytes of all partitions using that message group

### Requirement 4: Table List View

**User Story:** As a system administrator, I want to see all tables in the system with comprehensive metadata, so that I can understand data organization, storage usage, and navigate to partition details.

#### Acceptance Criteria

1. WHEN the user selects the Tables view, THE Admin_CLI SHALL display a table with columns: table_name, partition_count, replica_factor, total_size, policy_summary
2. WHEN the user presses Enter on a table row, THE Admin_CLI SHALL drill down to show partitions for that table
3. THE Admin_CLI SHALL display table policies in a readable summary format
4. WHEN the user requests table details, THE Admin_CLI SHALL show full schema definition and policy configuration
5. THE Admin_CLI SHALL support filtering tables by name pattern
6. WHEN displaying tables, THE Admin_CLI SHALL compute partition_count by counting partitions for each table from the Remote_Cache
7. WHEN displaying tables, THE Admin_CLI SHALL compute replica_factor as the most common replica_count value across a table's partitions
8. WHEN displaying table size, THE Admin_CLI SHALL format the size with appropriate units (B, KB, MB, GB, TB)
9. WHEN a table has no partitions, THE Admin_CLI SHALL display "0" for partition_count and "0 B" for total_size
10. WHEN partition or size data is unavailable, THE Admin_CLI SHALL display "N/A" for the affected fields
11. WHEN a table has a placement_policy, THE Admin_CLI SHALL include the policy type in the display
12. WHEN a table has a replication_policy, THE Admin_CLI SHALL include the replication strategy in the display
13. WHEN a table has consistency_level, durability, or compression settings, THE Admin_CLI SHALL include these in the policy summary
14. WHEN a table has no custom policies, THE Admin_CLI SHALL display "Default" for the policy
15. WHEN the policy summary is too long for the column width, THE Admin_CLI SHALL truncate it with an ellipsis

### Requirement 5: Partition View

**User Story:** As a system administrator, I want to see partition details and replica distribution, so that I can verify data placement and troubleshoot issues.

#### Acceptance Criteria

1. WHEN viewing partitions for a table, THE Admin_CLI SHALL display columns: partition_id, key_range, replica_count, leader_node_id, storage_size, status
2. WHEN the user presses Enter on a partition, THE Admin_CLI SHALL show replica details including node locations and sync status
3. THE Admin_CLI SHALL indicate which replica is the current leader
4. WHEN viewing partition replicas, THE Admin_CLI SHALL allow navigation to the hosting node
5. THE Admin_CLI SHALL display partition key range boundaries clearly
6. THE Admin_CLI SHALL highlight partitions with fewer replicas than configured
7. THE Admin_CLI SHALL display partition storage size by reading from partition size_bytes in the Remote_Cache
8. WHEN partition size data is unavailable, THE Admin_CLI SHALL display "N/A" for storage size
9. THE Admin_CLI SHALL display the leader_node_id column from the partitions system table

### Requirement 6: Message Group View

**User Story:** As a system administrator, I want to see message group distribution, so that I can verify communication infrastructure health.

#### Acceptance Criteria

1. WHEN the user selects the Message Groups view, THE Admin_CLI SHALL display columns: group_id, replica_count, nodes_covered, status
2. WHEN the user presses Enter on a message group, THE Admin_CLI SHALL show replica locations and their status
3. THE Admin_CLI SHALL indicate which nodes have local message group access
4. THE Admin_CLI SHALL highlight message groups with unhealthy replicas
5. WHEN viewing message group replicas, THE Admin_CLI SHALL allow navigation to the hosting node

### Requirement 7: SQL Query View

**User Story:** As a system administrator, I want to execute SQL queries from the CLI, so that I can test the database system and inspect data without external tools.

#### Acceptance Criteria

1. WHEN the user presses '6' or navigates to SQL view, THE Admin_CLI SHALL display the SQL_Query_View
2. THE SQL_Query_View SHALL include a Query_Input area for entering SQL statements
3. THE Query_Input SHALL support multi-line SQL statements
4. THE Query_Input SHALL support basic text editing (cursor movement, backspace, delete)
5. WHEN the user presses Ctrl+Enter or a designated execute key, THE Admin_CLI SHALL execute the query
6. THE SQL_Query_View SHALL display query results in a Results_Panel below the input area
7. WHEN a SELECT query succeeds, THE Results_Panel SHALL display results in a table with column headers
8. THE Results_Panel SHALL support scrolling for large result sets
9. THE Results_Panel SHALL display the row count and execution time
10. WHEN an INSERT/UPDATE/DELETE query succeeds, THE Results_Panel SHALL display affected row count
11. WHEN a query fails, THE Results_Panel SHALL display the error message clearly
12. THE Results_Panel SHALL indicate which partitions were involved in the query
13. THE SQL_Query_View SHALL use the same color scheme as other views
14. THE SQL_Query_View SHALL display connection status in the status bar
15. THE SQL_Query_View SHALL support the standard quit ('q') and help ('?') shortcuts

### Requirement 8: Query History

**User Story:** As a system administrator, I want to access previously executed queries, so that I can reuse and modify them without retyping.

#### Acceptance Criteria

1. THE SQL_Query_View SHALL maintain a Query_History of executed queries
2. WHEN the user presses Up/Down arrows in the Query_Input, THE Admin_CLI SHALL navigate through Query_History
3. THE Query_History SHALL persist across CLI sessions
4. THE Query_History SHALL store up to 100 recent queries
5. WHEN the user selects a history item, THE Admin_CLI SHALL populate the Query_Input with that query

### Requirement 9: Query Input Assistance

**User Story:** As a system administrator, I want input assistance when writing queries, so that I can write queries more efficiently.

#### Acceptance Criteria

1. THE Query_Input SHALL provide syntax highlighting for SQL keywords
2. THE Query_Input SHALL display available tables from the cache when typing FROM clause
3. WHEN the user presses Tab, THE Admin_CLI SHALL attempt to autocomplete table names
4. THE SQL_Query_View SHALL display a hint bar showing available keyboard shortcuts
5. THE Query_Input SHALL support clearing the input with Escape key

### Requirement 10: Query Execution Safety

**User Story:** As a system administrator, I want safeguards when executing queries, so that I don't accidentally modify data.

#### Acceptance Criteria

1. WHEN executing a DELETE or UPDATE without WHERE clause, THE Admin_CLI SHALL display a confirmation prompt
2. THE Admin_CLI SHALL display a warning indicator for write operations (INSERT/UPDATE/DELETE)
3. THE SQL_Query_View SHALL support a read-only mode that only allows SELECT queries
4. WHEN in read-only mode, THE Admin_CLI SHALL reject write operations with a clear message

### Requirement 11: Hierarchical Navigation

**User Story:** As a system administrator, I want to navigate between related entities, so that I can trace relationships and troubleshoot issues efficiently.

#### Acceptance Criteria

1. THE Admin_CLI SHALL support navigation paths: nodes → services → partition/message_group details
2. THE Admin_CLI SHALL support navigation paths: tables → partitions → replicas → nodes
3. WHEN drilling down, THE Admin_CLI SHALL display a Breadcrumb showing the navigation path
4. WHEN the user presses Escape or Backspace, THE Admin_CLI SHALL navigate up one level in the hierarchy
5. THE Admin_CLI SHALL support jumping directly to related entities (e.g., from replica to its node)
6. WHEN viewing any entity, THE Admin_CLI SHALL show counts of related child entities

### Requirement 12: Real-time Updates via CDC

**User Story:** As a system administrator, I want to see live system state via CDC streaming, so that I can monitor changes as they happen without polling overhead.

#### Acceptance Criteria

1. WHEN connected, THE Admin_CLI SHALL establish a CDC_Stream subscription to receive system table changes
2. THE Admin_CLI SHALL maintain a Remote_Cache that mirrors the server's System_Table_Cache via CDC events
3. WHEN a CDC event is received, THE Admin_CLI SHALL update the Remote_Cache and refresh affected views immediately
4. WHEN data changes, THE Admin_CLI SHALL highlight changed rows briefly to indicate updates
5. THE Admin_CLI SHALL display the CDC stream status (connected, lag, events/sec) in the Status_Bar
6. WHEN the CDC_Stream disconnects, THE Admin_CLI SHALL fall back to polling at the configured Refresh_Interval
7. THE Admin_CLI SHALL support pausing CDC updates via keyboard shortcut for stable inspection
8. WHEN CDC is paused, THE Admin_CLI SHALL indicate stale data and allow manual refresh
9. THE Admin_CLI SHALL display the last update timestamp in the Status_Bar
10. WHEN partition data changes via CDC, THE Admin_CLI SHALL recompute affected table metadata

### Requirement 13: Remote Cache Management

**User Story:** As a system administrator, I want the CLI to maintain a local cache of system state, so that navigation is fast and the server is not overloaded.

#### Acceptance Criteria

1. WHEN connecting to a node, THE Admin_CLI SHALL request a full System_Table_Cache dump for initial sync
2. THE Remote_Cache SHALL store: nodes, services, partitions, tables, message_groups, indices, logs, config, contexts
3. WHEN navigating between views, THE Admin_CLI SHALL read from the Remote_Cache without additional API calls
4. WHEN a CDC event indicates a change, THE Admin_CLI SHALL apply the change to the Remote_Cache
5. THE Admin_CLI SHALL track cache freshness and display staleness warnings if CDC lag exceeds threshold
6. WHEN the user requests a force refresh, THE Admin_CLI SHALL request a full cache dump and resync
7. THE Admin_CLI SHALL persist the Remote_Cache to disk for faster startup on reconnection to the same cluster
8. WHEN computing table metadata, THE Admin_CLI SHALL complete calculations within 100ms for up to 1000 tables
9. THE Admin_CLI SHALL cache computed metadata to avoid redundant calculations

### Requirement 14: Keyboard Navigation

**User Story:** As a system administrator, I want efficient keyboard-driven navigation, so that I can work quickly without a mouse.

#### Acceptance Criteria

1. THE Admin_CLI SHALL support arrow keys for row selection in tables
2. THE Admin_CLI SHALL support Page Up/Down for fast scrolling
3. THE Admin_CLI SHALL support Home/End for jumping to first/last row
4. THE Admin_CLI SHALL support number keys (1-9) for quick view switching
5. THE Admin_CLI SHALL support '/' for entering filter mode
6. THE Admin_CLI SHALL support ':' for entering command mode
7. THE Admin_CLI SHALL support 'q' for quit and Escape for cancel/back
8. THE Admin_CLI SHALL display available shortcuts in the Status_Bar

### Requirement 15: Command Palette

**User Story:** As a system administrator, I want quick access to commands and actions, so that I can perform operations efficiently.

#### Acceptance Criteria

1. WHEN the user presses ':', THE Admin_CLI SHALL display a command input field
2. THE Admin_CLI SHALL support commands: connect, refresh, filter, sort, goto, help, quit, sql
3. WHEN typing a command, THE Admin_CLI SHALL show autocomplete suggestions
4. WHEN a command has parameters, THE Admin_CLI SHALL prompt for required values
5. IF an invalid command is entered, THEN THE Admin_CLI SHALL display an error message
6. THE Admin_CLI SHALL maintain command history accessible via up/down arrows

### Requirement 16: Detail Panels

**User Story:** As a system administrator, I want to see detailed information about selected entities, so that I can understand their full configuration and state.

#### Acceptance Criteria

1. WHEN the user presses 'd' on a selected entity, THE Admin_CLI SHALL display a detail panel
2. THE detail panel SHALL show all entity attributes in a readable format
3. THE detail panel SHALL show related entity counts and quick navigation links
4. THE Admin_CLI SHALL support scrolling within detail panels for long content
5. WHEN viewing node details, THE Admin_CLI SHALL show resource statistics, service list, and configuration
6. WHEN viewing partition details, THE Admin_CLI SHALL show Raft state, replica sync status, and recent CDC events

### Requirement 17: Visual Indicators

**User Story:** As a system administrator, I want clear visual feedback about system state, so that I can quickly identify issues.

#### Acceptance Criteria

1. THE Admin_CLI SHALL use color coding: green for healthy, yellow for warning, red for error/failed
2. THE Admin_CLI SHALL use distinct icons or symbols for entity types (node, partition, message_group)
3. THE Admin_CLI SHALL highlight the currently selected row
4. THE Admin_CLI SHALL indicate loading state during data fetches
5. THE Admin_CLI SHALL use box-drawing characters for panel borders
6. THE Admin_CLI SHALL support monochrome mode for terminals without color support

### Requirement 18: Configuration

**User Story:** As a system administrator, I want to customize the CLI behavior, so that it fits my workflow and environment.

#### Acceptance Criteria

1. THE Admin_CLI SHALL read configuration from ~/.ddb-admin/config.json if present
2. THE Admin_CLI SHALL support configuration options: refresh_interval, default_view, color_scheme, keybindings
3. THE Admin_CLI SHALL support command-line arguments to override configuration
4. WHEN configuration is invalid, THE Admin_CLI SHALL use defaults and display a warning
5. THE Admin_CLI SHALL support environment variables for connection settings (DDB_NODE_ADDRESS)

### Requirement 19: Error Handling

**User Story:** As a system administrator, I want clear error messages and graceful degradation, so that I can understand and recover from problems.

#### Acceptance Criteria

1. WHEN an API call fails, THE Admin_CLI SHALL display the error in a non-blocking notification
2. WHEN partial data is available, THE Admin_CLI SHALL display it with indicators for missing sections
3. THE Admin_CLI SHALL log errors to ~/.ddb-admin/error.log for debugging
4. WHEN the terminal is resized, THE Admin_CLI SHALL adapt the layout gracefully
5. IF the terminal is too small, THEN THE Admin_CLI SHALL display a minimum size warning
6. WHEN partition data is missing for a table, THE Admin_CLI SHALL display "N/A" for size and replica count
7. WHEN a table exists but has no partitions, THE Admin_CLI SHALL display "0" for partition count and "0 B" for size
8. WHEN policy data is malformed or unparseable, THE Admin_CLI SHALL display "Default" for the policy
9. THE Admin_CLI SHALL NOT crash or throw errors when encountering missing or invalid metadata
10. THE Admin_CLI SHALL log warnings when metadata computation encounters unexpected data

### Requirement 20: Help System

**User Story:** As a system administrator, I want built-in help, so that I can learn the tool without external documentation.

#### Acceptance Criteria

1. WHEN the user presses '?', THE Admin_CLI SHALL display a help overlay with all keyboard shortcuts
2. THE Admin_CLI SHALL display context-sensitive help based on the current view
3. WHEN the user runs with --help flag, THE Admin_CLI SHALL display usage information and exit
4. THE help overlay SHALL be dismissible with any key press
5. THE Admin_CLI SHALL display brief hints in the Status_Bar for common actions

### Requirement 21: Documentation

**User Story:** As a new user, I want comprehensive documentation for the CLI tool, so that I can learn how to use it effectively without external help.

#### Acceptance Criteria

1. THE Documentation SHALL include a README file with installation instructions and quick start guide
2. THE Documentation SHALL include a User Guide covering all major features with examples
3. THE User Guide SHALL document the connection process including address formats and authentication
4. THE User Guide SHALL document each view (Nodes, Services, Tables, Partitions, Message Groups, SQL, Logs, Config, Contexts) with screenshots or ASCII representations
5. THE User Guide SHALL document navigation patterns including drill-down, back navigation, and breadcrumbs
6. THE User Guide SHALL document filtering and sorting capabilities with examples
7. THE User Guide SHALL document the detail panel feature and how to access entity details
8. THE User Guide SHALL document the command palette with all available commands
9. THE User Guide SHALL include troubleshooting section for common issues
10. THE Command_Reference SHALL list all keyboard shortcuts organized by category
11. THE Command_Reference SHALL document all command palette commands with syntax and examples
12. THE Command_Reference SHALL document configuration options and environment variables
13. THE Command_Reference SHALL document command-line arguments and flags
14. THE Command_Reference SHALL be accessible both as a standalone document and via the CLI help system
15. THE User Guide SHALL document live query subscriptions including LIVE SELECT syntax and event streaming

### Requirement 22: Centralized State Management

**User Story:** As a CLI developer, I want a single source of truth for application state, so that state changes are predictable and debugging is easier.

#### Acceptance Criteria

1. THE Admin_CLI SHALL implement a StateManager that holds all application state
2. THE StateManager SHALL manage: connection status, cache data, navigation state, UI state, configuration
3. WHEN state changes, THE StateManager SHALL emit events to notify subscribers
4. THE StateManager SHALL support state snapshots for debugging and time-travel
5. ALL components SHALL read state from StateManager, not maintain local copies
6. THE StateManager SHALL validate state transitions to prevent invalid states
7. THE StateManager SHALL provide a read-only view of state to prevent unauthorized mutations

### Requirement 23: View-Detail Panel Coordination

**User Story:** As a CLI developer, I want automatic coordination between views and detail panels, so that I don't have to manually wire up selection events.

#### Acceptance Criteria

1. THE Admin_CLI SHALL implement a ViewDetailCoordinator component
2. WHEN a view registers with the coordinator, THE coordinator SHALL automatically wire selection events
3. WHEN a row is selected in any view, THE coordinator SHALL update the detail panel automatically
4. THE coordinator SHALL handle detail panel visibility based on view configuration
5. THE coordinator SHALL support multiple detail panel layouts (side, bottom, overlay)
6. WHEN switching views, THE coordinator SHALL preserve or clear detail panel state as configured
7. THE coordinator SHALL handle edge cases (empty selection, view with no details)

### Requirement 24: Component Registry and Dependency Injection

**User Story:** As a CLI developer, I want clean dependency management, so that components are loosely coupled and testable.

#### Acceptance Criteria

1. THE Admin_CLI SHALL implement a ComponentRegistry for dependency injection
2. WHEN the application starts, THE registry SHALL initialize all components in dependency order
3. COMPONENTS SHALL declare dependencies via constructor parameters or registration metadata
4. THE registry SHALL resolve dependencies automatically and inject them
5. THE registry SHALL support singleton and factory component lifecycles
6. WHEN testing, THE registry SHALL allow mock component registration
7. THE registry SHALL detect circular dependencies and report errors

### Requirement 25: Event Bus Architecture

**User Story:** As a CLI developer, I want a central event bus, so that components can communicate without tight coupling.

#### Acceptance Criteria

1. THE Admin_CLI SHALL implement an EventBus for inter-component communication
2. THE EventBus SHALL support namespaced events (e.g., 'view:selection', 'cache:update')
3. WHEN an event is emitted, THE EventBus SHALL deliver it to all registered handlers
4. THE EventBus SHALL support event priorities for handler execution order
5. THE EventBus SHALL support one-time event handlers that auto-unregister
6. THE EventBus SHALL log all events when debug mode is enabled
7. THE EventBus SHALL support wildcard subscriptions (e.g., 'cache:*')

### Requirement 26: Development and Debugging Tools

**User Story:** As a CLI developer, I want built-in debugging tools, so that I can diagnose issues during development.

#### Acceptance Criteria

1. THE Admin_CLI SHALL implement a DevTools overlay accessible via keyboard shortcut
2. THE DevTools SHALL display current application state in a tree view
3. THE DevTools SHALL show recent events with timestamps and payloads
4. THE DevTools SHALL display component registry and dependency graph
5. THE DevTools SHALL show CDC event stream with filtering capabilities
6. THE DevTools SHALL support state snapshots and restoration for testing
7. THE DevTools SHALL be disabled in production builds
8. WHEN DevTools is open, THE Admin_CLI SHALL log performance metrics (render time, event latency)

### Requirement 27: View Models for Business Logic Separation

**User Story:** As a CLI developer, I want view models to separate UI from business logic, so that views are simpler and logic is reusable.

#### Acceptance Criteria

1. EACH view SHALL have a corresponding ViewModel class
2. THE ViewModel SHALL handle data transformation, filtering, sorting, and formatting
3. THE ViewModel SHALL expose computed properties derived from state
4. THE View SHALL only handle rendering and user input, delegating logic to ViewModel
5. THE ViewModel SHALL be testable without UI dependencies
6. WHEN state changes, THE ViewModel SHALL recompute affected properties
7. THE ViewModel SHALL emit events when computed properties change

### Requirement 28: Configuration-Driven View Definitions

**User Story:** As a CLI developer, I want to define views declaratively, so that adding new views requires minimal code.

#### Acceptance Criteria

1. THE Admin_CLI SHALL support JSON/YAML view configuration files
2. THE view configuration SHALL define: columns, data source, filters, actions, detail panel layout
3. WHEN a view configuration is loaded, THE Admin_CLI SHALL generate the view automatically
4. THE configuration SHALL support computed columns with expression syntax
5. THE configuration SHALL support conditional styling rules
6. THE configuration SHALL define keyboard shortcuts and actions per view
7. WHEN configuration is invalid, THE Admin_CLI SHALL report errors with line numbers
8. THE Admin_CLI SHALL support hot-reloading of view configurations in development mode

### Requirement 29: Logs View

**User Story:** As a system administrator, I want to view and query system logs, so that I can monitor, debug, and audit system behavior.

#### Acceptance Criteria

1. WHEN the user selects the Logs view, THE Admin_CLI SHALL display a table with columns: timestamp, level, node_id, service_id, message
2. THE Admin_CLI SHALL support filtering logs by level (ERROR, WARN, INFO, DEBUG, TRACE)
3. THE Admin_CLI SHALL support filtering logs by node_id
4. THE Admin_CLI SHALL support filtering logs by service_id
5. THE Admin_CLI SHALL support filtering logs by time range
6. THE Admin_CLI SHALL support filtering logs by message content (text search)
7. WHEN the user presses Enter on a log entry, THE Admin_CLI SHALL display full log details including all structured metadata
8. THE Admin_CLI SHALL highlight ERROR logs in red and WARN logs in yellow
9. THE Admin_CLI SHALL support real-time log streaming via CDC when viewing recent logs
10. THE Admin_CLI SHALL support exporting filtered logs to a file
11. THE Admin_CLI SHALL display log count and time range in the status bar
12. THE Admin_CLI SHALL support sorting logs by timestamp (ascending or descending)

### Requirement 30: Config View

**User Story:** As a system administrator, I want to view and edit system configuration, so that I can tune system behavior without restarting nodes.

#### Acceptance Criteria

1. WHEN the user selects the Config view, THE Admin_CLI SHALL display a table with columns: key, value, type, requires_restart, last_modified
2. THE Admin_CLI SHALL support filtering config entries by key pattern
3. WHEN the user presses Enter on a config entry, THE Admin_CLI SHALL display full config details including description and default value
4. THE Admin_CLI SHALL support editing config values via a command or keyboard shortcut
5. WHEN editing a config value, THE Admin_CLI SHALL validate the value against the expected type
6. WHEN a config change requires restart, THE Admin_CLI SHALL display a warning indicator
7. THE Admin_CLI SHALL highlight config entries that differ from their default values
8. THE Admin_CLI SHALL support reverting a config entry to its default value
9. THE Admin_CLI SHALL display a confirmation prompt before applying config changes
10. THE Admin_CLI SHALL show which node(s) will be affected by a config change

### Requirement 31: Contexts View

**User Story:** As a system administrator, I want to view function execution contexts, so that I can monitor and debug user-defined functions.

#### Acceptance Criteria

1. WHEN the user selects the Contexts view, THE Admin_CLI SHALL display a table with columns: context_id, context_type, name, created_at, updated_at
2. THE Admin_CLI SHALL support filtering contexts by type (function, service, user)
3. WHEN the user presses Enter on a context entry, THE Admin_CLI SHALL display full context details including state data
4. THE Admin_CLI SHALL highlight contexts that have been recently updated
5. THE Admin_CLI SHALL support filtering contexts by name pattern
6. THE Admin_CLI SHALL display context count by type in the status bar

### Requirement 32: Live Query Support

**User Story:** As a system administrator, I want to create and monitor live query subscriptions, so that I can observe real-time data changes.

#### Acceptance Criteria

1. THE SQL_Query_View SHALL support LIVE SELECT statements that stream matching changes
2. WHEN a LIVE SELECT is executed, THE Admin_CLI SHALL display initial results and then stream INSERT, UPDATE, DELETE events
3. THE Admin_CLI SHALL display live query events in a streaming results panel below the initial results
4. EACH live query event SHALL show: event_type (INSERT/UPDATE/DELETE), timestamp, and row data
5. THE Admin_CLI SHALL highlight INSERT events in green, UPDATE events in yellow, and DELETE events in red
6. THE Admin_CLI SHALL display the live query subscription status (active, paused, expired) in the status bar
7. THE Admin_CLI SHALL support pausing and resuming live query subscriptions via keyboard shortcut
8. WHEN a live query subscription expires, THE Admin_CLI SHALL display a notification and offer to renew
9. THE Admin_CLI SHALL support canceling a live query subscription via keyboard shortcut or command
10. THE Admin_CLI SHALL display the event rate (events/sec) for active live queries
11. THE Admin_CLI SHALL support multiple concurrent live query subscriptions (up to configured limit)
12. WHEN viewing live query results, THE Admin_CLI SHALL support scrolling through historical events
13. THE Admin_CLI SHALL persist live query definitions for quick re-execution
14. THE Admin_CLI SHALL display which partitions are being monitored by the live query
