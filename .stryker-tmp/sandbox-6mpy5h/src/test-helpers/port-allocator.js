/**
 * Centralized port allocator for tests.
 *
 * Ensures unique ports across all test files by:
 * 1. Using a hash of the test file path to determine a unique port range
 * 2. Providing sequential ports within that range
 *
 * Each test file gets a range of 100 ports, starting from a base determined
 * by hashing the file path. This prevents port conflicts when tests run
 * in parallel.
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
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { PORT_RANGE_START, PORT_RANGE_END, PORTS_PER_TEST_FILE, DEFAULT_TEST_FILE_ID, TEST_HOST } from './port-allocator-constants.js';

/**
 * Calculate the total number of available port ranges.
 */
const TOTAL_RANGES = Math.floor(stryMutAct_9fa48("151962") ? (PORT_RANGE_END - PORT_RANGE_START) * PORTS_PER_TEST_FILE : (stryCov_9fa48("151962"), (stryMutAct_9fa48("151963") ? PORT_RANGE_END + PORT_RANGE_START : (stryCov_9fa48("151963"), PORT_RANGE_END - PORT_RANGE_START)) / PORTS_PER_TEST_FILE));
const TOTAL_PORTS = stryMutAct_9fa48("151964") ? PORT_RANGE_END + PORT_RANGE_START : (stryCov_9fa48("151964"), PORT_RANGE_END - PORT_RANGE_START);
const PORT_ALLOCATOR_NAMESPACE = stryMutAct_9fa48("151967") ? process.env.DDB_TEST_PORT_ALLOCATOR_NAMESPACE && 'default' : stryMutAct_9fa48("151966") ? false : stryMutAct_9fa48("151965") ? true : (stryCov_9fa48("151965", "151966", "151967"), process.env.DDB_TEST_PORT_ALLOCATOR_NAMESPACE || (stryMutAct_9fa48("151968") ? "" : (stryCov_9fa48("151968"), 'default')));
const PORT_ALLOCATOR_STATE_DIR = path.join(os.tmpdir(), stryMutAct_9fa48("151969") ? "" : (stryCov_9fa48("151969"), 'ddb-test-port-allocator'), PORT_ALLOCATOR_NAMESPACE);
const PORT_ALLOCATOR_STATE_FILE = path.join(PORT_ALLOCATOR_STATE_DIR, stryMutAct_9fa48("151970") ? "" : (stryCov_9fa48("151970"), 'state.json'));
const PORT_ALLOCATOR_LOCK_DIR = path.join(PORT_ALLOCATOR_STATE_DIR, stryMutAct_9fa48("151971") ? "" : (stryCov_9fa48("151971"), 'lock'));
const PORT_ALLOCATOR_LOCK_WAIT_MS = 10;
const PORT_ALLOCATOR_LOCK_ATTEMPTS = 200;
const lockWaitArray = new Int32Array(new SharedArrayBuffer(4));

/**
 * Per-file port counters.
 * Maps test file identifier to current port offset within its range.
 */
const filePortOffsets = new Map();
const processReservedPorts = new Set();
let exitCleanupRegistered = stryMutAct_9fa48("151972") ? true : (stryCov_9fa48("151972"), false);

/**
 * Hash a string to get a deterministic number.
 *
 * @param {string} str - String to hash
 * @returns {number} Hash value
 */
function hashString(str) {
  if (stryMutAct_9fa48("151973")) {
    {}
  } else {
    stryCov_9fa48("151973");
    const hash = createHash(stryMutAct_9fa48("151974") ? "" : (stryCov_9fa48("151974"), 'md5')).update(str).digest();
    return hash.readUInt32BE(0);
  }
}

/**
 * Get the base port for a test file.
 * Uses a hash of the file path to determine a unique range.
 *
 * @param {string} testFileId - Identifier for the test file
 * @returns {number} Base port for this test file's range
 */
function getBasePort(testFileId) {
  if (stryMutAct_9fa48("151975")) {
    {}
  } else {
    stryCov_9fa48("151975");
    const rangeIndex = stryMutAct_9fa48("151976") ? hashString(testFileId) * TOTAL_RANGES : (stryCov_9fa48("151976"), hashString(testFileId) % TOTAL_RANGES);
    return stryMutAct_9fa48("151977") ? PORT_RANGE_START - rangeIndex * PORTS_PER_TEST_FILE : (stryCov_9fa48("151977"), PORT_RANGE_START + (stryMutAct_9fa48("151978") ? rangeIndex / PORTS_PER_TEST_FILE : (stryCov_9fa48("151978"), rangeIndex * PORTS_PER_TEST_FILE)));
  }
}

/**
 * Ensure allocator state directory exists.
 */
function ensureAllocatorStateDir() {
  if (stryMutAct_9fa48("151979")) {
    {}
  } else {
    stryCov_9fa48("151979");
    fs.mkdirSync(PORT_ALLOCATOR_STATE_DIR, stryMutAct_9fa48("151980") ? {} : (stryCov_9fa48("151980"), {
      recursive: stryMutAct_9fa48("151981") ? false : (stryCov_9fa48("151981"), true)
    }));
  }
}

/**
 * Load allocator reservation state from disk.
 *
 * @return {Object} Reservation state.
 */
function loadAllocatorState() {
  if (stryMutAct_9fa48("151982")) {
    {}
  } else {
    stryCov_9fa48("151982");
    try {
      if (stryMutAct_9fa48("151983")) {
        {}
      } else {
        stryCov_9fa48("151983");
        const raw = fs.readFileSync(PORT_ALLOCATOR_STATE_FILE, stryMutAct_9fa48("151984") ? "" : (stryCov_9fa48("151984"), 'utf8'));
        const parsed = JSON.parse(raw);
        return (stryMutAct_9fa48("151987") ? parsed || typeof parsed === 'object' : stryMutAct_9fa48("151986") ? false : stryMutAct_9fa48("151985") ? true : (stryCov_9fa48("151985", "151986", "151987"), parsed && (stryMutAct_9fa48("151989") ? typeof parsed !== 'object' : stryMutAct_9fa48("151988") ? true : (stryCov_9fa48("151988", "151989"), typeof parsed === (stryMutAct_9fa48("151990") ? "" : (stryCov_9fa48("151990"), 'object')))))) ? parsed : stryMutAct_9fa48("151991") ? {} : (stryCov_9fa48("151991"), {
          reservations: {}
        });
      }
    } catch {
      if (stryMutAct_9fa48("151992")) {
        {}
      } else {
        stryCov_9fa48("151992");
        return stryMutAct_9fa48("151993") ? {} : (stryCov_9fa48("151993"), {
          reservations: {}
        });
      }
    }
  }
}

/**
 * Persist allocator reservation state to disk.
 *
 * @param {Object} state - Reservation state.
 */
function saveAllocatorState(state) {
  if (stryMutAct_9fa48("151994")) {
    {}
  } else {
    stryCov_9fa48("151994");
    ensureAllocatorStateDir();
    fs.writeFileSync(PORT_ALLOCATOR_STATE_FILE, JSON.stringify(state), stryMutAct_9fa48("151995") ? "" : (stryCov_9fa48("151995"), 'utf8'));
  }
}

/**
 * Check whether a process is still alive.
 *
 * @param {number} pid - Process identifier.
 * @return {boolean} True if the process still exists.
 */
function isProcessAlive(pid) {
  if (stryMutAct_9fa48("151996")) {
    {}
  } else {
    stryCov_9fa48("151996");
    if (stryMutAct_9fa48("151999") ? !Number.isInteger(pid) && pid <= 0 : stryMutAct_9fa48("151998") ? false : stryMutAct_9fa48("151997") ? true : (stryCov_9fa48("151997", "151998", "151999"), (stryMutAct_9fa48("152000") ? Number.isInteger(pid) : (stryCov_9fa48("152000"), !Number.isInteger(pid))) || (stryMutAct_9fa48("152003") ? pid > 0 : stryMutAct_9fa48("152002") ? pid < 0 : stryMutAct_9fa48("152001") ? false : (stryCov_9fa48("152001", "152002", "152003"), pid <= 0)))) {
      if (stryMutAct_9fa48("152004")) {
        {}
      } else {
        stryCov_9fa48("152004");
        return stryMutAct_9fa48("152005") ? true : (stryCov_9fa48("152005"), false);
      }
    }
    try {
      if (stryMutAct_9fa48("152006")) {
        {}
      } else {
        stryCov_9fa48("152006");
        process.kill(pid, 0);
        return stryMutAct_9fa48("152007") ? false : (stryCov_9fa48("152007"), true);
      }
    } catch (error) {
      if (stryMutAct_9fa48("152008")) {
        {}
      } else {
        stryCov_9fa48("152008");
        return stryMutAct_9fa48("152011") ? error?.code !== 'EPERM' : stryMutAct_9fa48("152010") ? false : stryMutAct_9fa48("152009") ? true : (stryCov_9fa48("152009", "152010", "152011"), (stryMutAct_9fa48("152012") ? error.code : (stryCov_9fa48("152012"), error?.code)) === (stryMutAct_9fa48("152013") ? "" : (stryCov_9fa48("152013"), 'EPERM')));
      }
    }
  }
}

/**
 * Remove stale reservations for dead worker processes.
 *
 * @param {Object} state - Reservation state.
 */
function pruneDeadReservations(state) {
  if (stryMutAct_9fa48("152014")) {
    {}
  } else {
    stryCov_9fa48("152014");
    const reservations = stryMutAct_9fa48("152017") ? state?.reservations && {} : stryMutAct_9fa48("152016") ? false : stryMutAct_9fa48("152015") ? true : (stryCov_9fa48("152015", "152016", "152017"), (stryMutAct_9fa48("152018") ? state.reservations : (stryCov_9fa48("152018"), state?.reservations)) || {});
    for (const [port, reservation] of Object.entries(reservations)) {
      if (stryMutAct_9fa48("152019")) {
        {}
      } else {
        stryCov_9fa48("152019");
        if (stryMutAct_9fa48("152022") ? false : stryMutAct_9fa48("152021") ? true : stryMutAct_9fa48("152020") ? isProcessAlive(reservation?.pid) : (stryCov_9fa48("152020", "152021", "152022"), !isProcessAlive(stryMutAct_9fa48("152023") ? reservation.pid : (stryCov_9fa48("152023"), reservation?.pid)))) {
          if (stryMutAct_9fa48("152024")) {
            {}
          } else {
            stryCov_9fa48("152024");
            delete reservations[port];
          }
        }
      }
    }
  }
}

/**
 * Execute a critical section while holding the allocator lock.
 *
 * @param {Function} fn - Critical section.
 * @return {*} Result returned by fn().
 */
function withAllocatorLock(fn) {
  if (stryMutAct_9fa48("152025")) {
    {}
  } else {
    stryCov_9fa48("152025");
    ensureAllocatorStateDir();
    let lockHeld = stryMutAct_9fa48("152026") ? true : (stryCov_9fa48("152026"), false);
    for (let attempt = 0; stryMutAct_9fa48("152029") ? attempt >= PORT_ALLOCATOR_LOCK_ATTEMPTS : stryMutAct_9fa48("152028") ? attempt <= PORT_ALLOCATOR_LOCK_ATTEMPTS : stryMutAct_9fa48("152027") ? false : (stryCov_9fa48("152027", "152028", "152029"), attempt < PORT_ALLOCATOR_LOCK_ATTEMPTS); stryMutAct_9fa48("152030") ? attempt-- : (stryCov_9fa48("152030"), attempt++)) {
      if (stryMutAct_9fa48("152031")) {
        {}
      } else {
        stryCov_9fa48("152031");
        try {
          if (stryMutAct_9fa48("152032")) {
            {}
          } else {
            stryCov_9fa48("152032");
            fs.mkdirSync(PORT_ALLOCATOR_LOCK_DIR);
            lockHeld = stryMutAct_9fa48("152033") ? false : (stryCov_9fa48("152033"), true);
            break;
          }
        } catch (error) {
          if (stryMutAct_9fa48("152034")) {
            {}
          } else {
            stryCov_9fa48("152034");
            if (stryMutAct_9fa48("152037") ? error?.code === 'EEXIST' : stryMutAct_9fa48("152036") ? false : stryMutAct_9fa48("152035") ? true : (stryCov_9fa48("152035", "152036", "152037"), (stryMutAct_9fa48("152038") ? error.code : (stryCov_9fa48("152038"), error?.code)) !== (stryMutAct_9fa48("152039") ? "" : (stryCov_9fa48("152039"), 'EEXIST')))) {
              if (stryMutAct_9fa48("152040")) {
                {}
              } else {
                stryCov_9fa48("152040");
                throw error;
              }
            }
            Atomics.wait(lockWaitArray, 0, 0, PORT_ALLOCATOR_LOCK_WAIT_MS);
          }
        }
      }
    }
    if (stryMutAct_9fa48("152043") ? false : stryMutAct_9fa48("152042") ? true : stryMutAct_9fa48("152041") ? lockHeld : (stryCov_9fa48("152041", "152042", "152043"), !lockHeld)) {
      if (stryMutAct_9fa48("152044")) {
        {}
      } else {
        stryCov_9fa48("152044");
        throw new Error(stryMutAct_9fa48("152045") ? "" : (stryCov_9fa48("152045"), 'Timed out acquiring test port allocator lock'));
      }
    }
    try {
      if (stryMutAct_9fa48("152046")) {
        {}
      } else {
        stryCov_9fa48("152046");
        return fn();
      }
    } finally {
      if (stryMutAct_9fa48("152047")) {
        {}
      } else {
        stryCov_9fa48("152047");
        try {
          if (stryMutAct_9fa48("152048")) {
            {}
          } else {
            stryCov_9fa48("152048");
            fs.rmdirSync(PORT_ALLOCATOR_LOCK_DIR);
          }
        } catch {
          // Best-effort lock cleanup only.
        }
      }
    }
  }
}

/**
 * Release this process's reserved ports.
 */
function releaseReservedPorts() {
  if (stryMutAct_9fa48("152049")) {
    {}
  } else {
    stryCov_9fa48("152049");
    if (stryMutAct_9fa48("152052") ? processReservedPorts.size !== 0 : stryMutAct_9fa48("152051") ? false : stryMutAct_9fa48("152050") ? true : (stryCov_9fa48("152050", "152051", "152052"), processReservedPorts.size === 0)) {
      if (stryMutAct_9fa48("152053")) {
        {}
      } else {
        stryCov_9fa48("152053");
        return;
      }
    }
    withAllocatorLock(() => {
      if (stryMutAct_9fa48("152054")) {
        {}
      } else {
        stryCov_9fa48("152054");
        const state = loadAllocatorState();
        const reservations = stryMutAct_9fa48("152057") ? state.reservations && {} : stryMutAct_9fa48("152056") ? false : stryMutAct_9fa48("152055") ? true : (stryCov_9fa48("152055", "152056", "152057"), state.reservations || {});
        for (const port of processReservedPorts) {
          if (stryMutAct_9fa48("152058")) {
            {}
          } else {
            stryCov_9fa48("152058");
            const key = String(port);
            if (stryMutAct_9fa48("152061") ? reservations[key]?.pid !== process.pid : stryMutAct_9fa48("152060") ? false : stryMutAct_9fa48("152059") ? true : (stryCov_9fa48("152059", "152060", "152061"), (stryMutAct_9fa48("152062") ? reservations[key].pid : (stryCov_9fa48("152062"), reservations[key]?.pid)) === process.pid)) {
              if (stryMutAct_9fa48("152063")) {
                {}
              } else {
                stryCov_9fa48("152063");
                delete reservations[key];
              }
            }
          }
        }
        state.reservations = reservations;
        saveAllocatorState(state);
      }
    });
    processReservedPorts.clear();
  }
}

/**
 * Register process-exit cleanup for reserved ports.
 */
function registerExitCleanup() {
  if (stryMutAct_9fa48("152064")) {
    {}
  } else {
    stryCov_9fa48("152064");
    if (stryMutAct_9fa48("152066") ? false : stryMutAct_9fa48("152065") ? true : (stryCov_9fa48("152065", "152066"), exitCleanupRegistered)) {
      if (stryMutAct_9fa48("152067")) {
        {}
      } else {
        stryCov_9fa48("152067");
        return;
      }
    }
    exitCleanupRegistered = stryMutAct_9fa48("152068") ? false : (stryCov_9fa48("152068"), true);
    process.on(stryMutAct_9fa48("152069") ? "" : (stryCov_9fa48("152069"), 'exit'), () => {
      if (stryMutAct_9fa48("152070")) {
        {}
      } else {
        stryCov_9fa48("152070");
        try {
          if (stryMutAct_9fa48("152071")) {
            {}
          } else {
            stryCov_9fa48("152071");
            releaseReservedPorts();
          }
        } catch {
          // Best-effort cleanup only.
        }
      }
    });
  }
}

/**
 * Reserve a unique port across concurrent test worker processes.
 *
 * @param {number} requestedPort - Preferred port candidate.
 * @param {string} testFileId - Allocator owner identifier.
 * @return {number} Reserved port.
 */
function reservePort(requestedPort, testFileId) {
  if (stryMutAct_9fa48("152072")) {
    {}
  } else {
    stryCov_9fa48("152072");
    registerExitCleanup();
    return withAllocatorLock(() => {
      if (stryMutAct_9fa48("152073")) {
        {}
      } else {
        stryCov_9fa48("152073");
        const state = loadAllocatorState();
        pruneDeadReservations(state);
        const reservations = stryMutAct_9fa48("152076") ? state.reservations && {} : stryMutAct_9fa48("152075") ? false : stryMutAct_9fa48("152074") ? true : (stryCov_9fa48("152074", "152075", "152076"), state.reservations || {});
        const startOffset = stryMutAct_9fa48("152077") ? ((requestedPort - PORT_RANGE_START) % TOTAL_PORTS + TOTAL_PORTS) * TOTAL_PORTS : (stryCov_9fa48("152077"), (stryMutAct_9fa48("152078") ? (requestedPort - PORT_RANGE_START) % TOTAL_PORTS - TOTAL_PORTS : (stryCov_9fa48("152078"), (stryMutAct_9fa48("152079") ? (requestedPort - PORT_RANGE_START) * TOTAL_PORTS : (stryCov_9fa48("152079"), (stryMutAct_9fa48("152080") ? requestedPort + PORT_RANGE_START : (stryCov_9fa48("152080"), requestedPort - PORT_RANGE_START)) % TOTAL_PORTS)) + TOTAL_PORTS)) % TOTAL_PORTS);
        for (let attempt = 0; stryMutAct_9fa48("152083") ? attempt >= TOTAL_PORTS : stryMutAct_9fa48("152082") ? attempt <= TOTAL_PORTS : stryMutAct_9fa48("152081") ? false : (stryCov_9fa48("152081", "152082", "152083"), attempt < TOTAL_PORTS); stryMutAct_9fa48("152084") ? attempt-- : (stryCov_9fa48("152084"), attempt++)) {
          if (stryMutAct_9fa48("152085")) {
            {}
          } else {
            stryCov_9fa48("152085");
            const port = stryMutAct_9fa48("152086") ? PORT_RANGE_START - (startOffset + attempt) % TOTAL_PORTS : (stryCov_9fa48("152086"), PORT_RANGE_START + (stryMutAct_9fa48("152087") ? (startOffset + attempt) * TOTAL_PORTS : (stryCov_9fa48("152087"), (stryMutAct_9fa48("152088") ? startOffset - attempt : (stryCov_9fa48("152088"), startOffset + attempt)) % TOTAL_PORTS)));
            const key = String(port);
            if (stryMutAct_9fa48("152090") ? false : stryMutAct_9fa48("152089") ? true : (stryCov_9fa48("152089", "152090"), reservations[key])) {
              if (stryMutAct_9fa48("152091")) {
                {}
              } else {
                stryCov_9fa48("152091");
                continue;
              }
            }
            reservations[key] = stryMutAct_9fa48("152092") ? {} : (stryCov_9fa48("152092"), {
              pid: process.pid,
              testFileId
            });
            state.reservations = reservations;
            saveAllocatorState(state);
            processReservedPorts.add(port);
            return port;
          }
        }
        throw new Error(stryMutAct_9fa48("152093") ? "" : (stryCov_9fa48("152093"), 'No available test ports remain in allocator range'));
      }
    });
  }
}

/**
 * Get a unique port for a test.
 *
 * @param {string} [testFileId] - Optional test file identifier.
 *   If not provided, uses a default range. Recommended to pass
 *   import.meta.url for consistent per-file allocation.
 * @returns {number} A unique port number
 */
export function getTestPort(testFileId = DEFAULT_TEST_FILE_ID) {
  if (stryMutAct_9fa48("152094")) {
    {}
  } else {
    stryCov_9fa48("152094");
    const basePort = getBasePort(testFileId);
    const currentOffset = stryMutAct_9fa48("152097") ? filePortOffsets.get(testFileId) && 0 : stryMutAct_9fa48("152096") ? false : stryMutAct_9fa48("152095") ? true : (stryCov_9fa48("152095", "152096", "152097"), filePortOffsets.get(testFileId) || 0);
    if (stryMutAct_9fa48("152101") ? currentOffset < PORTS_PER_TEST_FILE : stryMutAct_9fa48("152100") ? currentOffset > PORTS_PER_TEST_FILE : stryMutAct_9fa48("152099") ? false : stryMutAct_9fa48("152098") ? true : (stryCov_9fa48("152098", "152099", "152100", "152101"), currentOffset >= PORTS_PER_TEST_FILE)) {
      if (stryMutAct_9fa48("152102")) {
        {}
      } else {
        stryCov_9fa48("152102");
        throw new Error((stryMutAct_9fa48("152103") ? `` : (stryCov_9fa48("152103"), `Port range exhausted for test file: ${testFileId}. `)) + (stryMutAct_9fa48("152104") ? `` : (stryCov_9fa48("152104"), `Maximum ${PORTS_PER_TEST_FILE} ports per file.`)));
      }
    }
    filePortOffsets.set(testFileId, stryMutAct_9fa48("152105") ? currentOffset - 1 : (stryCov_9fa48("152105"), currentOffset + 1));
    return reservePort(stryMutAct_9fa48("152106") ? basePort - currentOffset : (stryCov_9fa48("152106"), basePort + currentOffset), testFileId);
  }
}

/**
 * Reset the port counter for a test file.
 * Useful in beforeEach() to ensure consistent port allocation.
 *
 * @param {string} [testFileId] - Test file identifier to reset
 */
export function resetTestPorts(testFileId = DEFAULT_TEST_FILE_ID) {
  if (stryMutAct_9fa48("152107")) {
    {}
  } else {
    stryCov_9fa48("152107");
    filePortOffsets.set(testFileId, 0);
  }
}

/**
 * Get an available port by actually binding to port 0.
 * This is the most reliable way to get a free port, but requires
 * async operation.
 *
 * @returns {Promise<number>} An available port number
 */
export function getAvailablePort() {
  if (stryMutAct_9fa48("152108")) {
    {}
  } else {
    stryCov_9fa48("152108");
    return new Promise((resolve, reject) => {
      if (stryMutAct_9fa48("152109")) {
        {}
      } else {
        stryCov_9fa48("152109");
        const server = createServer();
        server.listen(0, TEST_HOST, () => {
          if (stryMutAct_9fa48("152110")) {
            {}
          } else {
            stryCov_9fa48("152110");
            const {
              port
            } = server.address();
            server.close(err => {
              if (stryMutAct_9fa48("152111")) {
                {}
              } else {
                stryCov_9fa48("152111");
                if (stryMutAct_9fa48("152113") ? false : stryMutAct_9fa48("152112") ? true : (stryCov_9fa48("152112", "152113"), err)) {
                  if (stryMutAct_9fa48("152114")) {
                    {}
                  } else {
                    stryCov_9fa48("152114");
                    reject(err);
                  }
                } else {
                  if (stryMutAct_9fa48("152115")) {
                    {}
                  } else {
                    stryCov_9fa48("152115");
                    resolve(port);
                  }
                }
              }
            });
          }
        });
        server.on(stryMutAct_9fa48("152116") ? "" : (stryCov_9fa48("152116"), 'error'), reject);
      }
    });
  }
}

/**
 * Get multiple available ports.
 *
 * @param {number} count - Number of ports to allocate
 * @returns {Promise<number[]>} Array of available port numbers
 */
export async function getAvailablePorts(count) {
  if (stryMutAct_9fa48("152117")) {
    {}
  } else {
    stryCov_9fa48("152117");
    const ports = stryMutAct_9fa48("152118") ? ["Stryker was here"] : (stryCov_9fa48("152118"), []);
    for (let i = 0; stryMutAct_9fa48("152121") ? i >= count : stryMutAct_9fa48("152120") ? i <= count : stryMutAct_9fa48("152119") ? false : (stryCov_9fa48("152119", "152120", "152121"), i < count); stryMutAct_9fa48("152122") ? i-- : (stryCov_9fa48("152122"), i++)) {
      if (stryMutAct_9fa48("152123")) {
        {}
      } else {
        stryCov_9fa48("152123");
        ports.push(await getAvailablePort());
      }
    }
    return ports;
  }
}

/**
 * Create a port allocator bound to a specific test file.
 * This is the recommended way to use the port allocator.
 *
 * @param {string} testFileId - Test file identifier (use import.meta.url)
 * @returns {Object} Port allocator with getPort() and reset() methods
 *
 * @example
 * // At the top of your test file:
 * import {createPortAllocator} from '../../src/test-helpers/port-allocator.js';
 * const ports = createPortAllocator(import.meta.url);
 *
 * // In beforeEach:
 * beforeEach(() => {
 *   ports.reset();
 * });
 *
 * // In tests:
 * const port = ports.getPort();
 */
export function createPortAllocator(testFileId) {
  if (stryMutAct_9fa48("152124")) {
    {}
  } else {
    stryCov_9fa48("152124");
    return stryMutAct_9fa48("152125") ? {} : (stryCov_9fa48("152125"), {
      /**
       * Get the next unique port for this test file.
       * @returns {number} A unique port number
       */
      getPort() {
        if (stryMutAct_9fa48("152126")) {
          {}
        } else {
          stryCov_9fa48("152126");
          return getTestPort(testFileId);
        }
      },
      /**
       * Reset the port counter for this test file.
       */
      reset() {
        if (stryMutAct_9fa48("152127")) {
          {}
        } else {
          stryCov_9fa48("152127");
          resetTestPorts(testFileId);
        }
      },
      /**
       * Get an available port by binding to port 0.
       * @returns {Promise<number>} An available port number
       */
      async getAvailable() {
        if (stryMutAct_9fa48("152128")) {
          {}
        } else {
          stryCov_9fa48("152128");
          return getAvailablePort();
        }
      }
    });
  }
}