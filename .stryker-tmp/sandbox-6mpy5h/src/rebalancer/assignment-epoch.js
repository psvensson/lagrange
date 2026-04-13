/**
 * Assignment Epoch - Immutable versioned snapshot of partition assignments.
 * Provides immutable epoch creation for coordinated partition-to-node mappings.
 * Requirements: 3.1, 3.3
 */
// @ts-nocheck


/**
 * Error thrown when attempting to modify an immutable epoch.
 */function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
class EpochImmutabilityError extends Error {
  /**
   * Create an EpochImmutabilityError.
   * @param {string} message - Error message.
   */
  constructor(message) {
    if (stryMutAct_9fa48("129806")) {
      {}
    } else {
      stryCov_9fa48("129806");
      super(message);
      this.name = stryMutAct_9fa48("129807") ? "" : (stryCov_9fa48("129807"), 'EpochImmutabilityError');
    }
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
    if (stryMutAct_9fa48("129808")) {
      {}
    } else {
      stryCov_9fa48("129808");
      super(message);
      this.name = stryMutAct_9fa48("129809") ? "" : (stryCov_9fa48("129809"), 'EpochValidationError');
      this.field = field;
    }
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
    if (stryMutAct_9fa48("129810")) {
      {}
    } else {
      stryCov_9fa48("129810");
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
  }

  /**
   * Validate constructor options.
   * @param {Object} options - Options to validate.
   * @throws {EpochValidationError} If validation fails.
   * @private
   */
  _validateOptions(options) {
    if (stryMutAct_9fa48("129811")) {
      {}
    } else {
      stryCov_9fa48("129811");
      if (stryMutAct_9fa48("129814") ? options === null && typeof options !== 'object' : stryMutAct_9fa48("129813") ? false : stryMutAct_9fa48("129812") ? true : (stryCov_9fa48("129812", "129813", "129814"), (stryMutAct_9fa48("129816") ? options !== null : stryMutAct_9fa48("129815") ? false : (stryCov_9fa48("129815", "129816"), options === null)) || (stryMutAct_9fa48("129818") ? typeof options === 'object' : stryMutAct_9fa48("129817") ? false : (stryCov_9fa48("129817", "129818"), typeof options !== (stryMutAct_9fa48("129819") ? "" : (stryCov_9fa48("129819"), 'object')))))) {
        if (stryMutAct_9fa48("129820")) {
          {}
        } else {
          stryCov_9fa48("129820");
          throw new EpochValidationError(stryMutAct_9fa48("129821") ? "" : (stryCov_9fa48("129821"), 'Options must be an object'), stryMutAct_9fa48("129822") ? "" : (stryCov_9fa48("129822"), 'options'));
        }
      }

      // Validate epoch number
      if (stryMutAct_9fa48("129825") ? typeof options.epoch === 'number' : stryMutAct_9fa48("129824") ? false : stryMutAct_9fa48("129823") ? true : (stryCov_9fa48("129823", "129824", "129825"), typeof options.epoch !== (stryMutAct_9fa48("129826") ? "" : (stryCov_9fa48("129826"), 'number')))) {
        if (stryMutAct_9fa48("129827")) {
          {}
        } else {
          stryCov_9fa48("129827");
          throw new EpochValidationError(stryMutAct_9fa48("129828") ? "" : (stryCov_9fa48("129828"), 'Epoch must be a number'), stryMutAct_9fa48("129829") ? "" : (stryCov_9fa48("129829"), 'epoch'));
        }
      }
      if (stryMutAct_9fa48("129832") ? false : stryMutAct_9fa48("129831") ? true : stryMutAct_9fa48("129830") ? Number.isInteger(options.epoch) : (stryCov_9fa48("129830", "129831", "129832"), !Number.isInteger(options.epoch))) {
        if (stryMutAct_9fa48("129833")) {
          {}
        } else {
          stryCov_9fa48("129833");
          throw new EpochValidationError(stryMutAct_9fa48("129834") ? "" : (stryCov_9fa48("129834"), 'Epoch must be an integer'), stryMutAct_9fa48("129835") ? "" : (stryCov_9fa48("129835"), 'epoch'));
        }
      }
      if (stryMutAct_9fa48("129839") ? options.epoch >= 0 : stryMutAct_9fa48("129838") ? options.epoch <= 0 : stryMutAct_9fa48("129837") ? false : stryMutAct_9fa48("129836") ? true : (stryCov_9fa48("129836", "129837", "129838", "129839"), options.epoch < 0)) {
        if (stryMutAct_9fa48("129840")) {
          {}
        } else {
          stryCov_9fa48("129840");
          throw new EpochValidationError(stryMutAct_9fa48("129841") ? "" : (stryCov_9fa48("129841"), 'Epoch must be non-negative'), stryMutAct_9fa48("129842") ? "" : (stryCov_9fa48("129842"), 'epoch'));
        }
      }

      // Validate assignments
      if (stryMutAct_9fa48("129845") ? options.assignments === null && typeof options.assignments !== 'object' : stryMutAct_9fa48("129844") ? false : stryMutAct_9fa48("129843") ? true : (stryCov_9fa48("129843", "129844", "129845"), (stryMutAct_9fa48("129847") ? options.assignments !== null : stryMutAct_9fa48("129846") ? false : (stryCov_9fa48("129846", "129847"), options.assignments === null)) || (stryMutAct_9fa48("129849") ? typeof options.assignments === 'object' : stryMutAct_9fa48("129848") ? false : (stryCov_9fa48("129848", "129849"), typeof options.assignments !== (stryMutAct_9fa48("129850") ? "" : (stryCov_9fa48("129850"), 'object')))))) {
        if (stryMutAct_9fa48("129851")) {
          {}
        } else {
          stryCov_9fa48("129851");
          throw new EpochValidationError(stryMutAct_9fa48("129852") ? "" : (stryCov_9fa48("129852"), 'Assignments must be an object'), stryMutAct_9fa48("129853") ? "" : (stryCov_9fa48("129853"), 'assignments'));
        }
      }

      // Validate each assignment entry
      for (const [partitionId, nodeList] of Object.entries(options.assignments)) {
        if (stryMutAct_9fa48("129854")) {
          {}
        } else {
          stryCov_9fa48("129854");
          if (stryMutAct_9fa48("129857") ? !partitionId && typeof partitionId !== 'string' : stryMutAct_9fa48("129856") ? false : stryMutAct_9fa48("129855") ? true : (stryCov_9fa48("129855", "129856", "129857"), (stryMutAct_9fa48("129858") ? partitionId : (stryCov_9fa48("129858"), !partitionId)) || (stryMutAct_9fa48("129860") ? typeof partitionId === 'string' : stryMutAct_9fa48("129859") ? false : (stryCov_9fa48("129859", "129860"), typeof partitionId !== (stryMutAct_9fa48("129861") ? "" : (stryCov_9fa48("129861"), 'string')))))) {
            if (stryMutAct_9fa48("129862")) {
              {}
            } else {
              stryCov_9fa48("129862");
              throw new EpochValidationError(stryMutAct_9fa48("129863") ? "" : (stryCov_9fa48("129863"), 'Partition ID must be a non-empty string'), stryMutAct_9fa48("129864") ? "" : (stryCov_9fa48("129864"), 'assignments'));
            }
          }
          if (stryMutAct_9fa48("129867") ? false : stryMutAct_9fa48("129866") ? true : stryMutAct_9fa48("129865") ? Array.isArray(nodeList) : (stryCov_9fa48("129865", "129866", "129867"), !Array.isArray(nodeList))) {
            if (stryMutAct_9fa48("129868")) {
              {}
            } else {
              stryCov_9fa48("129868");
              throw new EpochValidationError(stryMutAct_9fa48("129869") ? `` : (stryCov_9fa48("129869"), `Assignment for partition '${partitionId}' must be an array of node IDs`), stryMutAct_9fa48("129870") ? "" : (stryCov_9fa48("129870"), 'assignments'));
            }
          }
          for (const nodeId of nodeList) {
            if (stryMutAct_9fa48("129871")) {
              {}
            } else {
              stryCov_9fa48("129871");
              if (stryMutAct_9fa48("129874") ? !nodeId && typeof nodeId !== 'string' : stryMutAct_9fa48("129873") ? false : stryMutAct_9fa48("129872") ? true : (stryCov_9fa48("129872", "129873", "129874"), (stryMutAct_9fa48("129875") ? nodeId : (stryCov_9fa48("129875"), !nodeId)) || (stryMutAct_9fa48("129877") ? typeof nodeId === 'string' : stryMutAct_9fa48("129876") ? false : (stryCov_9fa48("129876", "129877"), typeof nodeId !== (stryMutAct_9fa48("129878") ? "" : (stryCov_9fa48("129878"), 'string')))))) {
                if (stryMutAct_9fa48("129879")) {
                  {}
                } else {
                  stryCov_9fa48("129879");
                  throw new EpochValidationError(stryMutAct_9fa48("129880") ? `` : (stryCov_9fa48("129880"), `Node ID in partition '${partitionId}' must be a non-empty string`), stryMutAct_9fa48("129881") ? "" : (stryCov_9fa48("129881"), 'assignments'));
                }
              }
            }
          }
        }
      }

      // Validate timestamp
      if (stryMutAct_9fa48("129884") ? typeof options.timestamp === 'string' : stryMutAct_9fa48("129883") ? false : stryMutAct_9fa48("129882") ? true : (stryCov_9fa48("129882", "129883", "129884"), typeof options.timestamp !== (stryMutAct_9fa48("129885") ? "" : (stryCov_9fa48("129885"), 'string')))) {
        if (stryMutAct_9fa48("129886")) {
          {}
        } else {
          stryCov_9fa48("129886");
          throw new EpochValidationError(stryMutAct_9fa48("129887") ? "" : (stryCov_9fa48("129887"), 'Timestamp must be a string'), stryMutAct_9fa48("129888") ? "" : (stryCov_9fa48("129888"), 'timestamp'));
        }
      }
      if (stryMutAct_9fa48("129891") ? false : stryMutAct_9fa48("129890") ? true : stryMutAct_9fa48("129889") ? options.timestamp : (stryCov_9fa48("129889", "129890", "129891"), !options.timestamp)) {
        if (stryMutAct_9fa48("129892")) {
          {}
        } else {
          stryCov_9fa48("129892");
          throw new EpochValidationError(stryMutAct_9fa48("129893") ? "" : (stryCov_9fa48("129893"), 'Timestamp cannot be empty'), stryMutAct_9fa48("129894") ? "" : (stryCov_9fa48("129894"), 'timestamp'));
        }
      }

      // Validate proposedBy
      if (stryMutAct_9fa48("129897") ? typeof options.proposedBy === 'string' : stryMutAct_9fa48("129896") ? false : stryMutAct_9fa48("129895") ? true : (stryCov_9fa48("129895", "129896", "129897"), typeof options.proposedBy !== (stryMutAct_9fa48("129898") ? "" : (stryCov_9fa48("129898"), 'string')))) {
        if (stryMutAct_9fa48("129899")) {
          {}
        } else {
          stryCov_9fa48("129899");
          throw new EpochValidationError(stryMutAct_9fa48("129900") ? "" : (stryCov_9fa48("129900"), 'ProposedBy must be a string'), stryMutAct_9fa48("129901") ? "" : (stryCov_9fa48("129901"), 'proposedBy'));
        }
      }
      if (stryMutAct_9fa48("129904") ? false : stryMutAct_9fa48("129903") ? true : stryMutAct_9fa48("129902") ? options.proposedBy : (stryCov_9fa48("129902", "129903", "129904"), !options.proposedBy)) {
        if (stryMutAct_9fa48("129905")) {
          {}
        } else {
          stryCov_9fa48("129905");
          throw new EpochValidationError(stryMutAct_9fa48("129906") ? "" : (stryCov_9fa48("129906"), 'ProposedBy cannot be empty'), stryMutAct_9fa48("129907") ? "" : (stryCov_9fa48("129907"), 'proposedBy'));
        }
      }
    }
  }

  /**
   * Deep copy and freeze assignments object.
   * @param {Object} assignments - Assignments to copy and freeze.
   * @return {Object} Frozen deep copy of assignments.
   * @private
   */
  _deepFreezeAssignments(assignments) {
    if (stryMutAct_9fa48("129908")) {
      {}
    } else {
      stryCov_9fa48("129908");
      const copy = {};
      for (const [partitionId, nodeList] of Object.entries(assignments)) {
        if (stryMutAct_9fa48("129909")) {
          {}
        } else {
          stryCov_9fa48("129909");
          // Create a frozen copy of the node list array
          copy[partitionId] = Object.freeze(stryMutAct_9fa48("129910") ? [] : (stryCov_9fa48("129910"), [...nodeList]));
        }
      }
      return Object.freeze(copy);
    }
  }

  /**
   * Get the epoch number.
   * @return {number} The epoch number.
   */
  get epoch() {
    if (stryMutAct_9fa48("129911")) {
      {}
    } else {
      stryCov_9fa48("129911");
      return this._epoch;
    }
  }

  /**
   * Get the assignments mapping.
   * Returns a frozen object - modifications will have no effect.
   * @return {Object} The partition to node list mapping.
   */
  get assignments() {
    if (stryMutAct_9fa48("129912")) {
      {}
    } else {
      stryCov_9fa48("129912");
      return this._assignments;
    }
  }

  /**
   * Get the timestamp.
   * @return {string} The HLC timestamp string.
   */
  get timestamp() {
    if (stryMutAct_9fa48("129913")) {
      {}
    } else {
      stryCov_9fa48("129913");
      return this._timestamp;
    }
  }

  /**
   * Get the proposer node ID.
   * @return {string} The node ID that proposed this epoch.
   */
  get proposedBy() {
    if (stryMutAct_9fa48("129914")) {
      {}
    } else {
      stryCov_9fa48("129914");
      return this._proposedBy;
    }
  }

  /**
   * Get assignments for a specific partition.
   * @param {string} partitionId - The partition ID.
   * @return {string[]|undefined} Array of node IDs or undefined if not found.
   */
  getPartitionAssignments(partitionId) {
    if (stryMutAct_9fa48("129915")) {
      {}
    } else {
      stryCov_9fa48("129915");
      return this._assignments[partitionId];
    }
  }

  /**
   * Get all partitions assigned to a specific node.
   * @param {string} nodeId - The node ID.
   * @return {string[]} Array of partition IDs assigned to this node.
   */
  getNodeAssignments(nodeId) {
    if (stryMutAct_9fa48("129916")) {
      {}
    } else {
      stryCov_9fa48("129916");
      const partitions = stryMutAct_9fa48("129917") ? ["Stryker was here"] : (stryCov_9fa48("129917"), []);
      for (const [partitionId, nodeList] of Object.entries(this._assignments)) {
        if (stryMutAct_9fa48("129918")) {
          {}
        } else {
          stryCov_9fa48("129918");
          if (stryMutAct_9fa48("129920") ? false : stryMutAct_9fa48("129919") ? true : (stryCov_9fa48("129919", "129920"), nodeList.includes(nodeId))) {
            if (stryMutAct_9fa48("129921")) {
              {}
            } else {
              stryCov_9fa48("129921");
              partitions.push(partitionId);
            }
          }
        }
      }
      return partitions;
    }
  }

  /**
   * Get all partition IDs in this epoch.
   * @return {string[]} Array of all partition IDs.
   */
  getPartitionIds() {
    if (stryMutAct_9fa48("129922")) {
      {}
    } else {
      stryCov_9fa48("129922");
      return Object.keys(this._assignments);
    }
  }

  /**
   * Get all unique node IDs that have assignments.
   * @return {string[]} Array of unique node IDs.
   */
  getAssignedNodeIds() {
    if (stryMutAct_9fa48("129923")) {
      {}
    } else {
      stryCov_9fa48("129923");
      const nodeSet = new Set();
      for (const nodeList of Object.values(this._assignments)) {
        if (stryMutAct_9fa48("129924")) {
          {}
        } else {
          stryCov_9fa48("129924");
          for (const nodeId of nodeList) {
            if (stryMutAct_9fa48("129925")) {
              {}
            } else {
              stryCov_9fa48("129925");
              nodeSet.add(nodeId);
            }
          }
        }
      }
      return Array.from(nodeSet);
    }
  }

  /**
   * Get the total number of partitions.
   * @return {number} Number of partitions.
   */
  getPartitionCount() {
    if (stryMutAct_9fa48("129926")) {
      {}
    } else {
      stryCov_9fa48("129926");
      return Object.keys(this._assignments).length;
    }
  }

  /**
   * Get the total number of replica assignments.
   * @return {number} Total number of replica assignments across all partitions.
   */
  getTotalReplicaCount() {
    if (stryMutAct_9fa48("129927")) {
      {}
    } else {
      stryCov_9fa48("129927");
      let count = 0;
      for (const nodeList of Object.values(this._assignments)) {
        if (stryMutAct_9fa48("129928")) {
          {}
        } else {
          stryCov_9fa48("129928");
          stryMutAct_9fa48("129929") ? count -= nodeList.length : (stryCov_9fa48("129929"), count += nodeList.length);
        }
      }
      return count;
    }
  }

  /**
   * Check if a partition exists in this epoch.
   * @param {string} partitionId - The partition ID.
   * @return {boolean} True if partition exists.
   */
  hasPartition(partitionId) {
    if (stryMutAct_9fa48("129930")) {
      {}
    } else {
      stryCov_9fa48("129930");
      return partitionId in this._assignments;
    }
  }

  /**
   * Check if a node has any assignments.
   * @param {string} nodeId - The node ID.
   * @return {boolean} True if node has assignments.
   */
  hasNodeAssignments(nodeId) {
    if (stryMutAct_9fa48("129931")) {
      {}
    } else {
      stryCov_9fa48("129931");
      for (const nodeList of Object.values(this._assignments)) {
        if (stryMutAct_9fa48("129932")) {
          {}
        } else {
          stryCov_9fa48("129932");
          if (stryMutAct_9fa48("129934") ? false : stryMutAct_9fa48("129933") ? true : (stryCov_9fa48("129933", "129934"), nodeList.includes(nodeId))) {
            if (stryMutAct_9fa48("129935")) {
              {}
            } else {
              stryCov_9fa48("129935");
              return stryMutAct_9fa48("129936") ? false : (stryCov_9fa48("129936"), true);
            }
          }
        }
      }
      return stryMutAct_9fa48("129937") ? true : (stryCov_9fa48("129937"), false);
    }
  }

  /**
   * Convert epoch to a plain object representation.
   * Returns a deep copy that can be safely modified.
   * @return {Object} Plain object representation.
   */
  toObject() {
    if (stryMutAct_9fa48("129938")) {
      {}
    } else {
      stryCov_9fa48("129938");
      const assignmentsCopy = {};
      for (const [partitionId, nodeList] of Object.entries(this._assignments)) {
        if (stryMutAct_9fa48("129939")) {
          {}
        } else {
          stryCov_9fa48("129939");
          assignmentsCopy[partitionId] = stryMutAct_9fa48("129940") ? [] : (stryCov_9fa48("129940"), [...nodeList]);
        }
      }
      return stryMutAct_9fa48("129941") ? {} : (stryCov_9fa48("129941"), {
        epoch: this._epoch,
        assignments: assignmentsCopy,
        timestamp: this._timestamp,
        proposedBy: this._proposedBy
      });
    }
  }

  /**
   * Convert epoch to JSON string.
   * @return {string} JSON representation.
   */
  toJSON() {
    if (stryMutAct_9fa48("129942")) {
      {}
    } else {
      stryCov_9fa48("129942");
      return JSON.stringify(this.toObject());
    }
  }

  /**
   * Create an AssignmentEpoch from a plain object.
   * @param {Object} obj - Plain object with epoch data.
   * @return {AssignmentEpoch} New immutable epoch instance.
   * @throws {EpochValidationError} If object is invalid.
   */
  static fromObject(obj) {
    if (stryMutAct_9fa48("129943")) {
      {}
    } else {
      stryCov_9fa48("129943");
      return new AssignmentEpoch(obj);
    }
  }

  /**
   * Create an AssignmentEpoch from a JSON string.
   * @param {string} json - JSON string representation.
   * @return {AssignmentEpoch} New immutable epoch instance.
   * @throws {EpochValidationError} If JSON is invalid.
   */
  static fromJSON(json) {
    if (stryMutAct_9fa48("129944")) {
      {}
    } else {
      stryCov_9fa48("129944");
      try {
        if (stryMutAct_9fa48("129945")) {
          {}
        } else {
          stryCov_9fa48("129945");
          const obj = JSON.parse(json);
          return AssignmentEpoch.fromObject(obj);
        }
      } catch (error) {
        if (stryMutAct_9fa48("129946")) {
          {}
        } else {
          stryCov_9fa48("129946");
          if (stryMutAct_9fa48("129948") ? false : stryMutAct_9fa48("129947") ? true : (stryCov_9fa48("129947", "129948"), error instanceof EpochValidationError)) {
            if (stryMutAct_9fa48("129949")) {
              {}
            } else {
              stryCov_9fa48("129949");
              throw error;
            }
          }
          throw new EpochValidationError(stryMutAct_9fa48("129950") ? `` : (stryCov_9fa48("129950"), `Invalid JSON: ${error.message}`), stryMutAct_9fa48("129951") ? "" : (stryCov_9fa48("129951"), 'json'));
        }
      }
    }
  }

  /**
   * Create an initial epoch (epoch 0) with empty assignments.
   * @param {string} timestamp - HLC timestamp string.
   * @param {string} proposedBy - Node ID that proposed this epoch.
   * @return {AssignmentEpoch} New initial epoch.
   */
  static createInitial(timestamp, proposedBy) {
    if (stryMutAct_9fa48("129952")) {
      {}
    } else {
      stryCov_9fa48("129952");
      return new AssignmentEpoch(stryMutAct_9fa48("129953") ? {} : (stryCov_9fa48("129953"), {
        epoch: 0,
        assignments: {},
        timestamp,
        proposedBy
      }));
    }
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
    if (stryMutAct_9fa48("129954")) {
      {}
    } else {
      stryCov_9fa48("129954");
      return new AssignmentEpoch(stryMutAct_9fa48("129955") ? {} : (stryCov_9fa48("129955"), {
        epoch: stryMutAct_9fa48("129956") ? previousEpoch.epoch - 1 : (stryCov_9fa48("129956"), previousEpoch.epoch + 1),
        assignments: newAssignments,
        timestamp,
        proposedBy
      }));
    }
  }
}
export { AssignmentEpoch, EpochImmutabilityError, EpochValidationError };