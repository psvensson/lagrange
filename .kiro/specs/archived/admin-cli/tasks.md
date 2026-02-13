# Implementation Plan: Admin CLI

## Overview

This implementation plan breaks down the Admin CLI into incremental tasks that build upon each other. The CLI follows a layered approach: core infrastructure, cache management, views, SQL interface, and finally the new views (Logs, Config, Contexts) and Live Query support. Each task references specific requirements and includes property-based tests where applicable.

## Tasks

- [x] 1. Project Setup and Core Infrastructure
  - [x] 1.1 Initialize CLI project structure
    - Create package.json with CLI entry point
    - Configure ESLint with Google JavaScript style guide
    - Set up tap test framework with fast-check for property-based testing
    - Install dependencies: blessed, blessed-contrib, chalk, ws, node-fetch, ajv, dotenv, lodash, dayjs
    - _Requirements: 18.1, 18.2_

  - [x] 1.2 Implement EventBus for inter-component communication
    - Create EventBus class with namespaced events
    - Implement on(), once(), off(), emit() methods
    - Support event priorities and wildcard subscriptions
    - Add debug mode with event logging
    - _Requirements: 25.1, 25.2, 25.3, 25.4, 25.5, 25.6, 25.7_

  - [x] 1.3 Write property test for Event Bus Delivery Completeness
    - **Property 34: Event Bus Delivery Completeness**
    - **Validates: Requirements 25.3**

  - [x] 1.4 Write property test for Event Priority Ordering
    - **Property 39: Event Priority Ordering**
    - **Validates: Requirements 25.4**

  - [x] 1.5 Implement StateManager for centralized state
    - Create StateManager class with immutable state snapshots
    - Implement getState(), setState(), batchUpdate() methods
    - Add state validation for connection status and navigation
    - Support snapshot creation and restoration
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.5, 22.6, 22.7_

  - [x] 1.6 Write property test for State Validation Consistency
    - **Property 33: State Validation Consistency**
    - **Validates: Requirements 22.6**

  - [x] 1.7 Write property test for State Snapshot Restoration
    - **Property 37: State Snapshot Restoration**
    - **Validates: Requirements 22.4**

  - [x] 1.8 Implement ComponentRegistry for dependency injection
    - Create ComponentRegistry class with factory registration
    - Implement topological sort for initialization order
    - Add circular dependency detection
    - Support singleton and factory lifecycles
    - _Requirements: 24.1, 24.2, 24.3, 24.4, 24.5, 24.6, 24.7_

  - [x] 1.9 Write property test for Component Dependency Resolution
    - **Property 35: Component Dependency Resolution**
    - **Validates: Requirements 24.3, 24.4**

  - [x] 1.10 Write property test for Circular Dependency Detection
    - **Property 40: Circular Dependency Detection**
    - **Validates: Requirements 24.7**

- [x] 2. Checkpoint - Verify core infrastructure
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Configuration and Connection Management
  - [x] 3.1 Implement ConfigManager
    - Create ConfigManager class with default configuration
    - Load configuration from ~/.ddb-admin/config.json
    - Support environment variable overrides (DDB_NODE_ADDRESS, DDB_REFRESH_INTERVAL)
    - Apply CLI argument overrides
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5_

  - [x] 3.2 Write property test for Configuration Validation
    - **Property 14: Configuration Validation**
    - **Validates: Requirements 18.2, 18.4**

  - [x] 3.3 Implement ConnectionManager with WebSocket
    - Create ConnectionManager class for WebSocket connections
    - Implement connect(), disconnect(), scheduleReconnect() methods
    - Handle exponential backoff for reconnection
    - Support CDC event and query result callbacks
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [x] 3.4 Write property test for Reconnection Backoff
    - **Property 12: Reconnection Backoff**
    - **Validates: Requirements 1.5**

- [x] 4. Remote Cache Implementation
  - [x] 4.1 Implement RemoteCache class
    - Create RemoteCache with tables for nodes, services, partitions, tables, message_groups, indices, logs, config, contexts
    - Implement loadFromDump() for initial sync
    - Implement applyCDCEvent() for real-time updates
    - Add query methods: getNodes(), getServices(), getTables(), getPartitions(), getMessageGroups(), getLogs(), getConfig(), getContexts()
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6_

  - [x] 4.2 Write property test for CDC Cache Consistency
    - **Property 5: CDC Cache Consistency**
    - **Validates: Requirements 12.2, 12.3, 13.4**

  - [x] 4.3 Write property test for Cache Serialization Round-Trip
    - **Property 10: Cache Serialization Round-Trip**
    - **Validates: Requirements 13.7**

  - [x] 4.4 Implement TableMetadataComputer
    - Create TableMetadataComputer class for computing partition_count and replica_factor
    - Implement metadata caching to avoid redundant calculations
    - Handle missing or invalid partition data gracefully
    - _Requirements: 4.6, 4.7, 13.8, 13.9_

  - [x] 4.5 Write property test for Partition Count Accuracy
    - **Property 26: Partition Count Accuracy**
    - **Validates: Requirements 4.6, 4.9**

  - [x] 4.6 Write property test for Replica Factor Most Common
    - **Property 27: Replica Factor Most Common**
    - **Validates: Requirements 4.7**

  - [x] 4.7 Write property test for Metadata Enrichment Idempotence
    - **Property 28: Metadata Enrichment Idempotence**
    - **Validates: Requirements 4.6, 4.7**

  - [x] 4.8 Write property test for Graceful Degradation
    - **Property 29: Graceful Degradation**
    - **Validates: Requirements 19.6, 19.7, 19.8, 19.9**

  - [x] 4.9 Write property test for Cache Query Methods Completeness
    - **Property 53: Cache Query Methods Completeness**
    - **Validates: Requirements 13.2**

- [x] 5. Checkpoint - Verify cache implementation
  - Ensure all tests pass, ask the user if questions arise.


- [x] 6. Navigation and View Infrastructure
  - [x] 6.1 Implement NavigationController
    - Create NavigationController class for hierarchical navigation
    - Implement drillDown(), goBack(), goToView(), jumpToEntity() methods
    - Generate breadcrumb strings from navigation stack
    - Support navigation paths: nodes → services → details, tables → partitions → replicas
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

  - [x] 6.2 Write property test for Breadcrumb Accuracy
    - **Property 7: Breadcrumb Accuracy**
    - **Validates: Requirements 11.3**

  - [x] 6.3 Write property test for Back Navigation Consistency
    - **Property 8: Back Navigation Consistency**
    - **Validates: Requirements 11.4**

  - [x] 6.4 Write property test for Related Entity Counts
    - **Property 9: Related Entity Counts**
    - **Validates: Requirements 11.6**

  - [x] 6.5 Implement BaseView class
    - Create BaseView class with common view functionality
    - Implement applyFilter(), applySort(), render() methods
    - Support row status styling (normal, warning, error)
    - Handle changed row highlighting
    - _Requirements: 2.5, 2.6, 17.1, 17.3_

  - [x] 6.6 Write property test for Filter Correctness
    - **Property 2: Filter Correctness**
    - **Validates: Requirements 2.5, 3.6, 4.5**

  - [x] 6.7 Write property test for Sort Correctness
    - **Property 4: Sort Correctness**
    - **Validates: Requirements 2.6**

  - [x] 6.8 Implement ViewManager
    - Create ViewManager class for view coordination
    - Implement registerView(), switchView(), refresh() methods
    - Handle CDC update notifications to views
    - _Requirements: 12.3, 12.4_

  - [x] 6.9 Implement ViewDetailCoordinator
    - Create ViewDetailCoordinator for automatic view-detail panel coordination
    - Wire selection events to detail panel updates
    - Support multiple detail panel layouts (side, bottom, overlay)
    - _Requirements: 23.1, 23.2, 23.3, 23.4, 23.5, 23.6, 23.7_

  - [x] 6.10 Write property test for View-Detail Coordination Correctness
    - **Property 36: View-Detail Coordination Correctness**
    - **Validates: Requirements 23.2, 23.3**

  - [x] 6.11 Implement BaseViewModel class
    - Create BaseViewModel for separating business logic from UI
    - Implement computed property caching
    - Handle state change notifications
    - _Requirements: 27.1, 27.2, 27.3, 27.4, 27.5, 27.6, 27.7_

  - [x] 6.12 Write property test for ViewModel Computed Property Caching
    - **Property 38: ViewModel Computed Property Caching**
    - **Validates: Requirements 27.6**

- [x] 7. Core Views Implementation
  - [x] 7.1 Implement NodesView
    - Create NodesView with columns: node_id, address, status, CPU%, memory%, disk%, services_count
    - Implement row status highlighting for warning conditions
    - Support drill-down to services
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 7.2 Write property test for View Rendering Completeness
    - **Property 1: View Rendering Completeness**
    - **Validates: Requirements 2.1, 3.2, 4.1, 5.1, 6.1, 7.1**

  - [x] 7.3 Write property test for Warning Highlighting
    - **Property 6: Warning Highlighting**
    - **Validates: Requirements 2.4, 5.6, 6.4**

  - [x] 7.4 Write property test for Status Color Mapping
    - **Property 13: Status Color Mapping**
    - **Validates: Requirements 17.1**

  - [x] 7.5 Implement ServicesView
    - Create ServicesView with columns: service_id, type, node_id, status, address
    - Support filtering by node and service type
    - Implement drill-down to partition/message_group details
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [x] 7.6 Write property test for Drill-Down Filtering
    - **Property 3: Drill-Down Filtering**
    - **Validates: Requirements 2.3, 3.1, 4.2**

  - [x] 7.7 Implement TablesView
    - Create TablesView with columns: table_name, partition_count, replica_factor, total_size, policy_summary
    - Implement size formatting with appropriate units
    - Format policy summary with truncation
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 4.12, 4.13, 4.14, 4.15_

  - [x] 7.8 Write property test for Policy Display Completeness
    - **Property 30: Policy Display Completeness**
    - **Validates: Requirements 4.11, 4.12, 4.13**

  - [x] 7.9 Write property test for Size Formatting Round Trip
    - **Property 31: Size Formatting Round Trip**
    - **Validates: Requirements 4.8**

  - [x] 7.10 Implement PartitionsView
    - Create PartitionsView with columns: partition_id, key_range, replica_count, leader_node_id, storage_size, status
    - Highlight under-replicated partitions
    - Support navigation to hosting node
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9_

  - [x] 7.11 Implement MessageGroupsView
    - Create MessageGroupsView with columns: group_id, replica_count, nodes_covered, status
    - Highlight unhealthy replicas
    - Support drill-down to replica locations
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 8. Checkpoint - Verify core views
  - Ensure all tests pass, ask the user if questions arise.


- [x] 9. SQL Query Interface
  - [x] 9.1 Implement QueryInput component
    - Create QueryInput with multi-line text editing
    - Implement cursor movement, character insertion/deletion
    - Support history navigation with up/down arrows
    - Handle Escape to clear input
    - _Requirements: 7.3, 7.4, 9.5_

  - [x] 9.2 Write property test for Query Input Text Handling
    - **Property 24: Query Input Text Handling**
    - **Validates: Requirements 7.3, 7.4**

  - [x] 9.3 Write property test for Escape Clears Input
    - **Property 25: Escape Clears Input**
    - **Validates: Requirements 9.5**

  - [x] 9.4 Implement SQLSyntaxHighlighter
    - Create SQLSyntaxHighlighter for keyword highlighting
    - Support SQL keywords: SELECT, FROM, WHERE, INSERT, UPDATE, DELETE, etc.
    - Apply color formatting tags
    - _Requirements: 9.1_

  - [x] 9.5 Write property test for SQL Keyword Highlighting
    - **Property 22: SQL Keyword Highlighting**
    - **Validates: Requirements 9.1**

  - [x] 9.6 Implement TableAutocomplete
    - Create TableAutocomplete for table name suggestions
    - Get suggestions from cache based on prefix
    - Detect FROM/INTO/UPDATE context for triggering
    - _Requirements: 9.2, 9.3_

  - [x] 9.7 Write property test for Table Name Autocomplete
    - **Property 23: Table Name Autocomplete**
    - **Validates: Requirements 9.3**

  - [x] 9.8 Implement QueryHistory
    - Create QueryHistory with max 100 entries
    - Implement add(), getAt(), getAll() methods
    - Support persistence to ~/.ddb-admin/query_history.json
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 9.9 Write property test for Query History Consistency
    - **Property 17: Query History Consistency**
    - **Validates: Requirements 8.1, 8.2, 8.5**

  - [x] 9.10 Write property test for Query History Bounds
    - **Property 18: Query History Bounds**
    - **Validates: Requirements 8.4**

  - [x] 9.11 Write property test for Query History Persistence Round-Trip
    - **Property 19: Query History Persistence Round-Trip**
    - **Validates: Requirements 8.3**

  - [x] 9.12 Implement ResultsPanel
    - Create ResultsPanel for displaying query results
    - Support table display with column headers
    - Display row count, execution time, partition information
    - Handle write operation results and errors
    - _Requirements: 7.6, 7.7, 7.8, 7.9, 7.10, 7.11, 7.12_

  - [x] 9.13 Write property test for Query Result Completeness
    - **Property 15: Query Result Completeness**
    - **Validates: Requirements 7.9, 7.10, 7.12**

  - [x] 9.14 Write property test for Query Error Display
    - **Property 16: Query Error Display**
    - **Validates: Requirements 7.11**

  - [x] 9.15 Implement SQLQueryView
    - Create SQLQueryView combining QueryInput, ResultsPanel, QueryHistory
    - Implement query execution via ConnectionManager
    - Support read-only mode
    - Detect dangerous queries (DELETE/UPDATE without WHERE)
    - _Requirements: 7.1, 7.2, 7.5, 7.13, 7.14, 7.15, 10.1, 10.2, 10.3, 10.4_

  - [x] 9.16 Write property test for Read-Only Mode Enforcement
    - **Property 20: Read-Only Mode Enforcement**
    - **Validates: Requirements 10.3, 10.4**

  - [x] 9.17 Write property test for Dangerous Query Detection
    - **Property 21: Dangerous Query Detection**
    - **Validates: Requirements 10.1**

- [x] 10. Checkpoint - Verify SQL interface
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Logs View Implementation
  - [x] 11.1 Implement LogsView
    - Create LogsView with columns: timestamp, level, node_id, service_id, message
    - Implement multi-criteria filtering (level, node, service, time range, text)
    - Highlight ERROR logs in red, WARN logs in yellow
    - Support sorting by timestamp
    - _Requirements: 29.1, 29.2, 29.3, 29.4, 29.5, 29.6, 29.7, 29.8, 29.11, 29.12_

  - [x] 11.2 Write property test for Logs View Filtering Correctness
    - **Property 41: Logs View Filtering Correctness**
    - **Validates: Requirements 29.2, 29.3, 29.4, 29.5, 29.6**

  - [x] 11.3 Write property test for Logs Level Color Mapping
    - **Property 42: Logs Level Color Mapping**
    - **Validates: Requirements 29.8**

  - [x] 11.4 Write property test for Logs Sorting Correctness
    - **Property 43: Logs Sorting Correctness**
    - **Validates: Requirements 29.12**

  - [x] 11.5 Implement log detail panel
    - Display full log details including structured metadata
    - Support real-time log streaming via CDC
    - _Requirements: 29.7, 29.9_

  - [x] 11.6 Implement log export functionality
    - Export filtered logs to file
    - _Requirements: 29.10_

- [x] 12. Config View Implementation
  - [x] 12.1 Implement ConfigView
    - Create ConfigView with columns: key, value, type, requires_restart, last_modified
    - Support filtering by key pattern
    - Highlight entries that differ from default values
    - Display restart-required warnings
    - _Requirements: 30.1, 30.2, 30.6, 30.7_

  - [x] 12.2 Write property test for Config Default Highlighting
    - **Property 45: Config Default Highlighting**
    - **Validates: Requirements 30.7**

  - [x] 12.3 Implement config editing functionality
    - Display full config details with description and default value
    - Validate values against expected type
    - Show confirmation prompt before applying changes
    - Support reverting to default value
    - _Requirements: 30.3, 30.4, 30.5, 30.8, 30.9, 30.10_

  - [x] 12.4 Write property test for Config View Value Validation
    - **Property 44: Config View Value Validation**
    - **Validates: Requirements 30.5**

- [x] 13. Contexts View Implementation
  - [x] 13.1 Implement ContextsView
    - Create ContextsView with columns: context_id, context_type, name, created_at, updated_at
    - Support filtering by type and name pattern
    - Highlight recently updated contexts
    - Display context count by type in status bar
    - _Requirements: 31.1, 31.2, 31.3, 31.4, 31.5, 31.6_

  - [x] 13.2 Write property test for Contexts View Type Filtering
    - **Property 46: Contexts View Type Filtering**
    - **Validates: Requirements 31.2**

  - [x] 13.3 Write property test for Contexts Recent Update Highlighting
    - **Property 47: Contexts Recent Update Highlighting**
    - **Validates: Requirements 31.4**

- [x] 14. Checkpoint - Verify new views (Logs, Config, Contexts)
  - Ensure all tests pass, ask the user if questions arise.


- [x] 15. Live Query Support
  - [x] 15.1 Implement LiveQueryManager
    - Create LiveQueryManager for managing live query subscriptions
    - Implement subscribe(), pause(), resume(), cancel(), renew() methods
    - Track subscription status, events, and event rate
    - Enforce maximum concurrent subscriptions limit
    - _Requirements: 32.1, 32.7, 32.9, 32.10, 32.11_

  - [x] 15.2 Write property test for Live Query Subscription Limit
    - **Property 48: Live Query Subscription Limit**
    - **Validates: Requirements 32.11**

  - [x] 15.3 Write property test for Live Query Pause/Resume Consistency
    - **Property 50: Live Query Pause/Resume Consistency**
    - **Validates: Requirements 32.7**

  - [x] 15.4 Write property test for Live Query Event Rate Calculation
    - **Property 51: Live Query Event Rate Calculation**
    - **Validates: Requirements 32.10**

  - [x] 15.5 Implement LiveStreamPanel
    - Create LiveStreamPanel for displaying live query events
    - Color-code events: INSERT (green), UPDATE (yellow), DELETE (red)
    - Support scrolling through historical events
    - Display event timestamp and row data
    - _Requirements: 32.3, 32.4, 32.5, 32.12_

  - [x] 15.6 Write property test for Live Query Event Color Mapping
    - **Property 49: Live Query Event Color Mapping**
    - **Validates: Requirements 32.5**

  - [x] 15.7 Write property test for Live Stream Panel Scrolling Bounds
    - **Property 52: Live Stream Panel Scrolling Bounds**
    - **Validates: Requirements 32.12**

  - [x] 15.8 Integrate live query into SQLQueryView
    - Detect LIVE SELECT statements
    - Display initial results and stream events
    - Show subscription status in status bar
    - Support pause/resume/cancel via keyboard shortcuts
    - Display event rate and monitored partitions
    - _Requirements: 32.1, 32.2, 32.6, 32.8, 32.13, 32.14_

  - [x] 15.9 Write property test for CDC Selective Update
    - **Property 32: CDC Selective Update**
    - **Validates: Requirements 12.10, 13.8**

- [x] 16. Checkpoint - Verify live query support
  - Ensure all tests pass, ask the user if questions arise.

- [x] 17. Command Interface and Help System
  - [x] 17.1 Implement CommandParser
    - Create CommandParser for command palette
    - Support commands: connect, refresh, filter, sort, goto, sql, help, quit
    - Implement command autocomplete
    - Maintain command history
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6_

  - [x] 17.2 Write property test for Command Parsing Correctness
    - **Property 11: Command Parsing Correctness**
    - **Validates: Requirements 15.2, 15.5**

  - [x] 17.3 Implement help overlay
    - Display all keyboard shortcuts organized by category
    - Show context-sensitive help based on current view
    - Support --help flag for usage information
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5_

  - [x] 17.4 Implement keyboard navigation
    - Support arrow keys, Page Up/Down, Home/End for navigation
    - Support number keys (1-9) for quick view switching
    - Support '/' for filter mode, ':' for command mode
    - Support 'q' for quit, Escape for cancel/back
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 14.7, 14.8_

- [x] 18. Detail Panels and Visual Indicators
  - [x] 18.1 Implement detail panels for all entity types
    - Node details: resource statistics, service list, configuration
    - Partition details: Raft state, replica sync status, recent CDC events
    - Support scrolling within detail panels
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6_

  - [x] 18.2 Implement visual indicators
    - Color coding: green (healthy), yellow (warning), red (error/failed)
    - Entity type icons/symbols
    - Loading state indicators
    - Box-drawing characters for panel borders
    - Support monochrome mode
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6_

- [x] 19. Real-time Updates and CDC Integration
  - [x] 19.1 Implement CDC stream handling
    - Subscribe to CDC stream on connection
    - Update RemoteCache on CDC events
    - Highlight changed rows briefly
    - Display CDC stream status in status bar
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.9_

  - [x] 19.2 Implement CDC pause/resume
    - Support pausing CDC updates via keyboard shortcut
    - Indicate stale data when paused
    - Allow manual refresh
    - _Requirements: 12.6, 12.7, 12.8_

- [x] 20. Development Tools
  - [x] 20.1 Implement DevTools overlay
    - Display current application state in tree view
    - Show recent events with timestamps
    - Display component registry and dependency graph
    - Show CDC event stream with filtering
    - Support state snapshots and restoration
    - Disable in production builds
    - _Requirements: 26.1, 26.2, 26.3, 26.4, 26.5, 26.6, 26.7, 26.8_

- [x] 21. Error Handling and Logging
  - [x] 21.1 Implement error handling
    - Display API errors in non-blocking notifications
    - Display partial data with missing section indicators
    - Log errors to ~/.ddb-admin/error.log
    - Handle terminal resize gracefully
    - Display minimum size warning if terminal too small
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.10_

- [x] 22. Documentation
  - [x] 22.1 Create README.md
    - Installation instructions
    - Quick start guide
    - System requirements
    - Basic usage examples
    - _Requirements: 21.1_

  - [x] 22.2 Create USER_GUIDE.md
    - Connection management
    - View navigation (all views including Logs, Config, Contexts)
    - Filtering and sorting
    - Detail panels
    - Command palette
    - SQL Query View usage
    - Live Query subscriptions
    - Troubleshooting
    - _Requirements: 21.2, 21.3, 21.4, 21.5, 21.6, 21.7, 21.8, 21.9, 21.15_

  - [x] 22.3 Create COMMAND_REFERENCE.md
    - Keyboard shortcuts by category
    - Command palette commands
    - Configuration options
    - Environment variables
    - Command-line arguments
    - Live query commands
    - _Requirements: 21.10, 21.11, 21.12, 21.13, 21.14_

- [x] 23. Final Checkpoint - Full integration verification
  - Run complete test suite
  - Verify all views render correctly
  - Verify CDC integration works end-to-end
  - Verify live query functionality
  - Ensure all documentation is complete
