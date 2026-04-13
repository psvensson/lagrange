/**
 * Address Manager - Unique address generation and management.
 * Provides unique addresses for nodes and services using UUID v4.
 * Also provides unified address parsing, formatting, and validation.
 * Unified address format: {nodeId}/{serviceType}/{serviceId}
 * Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 2.1, 7.1
 */
// @ts-nocheck
function stryNS_9fa48() {
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
import { v4 as uuidv4, validate as uuidValidate } from 'uuid';
import { ADDRESS } from '../constants/index.js';
import { LoggingService } from '../logging/logging-service.js';
import { ADDRESS_COMPONENT, ADDRESS_ERROR_MSG, ADDRESS_ERROR_NAME, ADDRESS_FORMAT, ADDRESS_LOG_MSG, ADDRESS_SUBSYSTEM, ADDRESS_TYPE, ADDRESS_VALIDATE } from './constants.js';

/**
 * Address types supported by the system.
 * @enum {string}
 */
const AddressType = ADDRESS_TYPE;

/**
 * Error thrown when an address is malformed.
 */
class MalformedAddressError extends Error {
  /**
   * Create a MalformedAddressError.
   * @param {string} message - Error message.
   * @param {string} address - The malformed address.
   */
  constructor(message, address) {
    if (stryMutAct_9fa48("0")) {
      {}
    } else {
      stryCov_9fa48("0");
      super(message);
      this.name = ADDRESS_ERROR_NAME.MALFORMED;
      this.address = address;
    }
  }
}

/**
 * Error thrown when an address component is empty.
 */
class EmptyComponentError extends Error {
  /**
   * Create an EmptyComponentError.
   * @param {string} component - The name of the empty component.
   * @param {string} address - The address with the empty component.
   */
  constructor(component, address) {
    if (stryMutAct_9fa48("1")) {
      {}
    } else {
      stryCov_9fa48("1");
      super(ADDRESS_ERROR_MSG.componentEmpty(component));
      this.name = ADDRESS_ERROR_NAME.EMPTY_COMPONENT;
      this.component = component;
      this.address = address;
    }
  }
}

/**
 * AddressManager provides unique address generation and validation.
 * Ensures no address collisions occur within the system.
 */
class AddressManager {
  static instance = null;

  /**
   * Create a new AddressManager instance.
   * @private
   */
  constructor() {
    if (stryMutAct_9fa48("2")) {
      {}
    } else {
      stryCov_9fa48("2");
      // Track all generated addresses to detect conflicts
      this.nodeAddresses = new Set();
      this.serviceAddresses = new Set();

      // Set up subsystem logger
      const loggingService = LoggingService.getInstance();
      this.logger = loggingService.isInitialized() ? loggingService.forSubsystem(ADDRESS_SUBSYSTEM.NAME) : null;
    }
  }

  /**
   * Get the singleton instance.
   * @return {AddressManager} The address manager instance.
   */
  static getInstance() {
    if (stryMutAct_9fa48("3")) {
      {}
    } else {
      stryCov_9fa48("3");
      if (stryMutAct_9fa48("6") ? false : stryMutAct_9fa48("5") ? true : stryMutAct_9fa48("4") ? AddressManager.instance : (stryCov_9fa48("4", "5", "6"), !AddressManager.instance)) {
        if (stryMutAct_9fa48("7")) {
          {}
        } else {
          stryCov_9fa48("7");
          AddressManager.instance = new AddressManager();
        }
      }
      return AddressManager.instance;
    }
  }

  /**
   * Reset the singleton instance (for testing).
   */
  static resetInstance() {
    if (stryMutAct_9fa48("8")) {
      {}
    } else {
      stryCov_9fa48("8");
      AddressManager.instance = null;
    }
  }

  /**
   * Generate a unique node address.
   * @return {string} A unique UUID v4 node address.
   */
  generateNodeAddress() {
    if (stryMutAct_9fa48("9")) {
      {}
    } else {
      stryCov_9fa48("9");
      const address = uuidv4();
      this.nodeAddresses.add(address);
      if (stryMutAct_9fa48("11") ? false : stryMutAct_9fa48("10") ? true : (stryCov_9fa48("10", "11"), this.logger)) {
        if (stryMutAct_9fa48("12")) {
          {}
        } else {
          stryCov_9fa48("12");
          this.logger.debug(ADDRESS_LOG_MSG.GENERATED_NODE, stryMutAct_9fa48("13") ? {} : (stryCov_9fa48("13"), {
            address
          }));
        }
      }
      return address;
    }
  }

  /**
   * Generate a unique service address.
   * @param {string} nodeAddress - The node address this service belongs to.
   * @return {string} A unique UUID v4 service address.
   */
  generateServiceAddress(nodeAddress) {
    if (stryMutAct_9fa48("14")) {
      {}
    } else {
      stryCov_9fa48("14");
      const address = uuidv4();
      this.serviceAddresses.add(address);
      if (stryMutAct_9fa48("16") ? false : stryMutAct_9fa48("15") ? true : (stryCov_9fa48("15", "16"), this.logger)) {
        if (stryMutAct_9fa48("17")) {
          {}
        } else {
          stryCov_9fa48("17");
          this.logger.debug(ADDRESS_LOG_MSG.GENERATED_SERVICE, stryMutAct_9fa48("18") ? {} : (stryCov_9fa48("18"), {
            address,
            nodeAddress
          }));
        }
      }
      return address;
    }
  }

  /**
   * Validate an address format.
   * @param {string} address - The address to validate.
   * @return {boolean} True if the address is a valid UUID v4.
   */
  validateAddress(address) {
    if (stryMutAct_9fa48("19")) {
      {}
    } else {
      stryCov_9fa48("19");
      if (stryMutAct_9fa48("22") ? typeof address === ADDRESS_VALIDATE.TYPEOF_STRING : stryMutAct_9fa48("21") ? false : stryMutAct_9fa48("20") ? true : (stryCov_9fa48("20", "21", "22"), typeof address !== ADDRESS_VALIDATE.TYPEOF_STRING)) {
        if (stryMutAct_9fa48("23")) {
          {}
        } else {
          stryCov_9fa48("23");
          return stryMutAct_9fa48("24") ? true : (stryCov_9fa48("24"), false);
        }
      }
      return uuidValidate(address);
    }
  }

  /**
   * Check if a node address already exists (conflict detection).
   * @param {string} address - The address to check.
   * @return {boolean} True if the address already exists.
   */
  hasNodeAddressConflict(address) {
    if (stryMutAct_9fa48("25")) {
      {}
    } else {
      stryCov_9fa48("25");
      return this.nodeAddresses.has(address);
    }
  }

  /**
   * Check if a service address already exists (conflict detection).
   * @param {string} address - The address to check.
   * @return {boolean} True if the address already exists.
   */
  hasServiceAddressConflict(address) {
    if (stryMutAct_9fa48("26")) {
      {}
    } else {
      stryCov_9fa48("26");
      return this.serviceAddresses.has(address);
    }
  }

  /**
   * Check if any address (node or service) already exists.
   * @param {string} address - The address to check.
   * @return {boolean} True if the address already exists.
   */
  hasAddressConflict(address) {
    if (stryMutAct_9fa48("27")) {
      {}
    } else {
      stryCov_9fa48("27");
      return stryMutAct_9fa48("30") ? this.nodeAddresses.has(address) && this.serviceAddresses.has(address) : stryMutAct_9fa48("29") ? false : stryMutAct_9fa48("28") ? true : (stryCov_9fa48("28", "29", "30"), this.nodeAddresses.has(address) || this.serviceAddresses.has(address));
    }
  }

  /**
   * Register an external node address (e.g., from another node joining).
   * @param {string} address - The node address to register.
   * @return {boolean} True if registered successfully, false if conflict.
   */
  registerNodeAddress(address) {
    if (stryMutAct_9fa48("31")) {
      {}
    } else {
      stryCov_9fa48("31");
      if (stryMutAct_9fa48("34") ? false : stryMutAct_9fa48("33") ? true : stryMutAct_9fa48("32") ? this.validateAddress(address) : (stryCov_9fa48("32", "33", "34"), !this.validateAddress(address))) {
        if (stryMutAct_9fa48("35")) {
          {}
        } else {
          stryCov_9fa48("35");
          if (stryMutAct_9fa48("37") ? false : stryMutAct_9fa48("36") ? true : (stryCov_9fa48("36", "37"), this.logger)) {
            if (stryMutAct_9fa48("38")) {
              {}
            } else {
              stryCov_9fa48("38");
              this.logger.warn(ADDRESS_LOG_MSG.INVALID_NODE_FORMAT, stryMutAct_9fa48("39") ? {} : (stryCov_9fa48("39"), {
                address
              }));
            }
          }
          return stryMutAct_9fa48("40") ? true : (stryCov_9fa48("40"), false);
        }
      }
      if (stryMutAct_9fa48("42") ? false : stryMutAct_9fa48("41") ? true : (stryCov_9fa48("41", "42"), this.hasAddressConflict(address))) {
        if (stryMutAct_9fa48("43")) {
          {}
        } else {
          stryCov_9fa48("43");
          if (stryMutAct_9fa48("45") ? false : stryMutAct_9fa48("44") ? true : (stryCov_9fa48("44", "45"), this.logger)) {
            if (stryMutAct_9fa48("46")) {
              {}
            } else {
              stryCov_9fa48("46");
              this.logger.warn(ADDRESS_LOG_MSG.NODE_CONFLICT, stryMutAct_9fa48("47") ? {} : (stryCov_9fa48("47"), {
                address
              }));
            }
          }
          return stryMutAct_9fa48("48") ? true : (stryCov_9fa48("48"), false);
        }
      }
      this.nodeAddresses.add(address);
      if (stryMutAct_9fa48("50") ? false : stryMutAct_9fa48("49") ? true : (stryCov_9fa48("49", "50"), this.logger)) {
        if (stryMutAct_9fa48("51")) {
          {}
        } else {
          stryCov_9fa48("51");
          this.logger.debug(ADDRESS_LOG_MSG.REGISTERED_NODE, stryMutAct_9fa48("52") ? {} : (stryCov_9fa48("52"), {
            address
          }));
        }
      }
      return stryMutAct_9fa48("53") ? false : (stryCov_9fa48("53"), true);
    }
  }

  /**
   * Register an external service address.
   * @param {string} address - The service address to register.
   * @return {boolean} True if registered successfully, false if conflict.
   */
  registerServiceAddress(address) {
    if (stryMutAct_9fa48("54")) {
      {}
    } else {
      stryCov_9fa48("54");
      if (stryMutAct_9fa48("57") ? false : stryMutAct_9fa48("56") ? true : stryMutAct_9fa48("55") ? this.validateAddress(address) : (stryCov_9fa48("55", "56", "57"), !this.validateAddress(address))) {
        if (stryMutAct_9fa48("58")) {
          {}
        } else {
          stryCov_9fa48("58");
          if (stryMutAct_9fa48("60") ? false : stryMutAct_9fa48("59") ? true : (stryCov_9fa48("59", "60"), this.logger)) {
            if (stryMutAct_9fa48("61")) {
              {}
            } else {
              stryCov_9fa48("61");
              this.logger.warn(ADDRESS_LOG_MSG.INVALID_SERVICE_FORMAT, stryMutAct_9fa48("62") ? {} : (stryCov_9fa48("62"), {
                address
              }));
            }
          }
          return stryMutAct_9fa48("63") ? true : (stryCov_9fa48("63"), false);
        }
      }
      if (stryMutAct_9fa48("65") ? false : stryMutAct_9fa48("64") ? true : (stryCov_9fa48("64", "65"), this.hasAddressConflict(address))) {
        if (stryMutAct_9fa48("66")) {
          {}
        } else {
          stryCov_9fa48("66");
          if (stryMutAct_9fa48("68") ? false : stryMutAct_9fa48("67") ? true : (stryCov_9fa48("67", "68"), this.logger)) {
            if (stryMutAct_9fa48("69")) {
              {}
            } else {
              stryCov_9fa48("69");
              this.logger.warn(ADDRESS_LOG_MSG.SERVICE_CONFLICT, stryMutAct_9fa48("70") ? {} : (stryCov_9fa48("70"), {
                address
              }));
            }
          }
          return stryMutAct_9fa48("71") ? true : (stryCov_9fa48("71"), false);
        }
      }
      this.serviceAddresses.add(address);
      if (stryMutAct_9fa48("73") ? false : stryMutAct_9fa48("72") ? true : (stryCov_9fa48("72", "73"), this.logger)) {
        if (stryMutAct_9fa48("74")) {
          {}
        } else {
          stryCov_9fa48("74");
          this.logger.debug(ADDRESS_LOG_MSG.REGISTERED_SERVICE, stryMutAct_9fa48("75") ? {} : (stryCov_9fa48("75"), {
            address
          }));
        }
      }
      return stryMutAct_9fa48("76") ? false : (stryCov_9fa48("76"), true);
    }
  }

  /**
   * Unregister a node address (e.g., when a node leaves).
   * @param {string} address - The node address to unregister.
   * @return {boolean} True if unregistered successfully.
   */
  unregisterNodeAddress(address) {
    if (stryMutAct_9fa48("77")) {
      {}
    } else {
      stryCov_9fa48("77");
      const removed = this.nodeAddresses.delete(address);
      if (stryMutAct_9fa48("80") ? removed || this.logger : stryMutAct_9fa48("79") ? false : stryMutAct_9fa48("78") ? true : (stryCov_9fa48("78", "79", "80"), removed && this.logger)) {
        if (stryMutAct_9fa48("81")) {
          {}
        } else {
          stryCov_9fa48("81");
          this.logger.debug(ADDRESS_LOG_MSG.UNREGISTERED_NODE, stryMutAct_9fa48("82") ? {} : (stryCov_9fa48("82"), {
            address
          }));
        }
      }
      return removed;
    }
  }

  /**
   * Unregister a service address (e.g., when a service stops).
   * @param {string} address - The service address to unregister.
   * @return {boolean} True if unregistered successfully.
   */
  unregisterServiceAddress(address) {
    if (stryMutAct_9fa48("83")) {
      {}
    } else {
      stryCov_9fa48("83");
      const removed = this.serviceAddresses.delete(address);
      if (stryMutAct_9fa48("86") ? removed || this.logger : stryMutAct_9fa48("85") ? false : stryMutAct_9fa48("84") ? true : (stryCov_9fa48("84", "85", "86"), removed && this.logger)) {
        if (stryMutAct_9fa48("87")) {
          {}
        } else {
          stryCov_9fa48("87");
          this.logger.debug(ADDRESS_LOG_MSG.UNREGISTERED_SERVICE, stryMutAct_9fa48("88") ? {} : (stryCov_9fa48("88"), {
            address
          }));
        }
      }
      return removed;
    }
  }

  /**
   * Get the count of registered node addresses.
   * @return {number} The number of registered node addresses.
   */
  getNodeAddressCount() {
    if (stryMutAct_9fa48("89")) {
      {}
    } else {
      stryCov_9fa48("89");
      return this.nodeAddresses.size;
    }
  }

  /**
   * Get the count of registered service addresses.
   * @return {number} The number of registered service addresses.
   */
  getServiceAddressCount() {
    if (stryMutAct_9fa48("90")) {
      {}
    } else {
      stryCov_9fa48("90");
      return this.serviceAddresses.size;
    }
  }

  /**
   * Get all registered node addresses.
   * @return {string[]} Array of registered node addresses.
   */
  getAllNodeAddresses() {
    if (stryMutAct_9fa48("91")) {
      {}
    } else {
      stryCov_9fa48("91");
      return Array.from(this.nodeAddresses);
    }
  }

  /**
   * Get all registered service addresses.
   * @return {string[]} Array of registered service addresses.
   */
  getAllServiceAddresses() {
    if (stryMutAct_9fa48("92")) {
      {}
    } else {
      stryCov_9fa48("92");
      return Array.from(this.serviceAddresses);
    }
  }

  /**
   * Clear all registered addresses (for testing).
   */
  clear() {
    if (stryMutAct_9fa48("93")) {
      {}
    } else {
      stryCov_9fa48("93");
      this.nodeAddresses.clear();
      this.serviceAddresses.clear();
      if (stryMutAct_9fa48("95") ? false : stryMutAct_9fa48("94") ? true : (stryCov_9fa48("94", "95"), this.logger)) {
        if (stryMutAct_9fa48("96")) {
          {}
        } else {
          stryCov_9fa48("96");
          this.logger.debug(ADDRESS_LOG_MSG.CLEARED);
        }
      }
    }
  }

  // ============================================================
  // Unified Address Methods (format: {nodeId}/{serviceType}/{serviceId})
  // ============================================================

  /**
   * Parse a unified address string into components.
   * @param {string} address - Address in format nodeId/serviceType/serviceId.
   * @return {{nodeId: string, serviceType: string, serviceId: string}}
   *   Parsed address components.
   * @throws {MalformedAddressError} If address doesn't have exactly 3 components.
   * @throws {EmptyComponentError} If any component is empty.
   */
  parse(address) {
    if (stryMutAct_9fa48("97")) {
      {}
    } else {
      stryCov_9fa48("97");
      if (stryMutAct_9fa48("100") ? typeof address === ADDRESS_VALIDATE.TYPEOF_STRING : stryMutAct_9fa48("99") ? false : stryMutAct_9fa48("98") ? true : (stryCov_9fa48("98", "99", "100"), typeof address !== ADDRESS_VALIDATE.TYPEOF_STRING)) {
        if (stryMutAct_9fa48("101")) {
          {}
        } else {
          stryCov_9fa48("101");
          throw new MalformedAddressError(ADDRESS_ERROR_MSG.MUST_BE_STRING, String(address));
        }
      }
      const parts = address.split(ADDRESS.SEPARATOR);
      if (stryMutAct_9fa48("104") ? parts.length === ADDRESS_VALIDATE.COMPONENT_COUNT : stryMutAct_9fa48("103") ? false : stryMutAct_9fa48("102") ? true : (stryCov_9fa48("102", "103", "104"), parts.length !== ADDRESS_VALIDATE.COMPONENT_COUNT)) {
        if (stryMutAct_9fa48("105")) {
          {}
        } else {
          stryCov_9fa48("105");
          throw new MalformedAddressError(ADDRESS_ERROR_MSG.mustHaveComponents(parts.length), address);
        }
      }
      const [nodeId, serviceType, serviceId] = parts;
      if (stryMutAct_9fa48("108") ? false : stryMutAct_9fa48("107") ? true : stryMutAct_9fa48("106") ? nodeId : (stryCov_9fa48("106", "107", "108"), !nodeId)) {
        if (stryMutAct_9fa48("109")) {
          {}
        } else {
          stryCov_9fa48("109");
          throw new EmptyComponentError(ADDRESS_COMPONENT.NODE_ID, address);
        }
      }
      if (stryMutAct_9fa48("112") ? false : stryMutAct_9fa48("111") ? true : stryMutAct_9fa48("110") ? serviceType : (stryCov_9fa48("110", "111", "112"), !serviceType)) {
        if (stryMutAct_9fa48("113")) {
          {}
        } else {
          stryCov_9fa48("113");
          throw new EmptyComponentError(ADDRESS_COMPONENT.SERVICE_TYPE, address);
        }
      }
      if (stryMutAct_9fa48("116") ? false : stryMutAct_9fa48("115") ? true : stryMutAct_9fa48("114") ? serviceId : (stryCov_9fa48("114", "115", "116"), !serviceId)) {
        if (stryMutAct_9fa48("117")) {
          {}
        } else {
          stryCov_9fa48("117");
          throw new EmptyComponentError(ADDRESS_COMPONENT.SERVICE_ID, address);
        }
      }
      return stryMutAct_9fa48("118") ? {} : (stryCov_9fa48("118"), {
        nodeId,
        serviceType,
        serviceId
      });
    }
  }

  /**
   * Format components into a unified address string.
   * @param {string} nodeId - The node identifier.
   * @param {string} serviceType - The service type (e.g., 'partition', 'raft').
   * @param {string} serviceId - The service identifier.
   * @return {string} The canonical address string.
   * @throws {EmptyComponentError} If any component is empty.
   */
  format(nodeId, serviceType, serviceId) {
    if (stryMutAct_9fa48("119")) {
      {}
    } else {
      stryCov_9fa48("119");
      if (stryMutAct_9fa48("122") ? false : stryMutAct_9fa48("121") ? true : stryMutAct_9fa48("120") ? nodeId : (stryCov_9fa48("120", "121", "122"), !nodeId)) {
        if (stryMutAct_9fa48("123")) {
          {}
        } else {
          stryCov_9fa48("123");
          throw new EmptyComponentError(ADDRESS_COMPONENT.NODE_ID, ADDRESS_FORMAT.EMPTY);
        }
      }
      if (stryMutAct_9fa48("126") ? false : stryMutAct_9fa48("125") ? true : stryMutAct_9fa48("124") ? serviceType : (stryCov_9fa48("124", "125", "126"), !serviceType)) {
        if (stryMutAct_9fa48("127")) {
          {}
        } else {
          stryCov_9fa48("127");
          throw new EmptyComponentError(ADDRESS_COMPONENT.SERVICE_TYPE, ADDRESS_FORMAT.EMPTY);
        }
      }
      if (stryMutAct_9fa48("130") ? false : stryMutAct_9fa48("129") ? true : stryMutAct_9fa48("128") ? serviceId : (stryCov_9fa48("128", "129", "130"), !serviceId)) {
        if (stryMutAct_9fa48("131")) {
          {}
        } else {
          stryCov_9fa48("131");
          throw new EmptyComponentError(ADDRESS_COMPONENT.SERVICE_ID, ADDRESS_FORMAT.EMPTY);
        }
      }
      return ADDRESS_FORMAT.build(nodeId, serviceType, serviceId);
    }
  }

  /**
   * Validate an address without throwing.
   * @param {string} address - The address to validate.
   * @return {{valid: boolean, error?: string}} Validation result.
   */
  validate(address) {
    if (stryMutAct_9fa48("132")) {
      {}
    } else {
      stryCov_9fa48("132");
      if (stryMutAct_9fa48("135") ? typeof address === ADDRESS_VALIDATE.TYPEOF_STRING : stryMutAct_9fa48("134") ? false : stryMutAct_9fa48("133") ? true : (stryCov_9fa48("133", "134", "135"), typeof address !== ADDRESS_VALIDATE.TYPEOF_STRING)) {
        if (stryMutAct_9fa48("136")) {
          {}
        } else {
          stryCov_9fa48("136");
          return stryMutAct_9fa48("137") ? {} : (stryCov_9fa48("137"), {
            valid: stryMutAct_9fa48("138") ? true : (stryCov_9fa48("138"), false),
            error: ADDRESS_ERROR_MSG.MUST_BE_STRING
          });
        }
      }
      const parts = address.split(ADDRESS.SEPARATOR);
      if (stryMutAct_9fa48("141") ? parts.length === ADDRESS_VALIDATE.COMPONENT_COUNT : stryMutAct_9fa48("140") ? false : stryMutAct_9fa48("139") ? true : (stryCov_9fa48("139", "140", "141"), parts.length !== ADDRESS_VALIDATE.COMPONENT_COUNT)) {
        if (stryMutAct_9fa48("142")) {
          {}
        } else {
          stryCov_9fa48("142");
          return stryMutAct_9fa48("143") ? {} : (stryCov_9fa48("143"), {
            valid: stryMutAct_9fa48("144") ? true : (stryCov_9fa48("144"), false),
            error: ADDRESS_ERROR_MSG.mustHaveComponents(parts.length)
          });
        }
      }
      const [nodeId, serviceType, serviceId] = parts;
      if (stryMutAct_9fa48("147") ? false : stryMutAct_9fa48("146") ? true : stryMutAct_9fa48("145") ? nodeId : (stryCov_9fa48("145", "146", "147"), !nodeId)) {
        if (stryMutAct_9fa48("148")) {
          {}
        } else {
          stryCov_9fa48("148");
          return stryMutAct_9fa48("149") ? {} : (stryCov_9fa48("149"), {
            valid: stryMutAct_9fa48("150") ? true : (stryCov_9fa48("150"), false),
            error: ADDRESS_ERROR_MSG.componentCannotBeEmpty(ADDRESS_COMPONENT.NODE_ID)
          });
        }
      }
      if (stryMutAct_9fa48("153") ? false : stryMutAct_9fa48("152") ? true : stryMutAct_9fa48("151") ? serviceType : (stryCov_9fa48("151", "152", "153"), !serviceType)) {
        if (stryMutAct_9fa48("154")) {
          {}
        } else {
          stryCov_9fa48("154");
          return stryMutAct_9fa48("155") ? {} : (stryCov_9fa48("155"), {
            valid: stryMutAct_9fa48("156") ? true : (stryCov_9fa48("156"), false),
            error: ADDRESS_ERROR_MSG.componentCannotBeEmpty(ADDRESS_COMPONENT.SERVICE_TYPE)
          });
        }
      }
      if (stryMutAct_9fa48("159") ? false : stryMutAct_9fa48("158") ? true : stryMutAct_9fa48("157") ? serviceId : (stryCov_9fa48("157", "158", "159"), !serviceId)) {
        if (stryMutAct_9fa48("160")) {
          {}
        } else {
          stryCov_9fa48("160");
          return stryMutAct_9fa48("161") ? {} : (stryCov_9fa48("161"), {
            valid: stryMutAct_9fa48("162") ? true : (stryCov_9fa48("162"), false),
            error: ADDRESS_ERROR_MSG.componentCannotBeEmpty(ADDRESS_COMPONENT.SERVICE_ID)
          });
        }
      }
      return stryMutAct_9fa48("163") ? {} : (stryCov_9fa48("163"), {
        valid: stryMutAct_9fa48("164") ? false : (stryCov_9fa48("164"), true)
      });
    }
  }

  /**
   * Extract nodeId from a unified address.
   * @param {string} address - The unified address.
   * @return {string} The nodeId component.
   * @throws {MalformedAddressError} If address is malformed.
   * @throws {EmptyComponentError} If any component is empty.
   */
  getNodeId(address) {
    if (stryMutAct_9fa48("165")) {
      {}
    } else {
      stryCov_9fa48("165");
      return this.parse(address).nodeId;
    }
  }

  /**
   * Extract serviceType from a unified address.
   * @param {string} address - The unified address.
   * @return {string} The serviceType component.
   * @throws {MalformedAddressError} If address is malformed.
   * @throws {EmptyComponentError} If any component is empty.
   */
  getServiceType(address) {
    if (stryMutAct_9fa48("166")) {
      {}
    } else {
      stryCov_9fa48("166");
      return this.parse(address).serviceType;
    }
  }

  /**
   * Extract serviceId from a unified address.
   * @param {string} address - The unified address.
   * @return {string} The serviceId component.
   * @throws {MalformedAddressError} If address is malformed.
   * @throws {EmptyComponentError} If any component is empty.
   */
  getServiceId(address) {
    if (stryMutAct_9fa48("167")) {
      {}
    } else {
      stryCov_9fa48("167");
      return this.parse(address).serviceId;
    }
  }
}
export { AddressManager, AddressType, MalformedAddressError, EmptyComponentError };