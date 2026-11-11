/**
 * Host resource facts: what the kernel reports, through /proc and /sys, about
 * the machine and network namespace this process runs in. Observation only:
 * nothing here feeds a product decision.
 *
 * Every fact is a named state. A `measured` fact carries cumulative kernel
 * counters or instantaneous gauges exactly as read; an `unavailable` fact
 * carries the reason there is no reading. A zero is therefore always a
 * measured zero, never a stand-in for a counter that could not be read.
 *
 * Scope: /proc/net/* describes the process's network namespace. A container
 * started with host networking shares the host's namespace, so there the
 * counters are the host's interfaces and TCP stack (all traffic of that
 * host, not only this process's). /proc/stat, /proc/loadavg, /proc/pressure
 * and the thermal counters describe the whole machine in either mode.
 *
 * Cost and owner (R13): one reading is ~50 synchronous file reads (two
 * throttle counters per CPU, one per thermal zone, the /proc files). A node
 * process has one reader, sharedHostResourceFactsReader, read by both the
 * node health buffer and the resource diagnostics samplers; it reads the
 * files at most once per HOST_FACTS_READING_INTERVAL_MS and every caller
 * inside that interval shares the same reading (its `capturedAt` says when).
 */

import fs from 'node:fs';

const HOST_FACT_STATE = Object.freeze({
  MEASURED: 'measured',
  UNAVAILABLE: 'unavailable',
});

const HOST_FACT_UNAVAILABLE_REASON = Object.freeze({
  SOURCE_MISSING: 'source_missing',
  SOURCE_UNREADABLE: 'source_unreadable',
  SOURCE_UNPARSEABLE: 'source_unparseable',
  NO_WIRELESS_INTERFACE: 'no_wireless_interface',
  NO_THERMAL_THROTTLE_COUNTER: 'no_thermal_throttle_counter',
  NO_THERMAL_ZONE: 'no_thermal_zone',
});

const HOST_FACT_SOURCE = Object.freeze({
  NET_DEV: '/proc/net/dev',
  NET_SNMP: '/proc/net/snmp',
  NET_WIRELESS: '/proc/net/wireless',
  STAT: '/proc/stat',
  LOADAVG: '/proc/loadavg',
  MEMINFO: '/proc/meminfo',
  PRESSURE_CPU: '/proc/pressure/cpu',
  PRESSURE_MEMORY: '/proc/pressure/memory',
  PRESSURE_IO: '/proc/pressure/io',
  CPU_DIRECTORY: '/sys/devices/system/cpu',
  THERMAL_DIRECTORY: '/sys/class/thermal',
});

// One physical reading per this interval, whoever asks: the node health
// buffer's process-sample cadence is defined from it.
const HOST_FACTS_READING_INTERVAL_MS = 5000;
const MISSING_SOURCE_ERROR_CODE = 'ENOENT';
const TEXT_ENCODING = 'utf8';
const LINE_BREAK = '\n';
const WHITESPACE = /\s+/u;
const INTERFACE_SEPARATOR = ':';
const NET_DEV_HEADER_LINES = 2;
const NET_DEV_FIELD = Object.freeze({
  RX_BYTES: 0, RX_PACKETS: 1, RX_ERRORS: 2, RX_DROPPED: 3,
  TX_BYTES: 8, TX_PACKETS: 9, TX_ERRORS: 10, TX_DROPPED: 11,
  COUNT: 16,
});
// Interfaces that carry no traffic of their own on the wire: loopback, the
// container bridges and their veth ends, and tunnels, whose bytes are
// already counted on the physical interface they leave through.
const VIRTUAL_INTERFACE_PREFIXES = Object.freeze(
  ['lo', 'docker', 'veth', 'br-', 'virbr', 'tailscale', 'tun', 'tap', 'wg']);
const SNMP_TCP_PREFIX = 'Tcp:';
const SNMP_TCP_FIELD = Object.freeze({
  RETRANSMITTED_SEGMENTS: 'RetransSegs',
  OUT_SEGMENTS: 'OutSegs',
  IN_SEGMENTS: 'InSegs',
  IN_ERRORS: 'InErrs',
});
const WIRELESS_HEADER_LINES = 2;
const WIRELESS_FIELD = Object.freeze({LINK_QUALITY: 1, SIGNAL_LEVEL: 2, RETRY_DISCARDS: 7});
const WIRELESS_MIN_FIELDS = 8;
const STAT_CPU_TOTAL_PREFIX = 'cpu ';
const STAT_CPU_LINE = /^cpu\d+ /u;
const STAT_CPU_FIELD = Object.freeze({
  USER: 0, NICE: 1, SYSTEM: 2, IDLE: 3, IOWAIT: 4, IRQ: 5, SOFTIRQ: 6, STEAL: 7,
  COUNT: 8,
});
const LOADAVG_MIN_FIELDS = 3;
const MEMINFO_FIELD = Object.freeze({TOTAL: 'MemTotal:', AVAILABLE: 'MemAvailable:'});
const BYTES_PER_KIB = 1024;
const PRESSURE_KIND = Object.freeze({SOME: 'some', FULL: 'full'});
const PRESSURE_AVG10 = /avg10=([0-9.]+)/u;
const PRESSURE_TOTAL = /total=(\d+)/u;
const CPU_DIRECTORY_NAME = /^cpu\d+$/u;
const THERMAL_ZONE_NAME = /^thermal_zone\d+$/u;
const THROTTLE_COUNT_FILE = Object.freeze({
  CORE: 'thermal_throttle/core_throttle_count',
  PACKAGE: 'thermal_throttle/package_throttle_count',
});
const THERMAL_ZONE_TEMPERATURE_FILE = 'temp';
const PATH_SEPARATOR = '/';

function measuredFact(source, values) {
  return {state: HOST_FACT_STATE.MEASURED, source, ...values};
}

function unavailableFact(source, reason) {
  return {state: HOST_FACT_STATE.UNAVAILABLE, source, reason};
}

function unavailableReasonOf(error) {
  return error?.code === MISSING_SOURCE_ERROR_CODE ?
    HOST_FACT_UNAVAILABLE_REASON.SOURCE_MISSING :
    HOST_FACT_UNAVAILABLE_REASON.SOURCE_UNREADABLE;
}

function toCounters(fields) {
  return fields.map((field) => Number(field));
}

function allFinite(values) {
  return values.every((value) => Number.isFinite(value));
}

function isVirtualInterface(name) {
  return VIRTUAL_INTERFACE_PREFIXES.some((prefix) => name.startsWith(prefix));
}

/**
 * @param {string} text - /proc/net/dev.
 * @return {Object} Cumulative byte, packet and error counters summed over
 *   the namespace's non-virtual interfaces, with the interfaces named.
 */
function parseNetworkInterfaceCounters(text) {
  const totals = {rxBytes: 0, txBytes: 0, rxPackets: 0, txPackets: 0,
    rxErrorsAndDrops: 0, txErrorsAndDrops: 0};
  const interfaces = [];
  for (const line of text.split(LINE_BREAK).slice(NET_DEV_HEADER_LINES)) {
    const separatorAt = line.indexOf(INTERFACE_SEPARATOR);
    if (separatorAt < 0) continue;
    const name = line.slice(0, separatorAt).trim();
    const counters = toCounters(
      line.slice(separatorAt + 1).trim().split(WHITESPACE));
    if (counters.length < NET_DEV_FIELD.COUNT || !allFinite(counters)) {
      return unavailableFact(HOST_FACT_SOURCE.NET_DEV,
        HOST_FACT_UNAVAILABLE_REASON.SOURCE_UNPARSEABLE);
    }
    if (isVirtualInterface(name)) continue;
    interfaces.push(name);
    totals.rxBytes += counters[NET_DEV_FIELD.RX_BYTES];
    totals.txBytes += counters[NET_DEV_FIELD.TX_BYTES];
    totals.rxPackets += counters[NET_DEV_FIELD.RX_PACKETS];
    totals.txPackets += counters[NET_DEV_FIELD.TX_PACKETS];
    totals.rxErrorsAndDrops += counters[NET_DEV_FIELD.RX_ERRORS] +
      counters[NET_DEV_FIELD.RX_DROPPED];
    totals.txErrorsAndDrops += counters[NET_DEV_FIELD.TX_ERRORS] +
      counters[NET_DEV_FIELD.TX_DROPPED];
  }
  return measuredFact(HOST_FACT_SOURCE.NET_DEV, {...totals, interfaces});
}

/**
 * @param {string} text - /proc/net/snmp.
 * @return {Object} Cumulative TCP segment counters of the namespace.
 */
function parseTcpSegmentCounters(text) {
  const rows = text.split(LINE_BREAK)
    .filter((line) => line.startsWith(SNMP_TCP_PREFIX))
    .map((line) => line.slice(SNMP_TCP_PREFIX.length).trim().split(WHITESPACE));
  if (rows.length < 2) {
    return unavailableFact(HOST_FACT_SOURCE.NET_SNMP,
      HOST_FACT_UNAVAILABLE_REASON.SOURCE_UNPARSEABLE);
  }
  const [names, values] = rows;
  const read = (name) => Number(values[names.indexOf(name)]);
  const counters = {
    retransmittedSegments: read(SNMP_TCP_FIELD.RETRANSMITTED_SEGMENTS),
    outSegments: read(SNMP_TCP_FIELD.OUT_SEGMENTS),
    inSegments: read(SNMP_TCP_FIELD.IN_SEGMENTS),
    inErrors: read(SNMP_TCP_FIELD.IN_ERRORS),
  };
  return allFinite(Object.values(counters)) ?
    measuredFact(HOST_FACT_SOURCE.NET_SNMP, counters) :
    unavailableFact(HOST_FACT_SOURCE.NET_SNMP,
      HOST_FACT_UNAVAILABLE_REASON.SOURCE_UNPARSEABLE);
}

/**
 * @param {string} text - /proc/net/wireless.
 * @return {Object} Link quality and signal level of each wireless interface.
 */
function parseWirelessLinks(text) {
  const links = [];
  for (const line of text.split(LINE_BREAK).slice(WIRELESS_HEADER_LINES)) {
    const separatorAt = line.indexOf(INTERFACE_SEPARATOR);
    if (separatorAt < 0) continue;
    const fields = line.slice(separatorAt + 1).trim().split(WHITESPACE);
    const link = {
      interface: line.slice(0, separatorAt).trim(),
      linkQuality: Number.parseFloat(fields[WIRELESS_FIELD.LINK_QUALITY]),
      signalLevelDbm: Number.parseFloat(fields[WIRELESS_FIELD.SIGNAL_LEVEL]),
      retryDiscards: Number(fields[WIRELESS_FIELD.RETRY_DISCARDS]),
    };
    if (fields.length < WIRELESS_MIN_FIELDS ||
        !allFinite([link.linkQuality, link.signalLevelDbm, link.retryDiscards])) {
      return unavailableFact(HOST_FACT_SOURCE.NET_WIRELESS,
        HOST_FACT_UNAVAILABLE_REASON.SOURCE_UNPARSEABLE);
    }
    links.push(link);
  }
  return links.length === 0 ?
    unavailableFact(HOST_FACT_SOURCE.NET_WIRELESS,
      HOST_FACT_UNAVAILABLE_REASON.NO_WIRELESS_INTERFACE) :
    measuredFact(HOST_FACT_SOURCE.NET_WIRELESS, {links});
}

/**
 * @param {string} text - /proc/stat.
 * @return {Object} Cumulative machine CPU ticks by state, and the CPU count.
 */
function parseCpuTicks(text) {
  const lines = text.split(LINE_BREAK);
  const totalLine = lines.find((line) => line.startsWith(STAT_CPU_TOTAL_PREFIX));
  const ticks = totalLine === undefined ? [] :
    toCounters(totalLine.slice(STAT_CPU_TOTAL_PREFIX.length).trim().split(WHITESPACE));
  if (ticks.length < STAT_CPU_FIELD.COUNT || !allFinite(ticks)) {
    return unavailableFact(HOST_FACT_SOURCE.STAT,
      HOST_FACT_UNAVAILABLE_REASON.SOURCE_UNPARSEABLE);
  }
  const counted = ticks.slice(0, STAT_CPU_FIELD.COUNT);
  return measuredFact(HOST_FACT_SOURCE.STAT, {
    userTicks: ticks[STAT_CPU_FIELD.USER] + ticks[STAT_CPU_FIELD.NICE],
    systemTicks: ticks[STAT_CPU_FIELD.SYSTEM] + ticks[STAT_CPU_FIELD.IRQ] +
      ticks[STAT_CPU_FIELD.SOFTIRQ],
    idleTicks: ticks[STAT_CPU_FIELD.IDLE],
    iowaitTicks: ticks[STAT_CPU_FIELD.IOWAIT],
    stealTicks: ticks[STAT_CPU_FIELD.STEAL],
    totalTicks: counted.reduce((sum, value) => sum + value, 0),
    cpuCount: lines.filter((line) => STAT_CPU_LINE.test(line)).length,
  });
}

/**
 * @param {string} text - /proc/loadavg.
 * @return {Object} The 1, 5 and 15 minute load averages.
 */
function parseLoadAverage(text) {
  const loads = toCounters(text.trim().split(WHITESPACE).slice(0, LOADAVG_MIN_FIELDS));
  return loads.length < LOADAVG_MIN_FIELDS || !allFinite(loads) ?
    unavailableFact(HOST_FACT_SOURCE.LOADAVG,
      HOST_FACT_UNAVAILABLE_REASON.SOURCE_UNPARSEABLE) :
    measuredFact(HOST_FACT_SOURCE.LOADAVG,
      {load1: loads[0], load5: loads[1], load15: loads[2]});
}

/**
 * @param {string} text - /proc/meminfo.
 * @return {Object} The machine's total and available memory in bytes.
 */
function parseMachineMemory(text) {
  const read = (field) => {
    const line = text.split(LINE_BREAK).find((row) => row.startsWith(field));
    return line === undefined ? Number.NaN :
      Number(line.slice(field.length).trim().split(WHITESPACE)[0]) * BYTES_PER_KIB;
  };
  const memory = {
    totalBytes: read(MEMINFO_FIELD.TOTAL),
    availableBytes: read(MEMINFO_FIELD.AVAILABLE),
  };
  return allFinite(Object.values(memory)) ?
    measuredFact(HOST_FACT_SOURCE.MEMINFO, memory) :
    unavailableFact(HOST_FACT_SOURCE.MEMINFO,
      HOST_FACT_UNAVAILABLE_REASON.SOURCE_UNPARSEABLE);
}

/**
 * @param {string} source - The pressure file read.
 * @param {string} text - One /proc/pressure file.
 * @return {Object} The share of the last 10 s some (and, where reported, all)
 *   tasks were stalled on the resource, and the cumulative stall time.
 */
function parsePressure(source, text) {
  const values = {};
  for (const line of text.split(LINE_BREAK)) {
    const kind = Object.values(PRESSURE_KIND).find((name) => line.startsWith(`${name} `));
    if (kind === undefined) continue;
    const average = PRESSURE_AVG10.exec(line);
    const total = PRESSURE_TOTAL.exec(line);
    if (average === null || total === null) {
      return unavailableFact(source, HOST_FACT_UNAVAILABLE_REASON.SOURCE_UNPARSEABLE);
    }
    values[`${kind}Avg10Percent`] = Number(average[1]);
    values[`${kind}StalledMicroseconds`] = Number(total[1]);
  }
  return Object.hasOwn(values, `${PRESSURE_KIND.SOME}Avg10Percent`) ?
    measuredFact(source, values) :
    unavailableFact(source, HOST_FACT_UNAVAILABLE_REASON.SOURCE_UNPARSEABLE);
}

function readTextFile(path) {
  return fs.readFileSync(path, TEXT_ENCODING);
}

function listDirectoryNames(path) {
  return fs.readdirSync(path);
}

// The directory's entries matching a pattern, as paths. A directory that
// cannot be listed has none; the facts read from it are then unavailable.
function listMatching(listDirectory, directory, pattern) {
  let names = [];
  try {
    names = listDirectory(directory);
  } catch (error) {
    names = namesOfUnlistableDirectory(error);
  }
  return names.filter((name) => pattern.test(name))
    .map((name) => `${directory}${PATH_SEPARATOR}${name}`);
}

function namesOfUnlistableDirectory(_error) {
  return [];
}

function unreadableCounter(_error) {
  return Number.NaN;
}

class HostResourceFactsReader {
  /**
   * @param {Object} [options]
   * @param {Function} [options.readText] (path) => file text; throws like fs.
   * @param {Function} [options.listDirectory] (path) => entry names; throws
   *   like fs.
   * @param {number} [options.minIntervalMs] Readings closer together than
   *   this reuse the previous one.
   */
  constructor({readText = readTextFile, listDirectory = listDirectoryNames,
    minIntervalMs = HOST_FACTS_READING_INTERVAL_MS} = {}) {
    this.readText = readText;
    this.minIntervalMs = minIntervalMs;
    this.cpuDirectories = listMatching(listDirectory,
      HOST_FACT_SOURCE.CPU_DIRECTORY, CPU_DIRECTORY_NAME);
    this.thermalZones = listMatching(listDirectory,
      HOST_FACT_SOURCE.THERMAL_DIRECTORY, THERMAL_ZONE_NAME);
    this.lastFacts = null;
  }

  readFact(source, parse) {
    try {
      return parse(this.readText(source));
    } catch (error) {
      return unavailableFact(source, unavailableReasonOf(error));
    }
  }

  // The counters that could be read; a path that cannot is simply not one
  // of them, and a fact with none is unavailable.
  readCounterFiles(paths) {
    const counts = [];
    for (const path of paths) {
      let count = Number.NaN;
      try {
        count = Number(this.readText(path).trim());
      } catch (error) {
        count = unreadableCounter(error);
      }
      if (Number.isFinite(count)) counts.push(count);
    }
    return counts;
  }

  /**
   * Cumulative thermal throttle events. The kernel exposes them per CPU on
   * processors with a thermal monitor; a core event is counted on its core,
   * a package event on every core of the package (so the maximum is taken).
   * @return {Object} The thermal throttle fact.
   */
  readThermalThrottle() {
    const source = HOST_FACT_SOURCE.CPU_DIRECTORY;
    const core = this.readCounterFiles(this.cpuDirectories.map((directory) =>
      `${directory}${PATH_SEPARATOR}${THROTTLE_COUNT_FILE.CORE}`));
    const packageCounts = this.readCounterFiles(this.cpuDirectories.map((directory) =>
      `${directory}${PATH_SEPARATOR}${THROTTLE_COUNT_FILE.PACKAGE}`));
    if (core.length === 0 && packageCounts.length === 0) {
      return unavailableFact(source,
        HOST_FACT_UNAVAILABLE_REASON.NO_THERMAL_THROTTLE_COUNTER);
    }
    return measuredFact(source, {
      coreThrottleEvents: core.reduce((sum, count) => sum + count, 0),
      packageThrottleEvents: packageCounts.reduce((max, count) => Math.max(max, count), 0),
    });
  }

  readThermalZones() {
    const source = HOST_FACT_SOURCE.THERMAL_DIRECTORY;
    const temperatures = this.readCounterFiles(this.thermalZones.map((zone) =>
      `${zone}${PATH_SEPARATOR}${THERMAL_ZONE_TEMPERATURE_FILE}`));
    return temperatures.length === 0 ?
      unavailableFact(source, HOST_FACT_UNAVAILABLE_REASON.NO_THERMAL_ZONE) :
      measuredFact(source, {
        maxTemperatureMilliCelsius: Math.max(...temperatures),
        zones: temperatures.length,
      });
  }

  /**
   * @param {number} nowMs - The caller's clock.
   * @return {Object} One reading of every host fact.
   */
  read(nowMs) {
    // A clock that stepped back is a new reading, never a reuse that would
    // last until the clock catches up.
    const ageMs = this.lastFacts === null ? null : nowMs - this.lastFacts.capturedAt;
    if (ageMs !== null && ageMs >= 0 && ageMs < this.minIntervalMs) {
      return this.lastFacts;
    }
    const pressure = (source) =>
      this.readFact(source, (text) => parsePressure(source, text));
    this.lastFacts = {
      capturedAt: nowMs,
      network: this.readFact(HOST_FACT_SOURCE.NET_DEV, parseNetworkInterfaceCounters),
      tcp: this.readFact(HOST_FACT_SOURCE.NET_SNMP, parseTcpSegmentCounters),
      wireless: this.readFact(HOST_FACT_SOURCE.NET_WIRELESS, parseWirelessLinks),
      cpu: this.readFact(HOST_FACT_SOURCE.STAT, parseCpuTicks),
      load: this.readFact(HOST_FACT_SOURCE.LOADAVG, parseLoadAverage),
      memory: this.readFact(HOST_FACT_SOURCE.MEMINFO, parseMachineMemory),
      cpuPressure: pressure(HOST_FACT_SOURCE.PRESSURE_CPU),
      memoryPressure: pressure(HOST_FACT_SOURCE.PRESSURE_MEMORY),
      ioPressure: pressure(HOST_FACT_SOURCE.PRESSURE_IO),
      thermalThrottle: this.readThermalThrottle(),
      thermalZones: this.readThermalZones(),
    };
    return this.lastFacts;
  }
}

// The node process's one host-facts reader (see the header).
const sharedHostResourceFactsReader = new HostResourceFactsReader();

export {
  HOST_FACTS_READING_INTERVAL_MS,
  HOST_FACT_SOURCE,
  HOST_FACT_STATE,
  HOST_FACT_UNAVAILABLE_REASON,
  HostResourceFactsReader,
  parseCpuTicks,
  parseNetworkInterfaceCounters,
  parsePressure,
  parseTcpSegmentCounters,
  parseWirelessLinks,
  sharedHostResourceFactsReader,
};
