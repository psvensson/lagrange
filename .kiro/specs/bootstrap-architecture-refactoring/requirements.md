# Requirements Document

## Introduction

This document specifies the requirements for refactoring the bootstrap and node joining architecture in the distributed database system. The current implementation has two large monolithic files (`bootstrap-service.js` at 2568 lines and `node-joining-service.js` at 2619 lines) with several architectural issues including setter-based initialization, code duplication, and inconsistent service lifecycles.

The refactoring aims to:
1. Eliminate setter-based initialization that causes bugs when services are used before dependencies are ready
2. Extract bootstrap phases into separate, testable classes
3. Unify shared code between seed node bootstrap and joining node bootstrap
4. Standardize service lifecycle interfaces
5. Improve phase tracking and service construction patterns

## Glossary

- **Seed_Node**: The first node in the cluster that bootstraps the system tables and initial partitions
- **Joining_Node**: A node that joins an existing cluster by contacting the seed node
- **Bootstrap_Service**: The service that handles seed node initialization
- **Node_Joining_Service**: The service that handles joining nodes to an existing cluster
- **System_Cache**: In-memory cache of system tables, updated by CDC events
- **CDC**: Change Data Capture - mechanism for propagating changes to all nodes
- **Phase**: A discrete step in the bootstrap or joining process
- **Bootstrap_Mode**: Temporary mode allowing direct partition writes before cache is populated
- **Phase_Scoped_Service**: A service that exists only during a specific bootstrap phase
- **Service_Lifecycle**: The standard methods for initializing, starting, and stopping a service
- **Partition_Writer**: Component that writes to partitions (either direct or cache-routed)
- **SQL_Query_Engine**: Main entry point for SQL query processing that routes through system cache
- **Message_Router**: Unified message routing for local and remote communication
- **Replica_Handler**: Handler for CREATE_REPLICA/REMOVE_REPLICA execution
- **Control_Plane_Service**: Service for ordered registration and dispatch

## Requirements

### Requirement 1: Constructor-Based Dependency Injection

**User Story:** As a developer, I want services to receive all required dependencies through their constructor, so that services cannot be used before they are fully initialized.

#### Acceptance Criteria

1. THE SQL_Query_Engine SHALL require systemCache as a non-null constructor parameter
2. THE SQL_Query_Engine SHALL require messageRouter as a non-null constructor parameter
3. WHEN a service is constructed with a null required dependency, THEN THE system SHALL throw an error immediately
4. THE system SHALL NOT provide setter methods for required dependencies on production services
5. THE Bootstrap_Partition_Writer SHALL be a separate class that writes directly to partitions without requiring systemCache
6. THE Bootstrap_Partition_Writer SHALL only be used during the seed node registration phase
7. WHEN the cache hydration phase completes, THEN THE system SHALL create a new SQL_Query_Engine with the populated cache

### Requirement 2: Phase Extraction Architecture

**User Story:** As a developer, I want each bootstrap phase to be in its own class, so that phases can be tested independently and the codebase is more maintainable.

#### Acceptance Criteria

1. THE Infrastructure_Phase SHALL be a separate class responsible for creating NodeService and MessageRouter
2. THE Message_Group_Phase SHALL be a separate class responsible for creating message group replicas
3. THE Partition_Phase SHALL be a separate class responsible for creating system table partitions
4. THE Registration_Phase SHALL be a separate class responsible for writing initial system metadata
5. THE Cache_Hydration_Phase SHALL be a separate class responsible for populating the system cache
6. WHEN a phase class is instantiated, THE phase SHALL receive its dependencies through the constructor
7. WHEN a phase completes, THE phase SHALL return the services it created for use by subsequent phases
8. THE phase classes SHALL emit events for phase start, completion, and failure

### Requirement 3: Unified Bootstrap Pipeline

**User Story:** As a developer, I want seed node bootstrap and joining node bootstrap to share common code, so that bug fixes and improvements apply to both paths.

#### Acceptance Criteria

1. THE system SHALL provide a shared Message_Router_Setup component used by both Bootstrap_Service and Node_Joining_Service
2. THE system SHALL provide a shared Replica_Handler_Setup component used by both services
3. THE system SHALL provide a shared Control_Plane_Setup component used by both services
4. THE system SHALL provide a shared CDC_Integration_Setup component used by both services
5. WHEN common setup code is modified, THEN THE change SHALL affect both bootstrap paths
6. THE Bootstrap_Service SHALL use the shared components for its infrastructure phase
7. THE Node_Joining_Service SHALL use the shared components for its infrastructure phase

### Requirement 4: Standardized Service Lifecycle Interface

**User Story:** As a developer, I want all services to follow a consistent lifecycle interface, so that service management is predictable and errors are easier to diagnose.

#### Acceptance Criteria

1. THE Service_Lifecycle interface SHALL define an initialize() method for one-time setup
2. THE Service_Lifecycle interface SHALL define a start() method for beginning operation
3. THE Service_Lifecycle interface SHALL define a stop() method for graceful shutdown
4. THE Service_Lifecycle interface SHALL define a getState() method returning the current lifecycle state
5. WHEN a service is created, THE service SHALL be in the CREATED state
6. WHEN initialize() is called, THE service SHALL transition to INITIALIZED state
7. WHEN start() is called on an INITIALIZED service, THE service SHALL transition to RUNNING state
8. WHEN stop() is called on a RUNNING service, THE service SHALL transition to STOPPED state
9. IF start() is called on a service not in INITIALIZED state, THEN THE service SHALL throw an error
10. IF stop() is called on a service not in RUNNING state, THEN THE service SHALL log a warning but not throw

### Requirement 5: Phase State Machine

**User Story:** As a developer, I want bootstrap phases to be tracked by a formal state machine, so that invalid phase transitions are prevented and debugging is easier.

#### Acceptance Criteria

1. THE Bootstrap_Phase_State_Machine SHALL define valid phase transitions for seed node bootstrap
2. THE Joining_Phase_State_Machine SHALL define valid phase transitions for joining node bootstrap
3. WHEN an invalid phase transition is attempted, THEN THE state machine SHALL throw an error
4. THE state machine SHALL emit events on each phase transition
5. THE state machine SHALL provide a method to query the current phase
6. THE state machine SHALL provide a method to query valid next phases from current state
7. THE state machine SHALL track phase duration for each completed phase

### Requirement 6: Phase-Scoped Services Pattern

**User Story:** As a developer, I want the chicken-and-egg problem during seed node bootstrap to be solved with phase-scoped services, so that the solution is explicit and type-safe.

#### Acceptance Criteria

1. THE Bootstrap_Partition_Writer SHALL write directly to local partitions without requiring system cache
2. THE Bootstrap_Partition_Writer SHALL only accept partitionServices as a constructor parameter
3. THE SQL_Query_Engine SHALL require a populated system cache for construction
4. WHEN the registration phase runs, THE system SHALL use Bootstrap_Partition_Writer for writes
5. WHEN the cache hydration phase completes, THE system SHALL create SQL_Query_Engine with the populated cache
6. THE system SHALL NOT allow Bootstrap_Partition_Writer to be used after cache hydration
7. THE Bootstrap_Partition_Writer SHALL be disabled after the registration phase completes

### Requirement 7: Service Construction Validation

**User Story:** As a developer, I want service construction to validate all required dependencies, so that misconfiguration is caught early.

#### Acceptance Criteria

1. WHEN a service constructor receives a null required dependency, THEN THE constructor SHALL throw an error with a descriptive message
2. THE error message SHALL identify which dependency is missing
3. THE assertCritical utility SHALL be used for all required dependency validation
4. THE system SHALL distinguish between required and optional dependencies in constructor signatures
5. WHEN an optional dependency is null, THE service SHALL operate in a degraded mode or use defaults

### Requirement 8: Reduced File Size

**User Story:** As a developer, I want the bootstrap and node-joining files to be smaller and focused, so that the code is easier to understand and maintain.

#### Acceptance Criteria

1. THE Bootstrap_Service file SHALL be reduced to under 500 lines after refactoring
2. THE Node_Joining_Service file SHALL be reduced to under 500 lines after refactoring
3. WHEN phase logic is extracted, THE phase classes SHALL each be under 300 lines
4. THE shared components SHALL each be under 200 lines
5. THE system SHALL have no single file over 500 lines in the bootstrap module

### Requirement 9: Backward Compatibility

**User Story:** As a developer, I want the refactoring to maintain backward compatibility with existing tests and integrations, so that the refactoring does not break the system.

#### Acceptance Criteria

1. THE Bootstrap_Service SHALL continue to export the same public interface after refactoring
2. THE Node_Joining_Service SHALL continue to export the same public interface after refactoring
3. WHEN bootstrap() is called, THE return value SHALL have the same structure as before
4. WHEN join() is called, THE return value SHALL have the same structure as before
5. THE existing integration tests SHALL pass without modification after refactoring
6. THE existing property tests SHALL pass without modification after refactoring

### Requirement 10: Error Handling Consistency

**User Story:** As a developer, I want error handling to be consistent across all bootstrap phases, so that failures are handled predictably.

#### Acceptance Criteria

1. WHEN a phase fails, THE system SHALL emit a phase failure event with error details
2. WHEN a phase fails, THE system SHALL attempt cleanup of resources created in that phase
3. THE system SHALL NOT swallow errors in try/catch blocks
4. WHEN an error occurs, THE system SHALL either re-throw or log with full context
5. THE phase classes SHALL use consistent error types for similar failure conditions
6. IF a phase timeout occurs, THEN THE system SHALL throw a specific timeout error with phase context
