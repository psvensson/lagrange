# Testing Strategy

The testing strategy employs both unit tests for specific functionality and property-based tests for universal correctness properties.

## Unit Testing Approach

Unit tests will focus on:
- **Component Integration**: Testing interfaces between services
- **Edge Cases**: Boundary conditions and error scenarios
- **Protocol Handling**: Mock and WebSocket protocol implementations
- **Bootstrap Sequences**: Node joining and system table creation

## Property-Based Testing Framework

We will use **fast-check** for JavaScript property-based testing, configured with **maximum 10 iterations per test** (`numRuns: 10`).

**CRITICAL REQUIREMENT**: NO property-based test should iterate more than 10 times. This ensures:
- Fast test execution during development
- Reasonable test output that doesn't overflow context
- Quick feedback loops for developers
- Consistent test duration across all properties

Each property test will be tagged with: **Feature: distributed-database-system, Property {number}: {property_text}**

## Test Environment Setup

- **Mock Protocol**: For testing multiple nodes in single process
- **WebSocket Protocol**: For realistic distributed testing
- **Test Clusters**: Automated setup/teardown of multi-node clusters
- **Failure Injection**: Simulate node failures, network partitions, and data corruption

## Test Duration Requirements

**Any test taking longer than 2 seconds is a HARD ERROR that requires immediate analysis.**

This is a powerful multi-core machine running in-memory tests. There is no valid reason for tests to take more than a couple of seconds. If a test exceeds this limit:

1. **STOP** - Do not accept the test as passing
2. **ANALYZE** - Identify the root cause:
   - Unnecessary `setTimeout()` or real-time delays in tests
   - Uncleaned timers (`setTimeout`, `setInterval`) keeping the process alive
   - Speculative execution or background intervals not disabled in tests
   - Actual performance bugs in the implementation
3. **FIX** - Resolve the issue before proceeding

## Test Execution Strategy

When running tests during task execution:

1. **Run targeted tests only** - Don't run the full test suite except at checkpoints
2. **Focus on relevant tests** - Only run tests related to the feature/file being modified
3. **Run failing tests first** - When fixing issues, run only the specific failing test(s)
4. **Use test filtering** - Use patterns like `npm test -- --grep "pattern"` or similar to filter tests

## When to Run Full Test Suite

Only run the complete test suite (`npm test`) at:
- Checkpoint tasks explicitly marked in the task list
- Final integration verification
- When explicitly requested by the user
