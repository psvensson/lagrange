/**
 * Build DWARF mapping indexes and lookup helpers.
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
import { NUM, TYPEOF } from '../constants/index.js';
import { DWARF_INDEX_DEFAULT as DEF, DWARF_INDEX_ERROR_MSG as ERR } from './dwarf-index-constants.js';

/**
 * Build normalized indexes for source/offset/symbol lookups.
 *
 * @param {Object} parseResult - Parser output.
 * @param {Object} [options] - Builder options.
 * @param {Function} [options.now] - Timestamp provider.
 * @return {Object} Immutable index object.
 */
function buildDwarfIndex(parseResult, options = {}) {
  if (stryMutAct_9fa48("77179")) {
    {}
  } else {
    stryCov_9fa48("77179");
    validateParseResult(parseResult);
    const now = stryMutAct_9fa48("77182") ? options.now && (() => Date.now()) : stryMutAct_9fa48("77181") ? false : stryMutAct_9fa48("77180") ? true : (stryCov_9fa48("77180", "77181", "77182"), options.now || (stryMutAct_9fa48("77183") ? () => undefined : (stryCov_9fa48("77183"), () => Date.now())));
    const normalizedSourceMappings = normalizeSourceMappings(parseResult.sourceMappings);
    const normalizedSymbolMappings = normalizeSymbolMappings(parseResult.symbolMappings);
    const sourceFiles = deriveSourceFiles(stryMutAct_9fa48("77186") ? parseResult.sourceFiles && [] : stryMutAct_9fa48("77185") ? false : stryMutAct_9fa48("77184") ? true : (stryCov_9fa48("77184", "77185", "77186"), parseResult.sourceFiles || (stryMutAct_9fa48("77187") ? ["Stryker was here"] : (stryCov_9fa48("77187"), []))), normalizedSourceMappings);
    const sourceToOffsetIndex = createSourceToOffsetIndex(normalizedSourceMappings);
    const symbolNameIndex = createSymbolNameIndex(normalizedSymbolMappings);
    return stryMutAct_9fa48("77188") ? {} : (stryCov_9fa48("77188"), {
      moduleRef: stryMutAct_9fa48("77191") ? parseResult.moduleRef && null : stryMutAct_9fa48("77190") ? false : stryMutAct_9fa48("77189") ? true : (stryCov_9fa48("77189", "77190", "77191"), parseResult.moduleRef || null),
      moduleDigest: stryMutAct_9fa48("77194") ? parseResult.moduleDigest && null : stryMutAct_9fa48("77193") ? false : stryMutAct_9fa48("77192") ? true : (stryCov_9fa48("77192", "77193", "77194"), parseResult.moduleDigest || null),
      rawModuleId: stryMutAct_9fa48("77197") ? parseResult.rawModuleId && null : stryMutAct_9fa48("77196") ? false : stryMutAct_9fa48("77195") ? true : (stryCov_9fa48("77195", "77196", "77197"), parseResult.rawModuleId || null),
      createdAt: now(),
      sourceFiles,
      sourceMappings: normalizedSourceMappings,
      symbolMappings: normalizedSymbolMappings,
      sourceToOffsetIndex,
      offsetToSourceIndex: normalizedSourceMappings,
      symbolNameIndex,
      symbolOffsetIndex: normalizedSymbolMappings
    });
  }
}

/**
 * Find offset ranges for a specific source file + line.
 *
 * @param {Object} index - Built DWARF index.
 * @param {string} sourceFileUrl - Source file URL.
 * @param {number} lineNumber - Source line number.
 * @return {Array<Object>} Offset ranges for that line.
 */
function lookupOffsetsForSource(index, sourceFileUrl, lineNumber) {
  if (stryMutAct_9fa48("77198")) {
    {}
  } else {
    stryCov_9fa48("77198");
    ensureIndex(index);
    if (stryMutAct_9fa48("77201") ? false : stryMutAct_9fa48("77200") ? true : stryMutAct_9fa48("77199") ? isNonEmptyString(sourceFileUrl) : (stryCov_9fa48("77199", "77200", "77201"), !isNonEmptyString(sourceFileUrl))) {
      if (stryMutAct_9fa48("77202")) {
        {}
      } else {
        stryCov_9fa48("77202");
        throw new Error(ERR.SOURCE_FILE_URL_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("77205") ? false : stryMutAct_9fa48("77204") ? true : stryMutAct_9fa48("77203") ? isNonNegativeInteger(lineNumber) : (stryCov_9fa48("77203", "77204", "77205"), !isNonNegativeInteger(lineNumber))) {
      if (stryMutAct_9fa48("77206")) {
        {}
      } else {
        stryCov_9fa48("77206");
        throw new Error(ERR.LINE_NUMBER_REQUIRED);
      }
    }
    const perSource = index.sourceToOffsetIndex.get(sourceFileUrl);
    if (stryMutAct_9fa48("77209") ? false : stryMutAct_9fa48("77208") ? true : stryMutAct_9fa48("77207") ? perSource : (stryCov_9fa48("77207", "77208", "77209"), !perSource)) {
      if (stryMutAct_9fa48("77210")) {
        {}
      } else {
        stryCov_9fa48("77210");
        return stryMutAct_9fa48("77211") ? ["Stryker was here"] : (stryCov_9fa48("77211"), []);
      }
    }
    const lineRanges = perSource.get(lineNumber);
    return lineRanges ? stryMutAct_9fa48("77212") ? [] : (stryCov_9fa48("77212"), [...lineRanges]) : stryMutAct_9fa48("77213") ? ["Stryker was here"] : (stryCov_9fa48("77213"), []);
  }
}

/**
 * Find the first source mapping that contains a code offset.
 *
 * @param {Object} index - Built DWARF index.
 * @param {number} codeOffset - Wasm code offset.
 * @return {Object|null} Source mapping or null.
 */
function lookupSourceForOffset(index, codeOffset) {
  if (stryMutAct_9fa48("77214")) {
    {}
  } else {
    stryCov_9fa48("77214");
    ensureIndex(index);
    if (stryMutAct_9fa48("77217") ? false : stryMutAct_9fa48("77216") ? true : stryMutAct_9fa48("77215") ? isNonNegativeInteger(codeOffset) : (stryCov_9fa48("77215", "77216", "77217"), !isNonNegativeInteger(codeOffset))) {
      if (stryMutAct_9fa48("77218")) {
        {}
      } else {
        stryCov_9fa48("77218");
        throw new Error(ERR.CODE_OFFSET_REQUIRED);
      }
    }
    for (const mapping of index.offsetToSourceIndex) {
      if (stryMutAct_9fa48("77219")) {
        {}
      } else {
        stryCov_9fa48("77219");
        if (stryMutAct_9fa48("77223") ? mapping.startOffset <= codeOffset : stryMutAct_9fa48("77222") ? mapping.startOffset >= codeOffset : stryMutAct_9fa48("77221") ? false : stryMutAct_9fa48("77220") ? true : (stryCov_9fa48("77220", "77221", "77222", "77223"), mapping.startOffset > codeOffset)) {
          if (stryMutAct_9fa48("77224")) {
            {}
          } else {
            stryCov_9fa48("77224");
            break;
          }
        }
        if (stryMutAct_9fa48("77227") ? codeOffset >= mapping.startOffset || codeOffset <= mapping.endOffset : stryMutAct_9fa48("77226") ? false : stryMutAct_9fa48("77225") ? true : (stryCov_9fa48("77225", "77226", "77227"), (stryMutAct_9fa48("77230") ? codeOffset < mapping.startOffset : stryMutAct_9fa48("77229") ? codeOffset > mapping.startOffset : stryMutAct_9fa48("77228") ? true : (stryCov_9fa48("77228", "77229", "77230"), codeOffset >= mapping.startOffset)) && (stryMutAct_9fa48("77233") ? codeOffset > mapping.endOffset : stryMutAct_9fa48("77232") ? codeOffset < mapping.endOffset : stryMutAct_9fa48("77231") ? true : (stryCov_9fa48("77231", "77232", "77233"), codeOffset <= mapping.endOffset)))) {
          if (stryMutAct_9fa48("77234")) {
            {}
          } else {
            stryCov_9fa48("77234");
            return mapping;
          }
        }
      }
    }
    return null;
  }
}

/**
 * Find symbol names that contain a code offset.
 *
 * @param {Object} index - Built DWARF index.
 * @param {number} codeOffset - Wasm code offset.
 * @return {string[]} Symbol names covering the offset.
 */
function lookupSymbolsForOffset(index, codeOffset) {
  if (stryMutAct_9fa48("77235")) {
    {}
  } else {
    stryCov_9fa48("77235");
    ensureIndex(index);
    if (stryMutAct_9fa48("77238") ? false : stryMutAct_9fa48("77237") ? true : stryMutAct_9fa48("77236") ? isNonNegativeInteger(codeOffset) : (stryCov_9fa48("77236", "77237", "77238"), !isNonNegativeInteger(codeOffset))) {
      if (stryMutAct_9fa48("77239")) {
        {}
      } else {
        stryCov_9fa48("77239");
        throw new Error(ERR.CODE_OFFSET_REQUIRED);
      }
    }
    const names = new Set();
    for (const symbolMapping of index.symbolOffsetIndex) {
      if (stryMutAct_9fa48("77240")) {
        {}
      } else {
        stryCov_9fa48("77240");
        if (stryMutAct_9fa48("77244") ? symbolMapping.startOffset <= codeOffset : stryMutAct_9fa48("77243") ? symbolMapping.startOffset >= codeOffset : stryMutAct_9fa48("77242") ? false : stryMutAct_9fa48("77241") ? true : (stryCov_9fa48("77241", "77242", "77243", "77244"), symbolMapping.startOffset > codeOffset)) {
          if (stryMutAct_9fa48("77245")) {
            {}
          } else {
            stryCov_9fa48("77245");
            break;
          }
        }
        if (stryMutAct_9fa48("77248") ? codeOffset >= symbolMapping.startOffset || codeOffset <= symbolMapping.endOffset : stryMutAct_9fa48("77247") ? false : stryMutAct_9fa48("77246") ? true : (stryCov_9fa48("77246", "77247", "77248"), (stryMutAct_9fa48("77251") ? codeOffset < symbolMapping.startOffset : stryMutAct_9fa48("77250") ? codeOffset > symbolMapping.startOffset : stryMutAct_9fa48("77249") ? true : (stryCov_9fa48("77249", "77250", "77251"), codeOffset >= symbolMapping.startOffset)) && (stryMutAct_9fa48("77254") ? codeOffset > symbolMapping.endOffset : stryMutAct_9fa48("77253") ? codeOffset < symbolMapping.endOffset : stryMutAct_9fa48("77252") ? true : (stryCov_9fa48("77252", "77253", "77254"), codeOffset <= symbolMapping.endOffset)))) {
          if (stryMutAct_9fa48("77255")) {
            {}
          } else {
            stryCov_9fa48("77255");
            names.add(symbolMapping.symbolName);
          }
        }
      }
    }
    return stryMutAct_9fa48("77256") ? [] : (stryCov_9fa48("77256"), [...names]);
  }
}

/**
 * Find all ranges for a given symbol.
 *
 * @param {Object} index - Built DWARF index.
 * @param {string} symbolName - Symbol name.
 * @return {Array<Object>} Symbol ranges.
 */
function lookupSymbolRangesByName(index, symbolName) {
  if (stryMutAct_9fa48("77257")) {
    {}
  } else {
    stryCov_9fa48("77257");
    ensureIndex(index);
    if (stryMutAct_9fa48("77260") ? false : stryMutAct_9fa48("77259") ? true : stryMutAct_9fa48("77258") ? isNonEmptyString(symbolName) : (stryCov_9fa48("77258", "77259", "77260"), !isNonEmptyString(symbolName))) {
      if (stryMutAct_9fa48("77261")) {
        {}
      } else {
        stryCov_9fa48("77261");
        return stryMutAct_9fa48("77262") ? ["Stryker was here"] : (stryCov_9fa48("77262"), []);
      }
    }
    const ranges = index.symbolNameIndex.get(symbolName);
    return ranges ? stryMutAct_9fa48("77263") ? [] : (stryCov_9fa48("77263"), [...ranges]) : stryMutAct_9fa48("77264") ? ["Stryker was here"] : (stryCov_9fa48("77264"), []);
  }
}

/**
 * Validate parser output shape.
 *
 * @param {Object} parseResult - Candidate parse result.
 */
function validateParseResult(parseResult) {
  if (stryMutAct_9fa48("77265")) {
    {}
  } else {
    stryCov_9fa48("77265");
    if (stryMutAct_9fa48("77268") ? !parseResult && typeof parseResult !== TYPEOF.OBJECT : stryMutAct_9fa48("77267") ? false : stryMutAct_9fa48("77266") ? true : (stryCov_9fa48("77266", "77267", "77268"), (stryMutAct_9fa48("77269") ? parseResult : (stryCov_9fa48("77269"), !parseResult)) || (stryMutAct_9fa48("77271") ? typeof parseResult === TYPEOF.OBJECT : stryMutAct_9fa48("77270") ? false : (stryCov_9fa48("77270", "77271"), typeof parseResult !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("77272")) {
        {}
      } else {
        stryCov_9fa48("77272");
        throw new Error(ERR.PARSE_RESULT_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("77275") ? false : stryMutAct_9fa48("77274") ? true : stryMutAct_9fa48("77273") ? Array.isArray(parseResult.sourceMappings) : (stryCov_9fa48("77273", "77274", "77275"), !Array.isArray(parseResult.sourceMappings))) {
      if (stryMutAct_9fa48("77276")) {
        {}
      } else {
        stryCov_9fa48("77276");
        throw new Error(ERR.SOURCE_MAPPINGS_REQUIRED);
      }
    }
    if (stryMutAct_9fa48("77279") ? false : stryMutAct_9fa48("77278") ? true : stryMutAct_9fa48("77277") ? Array.isArray(parseResult.symbolMappings) : (stryCov_9fa48("77277", "77278", "77279"), !Array.isArray(parseResult.symbolMappings))) {
      if (stryMutAct_9fa48("77280")) {
        {}
      } else {
        stryCov_9fa48("77280");
        throw new Error(ERR.SYMBOL_MAPPINGS_REQUIRED);
      }
    }
  }
}

/**
 * Ensure lookup helpers receive a built index object.
 *
 * @param {Object} index - Candidate index.
 */
function ensureIndex(index) {
  if (stryMutAct_9fa48("77281")) {
    {}
  } else {
    stryCov_9fa48("77281");
    if (stryMutAct_9fa48("77284") ? !index && typeof index !== TYPEOF.OBJECT : stryMutAct_9fa48("77283") ? false : stryMutAct_9fa48("77282") ? true : (stryCov_9fa48("77282", "77283", "77284"), (stryMutAct_9fa48("77285") ? index : (stryCov_9fa48("77285"), !index)) || (stryMutAct_9fa48("77287") ? typeof index === TYPEOF.OBJECT : stryMutAct_9fa48("77286") ? false : (stryCov_9fa48("77286", "77287"), typeof index !== TYPEOF.OBJECT)))) {
      if (stryMutAct_9fa48("77288")) {
        {}
      } else {
        stryCov_9fa48("77288");
        throw new Error(ERR.INDEX_REQUIRED);
      }
    }
  }
}

/**
 * Normalize source mappings into a sorted canonical array.
 *
 * @param {Array<Object>} sourceMappings - Raw source mappings.
 * @return {Array<Object>} Normalized mappings.
 */
function normalizeSourceMappings(sourceMappings) {
  if (stryMutAct_9fa48("77289")) {
    {}
  } else {
    stryCov_9fa48("77289");
    const normalized = stryMutAct_9fa48("77290") ? ["Stryker was here"] : (stryCov_9fa48("77290"), []);
    for (const mapping of sourceMappings) {
      if (stryMutAct_9fa48("77291")) {
        {}
      } else {
        stryCov_9fa48("77291");
        if (stryMutAct_9fa48("77294") ? !mapping && typeof mapping !== TYPEOF.OBJECT : stryMutAct_9fa48("77293") ? false : stryMutAct_9fa48("77292") ? true : (stryCov_9fa48("77292", "77293", "77294"), (stryMutAct_9fa48("77295") ? mapping : (stryCov_9fa48("77295"), !mapping)) || (stryMutAct_9fa48("77297") ? typeof mapping === TYPEOF.OBJECT : stryMutAct_9fa48("77296") ? false : (stryCov_9fa48("77296", "77297"), typeof mapping !== TYPEOF.OBJECT)))) {
          if (stryMutAct_9fa48("77298")) {
            {}
          } else {
            stryCov_9fa48("77298");
            continue;
          }
        }
        if (stryMutAct_9fa48("77301") ? false : stryMutAct_9fa48("77300") ? true : stryMutAct_9fa48("77299") ? isNonEmptyString(mapping.sourceFileUrl) : (stryCov_9fa48("77299", "77300", "77301"), !isNonEmptyString(mapping.sourceFileUrl))) {
          if (stryMutAct_9fa48("77302")) {
            {}
          } else {
            stryCov_9fa48("77302");
            continue;
          }
        }
        if (stryMutAct_9fa48("77305") ? false : stryMutAct_9fa48("77304") ? true : stryMutAct_9fa48("77303") ? isNonNegativeInteger(mapping.lineNumber) : (stryCov_9fa48("77303", "77304", "77305"), !isNonNegativeInteger(mapping.lineNumber))) {
          if (stryMutAct_9fa48("77306")) {
            {}
          } else {
            stryCov_9fa48("77306");
            continue;
          }
        }
        if (stryMutAct_9fa48("77309") ? !isNonNegativeInteger(mapping.startOffset) && !isNonNegativeInteger(mapping.endOffset) : stryMutAct_9fa48("77308") ? false : stryMutAct_9fa48("77307") ? true : (stryCov_9fa48("77307", "77308", "77309"), (stryMutAct_9fa48("77310") ? isNonNegativeInteger(mapping.startOffset) : (stryCov_9fa48("77310"), !isNonNegativeInteger(mapping.startOffset))) || (stryMutAct_9fa48("77311") ? isNonNegativeInteger(mapping.endOffset) : (stryCov_9fa48("77311"), !isNonNegativeInteger(mapping.endOffset))))) {
          if (stryMutAct_9fa48("77312")) {
            {}
          } else {
            stryCov_9fa48("77312");
            continue;
          }
        }
        if (stryMutAct_9fa48("77316") ? mapping.endOffset >= mapping.startOffset : stryMutAct_9fa48("77315") ? mapping.endOffset <= mapping.startOffset : stryMutAct_9fa48("77314") ? false : stryMutAct_9fa48("77313") ? true : (stryCov_9fa48("77313", "77314", "77315", "77316"), mapping.endOffset < mapping.startOffset)) {
          if (stryMutAct_9fa48("77317")) {
            {}
          } else {
            stryCov_9fa48("77317");
            continue;
          }
        }
        normalized.push(stryMutAct_9fa48("77318") ? {} : (stryCov_9fa48("77318"), {
          sourceFileUrl: mapping.sourceFileUrl,
          lineNumber: mapping.lineNumber,
          columnNumber: isNonNegativeInteger(mapping.columnNumber) ? mapping.columnNumber : DEF.LINE_COLUMN_ZERO,
          startOffset: mapping.startOffset,
          endOffset: mapping.endOffset
        }));
      }
    }
    stryMutAct_9fa48("77319") ? normalized : (stryCov_9fa48("77319"), normalized.sort(compareByOffsetRange));
    return dedupeMappings(normalized, sourceMappingKey);
  }
}

/**
 * Normalize symbol mappings into a sorted canonical array.
 *
 * @param {Array<Object>} symbolMappings - Raw symbol mappings.
 * @return {Array<Object>} Normalized symbol mappings.
 */
function normalizeSymbolMappings(symbolMappings) {
  if (stryMutAct_9fa48("77320")) {
    {}
  } else {
    stryCov_9fa48("77320");
    const normalized = stryMutAct_9fa48("77321") ? ["Stryker was here"] : (stryCov_9fa48("77321"), []);
    for (const symbolMapping of symbolMappings) {
      if (stryMutAct_9fa48("77322")) {
        {}
      } else {
        stryCov_9fa48("77322");
        if (stryMutAct_9fa48("77325") ? !symbolMapping && typeof symbolMapping !== TYPEOF.OBJECT : stryMutAct_9fa48("77324") ? false : stryMutAct_9fa48("77323") ? true : (stryCov_9fa48("77323", "77324", "77325"), (stryMutAct_9fa48("77326") ? symbolMapping : (stryCov_9fa48("77326"), !symbolMapping)) || (stryMutAct_9fa48("77328") ? typeof symbolMapping === TYPEOF.OBJECT : stryMutAct_9fa48("77327") ? false : (stryCov_9fa48("77327", "77328"), typeof symbolMapping !== TYPEOF.OBJECT)))) {
          if (stryMutAct_9fa48("77329")) {
            {}
          } else {
            stryCov_9fa48("77329");
            continue;
          }
        }
        if (stryMutAct_9fa48("77332") ? false : stryMutAct_9fa48("77331") ? true : stryMutAct_9fa48("77330") ? isNonEmptyString(symbolMapping.symbolName) : (stryCov_9fa48("77330", "77331", "77332"), !isNonEmptyString(symbolMapping.symbolName))) {
          if (stryMutAct_9fa48("77333")) {
            {}
          } else {
            stryCov_9fa48("77333");
            continue;
          }
        }
        if (stryMutAct_9fa48("77336") ? !isNonNegativeInteger(symbolMapping.startOffset) && !isNonNegativeInteger(symbolMapping.endOffset) : stryMutAct_9fa48("77335") ? false : stryMutAct_9fa48("77334") ? true : (stryCov_9fa48("77334", "77335", "77336"), (stryMutAct_9fa48("77337") ? isNonNegativeInteger(symbolMapping.startOffset) : (stryCov_9fa48("77337"), !isNonNegativeInteger(symbolMapping.startOffset))) || (stryMutAct_9fa48("77338") ? isNonNegativeInteger(symbolMapping.endOffset) : (stryCov_9fa48("77338"), !isNonNegativeInteger(symbolMapping.endOffset))))) {
          if (stryMutAct_9fa48("77339")) {
            {}
          } else {
            stryCov_9fa48("77339");
            continue;
          }
        }
        if (stryMutAct_9fa48("77343") ? symbolMapping.endOffset >= symbolMapping.startOffset : stryMutAct_9fa48("77342") ? symbolMapping.endOffset <= symbolMapping.startOffset : stryMutAct_9fa48("77341") ? false : stryMutAct_9fa48("77340") ? true : (stryCov_9fa48("77340", "77341", "77342", "77343"), symbolMapping.endOffset < symbolMapping.startOffset)) {
          if (stryMutAct_9fa48("77344")) {
            {}
          } else {
            stryCov_9fa48("77344");
            continue;
          }
        }
        normalized.push(stryMutAct_9fa48("77345") ? {} : (stryCov_9fa48("77345"), {
          symbolName: symbolMapping.symbolName,
          startOffset: symbolMapping.startOffset,
          endOffset: symbolMapping.endOffset
        }));
      }
    }
    stryMutAct_9fa48("77346") ? normalized : (stryCov_9fa48("77346"), normalized.sort(compareByOffsetRange));
    return dedupeMappings(normalized, symbolMappingKey);
  }
}

/**
 * Derive source file list from explicit sources plus mappings.
 *
 * @param {Array<string>} sourceFiles - Declared source files.
 * @param {Array<Object>} sourceMappings - Normalized mappings.
 * @return {string[]} Deduped source list.
 */
function deriveSourceFiles(sourceFiles, sourceMappings) {
  if (stryMutAct_9fa48("77347")) {
    {}
  } else {
    stryCov_9fa48("77347");
    const unique = new Set();
    for (const sourceFileUrl of sourceFiles) {
      if (stryMutAct_9fa48("77348")) {
        {}
      } else {
        stryCov_9fa48("77348");
        if (stryMutAct_9fa48("77350") ? false : stryMutAct_9fa48("77349") ? true : (stryCov_9fa48("77349", "77350"), isNonEmptyString(sourceFileUrl))) {
          if (stryMutAct_9fa48("77351")) {
            {}
          } else {
            stryCov_9fa48("77351");
            unique.add(sourceFileUrl);
          }
        }
      }
    }
    for (const sourceMapping of sourceMappings) {
      if (stryMutAct_9fa48("77352")) {
        {}
      } else {
        stryCov_9fa48("77352");
        unique.add(sourceMapping.sourceFileUrl);
      }
    }
    return stryMutAct_9fa48("77353") ? [] : (stryCov_9fa48("77353"), [...unique]);
  }
}

/**
 * Build source->line->offset index.
 *
 * @param {Array<Object>} sourceMappings - Normalized mappings.
 * @return {Map<string, Map<number, Array<Object>>>}
 */
function createSourceToOffsetIndex(sourceMappings) {
  if (stryMutAct_9fa48("77354")) {
    {}
  } else {
    stryCov_9fa48("77354");
    const sourceIndex = new Map();
    for (const sourceMapping of sourceMappings) {
      if (stryMutAct_9fa48("77355")) {
        {}
      } else {
        stryCov_9fa48("77355");
        let lineIndex = sourceIndex.get(sourceMapping.sourceFileUrl);
        if (stryMutAct_9fa48("77358") ? false : stryMutAct_9fa48("77357") ? true : stryMutAct_9fa48("77356") ? lineIndex : (stryCov_9fa48("77356", "77357", "77358"), !lineIndex)) {
          if (stryMutAct_9fa48("77359")) {
            {}
          } else {
            stryCov_9fa48("77359");
            lineIndex = new Map();
            sourceIndex.set(sourceMapping.sourceFileUrl, lineIndex);
          }
        }
        const lineNumber = sourceMapping.lineNumber;
        const lineRanges = stryMutAct_9fa48("77362") ? lineIndex.get(lineNumber) && [] : stryMutAct_9fa48("77361") ? false : stryMutAct_9fa48("77360") ? true : (stryCov_9fa48("77360", "77361", "77362"), lineIndex.get(lineNumber) || (stryMutAct_9fa48("77363") ? ["Stryker was here"] : (stryCov_9fa48("77363"), [])));
        lineRanges.push(sourceMapping);
        lineIndex.set(lineNumber, lineRanges);
      }
    }
    return sourceIndex;
  }
}

/**
 * Build symbolName->ranges index.
 *
 * @param {Array<Object>} symbolMappings - Normalized symbol mappings.
 * @return {Map<string, Array<Object>>}
 */
function createSymbolNameIndex(symbolMappings) {
  if (stryMutAct_9fa48("77364")) {
    {}
  } else {
    stryCov_9fa48("77364");
    const symbolNameIndex = new Map();
    for (const symbolMapping of symbolMappings) {
      if (stryMutAct_9fa48("77365")) {
        {}
      } else {
        stryCov_9fa48("77365");
        const ranges = stryMutAct_9fa48("77368") ? symbolNameIndex.get(symbolMapping.symbolName) && [] : stryMutAct_9fa48("77367") ? false : stryMutAct_9fa48("77366") ? true : (stryCov_9fa48("77366", "77367", "77368"), symbolNameIndex.get(symbolMapping.symbolName) || (stryMutAct_9fa48("77369") ? ["Stryker was here"] : (stryCov_9fa48("77369"), [])));
        ranges.push(symbolMapping);
        symbolNameIndex.set(symbolMapping.symbolName, ranges);
      }
    }
    return symbolNameIndex;
  }
}

/**
 * Sort mappings by start offset, then end offset.
 *
 * @param {Object} left - Left mapping.
 * @param {Object} right - Right mapping.
 * @return {number} Sort comparator.
 */
function compareByOffsetRange(left, right) {
  if (stryMutAct_9fa48("77370")) {
    {}
  } else {
    stryCov_9fa48("77370");
    if (stryMutAct_9fa48("77373") ? left.startOffset === right.startOffset : stryMutAct_9fa48("77372") ? false : stryMutAct_9fa48("77371") ? true : (stryCov_9fa48("77371", "77372", "77373"), left.startOffset !== right.startOffset)) {
      if (stryMutAct_9fa48("77374")) {
        {}
      } else {
        stryCov_9fa48("77374");
        return stryMutAct_9fa48("77375") ? left.startOffset + right.startOffset : (stryCov_9fa48("77375"), left.startOffset - right.startOffset);
      }
    }
    return stryMutAct_9fa48("77376") ? left.endOffset + right.endOffset : (stryCov_9fa48("77376"), left.endOffset - right.endOffset);
  }
}

/**
 * Dedupe mapping entries with a stable key strategy.
 *
 * @param {Array<Object>} mappings - Candidate mappings.
 * @param {Function} keyFn - Key extractor.
 * @return {Array<Object>} Deduped mappings.
 */
function dedupeMappings(mappings, keyFn) {
  if (stryMutAct_9fa48("77377")) {
    {}
  } else {
    stryCov_9fa48("77377");
    const keys = new Set();
    const deduped = stryMutAct_9fa48("77378") ? ["Stryker was here"] : (stryCov_9fa48("77378"), []);
    for (const mapping of mappings) {
      if (stryMutAct_9fa48("77379")) {
        {}
      } else {
        stryCov_9fa48("77379");
        const key = keyFn(mapping);
        if (stryMutAct_9fa48("77381") ? false : stryMutAct_9fa48("77380") ? true : (stryCov_9fa48("77380", "77381"), keys.has(key))) {
          if (stryMutAct_9fa48("77382")) {
            {}
          } else {
            stryCov_9fa48("77382");
            continue;
          }
        }
        keys.add(key);
        deduped.push(mapping);
      }
    }
    return deduped;
  }
}

/**
 * @param {Object} mapping
 * @return {string}
 */
function sourceMappingKey(mapping) {
  if (stryMutAct_9fa48("77383")) {
    {}
  } else {
    stryCov_9fa48("77383");
    return (stryMutAct_9fa48("77384") ? [] : (stryCov_9fa48("77384"), [mapping.sourceFileUrl, mapping.lineNumber, mapping.columnNumber, mapping.startOffset, mapping.endOffset])).join(stryMutAct_9fa48("77385") ? "" : (stryCov_9fa48("77385"), ':'));
  }
}

/**
 * @param {Object} symbolMapping
 * @return {string}
 */
function symbolMappingKey(symbolMapping) {
  if (stryMutAct_9fa48("77386")) {
    {}
  } else {
    stryCov_9fa48("77386");
    return (stryMutAct_9fa48("77387") ? [] : (stryCov_9fa48("77387"), [symbolMapping.symbolName, symbolMapping.startOffset, symbolMapping.endOffset])).join(stryMutAct_9fa48("77388") ? "" : (stryCov_9fa48("77388"), ':'));
  }
}

/**
 * @param {*} value
 * @return {boolean}
 */
function isNonNegativeInteger(value) {
  if (stryMutAct_9fa48("77389")) {
    {}
  } else {
    stryCov_9fa48("77389");
    return stryMutAct_9fa48("77392") ? Number.isInteger(value) || value >= NUM.ZERO : stryMutAct_9fa48("77391") ? false : stryMutAct_9fa48("77390") ? true : (stryCov_9fa48("77390", "77391", "77392"), Number.isInteger(value) && (stryMutAct_9fa48("77395") ? value < NUM.ZERO : stryMutAct_9fa48("77394") ? value > NUM.ZERO : stryMutAct_9fa48("77393") ? true : (stryCov_9fa48("77393", "77394", "77395"), value >= NUM.ZERO)));
  }
}

/**
 * @param {*} value
 * @return {boolean}
 */
function isNonEmptyString(value) {
  if (stryMutAct_9fa48("77396")) {
    {}
  } else {
    stryCov_9fa48("77396");
    return stryMutAct_9fa48("77399") ? typeof value === TYPEOF.STRING || value.trim().length > NUM.ZERO : stryMutAct_9fa48("77398") ? false : stryMutAct_9fa48("77397") ? true : (stryCov_9fa48("77397", "77398", "77399"), (stryMutAct_9fa48("77401") ? typeof value !== TYPEOF.STRING : stryMutAct_9fa48("77400") ? true : (stryCov_9fa48("77400", "77401"), typeof value === TYPEOF.STRING)) && (stryMutAct_9fa48("77404") ? value.trim().length <= NUM.ZERO : stryMutAct_9fa48("77403") ? value.trim().length >= NUM.ZERO : stryMutAct_9fa48("77402") ? true : (stryCov_9fa48("77402", "77403", "77404"), (stryMutAct_9fa48("77405") ? value.length : (stryCov_9fa48("77405"), value.trim().length)) > NUM.ZERO)));
  }
}
export { buildDwarfIndex, lookupOffsetsForSource, lookupSourceForOffset, lookupSymbolsForOffset, lookupSymbolRangesByName };