/**
 * Streaming Aggregator - Streams results to reduce memory footprint.
 * Implements streaming aggregation and external merge sort for ordered results.
 * Requirements: 26.9
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
import { LoggingService } from '../logging/logging-service.js';
import { ConfigurationManager } from '../config/configuration-manager.js';
import { NUM, TYPEOF } from '../constants/index.js';
import { QUERY_AGGREGATE, QUERY_AST_NODE, QUERY_CONFIG_KEY, QUERY_DEFAULTS, QUERY_LOG_MSG, QUERY_SORT_DIRECTION, QUERY_SQL_FRAGMENT, QUERY_SUBSYSTEM } from './query-constants.js';
const RESULT_ESTIMATE = Object.freeze(stryMutAct_9fa48("125212") ? {} : (stryCov_9fa48("125212"), {
  UTF16_BYTES_PER_CHAR: NUM.TWO,
  FALLBACK_ROW_BYTES: NUM.HUNDRED
}));

/**
 * StreamingAggregator processes query results in a streaming fashion
 * to reduce memory footprint for large result sets.
 */
class StreamingAggregator {
  /**
   * Create a new streaming aggregator.
   * @param {Object} options - Configuration options.
   * @param {number} options.chunkSize - Number of rows per chunk.
   * @param {number} options.maxMemoryBytes - Maximum memory for buffering.
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("125213")) {
      {}
    } else {
      stryCov_9fa48("125213");
      this.logger = this.initLogger();
      const config = ConfigurationManager.getInstance();
      this.chunkSize = stryMutAct_9fa48("125216") ? (options.chunkSize || config.get(QUERY_CONFIG_KEY.COORDINATOR_STREAMING_CHUNK_SIZE)) && QUERY_DEFAULTS.COORDINATOR_STREAMING_CHUNK_SIZE : stryMutAct_9fa48("125215") ? false : stryMutAct_9fa48("125214") ? true : (stryCov_9fa48("125214", "125215", "125216"), (stryMutAct_9fa48("125218") ? options.chunkSize && config.get(QUERY_CONFIG_KEY.COORDINATOR_STREAMING_CHUNK_SIZE) : stryMutAct_9fa48("125217") ? false : (stryCov_9fa48("125217", "125218"), options.chunkSize || config.get(QUERY_CONFIG_KEY.COORDINATOR_STREAMING_CHUNK_SIZE))) || QUERY_DEFAULTS.COORDINATOR_STREAMING_CHUNK_SIZE);
      this.maxMemoryBytes = stryMutAct_9fa48("125221") ? (options.maxMemoryBytes || config.get(QUERY_CONFIG_KEY.COORDINATOR_MAX_RESULT_BUFFER_BYTES)) && QUERY_DEFAULTS.COORDINATOR_MAX_RESULT_BUFFER_BYTES : stryMutAct_9fa48("125220") ? false : stryMutAct_9fa48("125219") ? true : (stryCov_9fa48("125219", "125220", "125221"), (stryMutAct_9fa48("125223") ? options.maxMemoryBytes && config.get(QUERY_CONFIG_KEY.COORDINATOR_MAX_RESULT_BUFFER_BYTES) : stryMutAct_9fa48("125222") ? false : (stryCov_9fa48("125222", "125223"), options.maxMemoryBytes || config.get(QUERY_CONFIG_KEY.COORDINATOR_MAX_RESULT_BUFFER_BYTES))) || QUERY_DEFAULTS.COORDINATOR_MAX_RESULT_BUFFER_BYTES);
      this.enabled = stryMutAct_9fa48("125226") ? config.get(QUERY_CONFIG_KEY.COORDINATOR_STREAMING_ENABLED) === false : stryMutAct_9fa48("125225") ? false : stryMutAct_9fa48("125224") ? true : (stryCov_9fa48("125224", "125225", "125226"), config.get(QUERY_CONFIG_KEY.COORDINATOR_STREAMING_ENABLED) !== (stryMutAct_9fa48("125227") ? true : (stryCov_9fa48("125227"), false)));

      // Streaming state
      this.chunks = stryMutAct_9fa48("125228") ? ["Stryker was here"] : (stryCov_9fa48("125228"), []);
      this.currentChunk = stryMutAct_9fa48("125229") ? ["Stryker was here"] : (stryCov_9fa48("125229"), []);
      this.totalRows = NUM.ZERO;
      this.estimatedBytes = NUM.ZERO;
    }
  }

  /**
   * Initialize logger.
   * @return {Object} Logger instance.
   * @private
   */
  initLogger() {
    if (stryMutAct_9fa48("125230")) {
      {}
    } else {
      stryCov_9fa48("125230");
      try {
        if (stryMutAct_9fa48("125231")) {
          {}
        } else {
          stryCov_9fa48("125231");
          const loggingService = LoggingService.getInstance();
          if (stryMutAct_9fa48("125233") ? false : stryMutAct_9fa48("125232") ? true : (stryCov_9fa48("125232", "125233"), loggingService.isInitialized())) {
            if (stryMutAct_9fa48("125234")) {
              {}
            } else {
              stryCov_9fa48("125234");
              return loggingService.forSubsystem(QUERY_SUBSYSTEM.STREAMING_AGGREGATOR);
            }
          }
        }
      } catch {
        // Logging not available
      }
      return console;
    }
  }

  /**
   * Add rows to the streaming buffer.
   * @param {Array} rows - Rows to add.
   * @return {boolean} True if rows were added successfully.
   */
  addRows(rows) {
    if (stryMutAct_9fa48("125235")) {
      {}
    } else {
      stryCov_9fa48("125235");
      if (stryMutAct_9fa48("125238") ? !rows && rows.length === NUM.ZERO : stryMutAct_9fa48("125237") ? false : stryMutAct_9fa48("125236") ? true : (stryCov_9fa48("125236", "125237", "125238"), (stryMutAct_9fa48("125239") ? rows : (stryCov_9fa48("125239"), !rows)) || (stryMutAct_9fa48("125241") ? rows.length !== NUM.ZERO : stryMutAct_9fa48("125240") ? false : (stryCov_9fa48("125240", "125241"), rows.length === NUM.ZERO)))) return stryMutAct_9fa48("125242") ? false : (stryCov_9fa48("125242"), true);
      const rowBytes = this.estimateBytes(rows);

      // Check memory limit
      if (stryMutAct_9fa48("125246") ? this.estimatedBytes + rowBytes <= this.maxMemoryBytes : stryMutAct_9fa48("125245") ? this.estimatedBytes + rowBytes >= this.maxMemoryBytes : stryMutAct_9fa48("125244") ? false : stryMutAct_9fa48("125243") ? true : (stryCov_9fa48("125243", "125244", "125245", "125246"), (stryMutAct_9fa48("125247") ? this.estimatedBytes - rowBytes : (stryCov_9fa48("125247"), this.estimatedBytes + rowBytes)) > this.maxMemoryBytes)) {
        if (stryMutAct_9fa48("125248")) {
          {}
        } else {
          stryCov_9fa48("125248");
          this.logger.warn(QUERY_LOG_MSG.STREAMING_MEMORY_LIMIT_REACHED, stryMutAct_9fa48("125249") ? {} : (stryCov_9fa48("125249"), {
            currentBytes: this.estimatedBytes,
            newBytes: rowBytes,
            maxBytes: this.maxMemoryBytes
          }));
          return stryMutAct_9fa48("125250") ? true : (stryCov_9fa48("125250"), false);
        }
      }
      for (const row of rows) {
        if (stryMutAct_9fa48("125251")) {
          {}
        } else {
          stryCov_9fa48("125251");
          this.currentChunk.push(row);
          stryMutAct_9fa48("125252") ? this.totalRows-- : (stryCov_9fa48("125252"), this.totalRows++);
          if (stryMutAct_9fa48("125256") ? this.currentChunk.length < this.chunkSize : stryMutAct_9fa48("125255") ? this.currentChunk.length > this.chunkSize : stryMutAct_9fa48("125254") ? false : stryMutAct_9fa48("125253") ? true : (stryCov_9fa48("125253", "125254", "125255", "125256"), this.currentChunk.length >= this.chunkSize)) {
            if (stryMutAct_9fa48("125257")) {
              {}
            } else {
              stryCov_9fa48("125257");
              this.flushCurrentChunk();
            }
          }
        }
      }
      stryMutAct_9fa48("125258") ? this.estimatedBytes -= rowBytes : (stryCov_9fa48("125258"), this.estimatedBytes += rowBytes);
      return stryMutAct_9fa48("125259") ? false : (stryCov_9fa48("125259"), true);
    }
  }

  /**
   * Flush current chunk to chunks array.
   * @private
   */
  flushCurrentChunk() {
    if (stryMutAct_9fa48("125260")) {
      {}
    } else {
      stryCov_9fa48("125260");
      if (stryMutAct_9fa48("125264") ? this.currentChunk.length <= NUM.ZERO : stryMutAct_9fa48("125263") ? this.currentChunk.length >= NUM.ZERO : stryMutAct_9fa48("125262") ? false : stryMutAct_9fa48("125261") ? true : (stryCov_9fa48("125261", "125262", "125263", "125264"), this.currentChunk.length > NUM.ZERO)) {
        if (stryMutAct_9fa48("125265")) {
          {}
        } else {
          stryCov_9fa48("125265");
          this.chunks.push(this.currentChunk);
          this.currentChunk = stryMutAct_9fa48("125266") ? ["Stryker was here"] : (stryCov_9fa48("125266"), []);
        }
      }
    }
  }

  /**
   * Estimate bytes for rows.
   * @param {Array} rows - Rows to estimate.
   * @return {number} Estimated bytes.
   * @private
   */
  estimateBytes(rows) {
    if (stryMutAct_9fa48("125267")) {
      {}
    } else {
      stryCov_9fa48("125267");
      try {
        if (stryMutAct_9fa48("125268")) {
          {}
        } else {
          stryCov_9fa48("125268");
          return stryMutAct_9fa48("125269") ? JSON.stringify(rows).length / RESULT_ESTIMATE.UTF16_BYTES_PER_CHAR : (stryCov_9fa48("125269"), JSON.stringify(rows).length * RESULT_ESTIMATE.UTF16_BYTES_PER_CHAR);
        }
      } catch {
        if (stryMutAct_9fa48("125270")) {
          {}
        } else {
          stryCov_9fa48("125270");
          return stryMutAct_9fa48("125271") ? rows.length / RESULT_ESTIMATE.FALLBACK_ROW_BYTES : (stryCov_9fa48("125271"), rows.length * RESULT_ESTIMATE.FALLBACK_ROW_BYTES);
        }
      }
    }
  }

  /**
   * Get all rows (flattened from chunks).
   * @return {Array} All rows.
   */
  getAllRows() {
    if (stryMutAct_9fa48("125272")) {
      {}
    } else {
      stryCov_9fa48("125272");
      this.flushCurrentChunk();
      return this.chunks.flat();
    }
  }

  /**
   * Get rows as an async iterator for streaming.
   * @yield {Array} Chunk of rows.
   */
  *getChunks() {
    if (stryMutAct_9fa48("125273")) {
      {}
    } else {
      stryCov_9fa48("125273");
      this.flushCurrentChunk();
      for (const chunk of this.chunks) {
        if (stryMutAct_9fa48("125274")) {
          {}
        } else {
          stryCov_9fa48("125274");
          yield chunk;
        }
      }
    }
  }

  /**
   * Apply ORDER BY using external merge sort.
   * Requirements: 26.9
   * @param {Array} orderBy - ORDER BY clauses.
   * @return {Array} Sorted rows.
   */
  applySortedMerge(orderBy) {
    if (stryMutAct_9fa48("125275")) {
      {}
    } else {
      stryCov_9fa48("125275");
      this.flushCurrentChunk();
      if (stryMutAct_9fa48("125278") ? this.chunks.length !== NUM.ZERO : stryMutAct_9fa48("125277") ? false : stryMutAct_9fa48("125276") ? true : (stryCov_9fa48("125276", "125277", "125278"), this.chunks.length === NUM.ZERO)) return stryMutAct_9fa48("125279") ? ["Stryker was here"] : (stryCov_9fa48("125279"), []);
      if (stryMutAct_9fa48("125282") ? this.chunks.length !== NUM.ONE : stryMutAct_9fa48("125281") ? false : stryMutAct_9fa48("125280") ? true : (stryCov_9fa48("125280", "125281", "125282"), this.chunks.length === NUM.ONE)) {
        if (stryMutAct_9fa48("125283")) {
          {}
        } else {
          stryCov_9fa48("125283");
          return this.sortChunk(this.chunks[NUM.ZERO], orderBy);
        }
      }

      // Sort each chunk individually
      const sortedChunks = this.chunks.map(stryMutAct_9fa48("125284") ? () => undefined : (stryCov_9fa48("125284"), chunk => this.sortChunk(chunk, orderBy)));

      // Merge sorted chunks using k-way merge
      return this.kWayMerge(sortedChunks, orderBy);
    }
  }

  /**
   * Sort a single chunk.
   * @param {Array} chunk - Chunk to sort.
   * @param {Array} orderBy - ORDER BY clauses.
   * @return {Array} Sorted chunk.
   * @private
   */
  sortChunk(chunk, orderBy) {
    if (stryMutAct_9fa48("125285")) {
      {}
    } else {
      stryCov_9fa48("125285");
      return stryMutAct_9fa48("125286") ? [...chunk] : (stryCov_9fa48("125286"), (stryMutAct_9fa48("125287") ? [] : (stryCov_9fa48("125287"), [...chunk])).sort(stryMutAct_9fa48("125288") ? () => undefined : (stryCov_9fa48("125288"), (a, b) => this.compareRows(a, b, orderBy))));
    }
  }

  /**
   * Compare two rows based on ORDER BY clauses.
   * @param {Object} a - First row.
   * @param {Object} b - Second row.
   * @param {Array} orderBy - ORDER BY clauses.
   * @return {number} Comparison result.
   * @private
   */
  compareRows(a, b, orderBy) {
    if (stryMutAct_9fa48("125289")) {
      {}
    } else {
      stryCov_9fa48("125289");
      for (const clause of orderBy) {
        if (stryMutAct_9fa48("125290")) {
          {}
        } else {
          stryCov_9fa48("125290");
          const col = stryMutAct_9fa48("125293") ? clause.expression?.column && clause.column : stryMutAct_9fa48("125292") ? false : stryMutAct_9fa48("125291") ? true : (stryCov_9fa48("125291", "125292", "125293"), (stryMutAct_9fa48("125294") ? clause.expression.column : (stryCov_9fa48("125294"), clause.expression?.column)) || clause.column);
          const dir = (stryMutAct_9fa48("125297") ? clause.direction !== QUERY_SORT_DIRECTION.DESC : stryMutAct_9fa48("125296") ? false : stryMutAct_9fa48("125295") ? true : (stryCov_9fa48("125295", "125296", "125297"), clause.direction === QUERY_SORT_DIRECTION.DESC)) ? NUM.NEGATIVE_ONE : NUM.ONE;
          const aVal = a[col];
          const bVal = b[col];
          if (stryMutAct_9fa48("125300") ? aVal !== bVal : stryMutAct_9fa48("125299") ? false : stryMutAct_9fa48("125298") ? true : (stryCov_9fa48("125298", "125299", "125300"), aVal === bVal)) continue;
          if (stryMutAct_9fa48("125303") ? aVal === null && aVal === undefined : stryMutAct_9fa48("125302") ? false : stryMutAct_9fa48("125301") ? true : (stryCov_9fa48("125301", "125302", "125303"), (stryMutAct_9fa48("125305") ? aVal !== null : stryMutAct_9fa48("125304") ? false : (stryCov_9fa48("125304", "125305"), aVal === null)) || (stryMutAct_9fa48("125307") ? aVal !== undefined : stryMutAct_9fa48("125306") ? false : (stryCov_9fa48("125306", "125307"), aVal === undefined)))) return dir;
          if (stryMutAct_9fa48("125310") ? bVal === null && bVal === undefined : stryMutAct_9fa48("125309") ? false : stryMutAct_9fa48("125308") ? true : (stryCov_9fa48("125308", "125309", "125310"), (stryMutAct_9fa48("125312") ? bVal !== null : stryMutAct_9fa48("125311") ? false : (stryCov_9fa48("125311", "125312"), bVal === null)) || (stryMutAct_9fa48("125314") ? bVal !== undefined : stryMutAct_9fa48("125313") ? false : (stryCov_9fa48("125313", "125314"), bVal === undefined)))) return stryMutAct_9fa48("125315") ? +dir : (stryCov_9fa48("125315"), -dir);
          if (stryMutAct_9fa48("125318") ? typeof aVal === TYPEOF.STRING || typeof bVal === TYPEOF.STRING : stryMutAct_9fa48("125317") ? false : stryMutAct_9fa48("125316") ? true : (stryCov_9fa48("125316", "125317", "125318"), (stryMutAct_9fa48("125320") ? typeof aVal !== TYPEOF.STRING : stryMutAct_9fa48("125319") ? true : (stryCov_9fa48("125319", "125320"), typeof aVal === TYPEOF.STRING)) && (stryMutAct_9fa48("125322") ? typeof bVal !== TYPEOF.STRING : stryMutAct_9fa48("125321") ? true : (stryCov_9fa48("125321", "125322"), typeof bVal === TYPEOF.STRING)))) {
            if (stryMutAct_9fa48("125323")) {
              {}
            } else {
              stryCov_9fa48("125323");
              const cmp = aVal.localeCompare(bVal);
              if (stryMutAct_9fa48("125326") ? cmp === NUM.ZERO : stryMutAct_9fa48("125325") ? false : stryMutAct_9fa48("125324") ? true : (stryCov_9fa48("125324", "125325", "125326"), cmp !== NUM.ZERO)) return stryMutAct_9fa48("125327") ? cmp / dir : (stryCov_9fa48("125327"), cmp * dir);
            }
          } else {
            if (stryMutAct_9fa48("125328")) {
              {}
            } else {
              stryCov_9fa48("125328");
              if (stryMutAct_9fa48("125332") ? aVal >= bVal : stryMutAct_9fa48("125331") ? aVal <= bVal : stryMutAct_9fa48("125330") ? false : stryMutAct_9fa48("125329") ? true : (stryCov_9fa48("125329", "125330", "125331", "125332"), aVal < bVal)) return stryMutAct_9fa48("125333") ? +dir : (stryCov_9fa48("125333"), -dir);
              if (stryMutAct_9fa48("125337") ? aVal <= bVal : stryMutAct_9fa48("125336") ? aVal >= bVal : stryMutAct_9fa48("125335") ? false : stryMutAct_9fa48("125334") ? true : (stryCov_9fa48("125334", "125335", "125336", "125337"), aVal > bVal)) return dir;
            }
          }
        }
      }
      return NUM.ZERO;
    }
  }

  /**
   * Perform k-way merge of sorted chunks.
   * @param {Array} sortedChunks - Array of sorted chunks.
   * @param {Array} orderBy - ORDER BY clauses.
   * @return {Array} Merged sorted array.
   * @private
   */
  kWayMerge(sortedChunks, orderBy) {
    if (stryMutAct_9fa48("125338")) {
      {}
    } else {
      stryCov_9fa48("125338");
      const result = stryMutAct_9fa48("125339") ? ["Stryker was here"] : (stryCov_9fa48("125339"), []);
      const iterators = sortedChunks.map(stryMutAct_9fa48("125340") ? () => undefined : (stryCov_9fa48("125340"), chunk => stryMutAct_9fa48("125341") ? {} : (stryCov_9fa48("125341"), {
        data: chunk,
        index: NUM.ZERO
      })));
      while (stryMutAct_9fa48("125343") ? false : stryMutAct_9fa48("125342") ? false : (stryCov_9fa48("125342", "125343"), true)) {
        if (stryMutAct_9fa48("125344")) {
          {}
        } else {
          stryCov_9fa48("125344");
          // Find the minimum element among all iterators
          let minIterator = null;
          let minValue = null;
          for (const iter of iterators) {
            if (stryMutAct_9fa48("125345")) {
              {}
            } else {
              stryCov_9fa48("125345");
              if (stryMutAct_9fa48("125349") ? iter.index >= iter.data.length : stryMutAct_9fa48("125348") ? iter.index <= iter.data.length : stryMutAct_9fa48("125347") ? false : stryMutAct_9fa48("125346") ? true : (stryCov_9fa48("125346", "125347", "125348", "125349"), iter.index < iter.data.length)) {
                if (stryMutAct_9fa48("125350")) {
                  {}
                } else {
                  stryCov_9fa48("125350");
                  const value = iter.data[iter.index];
                  if (stryMutAct_9fa48("125353") ? minValue === null && this.compareRows(value, minValue, orderBy) < NUM.ZERO : stryMutAct_9fa48("125352") ? false : stryMutAct_9fa48("125351") ? true : (stryCov_9fa48("125351", "125352", "125353"), (stryMutAct_9fa48("125355") ? minValue !== null : stryMutAct_9fa48("125354") ? false : (stryCov_9fa48("125354", "125355"), minValue === null)) || (stryMutAct_9fa48("125358") ? this.compareRows(value, minValue, orderBy) >= NUM.ZERO : stryMutAct_9fa48("125357") ? this.compareRows(value, minValue, orderBy) <= NUM.ZERO : stryMutAct_9fa48("125356") ? false : (stryCov_9fa48("125356", "125357", "125358"), this.compareRows(value, minValue, orderBy) < NUM.ZERO)))) {
                    if (stryMutAct_9fa48("125359")) {
                      {}
                    } else {
                      stryCov_9fa48("125359");
                      minValue = value;
                      minIterator = iter;
                    }
                  }
                }
              }
            }
          }
          if (stryMutAct_9fa48("125362") ? minIterator !== null : stryMutAct_9fa48("125361") ? false : stryMutAct_9fa48("125360") ? true : (stryCov_9fa48("125360", "125361", "125362"), minIterator === null)) break;
          result.push(minValue);
          stryMutAct_9fa48("125363") ? minIterator.index-- : (stryCov_9fa48("125363"), minIterator.index++);
        }
      }
      return result;
    }
  }

  /**
   * Apply streaming aggregation for aggregate functions.
   * Computes aggregates incrementally without loading all data.
   * @param {Object} ast - SELECT AST with aggregate functions.
   * @return {Object} Aggregated result.
   */
  computeStreamingAggregates(ast) {
    if (stryMutAct_9fa48("125364")) {
      {}
    } else {
      stryCov_9fa48("125364");
      this.flushCurrentChunk();
      const aggregates = this.extractAggregates(ast);
      if (stryMutAct_9fa48("125367") ? aggregates.length !== 0 : stryMutAct_9fa48("125366") ? false : stryMutAct_9fa48("125365") ? true : (stryCov_9fa48("125365", "125366", "125367"), aggregates.length === 0)) {
        if (stryMutAct_9fa48("125368")) {
          {}
        } else {
          stryCov_9fa48("125368");
          return stryMutAct_9fa48("125369") ? {} : (stryCov_9fa48("125369"), {
            rows: this.getAllRows()
          });
        }
      }

      // Initialize aggregate accumulators
      const accumulators = aggregates.map(stryMutAct_9fa48("125370") ? () => undefined : (stryCov_9fa48("125370"), agg => stryMutAct_9fa48("125371") ? {} : (stryCov_9fa48("125371"), {
        ...agg,
        count: NUM.ZERO,
        sum: NUM.ZERO,
        min: null,
        max: null,
        values: stryMutAct_9fa48("125372") ? ["Stryker was here"] : (stryCov_9fa48("125372"), []) // For AVG and DISTINCT
      })));

      // Process chunks incrementally
      for (const chunk of this.chunks) {
        if (stryMutAct_9fa48("125373")) {
          {}
        } else {
          stryCov_9fa48("125373");
          for (const row of chunk) {
            if (stryMutAct_9fa48("125374")) {
              {}
            } else {
              stryCov_9fa48("125374");
              this.updateAccumulators(accumulators, row);
            }
          }
        }
      }

      // Compute final aggregate values
      const result = {};
      for (const acc of accumulators) {
        if (stryMutAct_9fa48("125375")) {
          {}
        } else {
          stryCov_9fa48("125375");
          result[acc.alias] = this.computeFinalAggregate(acc);
        }
      }
      return stryMutAct_9fa48("125376") ? {} : (stryCov_9fa48("125376"), {
        rows: stryMutAct_9fa48("125377") ? [] : (stryCov_9fa48("125377"), [result])
      });
    }
  }

  /**
   * Extract aggregate functions from AST.
   * @param {Object} ast - SELECT AST.
   * @return {Array} Array of aggregate definitions.
   * @private
   */
  extractAggregates(ast) {
    if (stryMutAct_9fa48("125378")) {
      {}
    } else {
      stryCov_9fa48("125378");
      const aggregates = stryMutAct_9fa48("125379") ? ["Stryker was here"] : (stryCov_9fa48("125379"), []);
      for (const col of stryMutAct_9fa48("125382") ? ast.columns && [] : stryMutAct_9fa48("125381") ? false : stryMutAct_9fa48("125380") ? true : (stryCov_9fa48("125380", "125381", "125382"), ast.columns || (stryMutAct_9fa48("125383") ? ["Stryker was here"] : (stryCov_9fa48("125383"), [])))) {
        if (stryMutAct_9fa48("125384")) {
          {}
        } else {
          stryCov_9fa48("125384");
          const expr = stryMutAct_9fa48("125387") ? col.expression && col : stryMutAct_9fa48("125386") ? false : stryMutAct_9fa48("125385") ? true : (stryCov_9fa48("125385", "125386", "125387"), col.expression || col);
          if (stryMutAct_9fa48("125390") ? expr.type !== QUERY_AST_NODE.AGGREGATE : stryMutAct_9fa48("125389") ? false : stryMutAct_9fa48("125388") ? true : (stryCov_9fa48("125388", "125389", "125390"), expr.type === QUERY_AST_NODE.AGGREGATE)) {
            if (stryMutAct_9fa48("125391")) {
              {}
            } else {
              stryCov_9fa48("125391");
              const colName = stryMutAct_9fa48("125394") ? expr.argument?.column && null : stryMutAct_9fa48("125393") ? false : stryMutAct_9fa48("125392") ? true : (stryCov_9fa48("125392", "125393", "125394"), (stryMutAct_9fa48("125395") ? expr.argument.column : (stryCov_9fa48("125395"), expr.argument?.column)) || null);
              aggregates.push(stryMutAct_9fa48("125396") ? {} : (stryCov_9fa48("125396"), {
                function: stryMutAct_9fa48("125397") ? expr.function.toLowerCase() : (stryCov_9fa48("125397"), expr.function.toUpperCase()),
                column: colName,
                distinct: stryMutAct_9fa48("125400") ? expr.distinct && false : stryMutAct_9fa48("125399") ? false : stryMutAct_9fa48("125398") ? true : (stryCov_9fa48("125398", "125399", "125400"), expr.distinct || (stryMutAct_9fa48("125401") ? true : (stryCov_9fa48("125401"), false))),
                alias: stryMutAct_9fa48("125404") ? col.alias && `${expr.function}(${colName || QUERY_SQL_FRAGMENT.STAR})` : stryMutAct_9fa48("125403") ? false : stryMutAct_9fa48("125402") ? true : (stryCov_9fa48("125402", "125403", "125404"), col.alias || (stryMutAct_9fa48("125405") ? `` : (stryCov_9fa48("125405"), `${expr.function}(${stryMutAct_9fa48("125408") ? colName && QUERY_SQL_FRAGMENT.STAR : stryMutAct_9fa48("125407") ? false : stryMutAct_9fa48("125406") ? true : (stryCov_9fa48("125406", "125407", "125408"), colName || QUERY_SQL_FRAGMENT.STAR)})`))),
                isStar: stryMutAct_9fa48("125411") ? expr.argument?.type !== QUERY_AST_NODE.STAR : stryMutAct_9fa48("125410") ? false : stryMutAct_9fa48("125409") ? true : (stryCov_9fa48("125409", "125410", "125411"), (stryMutAct_9fa48("125412") ? expr.argument.type : (stryCov_9fa48("125412"), expr.argument?.type)) === QUERY_AST_NODE.STAR)
              }));
            }
          }
        }
      }
      return aggregates;
    }
  }

  /**
   * Update accumulators with a row.
   * @param {Array} accumulators - Aggregate accumulators.
   * @param {Object} row - Data row.
   * @private
   */
  updateAccumulators(accumulators, row) {
    if (stryMutAct_9fa48("125413")) {
      {}
    } else {
      stryCov_9fa48("125413");
      for (const acc of accumulators) {
        if (stryMutAct_9fa48("125414")) {
          {}
        } else {
          stryCov_9fa48("125414");
          const value = acc.isStar ? NUM.ONE : row[acc.column];

          // Skip null values for non-COUNT(*)
          if (stryMutAct_9fa48("125417") ? value === null && value === undefined : stryMutAct_9fa48("125416") ? false : stryMutAct_9fa48("125415") ? true : (stryCov_9fa48("125415", "125416", "125417"), (stryMutAct_9fa48("125419") ? value !== null : stryMutAct_9fa48("125418") ? false : (stryCov_9fa48("125418", "125419"), value === null)) || (stryMutAct_9fa48("125421") ? value !== undefined : stryMutAct_9fa48("125420") ? false : (stryCov_9fa48("125420", "125421"), value === undefined)))) {
            if (stryMutAct_9fa48("125422")) {
              {}
            } else {
              stryCov_9fa48("125422");
              if (stryMutAct_9fa48("125425") ? acc.function === QUERY_AGGREGATE.COUNT || acc.isStar : stryMutAct_9fa48("125424") ? false : stryMutAct_9fa48("125423") ? true : (stryCov_9fa48("125423", "125424", "125425"), (stryMutAct_9fa48("125427") ? acc.function !== QUERY_AGGREGATE.COUNT : stryMutAct_9fa48("125426") ? true : (stryCov_9fa48("125426", "125427"), acc.function === QUERY_AGGREGATE.COUNT)) && acc.isStar)) {
                if (stryMutAct_9fa48("125428")) {
                  {}
                } else {
                  stryCov_9fa48("125428");
                  stryMutAct_9fa48("125429") ? acc.count-- : (stryCov_9fa48("125429"), acc.count++);
                }
              }
              continue;
            }
          }
          switch (acc.function) {
            case QUERY_AGGREGATE.COUNT:
              if (stryMutAct_9fa48("125430")) {} else {
                stryCov_9fa48("125430");
                if (stryMutAct_9fa48("125432") ? false : stryMutAct_9fa48("125431") ? true : (stryCov_9fa48("125431", "125432"), acc.distinct)) {
                  if (stryMutAct_9fa48("125433")) {
                    {}
                  } else {
                    stryCov_9fa48("125433");
                    if (stryMutAct_9fa48("125436") ? false : stryMutAct_9fa48("125435") ? true : stryMutAct_9fa48("125434") ? acc.values.includes(value) : (stryCov_9fa48("125434", "125435", "125436"), !acc.values.includes(value))) {
                      if (stryMutAct_9fa48("125437")) {
                        {}
                      } else {
                        stryCov_9fa48("125437");
                        acc.values.push(value);
                        stryMutAct_9fa48("125438") ? acc.count-- : (stryCov_9fa48("125438"), acc.count++);
                      }
                    }
                  }
                } else {
                  if (stryMutAct_9fa48("125439")) {
                    {}
                  } else {
                    stryCov_9fa48("125439");
                    stryMutAct_9fa48("125440") ? acc.count-- : (stryCov_9fa48("125440"), acc.count++);
                  }
                }
                break;
              }
            case QUERY_AGGREGATE.SUM:
              if (stryMutAct_9fa48("125441")) {} else {
                stryCov_9fa48("125441");
                stryMutAct_9fa48("125442") ? acc.sum -= Number(value) || NUM.ZERO : (stryCov_9fa48("125442"), acc.sum += stryMutAct_9fa48("125445") ? Number(value) && NUM.ZERO : stryMutAct_9fa48("125444") ? false : stryMutAct_9fa48("125443") ? true : (stryCov_9fa48("125443", "125444", "125445"), Number(value) || NUM.ZERO));
                break;
              }
            case QUERY_AGGREGATE.AVG:
              if (stryMutAct_9fa48("125446")) {} else {
                stryCov_9fa48("125446");
                stryMutAct_9fa48("125447") ? acc.sum -= Number(value) || NUM.ZERO : (stryCov_9fa48("125447"), acc.sum += stryMutAct_9fa48("125450") ? Number(value) && NUM.ZERO : stryMutAct_9fa48("125449") ? false : stryMutAct_9fa48("125448") ? true : (stryCov_9fa48("125448", "125449", "125450"), Number(value) || NUM.ZERO));
                stryMutAct_9fa48("125451") ? acc.count-- : (stryCov_9fa48("125451"), acc.count++);
                break;
              }
            case QUERY_AGGREGATE.MIN:
              if (stryMutAct_9fa48("125452")) {} else {
                stryCov_9fa48("125452");
                if (stryMutAct_9fa48("125455") ? acc.min === null && value < acc.min : stryMutAct_9fa48("125454") ? false : stryMutAct_9fa48("125453") ? true : (stryCov_9fa48("125453", "125454", "125455"), (stryMutAct_9fa48("125457") ? acc.min !== null : stryMutAct_9fa48("125456") ? false : (stryCov_9fa48("125456", "125457"), acc.min === null)) || (stryMutAct_9fa48("125460") ? value >= acc.min : stryMutAct_9fa48("125459") ? value <= acc.min : stryMutAct_9fa48("125458") ? false : (stryCov_9fa48("125458", "125459", "125460"), value < acc.min)))) {
                  if (stryMutAct_9fa48("125461")) {
                    {}
                  } else {
                    stryCov_9fa48("125461");
                    acc.min = value;
                  }
                }
                break;
              }
            case QUERY_AGGREGATE.MAX:
              if (stryMutAct_9fa48("125462")) {} else {
                stryCov_9fa48("125462");
                if (stryMutAct_9fa48("125465") ? acc.max === null && value > acc.max : stryMutAct_9fa48("125464") ? false : stryMutAct_9fa48("125463") ? true : (stryCov_9fa48("125463", "125464", "125465"), (stryMutAct_9fa48("125467") ? acc.max !== null : stryMutAct_9fa48("125466") ? false : (stryCov_9fa48("125466", "125467"), acc.max === null)) || (stryMutAct_9fa48("125470") ? value <= acc.max : stryMutAct_9fa48("125469") ? value >= acc.max : stryMutAct_9fa48("125468") ? false : (stryCov_9fa48("125468", "125469", "125470"), value > acc.max)))) {
                  if (stryMutAct_9fa48("125471")) {
                    {}
                  } else {
                    stryCov_9fa48("125471");
                    acc.max = value;
                  }
                }
                break;
              }
          }
        }
      }
    }
  }

  /**
   * Compute final aggregate value from accumulator.
   * @param {Object} acc - Aggregate accumulator.
   * @return {*} Final aggregate value.
   * @private
   */
  computeFinalAggregate(acc) {
    if (stryMutAct_9fa48("125472")) {
      {}
    } else {
      stryCov_9fa48("125472");
      switch (acc.function) {
        case QUERY_AGGREGATE.COUNT:
          if (stryMutAct_9fa48("125473")) {} else {
            stryCov_9fa48("125473");
            return acc.count;
          }
        case QUERY_AGGREGATE.SUM:
          if (stryMutAct_9fa48("125474")) {} else {
            stryCov_9fa48("125474");
            return acc.sum;
          }
        case QUERY_AGGREGATE.AVG:
          if (stryMutAct_9fa48("125475")) {} else {
            stryCov_9fa48("125475");
            return (stryMutAct_9fa48("125479") ? acc.count <= NUM.ZERO : stryMutAct_9fa48("125478") ? acc.count >= NUM.ZERO : stryMutAct_9fa48("125477") ? false : stryMutAct_9fa48("125476") ? true : (stryCov_9fa48("125476", "125477", "125478", "125479"), acc.count > NUM.ZERO)) ? stryMutAct_9fa48("125480") ? acc.sum * acc.count : (stryCov_9fa48("125480"), acc.sum / acc.count) : null;
          }
        case QUERY_AGGREGATE.MIN:
          if (stryMutAct_9fa48("125481")) {} else {
            stryCov_9fa48("125481");
            return acc.min;
          }
        case QUERY_AGGREGATE.MAX:
          if (stryMutAct_9fa48("125482")) {} else {
            stryCov_9fa48("125482");
            return acc.max;
          }
        default:
          if (stryMutAct_9fa48("125483")) {} else {
            stryCov_9fa48("125483");
            return null;
          }
      }
    }
  }

  /**
   * Apply GROUP BY with streaming aggregation.
   * @param {Object} ast - SELECT AST with GROUP BY.
   * @return {Object} Grouped and aggregated result.
   */
  computeStreamingGroupBy(ast) {
    if (stryMutAct_9fa48("125484")) {
      {}
    } else {
      stryCov_9fa48("125484");
      this.flushCurrentChunk();
      const groupByColumns = (stryMutAct_9fa48("125487") ? ast.groupBy && [] : stryMutAct_9fa48("125486") ? false : stryMutAct_9fa48("125485") ? true : (stryCov_9fa48("125485", "125486", "125487"), ast.groupBy || (stryMutAct_9fa48("125488") ? ["Stryker was here"] : (stryCov_9fa48("125488"), [])))).map(stryMutAct_9fa48("125489") ? () => undefined : (stryCov_9fa48("125489"), g => stryMutAct_9fa48("125492") ? (g.column || g.expression?.column) && g : stryMutAct_9fa48("125491") ? false : stryMutAct_9fa48("125490") ? true : (stryCov_9fa48("125490", "125491", "125492"), (stryMutAct_9fa48("125494") ? g.column && g.expression?.column : stryMutAct_9fa48("125493") ? false : (stryCov_9fa48("125493", "125494"), g.column || (stryMutAct_9fa48("125495") ? g.expression.column : (stryCov_9fa48("125495"), g.expression?.column)))) || g)));
      if (stryMutAct_9fa48("125498") ? groupByColumns.length !== NUM.ZERO : stryMutAct_9fa48("125497") ? false : stryMutAct_9fa48("125496") ? true : (stryCov_9fa48("125496", "125497", "125498"), groupByColumns.length === NUM.ZERO)) {
        if (stryMutAct_9fa48("125499")) {
          {}
        } else {
          stryCov_9fa48("125499");
          return this.computeStreamingAggregates(ast);
        }
      }
      const aggregates = this.extractAggregates(ast);
      const groups = new Map(); // groupKey -> accumulators

      // Process chunks incrementally
      for (const chunk of this.chunks) {
        if (stryMutAct_9fa48("125500")) {
          {}
        } else {
          stryCov_9fa48("125500");
          for (const row of chunk) {
            if (stryMutAct_9fa48("125501")) {
              {}
            } else {
              stryCov_9fa48("125501");
              const groupKey = groupByColumns.map(stryMutAct_9fa48("125502") ? () => undefined : (stryCov_9fa48("125502"), col => row[col])).join(QUERY_SQL_FRAGMENT.PIPE);
              if (stryMutAct_9fa48("125505") ? false : stryMutAct_9fa48("125504") ? true : stryMutAct_9fa48("125503") ? groups.has(groupKey) : (stryCov_9fa48("125503", "125504", "125505"), !groups.has(groupKey))) {
                if (stryMutAct_9fa48("125506")) {
                  {}
                } else {
                  stryCov_9fa48("125506");
                  // Initialize accumulators for new group
                  const accumulators = aggregates.map(stryMutAct_9fa48("125507") ? () => undefined : (stryCov_9fa48("125507"), agg => stryMutAct_9fa48("125508") ? {} : (stryCov_9fa48("125508"), {
                    ...agg,
                    count: NUM.ZERO,
                    sum: NUM.ZERO,
                    min: null,
                    max: null,
                    values: stryMutAct_9fa48("125509") ? ["Stryker was here"] : (stryCov_9fa48("125509"), [])
                  })));

                  // Store group by values
                  const groupValues = {};
                  for (const col of groupByColumns) {
                    if (stryMutAct_9fa48("125510")) {
                      {}
                    } else {
                      stryCov_9fa48("125510");
                      groupValues[col] = row[col];
                    }
                  }
                  groups.set(groupKey, stryMutAct_9fa48("125511") ? {} : (stryCov_9fa48("125511"), {
                    groupValues,
                    accumulators
                  }));
                }
              }
              const group = groups.get(groupKey);
              this.updateAccumulators(group.accumulators, row);
            }
          }
        }
      }

      // Build result rows
      const rows = stryMutAct_9fa48("125512") ? ["Stryker was here"] : (stryCov_9fa48("125512"), []);
      for (const group of groups.values()) {
        if (stryMutAct_9fa48("125513")) {
          {}
        } else {
          stryCov_9fa48("125513");
          const row = stryMutAct_9fa48("125514") ? {} : (stryCov_9fa48("125514"), {
            ...group.groupValues
          });
          for (const acc of group.accumulators) {
            if (stryMutAct_9fa48("125515")) {
              {}
            } else {
              stryCov_9fa48("125515");
              row[acc.alias] = this.computeFinalAggregate(acc);
            }
          }
          rows.push(row);
        }
      }
      return stryMutAct_9fa48("125516") ? {} : (stryCov_9fa48("125516"), {
        rows
      });
    }
  }

  /**
   * Get statistics about the streaming aggregator.
   * @return {Object} Statistics.
   */
  getStats() {
    if (stryMutAct_9fa48("125517")) {
      {}
    } else {
      stryCov_9fa48("125517");
      return stryMutAct_9fa48("125518") ? {} : (stryCov_9fa48("125518"), {
        enabled: this.enabled,
        chunkSize: this.chunkSize,
        maxMemoryBytes: this.maxMemoryBytes,
        totalRows: this.totalRows,
        estimatedBytes: this.estimatedBytes,
        chunkCount: stryMutAct_9fa48("125519") ? this.chunks.length - (this.currentChunk.length > NUM.ZERO ? NUM.ONE : NUM.ZERO) : (stryCov_9fa48("125519"), this.chunks.length + ((stryMutAct_9fa48("125523") ? this.currentChunk.length <= NUM.ZERO : stryMutAct_9fa48("125522") ? this.currentChunk.length >= NUM.ZERO : stryMutAct_9fa48("125521") ? false : stryMutAct_9fa48("125520") ? true : (stryCov_9fa48("125520", "125521", "125522", "125523"), this.currentChunk.length > NUM.ZERO)) ? NUM.ONE : NUM.ZERO))
      });
    }
  }

  /**
   * Reset the aggregator for a new query.
   */
  reset() {
    if (stryMutAct_9fa48("125524")) {
      {}
    } else {
      stryCov_9fa48("125524");
      this.chunks = stryMutAct_9fa48("125525") ? ["Stryker was here"] : (stryCov_9fa48("125525"), []);
      this.currentChunk = stryMutAct_9fa48("125526") ? ["Stryker was here"] : (stryCov_9fa48("125526"), []);
      this.totalRows = NUM.ZERO;
      this.estimatedBytes = NUM.ZERO;
    }
  }
}
export { StreamingAggregator };