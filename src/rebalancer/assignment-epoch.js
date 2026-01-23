/**
 * Assignment Epoch - Immutable versioned snapshot of partition assignments.
 * Provides immutable epoch creation for coordinated partition-to-node mappings.
 * Requirements: 3.1, 3.3
 */

/**
 * Error thrown when attempting to modify an immutable epoch.
 */
class EpochImmutabilityError extends Error {
  /**
   * Create an EpochImmutabilityError.
   * @param {string} message - Error message.
   */
  constructor(message) {
    super(message);
    this.name = 'EpochImmutabilityError';
  }
}

/**
 * Error thrown when epoch validation fails.
 */
class EpochValidationError extends Error {
  /**
   * Create an EpochValidationError.
   * @param {string} message - Error message.
   * @param {string} field - The field that failed validation.
   */
  constructor(message, field) {
    super(message);
    this.name = 'EpochValidationError';
    this.field = field;
  }
}

/**
 * AssignmentEpoch represents an immutable, versioned snapshot of all
 * partition-to-node assignments.
 *
 * Structure:
 * {
 *   epoch: number,           // Monotonically increasing version
 *   assignments: {           // Partition to node list mapping
 *     [partitionId]: [nodeId, nodeId, nodeId],
 *   },
 *   timestamp: string,       // HLC timestamp
 *   proposedBy: string       // nodeId that proposed this epoch
 * }
 */
class AssignmentEpoch {
  /**
   * Create a new immutable AssignmentEpoch.
   * @param {Object} options - Epoch configuration.
   * @param {number} options.epoch - The epoch number (must be non-negative integer).
   * @param {Object} options.assignments - Partition to node list mapping.
   * @param {string} options.timestamp - HLC timestamp string.
   * @param {string} options.proposedBy - Node ID that proposed this epoch.
   * @throws {EpochValidationError} If any required field is invalid.
   */
  constructor(options) {
    // Validate required fields
    this._validateOptions(options);

    // Store values
    this._epoch = options.epoch;
    this._timestamp = options.timestamp;
    this._proposedBy = options.proposedBy;

    // Deep copy and freeze assignments to ensure immutability
    this._assignments = this._deepFreezeAssignments(options.assignments);

    // Freeze this instance to prevent modification
    Object.freeze(this);
  }

  /**
   * Validate constructor options.
   * @param {Object} options - Options to validate.
   * @throws {EpochValidationError} If validation fails.
   * @private
   */
  _validateOptions(options) {
    if (options === null || typeof options !== 'object') {
      throw new EpochValidationError(
        'Options must be an object',
        'options',
      );
    }

    // Validate epoch number
    if (typeof options.epoch !== 'number') {
      throw new EpochValidationError(
        'Epoch must be a number',
        'epoch',
      );
    }
    if (!Number.isInteger(options.epoch)) {
      throw new EpochValidationError(
        'Epoch must be an integer',
        'epoch',
      );
    }
    if (options.epoch < 0) {
      throw new EpochValidationError(
        'Epoch must be non-negative',
        'epoch',
      );
    }

    // Validate assignments
    if (options.assignments === null || typeof options.assignments !== 'object') {
      throw new EpochValidationError(
        'Assignments must be an object',
        'assignments',
      );
    }

    // Validate each assignment entry
    for (const [partitionId, nodeList] of Object.entries(options.assignments)) {
      if (!partitionId || typeof partitionId !== 'string') {
        throw new EpochValidationError(
          'Partition ID must be a non-empty string',
          'assignments',
        );
      }
      if (!Array.isArray(nodeList)) {
        throw new EpochValidationError(
          `Assignment for partition '${partitionId}' must be an array of node IDs`,
          'assignments',
        );
      }
      for (const nodeId of nodeList) {
        if (!nodeId || typeof nodeId !== 'string') {
          throw new EpochValidationError(
            `Node ID in partition '${partitionId}' must be a non-empty string`,
            'assignments',
          );
        }
      }
    }

    // Validate timestamp
    if (typeof options.timestamp !== 'string') {
      throw new EpochValidationError(
        'Timestamp must be a string',
        'timestamp',
      );
    }
    if (!options.timestamp) {
      throw new EpochValidationError(
        'Timestamp cannot be empty',
        'timestamp',
      );
    }

    // Validate proposedBy
    if (typeof options.proposedBy !== 'string') {
      throw new EpochValidationError(
        'ProposedBy must be a string',
        'proposedBy',
      );
    }
    if (!options.proposedBy) {
      throw new EpochValidationError(
        'ProposedBy cannot be empty',
        'proposedBy',
      );
    }
  }

  /**
   * Deep copy and freeze assignments object.
   * @param {Object} assignments - Assignments to copy and freeze.
   * @return {Object} Frozen deep copy of assignments.
   * @private
   */
  _deepFreezeAssignments(assignments) {
    const copy = {};
    for (const [partitionId, nodeList] of Object.entries(assignments)) {
      // Create a frozen copy of the node list array
      copy[partitionId] = Object.freeze([...nodeList]);
    }
    return Object.freeze(copy);
  }

  /**
   * Get the epoch number.
   * @return {number} The epoch number.
   */
  get epoch() {
    return this._epoch;
  }

  /**
   * Get the assignments mapping.
   * Returns a frozen object - modifications will have no effect.
   * @return {Object} The partition to node list mapping.
   */
  get assignments() {
    return this._assignments;
  }

  /**
   * Get the timestamp.
   * @return {string} The HLC timestamp string.
   */
  get timestamp() {
    return this._timestamp;
  }

  /**
   * Get the proposer node ID.
   * @return {string} The node ID that proposed this epoch.
   */
  get proposedBy() {
    return this._proposedBy;
  }

  /**
   * Get assignments for a specific partition.
   * @param {string} partitionId - The partition ID.
   * @return {string[]|undefined} Array of node IDs or undefined if not found.
   */
  getPartitionAssignments(partitionId) {
    return this._assignments[partitionId];
  }

  /**
   * Get all partitions assigned to a specific node.
   * @param {string} nodeId - The node ID.
   * @return {string[]} Array of partition IDs assigned to this node.
   */
  getNodeAssignments(nodeId) {
    const partitions = [];
    for (const [partitionId, nodeList] of Object.entries(this._assignments)) {
      if (nodeList.includes(nodeId)) {
        partitions.push(partitionId);
      }
    }
    return partitions;
  }

  /**
   * Get all partition IDs in this epoch.
   * @return {string[]} Array of all partition IDs.
   */
  getPartitionIds() {
    return Object.keys(this._assignments);
  }

  /**
   * Get all unique node IDs that have assignments.
   * @return {string[]} Array of unique node IDs.
   */
  getAssignedNodeIds() {
    const nodeSet = new Set();
    for (const nodeList of Object.values(this._assignments)) {
      for (const nodeId of nodeList) {
        nodeSet.add(nodeId);
      }
    }
    return Array.from(nodeSet);
  }

  /**
   * Get the total number of partitions.
   * @return {number} Number of partitions.
   */
  getPartitionCount() {
    return Object.keys(this._assignments).length;
  }

  /**
   * Get the total number of replica assignments.
   * @return {number} Total number of replica assignments across all partitions.
   */
  getTotalReplicaCount() {
    let count = 0;
    for (const nodeList of Object.values(this._assignments)) {
      count += nodeList.length;
    }
    return count;
  }

  /**
   * Check if a partition exists in this epoch.
   * @param {string} partitionId - The partition ID.
   * @return {boolean} True if partition exists.
   */
  hasPartition(partitionId) {
    return partitionId in this._assignments;
  }

  /**
   * Check if a node has any assignments.
   * @param {string} nodeId - The node ID.
   * @return {boolean} True if node has assignments.
   */
  hasNodeAssignments(nodeId) {
    for (const nodeList of Object.values(this._assignments)) {
      if (nodeList.includes(nodeId)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Convert epoch to a plain object representation.
   * Returns a deep copy that can be safely modified.
   * @return {Object} Plain object representation.
   */
  toObject() {
    const assignmentsCopy = {};
    for (const [partitionId, nodeList] of Object.entries(this._assignments)) {
      assignmentsCopy[partitionId] = [...nodeList];
    }
    return {
      epoch: this._epoch,
      assignments: assignmentsCopy,
      timestamp: this._timestamp,
      proposedBy: this._proposedBy,
    };
  }

  /**
   * Convert epoch to JSON string.
   * @return {string} JSON representation.
   */
  toJSON() {
    return JSON.stringify(this.toObject());
  }

  /**
   * Create an AssignmentEpoch from a plain object.
   * @param {Object} obj - Plain object with epoch data.
   * @return {AssignmentEpoch} New immutable epoch instance.
   * @throws {EpochValidationError} If object is invalid.
   */
  static fromObject(obj) {
    return new AssignmentEpoch(obj);
  }

  /**
   * Create an AssignmentEpoch from a JSON string.
   * @param {string} json - JSON string representation.
   * @return {AssignmentEpoch} New immutable epoch instance.
   * @throws {EpochValidationError} If JSON is invalid.
   */
  static fromJSON(json) {
    try {
      const obj = JSON.parse(json);
      return AssignmentEpoch.fromObject(obj);
    } catch (error) {
      if (error instanceof EpochValidationError) {
        throw error;
      }
      throw new EpochValidationError(
        `Invalid JSON: ${error.message}`,
        'json',
      );
    }
  }

  /**
   * Create an initial epoch (epoch 0) with empty assignments.
   * @param {string} timestamp - HLC timestamp string.
   * @param {string} proposedBy - Node ID that proposed this epoch.
   * @return {AssignmentEpoch} New initial epoch.
   */
  static createInitial(timestamp, proposedBy) {
    return new AssignmentEpoch({
      epoch: 0,
      assignments: {},
      timestamp,
      proposedBy,
    });
  }

  /**
   * Create a new epoch with updated assignments.
   * The new epoch will have epoch number incremented by 1.
   * @param {AssignmentEpoch} previousEpoch - The previous epoch.
   * @param {Object} newAssignments - New partition assignments.
   * @param {string} timestamp - HLC timestamp string.
   * @param {string} proposedBy - Node ID proposing this epoch.
   * @return {AssignmentEpoch} New epoch with incremented epoch number.
   */
  static createNext(previousEpoch, newAssignments, timestamp, proposedBy) {
    return new AssignmentEpoch({
      epoch: previousEpoch.epoch + 1,
      assignments: newAssignments,
      timestamp,
      proposedBy,
    });
  }
}

export {
  AssignmentEpoch,
  EpochImmutabilityError,
  EpochValidationError,
};
