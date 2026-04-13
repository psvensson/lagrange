/**
 * PgWireProtocolHandler — PostgreSQL wire protocol message handler.
 *
 * Handles startup/auth handshake, simple query protocol, and
 * extended query protocol (Parse/Bind/Describe/Execute/Sync).
 * Maps all SQL execution to canonical SqlRequest through the
 * existing PostgresWireAdapter.
 *
 * Requirements: 8.1, 9.1, 9.4, 10.1
 *
 * @module runtime/pgwire-protocol-handler
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
import { randomUUID } from 'node:crypto';
import { PG_PROTOCOL_VERSION, PG_SSL_REQUEST_CODE, PG_FRONTEND_MSG, PG_BACKEND_MSG, PG_AUTH_TYPE, PG_TRANSACTION_STATE, PG_ERROR_FIELD, PG_SEVERITY, PG_ERROR_CODE, PG_DESCRIBE_TYPE, PG_CLOSE_TYPE, PG_SERVER_PARAMS, PG_HANDLER_ERROR, PG_HANDLER_LOG, PG_BUFFER_LIMIT } from './pgwire-protocol-constants.js';
import { PgWireSession, PGWIRE_SESSION_ERROR } from './pgwire-session.js';

// --- Internal handler states ---

const HANDLER_PHASE = Object.freeze(stryMutAct_9fa48("147806") ? {} : (stryCov_9fa48("147806"), {
  STARTUP: stryMutAct_9fa48("147807") ? "" : (stryCov_9fa48("147807"), 'startup'),
  NORMAL: stryMutAct_9fa48("147808") ? "" : (stryCov_9fa48("147808"), 'normal'),
  CLOSED: stryMutAct_9fa48("147809") ? "" : (stryCov_9fa48("147809"), 'closed')
}));

// --- Buffer helpers ---

/**
 * Write a null-terminated C string into a buffer at offset.
 *
 * @param {Buffer} buf - Target buffer.
 * @param {string} str - String to write.
 * @param {number} offset - Write offset.
 * @return {number} New offset after the null terminator.
 */
function writeCString(buf, str, offset) {
  if (stryMutAct_9fa48("147810")) {
    {}
  } else {
    stryCov_9fa48("147810");
    const written = buf.write(str, offset, stryMutAct_9fa48("147811") ? "" : (stryCov_9fa48("147811"), 'utf8'));
    buf[stryMutAct_9fa48("147812") ? offset - written : (stryCov_9fa48("147812"), offset + written)] = 0;
    return stryMutAct_9fa48("147813") ? offset + written - 1 : (stryCov_9fa48("147813"), (stryMutAct_9fa48("147814") ? offset - written : (stryCov_9fa48("147814"), offset + written)) + 1);
  }
}

/**
 * Read a null-terminated C string from a buffer at offset.
 *
 * @param {Buffer} buf - Source buffer.
 * @param {number} offset - Read offset.
 * @return {{value: string, nextOffset: number}}
 */
function readCString(buf, offset) {
  if (stryMutAct_9fa48("147815")) {
    {}
  } else {
    stryCov_9fa48("147815");
    const end = buf.indexOf(0, offset);
    if (stryMutAct_9fa48("147818") ? end !== -1 : stryMutAct_9fa48("147817") ? false : stryMutAct_9fa48("147816") ? true : (stryCov_9fa48("147816", "147817", "147818"), end === (stryMutAct_9fa48("147819") ? +1 : (stryCov_9fa48("147819"), -1)))) {
      if (stryMutAct_9fa48("147820")) {
        {}
      } else {
        stryCov_9fa48("147820");
        return stryMutAct_9fa48("147821") ? {} : (stryCov_9fa48("147821"), {
          value: stryMutAct_9fa48("147822") ? "Stryker was here!" : (stryCov_9fa48("147822"), ''),
          nextOffset: buf.length
        });
      }
    }
    return stryMutAct_9fa48("147823") ? {} : (stryCov_9fa48("147823"), {
      value: buf.toString(stryMutAct_9fa48("147824") ? "" : (stryCov_9fa48("147824"), 'utf8'), offset, end),
      nextOffset: stryMutAct_9fa48("147825") ? end - 1 : (stryCov_9fa48("147825"), end + 1)
    });
  }
}

// --- Message builders ---

/**
 * Build a backend message with type byte and length-prefixed payload.
 *
 * @param {number} type - Message type byte.
 * @param {Buffer} payload - Message payload.
 * @return {Buffer} Complete message buffer.
 */
function buildMessage(type, payload) {
  if (stryMutAct_9fa48("147826")) {
    {}
  } else {
    stryCov_9fa48("147826");
    const len = stryMutAct_9fa48("147827") ? PG_BUFFER_LIMIT.LENGTH_FIELD_SIZE - payload.length : (stryCov_9fa48("147827"), PG_BUFFER_LIMIT.LENGTH_FIELD_SIZE + payload.length);
    const buf = Buffer.allocUnsafe(stryMutAct_9fa48("147828") ? 1 - len : (stryCov_9fa48("147828"), 1 + len));
    buf[0] = type;
    buf.writeInt32BE(len, 1);
    payload.copy(buf, PG_BUFFER_LIMIT.MSG_HEADER_SIZE);
    return buf;
  }
}

/**
 * Build AuthenticationOk message.
 * @return {Buffer}
 */
function buildAuthOk() {
  if (stryMutAct_9fa48("147829")) {
    {}
  } else {
    stryCov_9fa48("147829");
    const payload = Buffer.allocUnsafe(PG_BUFFER_LIMIT.LENGTH_FIELD_SIZE);
    payload.writeInt32BE(PG_AUTH_TYPE.OK, 0);
    return buildMessage(PG_BACKEND_MSG.AUTH, payload);
  }
}

/**
 * Build ParameterStatus message.
 * @param {string} name - Parameter name.
 * @param {string} value - Parameter value.
 * @return {Buffer}
 */
function buildParameterStatus(name, value) {
  if (stryMutAct_9fa48("147830")) {
    {}
  } else {
    stryCov_9fa48("147830");
    const nameLen = stryMutAct_9fa48("147831") ? Buffer.byteLength(name, 'utf8') - 1 : (stryCov_9fa48("147831"), Buffer.byteLength(name, stryMutAct_9fa48("147832") ? "" : (stryCov_9fa48("147832"), 'utf8')) + 1);
    const valLen = stryMutAct_9fa48("147833") ? Buffer.byteLength(value, 'utf8') - 1 : (stryCov_9fa48("147833"), Buffer.byteLength(value, stryMutAct_9fa48("147834") ? "" : (stryCov_9fa48("147834"), 'utf8')) + 1);
    const payload = Buffer.allocUnsafe(stryMutAct_9fa48("147835") ? nameLen - valLen : (stryCov_9fa48("147835"), nameLen + valLen));
    let off = writeCString(payload, name, 0);
    writeCString(payload, value, off);
    return buildMessage(PG_BACKEND_MSG.PARAMETER_STATUS, payload);
  }
}

/**
 * Build BackendKeyData message.
 * @param {number} pid - Process ID.
 * @param {number} secretKey - Secret key.
 * @return {Buffer}
 */
function buildBackendKeyData(pid, secretKey) {
  if (stryMutAct_9fa48("147836")) {
    {}
  } else {
    stryCov_9fa48("147836");
    const payload = Buffer.allocUnsafe(8);
    payload.writeInt32BE(pid, 0);
    payload.writeInt32BE(secretKey, 4);
    return buildMessage(PG_BACKEND_MSG.BACKEND_KEY_DATA, payload);
  }
}

/**
 * Build ReadyForQuery message.
 * @param {number} txState - Transaction state byte.
 * @return {Buffer}
 */
function buildReadyForQuery(txState) {
  if (stryMutAct_9fa48("147837")) {
    {}
  } else {
    stryCov_9fa48("147837");
    const payload = Buffer.allocUnsafe(1);
    payload[0] = txState;
    return buildMessage(PG_BACKEND_MSG.READY_FOR_QUERY, payload);
  }
}

/**
 * Build ErrorResponse message.
 * @param {string} severity - PG_SEVERITY value.
 * @param {string} code - SQLSTATE code.
 * @param {string} message - Error message.
 * @return {Buffer}
 */
function buildErrorResponse(severity, code, message) {
  if (stryMutAct_9fa48("147838")) {
    {}
  } else {
    stryCov_9fa48("147838");
    const fields = stryMutAct_9fa48("147839") ? [] : (stryCov_9fa48("147839"), [stryMutAct_9fa48("147840") ? {} : (stryCov_9fa48("147840"), {
      id: PG_ERROR_FIELD.SEVERITY,
      val: severity
    }), stryMutAct_9fa48("147841") ? {} : (stryCov_9fa48("147841"), {
      id: PG_ERROR_FIELD.CODE,
      val: code
    }), stryMutAct_9fa48("147842") ? {} : (stryCov_9fa48("147842"), {
      id: PG_ERROR_FIELD.MESSAGE,
      val: message
    })]);
    let size = 1; // trailing null terminator
    for (const f of fields) {
      if (stryMutAct_9fa48("147843")) {
        {}
      } else {
        stryCov_9fa48("147843");
        stryMutAct_9fa48("147844") ? size -= 1 + Buffer.byteLength(f.val, 'utf8') + 1 : (stryCov_9fa48("147844"), size += stryMutAct_9fa48("147845") ? 1 + Buffer.byteLength(f.val, 'utf8') - 1 : (stryCov_9fa48("147845"), (stryMutAct_9fa48("147846") ? 1 - Buffer.byteLength(f.val, 'utf8') : (stryCov_9fa48("147846"), 1 + Buffer.byteLength(f.val, stryMutAct_9fa48("147847") ? "" : (stryCov_9fa48("147847"), 'utf8')))) + 1));
      }
    }
    const payload = Buffer.allocUnsafe(size);
    let off = 0;
    for (const f of fields) {
      if (stryMutAct_9fa48("147848")) {
        {}
      } else {
        stryCov_9fa48("147848");
        payload[stryMutAct_9fa48("147849") ? off-- : (stryCov_9fa48("147849"), off++)] = f.id;
        off = writeCString(payload, f.val, off);
      }
    }
    payload[off] = 0; // terminator
    return buildMessage(PG_BACKEND_MSG.ERROR_RESPONSE, payload);
  }
}

/**
 * Build RowDescription message from column metadata.
 * @param {Array<{name: string}>} columns - Column descriptors.
 * @return {Buffer}
 */
function buildRowDescription(columns) {
  if (stryMutAct_9fa48("147850")) {
    {}
  } else {
    stryCov_9fa48("147850");
    // 2 bytes field count + per-column data
    let size = 2;
    for (const col of columns) {
      if (stryMutAct_9fa48("147851")) {
        {}
      } else {
        stryCov_9fa48("147851");
        // name(cstring) + tableOID(4) + colAttr(2) + typeOID(4)
        // + typeLen(2) + typeMod(4) + format(2) = 18 fixed bytes
        stryMutAct_9fa48("147852") ? size -= Buffer.byteLength(col.name, 'utf8') + 1 + 18 : (stryCov_9fa48("147852"), size += stryMutAct_9fa48("147853") ? Buffer.byteLength(col.name, 'utf8') + 1 - 18 : (stryCov_9fa48("147853"), (stryMutAct_9fa48("147854") ? Buffer.byteLength(col.name, 'utf8') - 1 : (stryCov_9fa48("147854"), Buffer.byteLength(col.name, stryMutAct_9fa48("147855") ? "" : (stryCov_9fa48("147855"), 'utf8')) + 1)) + 18));
      }
    }
    const payload = Buffer.allocUnsafe(size);
    payload.writeInt16BE(columns.length, 0);
    let off = 2;
    for (const col of columns) {
      if (stryMutAct_9fa48("147856")) {
        {}
      } else {
        stryCov_9fa48("147856");
        off = writeCString(payload, col.name, off);
        payload.writeInt32BE(0, off);
        stryMutAct_9fa48("147857") ? off -= 4 : (stryCov_9fa48("147857"), off += 4); // table OID
        payload.writeInt16BE(0, off);
        stryMutAct_9fa48("147858") ? off -= 2 : (stryCov_9fa48("147858"), off += 2); // column attr
        payload.writeInt32BE(25, off);
        stryMutAct_9fa48("147859") ? off -= 4 : (stryCov_9fa48("147859"), off += 4); // type OID (text=25)
        payload.writeInt16BE(stryMutAct_9fa48("147860") ? +1 : (stryCov_9fa48("147860"), -1), off);
        stryMutAct_9fa48("147861") ? off -= 2 : (stryCov_9fa48("147861"), off += 2); // type length
        payload.writeInt32BE(stryMutAct_9fa48("147862") ? +1 : (stryCov_9fa48("147862"), -1), off);
        stryMutAct_9fa48("147863") ? off -= 4 : (stryCov_9fa48("147863"), off += 4); // type modifier
        payload.writeInt16BE(0, off);
        stryMutAct_9fa48("147864") ? off -= 2 : (stryCov_9fa48("147864"), off += 2); // format (text=0)
      }
    }
    return buildMessage(PG_BACKEND_MSG.ROW_DESCRIPTION, payload);
  }
}

/**
 * Build DataRow message from column values.
 * @param {Array<string|null>} values - Column values (null for SQL NULL).
 * @return {Buffer}
 */
function buildDataRow(values) {
  if (stryMutAct_9fa48("147865")) {
    {}
  } else {
    stryCov_9fa48("147865");
    let size = 2; // column count
    for (const v of values) {
      if (stryMutAct_9fa48("147866")) {
        {}
      } else {
        stryCov_9fa48("147866");
        if (stryMutAct_9fa48("147869") ? v === null && v === undefined : stryMutAct_9fa48("147868") ? false : stryMutAct_9fa48("147867") ? true : (stryCov_9fa48("147867", "147868", "147869"), (stryMutAct_9fa48("147871") ? v !== null : stryMutAct_9fa48("147870") ? false : (stryCov_9fa48("147870", "147871"), v === null)) || (stryMutAct_9fa48("147873") ? v !== undefined : stryMutAct_9fa48("147872") ? false : (stryCov_9fa48("147872", "147873"), v === undefined)))) {
          if (stryMutAct_9fa48("147874")) {
            {}
          } else {
            stryCov_9fa48("147874");
            stryMutAct_9fa48("147875") ? size -= 4 : (stryCov_9fa48("147875"), size += 4); // -1 length for NULL
          }
        } else {
          if (stryMutAct_9fa48("147876")) {
            {}
          } else {
            stryCov_9fa48("147876");
            const s = String(v);
            stryMutAct_9fa48("147877") ? size -= 4 + Buffer.byteLength(s, 'utf8') : (stryCov_9fa48("147877"), size += stryMutAct_9fa48("147878") ? 4 - Buffer.byteLength(s, 'utf8') : (stryCov_9fa48("147878"), 4 + Buffer.byteLength(s, stryMutAct_9fa48("147879") ? "" : (stryCov_9fa48("147879"), 'utf8'))));
          }
        }
      }
    }
    const payload = Buffer.allocUnsafe(size);
    payload.writeInt16BE(values.length, 0);
    let off = 2;
    for (const v of values) {
      if (stryMutAct_9fa48("147880")) {
        {}
      } else {
        stryCov_9fa48("147880");
        if (stryMutAct_9fa48("147883") ? v === null && v === undefined : stryMutAct_9fa48("147882") ? false : stryMutAct_9fa48("147881") ? true : (stryCov_9fa48("147881", "147882", "147883"), (stryMutAct_9fa48("147885") ? v !== null : stryMutAct_9fa48("147884") ? false : (stryCov_9fa48("147884", "147885"), v === null)) || (stryMutAct_9fa48("147887") ? v !== undefined : stryMutAct_9fa48("147886") ? false : (stryCov_9fa48("147886", "147887"), v === undefined)))) {
          if (stryMutAct_9fa48("147888")) {
            {}
          } else {
            stryCov_9fa48("147888");
            payload.writeInt32BE(stryMutAct_9fa48("147889") ? +1 : (stryCov_9fa48("147889"), -1), off);
            stryMutAct_9fa48("147890") ? off -= 4 : (stryCov_9fa48("147890"), off += 4);
          }
        } else {
          if (stryMutAct_9fa48("147891")) {
            {}
          } else {
            stryCov_9fa48("147891");
            const s = String(v);
            const len = Buffer.byteLength(s, stryMutAct_9fa48("147892") ? "" : (stryCov_9fa48("147892"), 'utf8'));
            payload.writeInt32BE(len, off);
            stryMutAct_9fa48("147893") ? off -= 4 : (stryCov_9fa48("147893"), off += 4);
            payload.write(s, off, stryMutAct_9fa48("147894") ? "" : (stryCov_9fa48("147894"), 'utf8'));
            stryMutAct_9fa48("147895") ? off -= len : (stryCov_9fa48("147895"), off += len);
          }
        }
      }
    }
    return buildMessage(PG_BACKEND_MSG.DATA_ROW, payload);
  }
}

/**
 * Build CommandComplete message.
 * @param {string} tag - Command tag (e.g. 'SELECT 1').
 * @return {Buffer}
 */
function buildCommandComplete(tag) {
  if (stryMutAct_9fa48("147896")) {
    {}
  } else {
    stryCov_9fa48("147896");
    const len = stryMutAct_9fa48("147897") ? Buffer.byteLength(tag, 'utf8') - 1 : (stryCov_9fa48("147897"), Buffer.byteLength(tag, stryMutAct_9fa48("147898") ? "" : (stryCov_9fa48("147898"), 'utf8')) + 1);
    const payload = Buffer.allocUnsafe(len);
    writeCString(payload, tag, 0);
    return buildMessage(PG_BACKEND_MSG.COMMAND_COMPLETE, payload);
  }
}

/**
 * Build ParseComplete message.
 * @return {Buffer}
 */
function buildParseComplete() {
  if (stryMutAct_9fa48("147899")) {
    {}
  } else {
    stryCov_9fa48("147899");
    return buildMessage(PG_BACKEND_MSG.PARSE_COMPLETE, Buffer.alloc(0));
  }
}

/**
 * Build BindComplete message.
 * @return {Buffer}
 */
function buildBindComplete() {
  if (stryMutAct_9fa48("147900")) {
    {}
  } else {
    stryCov_9fa48("147900");
    return buildMessage(PG_BACKEND_MSG.BIND_COMPLETE, Buffer.alloc(0));
  }
}

/**
 * Build CloseComplete message.
 * @return {Buffer}
 */
function buildCloseComplete() {
  if (stryMutAct_9fa48("147901")) {
    {}
  } else {
    stryCov_9fa48("147901");
    return buildMessage(PG_BACKEND_MSG.CLOSE_COMPLETE, Buffer.alloc(0));
  }
}

/**
 * Build NoData message.
 * @return {Buffer}
 */
function buildNoData() {
  if (stryMutAct_9fa48("147902")) {
    {}
  } else {
    stryCov_9fa48("147902");
    return buildMessage(PG_BACKEND_MSG.NO_DATA, Buffer.alloc(0));
  }
}

/**
 * Build EmptyQueryResponse message.
 * @return {Buffer}
 */
function buildEmptyQueryResponse() {
  if (stryMutAct_9fa48("147903")) {
    {}
  } else {
    stryCov_9fa48("147903");
    return buildMessage(PG_BACKEND_MSG.EMPTY_QUERY, Buffer.alloc(0));
  }
}

// --- Startup message parsing ---

/**
 * Parse startup message parameters from payload buffer.
 * Parameters are null-terminated key-value pairs ending with
 * a final null byte.
 *
 * @param {Buffer} buf - Payload after version field.
 * @return {Object} Parsed parameters.
 */
function parseStartupParams(buf) {
  if (stryMutAct_9fa48("147904")) {
    {}
  } else {
    stryCov_9fa48("147904");
    const params = {};
    let off = 0;
    while (stryMutAct_9fa48("147907") ? off >= buf.length : stryMutAct_9fa48("147906") ? off <= buf.length : stryMutAct_9fa48("147905") ? false : (stryCov_9fa48("147905", "147906", "147907"), off < buf.length)) {
      if (stryMutAct_9fa48("147908")) {
        {}
      } else {
        stryCov_9fa48("147908");
        if (stryMutAct_9fa48("147911") ? buf[off] !== 0 : stryMutAct_9fa48("147910") ? false : stryMutAct_9fa48("147909") ? true : (stryCov_9fa48("147909", "147910", "147911"), buf[off] === 0)) break;
        const key = readCString(buf, off);
        off = key.nextOffset;
        if (stryMutAct_9fa48("147915") ? off < buf.length : stryMutAct_9fa48("147914") ? off > buf.length : stryMutAct_9fa48("147913") ? false : stryMutAct_9fa48("147912") ? true : (stryCov_9fa48("147912", "147913", "147914", "147915"), off >= buf.length)) break;
        const val = readCString(buf, off);
        off = val.nextOffset;
        params[key.value] = val.value;
      }
    }
    return params;
  }
}

// --- Frontend message parsers ---

/**
 * Parse a simple Query message payload.
 * @param {Buffer} payload - Message payload (after header).
 * @return {{query: string}}
 */
function parseQueryMessage(payload) {
  if (stryMutAct_9fa48("147916")) {
    {}
  } else {
    stryCov_9fa48("147916");
    const {
      value
    } = readCString(payload, 0);
    return stryMutAct_9fa48("147917") ? {} : (stryCov_9fa48("147917"), {
      query: value
    });
  }
}

/**
 * Parse a Parse message payload.
 * @param {Buffer} payload - Message payload.
 * @return {{name: string, query: string, paramTypes: number[]}}
 */
function parseParseMessage(payload) {
  if (stryMutAct_9fa48("147918")) {
    {}
  } else {
    stryCov_9fa48("147918");
    let off = 0;
    const name = readCString(payload, off);
    off = name.nextOffset;
    const query = readCString(payload, off);
    off = query.nextOffset;
    const numParams = payload.readInt16BE(off);
    stryMutAct_9fa48("147919") ? off -= 2 : (stryCov_9fa48("147919"), off += 2);
    const paramTypes = stryMutAct_9fa48("147920") ? ["Stryker was here"] : (stryCov_9fa48("147920"), []);
    for (let i = 0; stryMutAct_9fa48("147923") ? i >= numParams : stryMutAct_9fa48("147922") ? i <= numParams : stryMutAct_9fa48("147921") ? false : (stryCov_9fa48("147921", "147922", "147923"), i < numParams); stryMutAct_9fa48("147924") ? i-- : (stryCov_9fa48("147924"), i++)) {
      if (stryMutAct_9fa48("147925")) {
        {}
      } else {
        stryCov_9fa48("147925");
        paramTypes.push(payload.readInt32BE(off));
        stryMutAct_9fa48("147926") ? off -= 4 : (stryCov_9fa48("147926"), off += 4);
      }
    }
    return stryMutAct_9fa48("147927") ? {} : (stryCov_9fa48("147927"), {
      name: name.value,
      query: query.value,
      paramTypes
    });
  }
}

/**
 * Parse a Bind message payload.
 * @param {Buffer} payload - Message payload.
 * @return {{portal: string, statement: string, params: string[]}}
 */
function parseBindMessage(payload) {
  if (stryMutAct_9fa48("147928")) {
    {}
  } else {
    stryCov_9fa48("147928");
    let off = 0;
    const portal = readCString(payload, off);
    off = portal.nextOffset;
    const statement = readCString(payload, off);
    off = statement.nextOffset;

    // Parameter format codes
    const numFormats = payload.readInt16BE(off);
    stryMutAct_9fa48("147929") ? off -= 2 : (stryCov_9fa48("147929"), off += 2);
    stryMutAct_9fa48("147930") ? off -= numFormats * 2 : (stryCov_9fa48("147930"), off += stryMutAct_9fa48("147931") ? numFormats / 2 : (stryCov_9fa48("147931"), numFormats * 2)); // skip format codes (all text)

    // Parameter values
    const numParams = payload.readInt16BE(off);
    stryMutAct_9fa48("147932") ? off -= 2 : (stryCov_9fa48("147932"), off += 2);
    const params = stryMutAct_9fa48("147933") ? ["Stryker was here"] : (stryCov_9fa48("147933"), []);
    for (let i = 0; stryMutAct_9fa48("147936") ? i >= numParams : stryMutAct_9fa48("147935") ? i <= numParams : stryMutAct_9fa48("147934") ? false : (stryCov_9fa48("147934", "147935", "147936"), i < numParams); stryMutAct_9fa48("147937") ? i-- : (stryCov_9fa48("147937"), i++)) {
      if (stryMutAct_9fa48("147938")) {
        {}
      } else {
        stryCov_9fa48("147938");
        const len = payload.readInt32BE(off);
        stryMutAct_9fa48("147939") ? off -= 4 : (stryCov_9fa48("147939"), off += 4);
        if (stryMutAct_9fa48("147942") ? len !== -1 : stryMutAct_9fa48("147941") ? false : stryMutAct_9fa48("147940") ? true : (stryCov_9fa48("147940", "147941", "147942"), len === (stryMutAct_9fa48("147943") ? +1 : (stryCov_9fa48("147943"), -1)))) {
          if (stryMutAct_9fa48("147944")) {
            {}
          } else {
            stryCov_9fa48("147944");
            params.push(null);
          }
        } else {
          if (stryMutAct_9fa48("147945")) {
            {}
          } else {
            stryCov_9fa48("147945");
            params.push(payload.toString(stryMutAct_9fa48("147946") ? "" : (stryCov_9fa48("147946"), 'utf8'), off, stryMutAct_9fa48("147947") ? off - len : (stryCov_9fa48("147947"), off + len)));
            stryMutAct_9fa48("147948") ? off -= len : (stryCov_9fa48("147948"), off += len);
          }
        }
      }
    }
    return stryMutAct_9fa48("147949") ? {} : (stryCov_9fa48("147949"), {
      portal: portal.value,
      statement: statement.value,
      params
    });
  }
}

/**
 * Parse a Describe message payload.
 * @param {Buffer} payload - Message payload.
 * @return {{type: number, name: string}}
 */
function parseDescribeMessage(payload) {
  if (stryMutAct_9fa48("147950")) {
    {}
  } else {
    stryCov_9fa48("147950");
    return stryMutAct_9fa48("147951") ? {} : (stryCov_9fa48("147951"), {
      type: payload[0],
      name: readCString(payload, 1).value
    });
  }
}

/**
 * Parse an Execute message payload.
 * @param {Buffer} payload - Message payload.
 * @return {{portal: string, maxRows: number}}
 */
function parseExecuteMessage(payload) {
  if (stryMutAct_9fa48("147952")) {
    {}
  } else {
    stryCov_9fa48("147952");
    const portal = readCString(payload, 0);
    const maxRows = payload.readInt32BE(portal.nextOffset);
    return stryMutAct_9fa48("147953") ? {} : (stryCov_9fa48("147953"), {
      portal: portal.value,
      maxRows
    });
  }
}

/**
 * Parse a Close message payload.
 * @param {Buffer} payload - Message payload.
 * @return {{type: number, name: string}}
 */
function parseCloseMessage(payload) {
  if (stryMutAct_9fa48("147954")) {
    {}
  } else {
    stryCov_9fa48("147954");
    return stryMutAct_9fa48("147955") ? {} : (stryCov_9fa48("147955"), {
      type: payload[0],
      name: readCString(payload, 1).value
    });
  }
}

// --- Result-to-wire helpers ---

/**
 * Derive a command tag from a SQL result.
 *
 * @param {Object} result - SqlCore result.
 * @param {string} query - Original SQL query.
 * @return {string} PG command tag.
 */
function deriveCommandTag(result, query) {
  if (stryMutAct_9fa48("147956")) {
    {}
  } else {
    stryCov_9fa48("147956");
    const upper = stryMutAct_9fa48("147958") ? query.trimEnd().toUpperCase() : stryMutAct_9fa48("147957") ? query.trimStart().toLowerCase() : (stryCov_9fa48("147957", "147958"), query.trimStart().toUpperCase());
    if (stryMutAct_9fa48("147961") ? upper.endsWith('SELECT') : stryMutAct_9fa48("147960") ? false : stryMutAct_9fa48("147959") ? true : (stryCov_9fa48("147959", "147960", "147961"), upper.startsWith(stryMutAct_9fa48("147962") ? "" : (stryCov_9fa48("147962"), 'SELECT')))) {
      if (stryMutAct_9fa48("147963")) {
        {}
      } else {
        stryCov_9fa48("147963");
        const count = Array.isArray(stryMutAct_9fa48("147964") ? result.rows : (stryCov_9fa48("147964"), result?.rows)) ? result.rows.length : 0;
        return stryMutAct_9fa48("147965") ? `` : (stryCov_9fa48("147965"), `SELECT ${count}`);
      }
    }
    if (stryMutAct_9fa48("147968") ? upper.endsWith('INSERT') : stryMutAct_9fa48("147967") ? false : stryMutAct_9fa48("147966") ? true : (stryCov_9fa48("147966", "147967", "147968"), upper.startsWith(stryMutAct_9fa48("147969") ? "" : (stryCov_9fa48("147969"), 'INSERT')))) {
      if (stryMutAct_9fa48("147970")) {
        {}
      } else {
        stryCov_9fa48("147970");
        const count = stryMutAct_9fa48("147971") ? (result?.changes ?? result?.rowCount) && 0 : (stryCov_9fa48("147971"), (stryMutAct_9fa48("147972") ? result?.changes && result?.rowCount : (stryCov_9fa48("147972"), (stryMutAct_9fa48("147973") ? result.changes : (stryCov_9fa48("147973"), result?.changes)) ?? (stryMutAct_9fa48("147974") ? result.rowCount : (stryCov_9fa48("147974"), result?.rowCount)))) ?? 0);
        return stryMutAct_9fa48("147975") ? `` : (stryCov_9fa48("147975"), `INSERT 0 ${count}`);
      }
    }
    if (stryMutAct_9fa48("147978") ? upper.endsWith('UPDATE') : stryMutAct_9fa48("147977") ? false : stryMutAct_9fa48("147976") ? true : (stryCov_9fa48("147976", "147977", "147978"), upper.startsWith(stryMutAct_9fa48("147979") ? "" : (stryCov_9fa48("147979"), 'UPDATE')))) {
      if (stryMutAct_9fa48("147980")) {
        {}
      } else {
        stryCov_9fa48("147980");
        const count = stryMutAct_9fa48("147981") ? (result?.changes ?? result?.rowCount) && 0 : (stryCov_9fa48("147981"), (stryMutAct_9fa48("147982") ? result?.changes && result?.rowCount : (stryCov_9fa48("147982"), (stryMutAct_9fa48("147983") ? result.changes : (stryCov_9fa48("147983"), result?.changes)) ?? (stryMutAct_9fa48("147984") ? result.rowCount : (stryCov_9fa48("147984"), result?.rowCount)))) ?? 0);
        return stryMutAct_9fa48("147985") ? `` : (stryCov_9fa48("147985"), `UPDATE ${count}`);
      }
    }
    if (stryMutAct_9fa48("147988") ? upper.endsWith('DELETE') : stryMutAct_9fa48("147987") ? false : stryMutAct_9fa48("147986") ? true : (stryCov_9fa48("147986", "147987", "147988"), upper.startsWith(stryMutAct_9fa48("147989") ? "" : (stryCov_9fa48("147989"), 'DELETE')))) {
      if (stryMutAct_9fa48("147990")) {
        {}
      } else {
        stryCov_9fa48("147990");
        const count = stryMutAct_9fa48("147991") ? (result?.changes ?? result?.rowCount) && 0 : (stryCov_9fa48("147991"), (stryMutAct_9fa48("147992") ? result?.changes && result?.rowCount : (stryCov_9fa48("147992"), (stryMutAct_9fa48("147993") ? result.changes : (stryCov_9fa48("147993"), result?.changes)) ?? (stryMutAct_9fa48("147994") ? result.rowCount : (stryCov_9fa48("147994"), result?.rowCount)))) ?? 0);
        return stryMutAct_9fa48("147995") ? `` : (stryCov_9fa48("147995"), `DELETE ${count}`);
      }
    }
    if (stryMutAct_9fa48("147998") ? upper.endsWith('CREATE') : stryMutAct_9fa48("147997") ? false : stryMutAct_9fa48("147996") ? true : (stryCov_9fa48("147996", "147997", "147998"), upper.startsWith(stryMutAct_9fa48("147999") ? "" : (stryCov_9fa48("147999"), 'CREATE')))) return stryMutAct_9fa48("148000") ? "" : (stryCov_9fa48("148000"), 'CREATE TABLE');
    if (stryMutAct_9fa48("148003") ? upper.endsWith('DROP') : stryMutAct_9fa48("148002") ? false : stryMutAct_9fa48("148001") ? true : (stryCov_9fa48("148001", "148002", "148003"), upper.startsWith(stryMutAct_9fa48("148004") ? "" : (stryCov_9fa48("148004"), 'DROP')))) return stryMutAct_9fa48("148005") ? "" : (stryCov_9fa48("148005"), 'DROP TABLE');
    if (stryMutAct_9fa48("148008") ? upper.endsWith('BEGIN') : stryMutAct_9fa48("148007") ? false : stryMutAct_9fa48("148006") ? true : (stryCov_9fa48("148006", "148007", "148008"), upper.startsWith(stryMutAct_9fa48("148009") ? "" : (stryCov_9fa48("148009"), 'BEGIN')))) return stryMutAct_9fa48("148010") ? "" : (stryCov_9fa48("148010"), 'BEGIN');
    if (stryMutAct_9fa48("148013") ? upper.endsWith('COMMIT') : stryMutAct_9fa48("148012") ? false : stryMutAct_9fa48("148011") ? true : (stryCov_9fa48("148011", "148012", "148013"), upper.startsWith(stryMutAct_9fa48("148014") ? "" : (stryCov_9fa48("148014"), 'COMMIT')))) return stryMutAct_9fa48("148015") ? "" : (stryCov_9fa48("148015"), 'COMMIT');
    if (stryMutAct_9fa48("148018") ? upper.endsWith('ROLLBACK') : stryMutAct_9fa48("148017") ? false : stryMutAct_9fa48("148016") ? true : (stryCov_9fa48("148016", "148017", "148018"), upper.startsWith(stryMutAct_9fa48("148019") ? "" : (stryCov_9fa48("148019"), 'ROLLBACK')))) return stryMutAct_9fa48("148020") ? "" : (stryCov_9fa48("148020"), 'ROLLBACK');
    return stryMutAct_9fa48("148021") ? "" : (stryCov_9fa48("148021"), 'OK');
  }
}

/**
 * Extract column descriptors from a SqlCore result.
 *
 * @param {Object} result - SqlCore result.
 * @return {Array<{name: string}>}
 */
function extractColumns(result) {
  if (stryMutAct_9fa48("148022")) {
    {}
  } else {
    stryCov_9fa48("148022");
    if (stryMutAct_9fa48("148025") ? result?.columns || Array.isArray(result.columns) : stryMutAct_9fa48("148024") ? false : stryMutAct_9fa48("148023") ? true : (stryCov_9fa48("148023", "148024", "148025"), (stryMutAct_9fa48("148026") ? result.columns : (stryCov_9fa48("148026"), result?.columns)) && Array.isArray(result.columns))) {
      if (stryMutAct_9fa48("148027")) {
        {}
      } else {
        stryCov_9fa48("148027");
        return result.columns.map(stryMutAct_9fa48("148028") ? () => undefined : (stryCov_9fa48("148028"), c => (stryMutAct_9fa48("148031") ? typeof c !== 'string' : stryMutAct_9fa48("148030") ? false : stryMutAct_9fa48("148029") ? true : (stryCov_9fa48("148029", "148030", "148031"), typeof c === (stryMutAct_9fa48("148032") ? "" : (stryCov_9fa48("148032"), 'string')))) ? stryMutAct_9fa48("148033") ? {} : (stryCov_9fa48("148033"), {
          name: c
        }) : stryMutAct_9fa48("148034") ? {} : (stryCov_9fa48("148034"), {
          name: stryMutAct_9fa48("148037") ? c.name && 'column' : stryMutAct_9fa48("148036") ? false : stryMutAct_9fa48("148035") ? true : (stryCov_9fa48("148035", "148036", "148037"), c.name || (stryMutAct_9fa48("148038") ? "" : (stryCov_9fa48("148038"), 'column')))
        })));
      }
    }
    if (stryMutAct_9fa48("148041") ? Array.isArray(result?.rows) || result.rows.length > 0 : stryMutAct_9fa48("148040") ? false : stryMutAct_9fa48("148039") ? true : (stryCov_9fa48("148039", "148040", "148041"), Array.isArray(stryMutAct_9fa48("148042") ? result.rows : (stryCov_9fa48("148042"), result?.rows)) && (stryMutAct_9fa48("148045") ? result.rows.length <= 0 : stryMutAct_9fa48("148044") ? result.rows.length >= 0 : stryMutAct_9fa48("148043") ? true : (stryCov_9fa48("148043", "148044", "148045"), result.rows.length > 0)))) {
      if (stryMutAct_9fa48("148046")) {
        {}
      } else {
        stryCov_9fa48("148046");
        return Object.keys(result.rows[0]).map(stryMutAct_9fa48("148047") ? () => undefined : (stryCov_9fa48("148047"), k => stryMutAct_9fa48("148048") ? {} : (stryCov_9fa48("148048"), {
          name: k
        })));
      }
    }
    return stryMutAct_9fa48("148049") ? ["Stryker was here"] : (stryCov_9fa48("148049"), []);
  }
}

/**
 * Extract row values from a SqlCore result row.
 *
 * @param {Object} row - Single result row.
 * @param {Array<{name: string}>} columns - Column descriptors.
 * @return {Array<string|null>}
 */
function extractRowValues(row, columns) {
  if (stryMutAct_9fa48("148050")) {
    {}
  } else {
    stryCov_9fa48("148050");
    if (stryMutAct_9fa48("148052") ? false : stryMutAct_9fa48("148051") ? true : (stryCov_9fa48("148051", "148052"), Array.isArray(row))) return row.map(stryMutAct_9fa48("148053") ? () => undefined : (stryCov_9fa48("148053"), v => stryMutAct_9fa48("148054") ? v && null : (stryCov_9fa48("148054"), v ?? null)));
    return columns.map(c => {
      if (stryMutAct_9fa48("148055")) {
        {}
      } else {
        stryCov_9fa48("148055");
        const v = row[c.name];
        return (stryMutAct_9fa48("148058") ? v !== undefined : stryMutAct_9fa48("148057") ? false : stryMutAct_9fa48("148056") ? true : (stryCov_9fa48("148056", "148057", "148058"), v === undefined)) ? null : v;
      }
    });
  }
}

/**
 * PgWireProtocolHandler — handles one TCP connection's PG wire
 * protocol lifecycle.
 *
 * Wired into the TCP server created by pgwire-runtime-module.
 * Each connection gets its own handler instance.
 */
class PgWireProtocolHandler {
  /**
   * @param {Object} options
   * @param {Object} options.adapter - PostgresWireAdapter instance.
   * @param {import('node:net').Socket} options.socket - TCP socket.
   * @param {Object} [options.logger] - Logger instance.
   */
  constructor(options) {
    if (stryMutAct_9fa48("148059")) {
      {}
    } else {
      stryCov_9fa48("148059");
      if (stryMutAct_9fa48("148062") ? !options && !options.adapter : stryMutAct_9fa48("148061") ? false : stryMutAct_9fa48("148060") ? true : (stryCov_9fa48("148060", "148061", "148062"), (stryMutAct_9fa48("148063") ? options : (stryCov_9fa48("148063"), !options)) || (stryMutAct_9fa48("148064") ? options.adapter : (stryCov_9fa48("148064"), !options.adapter)))) {
        if (stryMutAct_9fa48("148065")) {
          {}
        } else {
          stryCov_9fa48("148065");
          throw new Error(PG_HANDLER_ERROR.ADAPTER_REQUIRED);
        }
      }
      if (stryMutAct_9fa48("148068") ? false : stryMutAct_9fa48("148067") ? true : stryMutAct_9fa48("148066") ? options.socket : (stryCov_9fa48("148066", "148067", "148068"), !options.socket)) {
        if (stryMutAct_9fa48("148069")) {
          {}
        } else {
          stryCov_9fa48("148069");
          throw new Error(PG_HANDLER_ERROR.SOCKET_REQUIRED);
        }
      }
      this._adapter = options.adapter;
      this._socket = options.socket;
      this._logger = stryMutAct_9fa48("148072") ? options.logger && console : stryMutAct_9fa48("148071") ? false : stryMutAct_9fa48("148070") ? true : (stryCov_9fa48("148070", "148071", "148072"), options.logger || console);
      this._phase = HANDLER_PHASE.STARTUP;
      this._session = null;
      this._buffer = Buffer.alloc(0);
      this._pid = (stryMutAct_9fa48("148073") ? Math.random() / 0x7FFFFFFF : (stryCov_9fa48("148073"), Math.random() * 0x7FFFFFFF)) | 0;
      this._secretKey = (stryMutAct_9fa48("148074") ? Math.random() / 0x7FFFFFFF : (stryCov_9fa48("148074"), Math.random() * 0x7FFFFFFF)) | 0;
      this._onData = this._onData.bind(this);
      this._onError = this._onError.bind(this);
      this._onClose = this._onClose.bind(this);
    }
  }

  /**
   * Start handling the connection.
   * Attaches socket event listeners and begins protocol handling.
   */
  start() {
    if (stryMutAct_9fa48("148075")) {
      {}
    } else {
      stryCov_9fa48("148075");
      this._socket.on(stryMutAct_9fa48("148076") ? "" : (stryCov_9fa48("148076"), 'data'), this._onData);
      this._socket.on(stryMutAct_9fa48("148077") ? "" : (stryCov_9fa48("148077"), 'error'), this._onError);
      this._socket.on(stryMutAct_9fa48("148078") ? "" : (stryCov_9fa48("148078"), 'close'), this._onClose);
    }
  }

  /**
   * Detach listeners and close session.
   */
  destroy() {
    if (stryMutAct_9fa48("148079")) {
      {}
    } else {
      stryCov_9fa48("148079");
      this._phase = HANDLER_PHASE.CLOSED;
      this._socket.removeListener(stryMutAct_9fa48("148080") ? "" : (stryCov_9fa48("148080"), 'data'), this._onData);
      this._socket.removeListener(stryMutAct_9fa48("148081") ? "" : (stryCov_9fa48("148081"), 'error'), this._onError);
      this._socket.removeListener(stryMutAct_9fa48("148082") ? "" : (stryCov_9fa48("148082"), 'close'), this._onClose);
      if (stryMutAct_9fa48("148085") ? this._session || !this._session.isClosed() : stryMutAct_9fa48("148084") ? false : stryMutAct_9fa48("148083") ? true : (stryCov_9fa48("148083", "148084", "148085"), this._session && (stryMutAct_9fa48("148086") ? this._session.isClosed() : (stryCov_9fa48("148086"), !this._session.isClosed())))) {
        if (stryMutAct_9fa48("148087")) {
          {}
        } else {
          stryCov_9fa48("148087");
          const sid = this._session.sessionId;
          this._adapter.closeSession(sid);
          this._session.close();
        }
      }
      this._buffer = Buffer.alloc(0);
    }
  }

  /**
   * Get the session (for testing).
   * @return {PgWireSession|null}
   */
  getSession() {
    if (stryMutAct_9fa48("148088")) {
      {}
    } else {
      stryCov_9fa48("148088");
      return this._session;
    }
  }

  // --- Socket event handlers ---

  /** @private */
  _onData(chunk) {
    if (stryMutAct_9fa48("148089")) {
      {}
    } else {
      stryCov_9fa48("148089");
      if (stryMutAct_9fa48("148092") ? this._phase !== HANDLER_PHASE.CLOSED : stryMutAct_9fa48("148091") ? false : stryMutAct_9fa48("148090") ? true : (stryCov_9fa48("148090", "148091", "148092"), this._phase === HANDLER_PHASE.CLOSED)) return;
      this._buffer = Buffer.concat(stryMutAct_9fa48("148093") ? [] : (stryCov_9fa48("148093"), [this._buffer, chunk]));
      this._processBuffer();
    }
  }

  /** @private */
  _onError(err) {
    if (stryMutAct_9fa48("148094")) {
      {}
    } else {
      stryCov_9fa48("148094");
      this._logger.debug(PG_HANDLER_LOG.CONNECTION_ERROR, stryMutAct_9fa48("148095") ? {} : (stryCov_9fa48("148095"), {
        error: err.message
      }));
      this.destroy();
    }
  }

  /** @private */
  _onClose() {
    if (stryMutAct_9fa48("148096")) {
      {}
    } else {
      stryCov_9fa48("148096");
      this._logger.debug(PG_HANDLER_LOG.CONNECTION_CLOSED);
      this.destroy();
    }
  }

  // --- Buffer processing ---

  /** @private */
  _processBuffer() {
    if (stryMutAct_9fa48("148097")) {
      {}
    } else {
      stryCov_9fa48("148097");
      if (stryMutAct_9fa48("148100") ? this._phase !== HANDLER_PHASE.STARTUP : stryMutAct_9fa48("148099") ? false : stryMutAct_9fa48("148098") ? true : (stryCov_9fa48("148098", "148099", "148100"), this._phase === HANDLER_PHASE.STARTUP)) {
        if (stryMutAct_9fa48("148101")) {
          {}
        } else {
          stryCov_9fa48("148101");
          this._processStartup();
        }
      } else if (stryMutAct_9fa48("148104") ? this._phase !== HANDLER_PHASE.NORMAL : stryMutAct_9fa48("148103") ? false : stryMutAct_9fa48("148102") ? true : (stryCov_9fa48("148102", "148103", "148104"), this._phase === HANDLER_PHASE.NORMAL)) {
        if (stryMutAct_9fa48("148105")) {
          {}
        } else {
          stryCov_9fa48("148105");
          this._processMessages();
        }
      }
    }
  }

  /**
   * Process startup phase: read startup message (no type byte).
   * @private
   */
  _processStartup() {
    if (stryMutAct_9fa48("148106")) {
      {}
    } else {
      stryCov_9fa48("148106");
      if (stryMutAct_9fa48("148110") ? this._buffer.length >= PG_BUFFER_LIMIT.STARTUP_HEADER_SIZE : stryMutAct_9fa48("148109") ? this._buffer.length <= PG_BUFFER_LIMIT.STARTUP_HEADER_SIZE : stryMutAct_9fa48("148108") ? false : stryMutAct_9fa48("148107") ? true : (stryCov_9fa48("148107", "148108", "148109", "148110"), this._buffer.length < PG_BUFFER_LIMIT.STARTUP_HEADER_SIZE)) {
        if (stryMutAct_9fa48("148111")) {
          {}
        } else {
          stryCov_9fa48("148111");
          return;
        }
      }
      const msgLen = this._buffer.readInt32BE(0);
      if (stryMutAct_9fa48("148115") ? this._buffer.length >= msgLen : stryMutAct_9fa48("148114") ? this._buffer.length <= msgLen : stryMutAct_9fa48("148113") ? false : stryMutAct_9fa48("148112") ? true : (stryCov_9fa48("148112", "148113", "148114", "148115"), this._buffer.length < msgLen)) return;
      const msgBuf = this._buffer.subarray(0, msgLen);
      this._buffer = this._buffer.subarray(msgLen);
      const version = msgBuf.readInt32BE(PG_BUFFER_LIMIT.LENGTH_FIELD_SIZE);

      // Check for SSL request
      if (stryMutAct_9fa48("148118") ? version !== PG_SSL_REQUEST_CODE : stryMutAct_9fa48("148117") ? false : stryMutAct_9fa48("148116") ? true : (stryCov_9fa48("148116", "148117", "148118"), version === PG_SSL_REQUEST_CODE)) {
        if (stryMutAct_9fa48("148119")) {
          {}
        } else {
          stryCov_9fa48("148119");
          // Respond with 'N' (SSL not supported), stay in startup
          this._socket.write(Buffer.from(stryMutAct_9fa48("148120") ? [] : (stryCov_9fa48("148120"), [0x4E]))); // 'N'
          return;
        }
      }
      if (stryMutAct_9fa48("148123") ? version === PG_PROTOCOL_VERSION.CODE : stryMutAct_9fa48("148122") ? false : stryMutAct_9fa48("148121") ? true : (stryCov_9fa48("148121", "148122", "148123"), version !== PG_PROTOCOL_VERSION.CODE)) {
        if (stryMutAct_9fa48("148124")) {
          {}
        } else {
          stryCov_9fa48("148124");
          this._sendError(PG_SEVERITY.FATAL, PG_ERROR_CODE.PROTOCOL_VIOLATION, PG_HANDLER_ERROR.UNSUPPORTED_PROTOCOL_VERSION);
          this._socket.end();
          return;
        }
      }

      // Parse startup parameters (after 4-byte length + 4-byte version)
      const paramsBuf = msgBuf.subarray(8);
      const params = parseStartupParams(paramsBuf);
      this._logger.debug(PG_HANDLER_LOG.STARTUP_RECEIVED, stryMutAct_9fa48("148125") ? {} : (stryCov_9fa48("148125"), {
        user: params.user,
        database: params.database
      }));
      this._handleStartup(params);
    }
  }

  /**
   * Handle startup parameters: create session, send auth ok,
   * parameter statuses, backend key data, and ReadyForQuery.
   *
   * @param {Object} params - Startup parameters.
   * @private
   */
  async _handleStartup(params) {
    if (stryMutAct_9fa48("148126")) {
      {}
    } else {
      stryCov_9fa48("148126");
      const sessionId = stryMutAct_9fa48("148127") ? `` : (stryCov_9fa48("148127"), `pgwire-${randomUUID()}`);
      const tenantId = stryMutAct_9fa48("148130") ? params.database && 'default' : stryMutAct_9fa48("148129") ? false : stryMutAct_9fa48("148128") ? true : (stryCov_9fa48("148128", "148129", "148130"), params.database || (stryMutAct_9fa48("148131") ? "" : (stryCov_9fa48("148131"), 'default')));
      const user = stryMutAct_9fa48("148134") ? params.user && 'anonymous' : stryMutAct_9fa48("148133") ? false : stryMutAct_9fa48("148132") ? true : (stryCov_9fa48("148132", "148133", "148134"), params.user || (stryMutAct_9fa48("148135") ? "" : (stryCov_9fa48("148135"), 'anonymous')));
      try {
        if (stryMutAct_9fa48("148136")) {
          {}
        } else {
          stryCov_9fa48("148136");
          await this._adapter.authenticate(sessionId, stryMutAct_9fa48("148137") ? {} : (stryCov_9fa48("148137"), {
            tenantId,
            user
          }));
        }
      } catch (err) {
        if (stryMutAct_9fa48("148138")) {
          {}
        } else {
          stryCov_9fa48("148138");
          this._sendError(PG_SEVERITY.FATAL, PG_ERROR_CODE.INVALID_AUTHORIZATION, err.message);
          this._socket.end();
          return;
        }
      }
      this._session = new PgWireSession(stryMutAct_9fa48("148139") ? {} : (stryCov_9fa48("148139"), {
        sessionId,
        tenantId,
        user,
        database: stryMutAct_9fa48("148142") ? params.database && null : stryMutAct_9fa48("148141") ? false : stryMutAct_9fa48("148140") ? true : (stryCov_9fa48("148140", "148141", "148142"), params.database || null)
      }));
      this._session.markAuthenticated();

      // AuthenticationOk
      this._socket.write(buildAuthOk());

      // ParameterStatus messages
      for (const [name, value] of Object.entries(PG_SERVER_PARAMS)) {
        if (stryMutAct_9fa48("148143")) {
          {}
        } else {
          stryCov_9fa48("148143");
          this._socket.write(buildParameterStatus(name, value));
        }
      }

      // BackendKeyData
      this._socket.write(buildBackendKeyData(this._pid, this._secretKey));

      // ReadyForQuery
      this._session.markReady();
      this._socket.write(buildReadyForQuery(PG_TRANSACTION_STATE.IDLE));
      this._phase = HANDLER_PHASE.NORMAL;
      this._logger.debug(PG_HANDLER_LOG.AUTH_OK, stryMutAct_9fa48("148144") ? {} : (stryCov_9fa48("148144"), {
        sessionId
      }));

      // Process any remaining buffered data
      if (stryMutAct_9fa48("148148") ? this._buffer.length <= 0 : stryMutAct_9fa48("148147") ? this._buffer.length >= 0 : stryMutAct_9fa48("148146") ? false : stryMutAct_9fa48("148145") ? true : (stryCov_9fa48("148145", "148146", "148147", "148148"), this._buffer.length > 0)) {
        if (stryMutAct_9fa48("148149")) {
          {}
        } else {
          stryCov_9fa48("148149");
          this._processMessages();
        }
      }
    }
  }

  /**
   * Process normal-phase messages (type + length + payload).
   * @private
   */
  _processMessages() {
    if (stryMutAct_9fa48("148150")) {
      {}
    } else {
      stryCov_9fa48("148150");
      while (stryMutAct_9fa48("148153") ? this._buffer.length < PG_BUFFER_LIMIT.MSG_HEADER_SIZE : stryMutAct_9fa48("148152") ? this._buffer.length > PG_BUFFER_LIMIT.MSG_HEADER_SIZE : stryMutAct_9fa48("148151") ? false : (stryCov_9fa48("148151", "148152", "148153"), this._buffer.length >= PG_BUFFER_LIMIT.MSG_HEADER_SIZE)) {
        if (stryMutAct_9fa48("148154")) {
          {}
        } else {
          stryCov_9fa48("148154");
          const type = this._buffer[0];
          const msgLen = this._buffer.readInt32BE(1);
          const totalLen = stryMutAct_9fa48("148155") ? 1 - msgLen : (stryCov_9fa48("148155"), 1 + msgLen);
          if (stryMutAct_9fa48("148159") ? this._buffer.length >= totalLen : stryMutAct_9fa48("148158") ? this._buffer.length <= totalLen : stryMutAct_9fa48("148157") ? false : stryMutAct_9fa48("148156") ? true : (stryCov_9fa48("148156", "148157", "148158", "148159"), this._buffer.length < totalLen)) break;
          const payload = this._buffer.subarray(PG_BUFFER_LIMIT.MSG_HEADER_SIZE, totalLen);
          this._buffer = this._buffer.subarray(totalLen);
          this._dispatchMessage(type, payload);
        }
      }
    }
  }

  /**
   * Dispatch a single frontend message by type.
   *
   * @param {number} type - Message type byte.
   * @param {Buffer} payload - Message payload.
   * @private
   */
  _dispatchMessage(type, payload) {
    if (stryMutAct_9fa48("148160")) {
      {}
    } else {
      stryCov_9fa48("148160");
      switch (type) {
        case PG_FRONTEND_MSG.QUERY:
          if (stryMutAct_9fa48("148161")) {} else {
            stryCov_9fa48("148161");
            this._handleSimpleQuery(payload);
            break;
          }
        case PG_FRONTEND_MSG.PARSE:
          if (stryMutAct_9fa48("148162")) {} else {
            stryCov_9fa48("148162");
            this._handleParse(payload);
            break;
          }
        case PG_FRONTEND_MSG.BIND:
          if (stryMutAct_9fa48("148163")) {} else {
            stryCov_9fa48("148163");
            this._handleBind(payload);
            break;
          }
        case PG_FRONTEND_MSG.DESCRIBE:
          if (stryMutAct_9fa48("148164")) {} else {
            stryCov_9fa48("148164");
            this._handleDescribe(payload);
            break;
          }
        case PG_FRONTEND_MSG.EXECUTE:
          if (stryMutAct_9fa48("148165")) {} else {
            stryCov_9fa48("148165");
            this._handleExecute(payload);
            break;
          }
        case PG_FRONTEND_MSG.SYNC:
          if (stryMutAct_9fa48("148166")) {} else {
            stryCov_9fa48("148166");
            this._handleSync();
            break;
          }
        case PG_FRONTEND_MSG.CLOSE:
          if (stryMutAct_9fa48("148167")) {} else {
            stryCov_9fa48("148167");
            this._handleClose(payload);
            break;
          }
        case PG_FRONTEND_MSG.TERMINATE:
          if (stryMutAct_9fa48("148168")) {} else {
            stryCov_9fa48("148168");
            this._handleTerminate();
            break;
          }
        case PG_FRONTEND_MSG.FLUSH:
          if (stryMutAct_9fa48("148169")) {} else {
            stryCov_9fa48("148169");
            // Flush is a no-op for us (we write immediately)
            break;
          }
        default:
          if (stryMutAct_9fa48("148170")) {} else {
            stryCov_9fa48("148170");
            this._logger.debug(PG_HANDLER_LOG.UNSUPPORTED_MSG, stryMutAct_9fa48("148171") ? {} : (stryCov_9fa48("148171"), {
              type: stryMutAct_9fa48("148172") ? `` : (stryCov_9fa48("148172"), `0x${type.toString(16)}`)
            }));
            this._sendError(PG_SEVERITY.ERROR, PG_ERROR_CODE.FEATURE_NOT_SUPPORTED, (stryMutAct_9fa48("148173") ? `` : (stryCov_9fa48("148173"), `${PG_HANDLER_ERROR.UNKNOWN_MESSAGE_TYPE}: `)) + (stryMutAct_9fa48("148174") ? `` : (stryCov_9fa48("148174"), `0x${type.toString(16)}`)));
            break;
          }
      }
    }
  }

  // --- Simple query protocol ---

  /**
   * Handle a simple Query ('Q') message.
   *
   * Executes the query through PostgresWireAdapter and sends
   * RowDescription + DataRow* + CommandComplete + ReadyForQuery.
   *
   * @param {Buffer} payload - Query message payload.
   * @private
   */
  async _handleSimpleQuery(payload) {
    if (stryMutAct_9fa48("148175")) {
      {}
    } else {
      stryCov_9fa48("148175");
      const {
        query
      } = parseQueryMessage(payload);
      this._logger.debug(PG_HANDLER_LOG.QUERY_RECEIVED, stryMutAct_9fa48("148176") ? {} : (stryCov_9fa48("148176"), {
        sessionId: this._session.sessionId
      }));
      if (stryMutAct_9fa48("148179") ? !query && query.trim().length === 0 : stryMutAct_9fa48("148178") ? false : stryMutAct_9fa48("148177") ? true : (stryCov_9fa48("148177", "148178", "148179"), (stryMutAct_9fa48("148180") ? query : (stryCov_9fa48("148180"), !query)) || (stryMutAct_9fa48("148182") ? query.trim().length !== 0 : stryMutAct_9fa48("148181") ? false : (stryCov_9fa48("148181", "148182"), (stryMutAct_9fa48("148183") ? query.length : (stryCov_9fa48("148183"), query.trim().length)) === 0)))) {
        if (stryMutAct_9fa48("148184")) {
          {}
        } else {
          stryCov_9fa48("148184");
          this._socket.write(buildEmptyQueryResponse());
          this._socket.write(buildReadyForQuery(this._session.getTransactionState()));
          return;
        }
      }

      // Check for failed transaction state
      if (stryMutAct_9fa48("148186") ? false : stryMutAct_9fa48("148185") ? true : (stryCov_9fa48("148185", "148186"), this._session.isInFailedTransaction())) {
        if (stryMutAct_9fa48("148187")) {
          {}
        } else {
          stryCov_9fa48("148187");
          const upper = stryMutAct_9fa48("148189") ? query.trimEnd().toUpperCase() : stryMutAct_9fa48("148188") ? query.trimStart().toLowerCase() : (stryCov_9fa48("148188", "148189"), query.trimStart().toUpperCase());
          if (stryMutAct_9fa48("148192") ? false : stryMutAct_9fa48("148191") ? true : stryMutAct_9fa48("148190") ? upper.startsWith('ROLLBACK') : (stryCov_9fa48("148190", "148191", "148192"), !(stryMutAct_9fa48("148193") ? upper.endsWith('ROLLBACK') : (stryCov_9fa48("148193"), upper.startsWith(stryMutAct_9fa48("148194") ? "" : (stryCov_9fa48("148194"), 'ROLLBACK')))))) {
            if (stryMutAct_9fa48("148195")) {
              {}
            } else {
              stryCov_9fa48("148195");
              this._sendError(PG_SEVERITY.ERROR, PG_ERROR_CODE.IN_FAILED_TRANSACTION, (stryMutAct_9fa48("148196") ? "" : (stryCov_9fa48("148196"), 'current transaction is aborted, commands ignored ')) + (stryMutAct_9fa48("148197") ? "" : (stryCov_9fa48("148197"), 'until end of transaction block')));
              this._socket.write(buildReadyForQuery(this._session.getTransactionState()));
              return;
            }
          }
        }
      }
      await this._executeAndSend(query, stryMutAct_9fa48("148198") ? ["Stryker was here"] : (stryCov_9fa48("148198"), []));
      this._socket.write(buildReadyForQuery(this._session.getTransactionState()));
    }
  }

  // --- Extended query protocol ---

  /**
   * Handle Parse ('P') message.
   * Stores the prepared statement in session state.
   *
   * @param {Buffer} payload
   * @private
   */
  _handleParse(payload) {
    if (stryMutAct_9fa48("148199")) {
      {}
    } else {
      stryCov_9fa48("148199");
      const {
        name,
        query,
        paramTypes
      } = parseParseMessage(payload);
      this._logger.debug(PG_HANDLER_LOG.PARSE_RECEIVED, stryMutAct_9fa48("148200") ? {} : (stryCov_9fa48("148200"), {
        sessionId: this._session.sessionId,
        name: stryMutAct_9fa48("148203") ? name && '(unnamed)' : stryMutAct_9fa48("148202") ? false : stryMutAct_9fa48("148201") ? true : (stryCov_9fa48("148201", "148202", "148203"), name || (stryMutAct_9fa48("148204") ? "" : (stryCov_9fa48("148204"), '(unnamed)')))
      }));
      this._session.setPreparedStatement(name, query, paramTypes);
      this._socket.write(buildParseComplete());
    }
  }

  /**
   * Handle Bind ('B') message.
   * Binds parameters to a prepared statement, creating a portal.
   *
   * @param {Buffer} payload
   * @private
   */
  _handleBind(payload) {
    if (stryMutAct_9fa48("148205")) {
      {}
    } else {
      stryCov_9fa48("148205");
      const {
        portal,
        statement,
        params
      } = parseBindMessage(payload);
      this._logger.debug(PG_HANDLER_LOG.BIND_RECEIVED, stryMutAct_9fa48("148206") ? {} : (stryCov_9fa48("148206"), {
        sessionId: this._session.sessionId,
        portal: stryMutAct_9fa48("148209") ? portal && '(unnamed)' : stryMutAct_9fa48("148208") ? false : stryMutAct_9fa48("148207") ? true : (stryCov_9fa48("148207", "148208", "148209"), portal || (stryMutAct_9fa48("148210") ? "" : (stryCov_9fa48("148210"), '(unnamed)'))),
        statement: stryMutAct_9fa48("148213") ? statement && '(unnamed)' : stryMutAct_9fa48("148212") ? false : stryMutAct_9fa48("148211") ? true : (stryCov_9fa48("148211", "148212", "148213"), statement || (stryMutAct_9fa48("148214") ? "" : (stryCov_9fa48("148214"), '(unnamed)')))
      }));
      const stmt = this._session.getPreparedStatement(statement);
      if (stryMutAct_9fa48("148217") ? false : stryMutAct_9fa48("148216") ? true : stryMutAct_9fa48("148215") ? stmt : (stryCov_9fa48("148215", "148216", "148217"), !stmt)) {
        if (stryMutAct_9fa48("148218")) {
          {}
        } else {
          stryCov_9fa48("148218");
          this._sendError(PG_SEVERITY.ERROR, PG_ERROR_CODE.INTERNAL_ERROR, (stryMutAct_9fa48("148219") ? `` : (stryCov_9fa48("148219"), `${PGWIRE_SESSION_ERROR.STATEMENT_NOT_FOUND}: `)) + (stryMutAct_9fa48("148220") ? `` : (stryCov_9fa48("148220"), `'${statement}'`)));
          return;
        }
      }
      this._session.setPortal(portal, statement, params);
      this._socket.write(buildBindComplete());
    }
  }

  /**
   * Handle Describe ('D') message.
   * Returns RowDescription for a statement or portal.
   *
   * @param {Buffer} payload
   * @private
   */
  _handleDescribe(payload) {
    if (stryMutAct_9fa48("148221")) {
      {}
    } else {
      stryCov_9fa48("148221");
      const {
        type,
        name
      } = parseDescribeMessage(payload);
      if (stryMutAct_9fa48("148224") ? type !== PG_DESCRIBE_TYPE.STATEMENT : stryMutAct_9fa48("148223") ? false : stryMutAct_9fa48("148222") ? true : (stryCov_9fa48("148222", "148223", "148224"), type === PG_DESCRIBE_TYPE.STATEMENT)) {
        if (stryMutAct_9fa48("148225")) {
          {}
        } else {
          stryCov_9fa48("148225");
          const stmt = this._session.getPreparedStatement(name);
          if (stryMutAct_9fa48("148228") ? false : stryMutAct_9fa48("148227") ? true : stryMutAct_9fa48("148226") ? stmt : (stryCov_9fa48("148226", "148227", "148228"), !stmt)) {
            if (stryMutAct_9fa48("148229")) {
              {}
            } else {
              stryCov_9fa48("148229");
              this._sendError(PG_SEVERITY.ERROR, PG_ERROR_CODE.INTERNAL_ERROR, stryMutAct_9fa48("148230") ? `` : (stryCov_9fa48("148230"), `${PGWIRE_SESSION_ERROR.STATEMENT_NOT_FOUND}: '${name}'`));
              return;
            }
          }
          // We don't know columns until execution; send NoData
          this._socket.write(buildNoData());
        }
      } else if (stryMutAct_9fa48("148233") ? type !== PG_DESCRIBE_TYPE.PORTAL : stryMutAct_9fa48("148232") ? false : stryMutAct_9fa48("148231") ? true : (stryCov_9fa48("148231", "148232", "148233"), type === PG_DESCRIBE_TYPE.PORTAL)) {
        if (stryMutAct_9fa48("148234")) {
          {}
        } else {
          stryCov_9fa48("148234");
          const portal = this._session.getPortal(name);
          if (stryMutAct_9fa48("148237") ? false : stryMutAct_9fa48("148236") ? true : stryMutAct_9fa48("148235") ? portal : (stryCov_9fa48("148235", "148236", "148237"), !portal)) {
            if (stryMutAct_9fa48("148238")) {
              {}
            } else {
              stryCov_9fa48("148238");
              this._sendError(PG_SEVERITY.ERROR, PG_ERROR_CODE.INTERNAL_ERROR, stryMutAct_9fa48("148239") ? `` : (stryCov_9fa48("148239"), `Portal not found: '${name}'`));
              return;
            }
          }
          // We don't know columns until execution; send NoData
          this._socket.write(buildNoData());
        }
      } else {
        if (stryMutAct_9fa48("148240")) {
          {}
        } else {
          stryCov_9fa48("148240");
          this._sendError(PG_SEVERITY.ERROR, PG_ERROR_CODE.PROTOCOL_VIOLATION, stryMutAct_9fa48("148241") ? `` : (stryCov_9fa48("148241"), `Invalid describe target type: ${type}`));
        }
      }
    }
  }

  /**
   * Handle Execute ('E') message.
   * Executes a portal through the adapter.
   *
   * @param {Buffer} payload
   * @private
   */
  async _handleExecute(payload) {
    if (stryMutAct_9fa48("148242")) {
      {}
    } else {
      stryCov_9fa48("148242");
      const {
        portal: portalName
      } = parseExecuteMessage(payload);
      this._logger.debug(PG_HANDLER_LOG.EXECUTE_RECEIVED, stryMutAct_9fa48("148243") ? {} : (stryCov_9fa48("148243"), {
        sessionId: this._session.sessionId,
        portal: stryMutAct_9fa48("148246") ? portalName && '(unnamed)' : stryMutAct_9fa48("148245") ? false : stryMutAct_9fa48("148244") ? true : (stryCov_9fa48("148244", "148245", "148246"), portalName || (stryMutAct_9fa48("148247") ? "" : (stryCov_9fa48("148247"), '(unnamed)')))
      }));
      const portal = this._session.getPortal(portalName);
      if (stryMutAct_9fa48("148250") ? false : stryMutAct_9fa48("148249") ? true : stryMutAct_9fa48("148248") ? portal : (stryCov_9fa48("148248", "148249", "148250"), !portal)) {
        if (stryMutAct_9fa48("148251")) {
          {}
        } else {
          stryCov_9fa48("148251");
          this._sendError(PG_SEVERITY.ERROR, PG_ERROR_CODE.INTERNAL_ERROR, stryMutAct_9fa48("148252") ? `` : (stryCov_9fa48("148252"), `Portal not found: '${portalName}'`));
          return;
        }
      }
      const stmt = this._session.getPreparedStatement(portal.statementName);
      if (stryMutAct_9fa48("148255") ? false : stryMutAct_9fa48("148254") ? true : stryMutAct_9fa48("148253") ? stmt : (stryCov_9fa48("148253", "148254", "148255"), !stmt)) {
        if (stryMutAct_9fa48("148256")) {
          {}
        } else {
          stryCov_9fa48("148256");
          this._sendError(PG_SEVERITY.ERROR, PG_ERROR_CODE.INTERNAL_ERROR, (stryMutAct_9fa48("148257") ? `` : (stryCov_9fa48("148257"), `${PGWIRE_SESSION_ERROR.STATEMENT_NOT_FOUND}: `)) + (stryMutAct_9fa48("148258") ? `` : (stryCov_9fa48("148258"), `'${portal.statementName}'`)));
          return;
        }
      }

      // Check for failed transaction state
      if (stryMutAct_9fa48("148260") ? false : stryMutAct_9fa48("148259") ? true : (stryCov_9fa48("148259", "148260"), this._session.isInFailedTransaction())) {
        if (stryMutAct_9fa48("148261")) {
          {}
        } else {
          stryCov_9fa48("148261");
          const upper = stryMutAct_9fa48("148263") ? stmt.query.trimEnd().toUpperCase() : stryMutAct_9fa48("148262") ? stmt.query.trimStart().toLowerCase() : (stryCov_9fa48("148262", "148263"), stmt.query.trimStart().toUpperCase());
          if (stryMutAct_9fa48("148266") ? false : stryMutAct_9fa48("148265") ? true : stryMutAct_9fa48("148264") ? upper.startsWith('ROLLBACK') : (stryCov_9fa48("148264", "148265", "148266"), !(stryMutAct_9fa48("148267") ? upper.endsWith('ROLLBACK') : (stryCov_9fa48("148267"), upper.startsWith(stryMutAct_9fa48("148268") ? "" : (stryCov_9fa48("148268"), 'ROLLBACK')))))) {
            if (stryMutAct_9fa48("148269")) {
              {}
            } else {
              stryCov_9fa48("148269");
              this._sendError(PG_SEVERITY.ERROR, PG_ERROR_CODE.IN_FAILED_TRANSACTION, (stryMutAct_9fa48("148270") ? "" : (stryCov_9fa48("148270"), 'current transaction is aborted, commands ignored ')) + (stryMutAct_9fa48("148271") ? "" : (stryCov_9fa48("148271"), 'until end of transaction block')));
              return;
            }
          }
        }
      }
      await this._executeAndSend(stmt.query, portal.params);
    }
  }

  /**
   * Handle Sync ('S') message.
   * Ends an extended query cycle and sends ReadyForQuery.
   * @private
   */
  _handleSync() {
    if (stryMutAct_9fa48("148272")) {
      {}
    } else {
      stryCov_9fa48("148272");
      this._logger.debug(PG_HANDLER_LOG.SYNC_RECEIVED, stryMutAct_9fa48("148273") ? {} : (stryCov_9fa48("148273"), {
        sessionId: this._session.sessionId
      }));
      this._socket.write(buildReadyForQuery(this._session.getTransactionState()));
    }
  }

  /**
   * Handle Close ('C') message.
   * Closes a prepared statement or portal.
   *
   * @param {Buffer} payload
   * @private
   */
  _handleClose(payload) {
    if (stryMutAct_9fa48("148274")) {
      {}
    } else {
      stryCov_9fa48("148274");
      const {
        type,
        name
      } = parseCloseMessage(payload);
      if (stryMutAct_9fa48("148277") ? type !== PG_CLOSE_TYPE.STATEMENT : stryMutAct_9fa48("148276") ? false : stryMutAct_9fa48("148275") ? true : (stryCov_9fa48("148275", "148276", "148277"), type === PG_CLOSE_TYPE.STATEMENT)) {
        if (stryMutAct_9fa48("148278")) {
          {}
        } else {
          stryCov_9fa48("148278");
          this._session.closePreparedStatement(name);
        }
      } else if (stryMutAct_9fa48("148281") ? type !== PG_CLOSE_TYPE.PORTAL : stryMutAct_9fa48("148280") ? false : stryMutAct_9fa48("148279") ? true : (stryCov_9fa48("148279", "148280", "148281"), type === PG_CLOSE_TYPE.PORTAL)) {
        if (stryMutAct_9fa48("148282")) {
          {}
        } else {
          stryCov_9fa48("148282");
          this._session.closePortal(name);
        }
      }
      this._socket.write(buildCloseComplete());
    }
  }

  /**
   * Handle Terminate ('X') message.
   * @private
   */
  _handleTerminate() {
    if (stryMutAct_9fa48("148283")) {
      {}
    } else {
      stryCov_9fa48("148283");
      this._logger.debug(PG_HANDLER_LOG.TERMINATE_RECEIVED, stryMutAct_9fa48("148284") ? {} : (stryCov_9fa48("148284"), {
        sessionId: stryMutAct_9fa48("148285") ? this._session.sessionId : (stryCov_9fa48("148285"), this._session?.sessionId)
      }));
      this.destroy();
      this._socket.end();
    }
  }

  // --- Shared execution ---

  /**
   * Execute a query through the adapter and send result messages.
   *
   * Updates transaction state based on query type and result.
   * Sends RowDescription + DataRow* + CommandComplete on success,
   * or ErrorResponse on failure.
   *
   * @param {string} query - SQL query text.
   * @param {unknown[]} params - Bind parameters.
   * @private
   */
  async _executeAndSend(query, params) {
    if (stryMutAct_9fa48("148286")) {
      {}
    } else {
      stryCov_9fa48("148286");
      const upper = stryMutAct_9fa48("148288") ? query.trimEnd().toUpperCase() : stryMutAct_9fa48("148287") ? query.trimStart().toLowerCase() : (stryCov_9fa48("148287", "148288"), query.trimStart().toUpperCase());

      // Track transaction state transitions
      if (stryMutAct_9fa48("148291") ? upper.endsWith('BEGIN') : stryMutAct_9fa48("148290") ? false : stryMutAct_9fa48("148289") ? true : (stryCov_9fa48("148289", "148290", "148291"), upper.startsWith(stryMutAct_9fa48("148292") ? "" : (stryCov_9fa48("148292"), 'BEGIN')))) {
        if (stryMutAct_9fa48("148293")) {
          {}
        } else {
          stryCov_9fa48("148293");
          this._session.setTransactionState(PG_TRANSACTION_STATE.IN_TRANSACTION);
        }
      }
      try {
        if (stryMutAct_9fa48("148294")) {
          {}
        } else {
          stryCov_9fa48("148294");
          const result = await this._adapter.execute(this._session.sessionId, query, params);

          // Send result set for SELECT-like queries
          const columns = extractColumns(result);
          if (stryMutAct_9fa48("148297") ? columns.length > 0 || Array.isArray(result?.rows) : stryMutAct_9fa48("148296") ? false : stryMutAct_9fa48("148295") ? true : (stryCov_9fa48("148295", "148296", "148297"), (stryMutAct_9fa48("148300") ? columns.length <= 0 : stryMutAct_9fa48("148299") ? columns.length >= 0 : stryMutAct_9fa48("148298") ? true : (stryCov_9fa48("148298", "148299", "148300"), columns.length > 0)) && Array.isArray(stryMutAct_9fa48("148301") ? result.rows : (stryCov_9fa48("148301"), result?.rows)))) {
            if (stryMutAct_9fa48("148302")) {
              {}
            } else {
              stryCov_9fa48("148302");
              this._socket.write(buildRowDescription(columns));
              for (const row of result.rows) {
                if (stryMutAct_9fa48("148303")) {
                  {}
                } else {
                  stryCov_9fa48("148303");
                  const values = extractRowValues(row, columns);
                  this._socket.write(buildDataRow(values));
                }
              }
            }
          }
          const tag = deriveCommandTag(result, query);
          this._socket.write(buildCommandComplete(tag));

          // Update transaction state on COMMIT/ROLLBACK
          if (stryMutAct_9fa48("148306") ? upper.startsWith('COMMIT') && upper.startsWith('ROLLBACK') : stryMutAct_9fa48("148305") ? false : stryMutAct_9fa48("148304") ? true : (stryCov_9fa48("148304", "148305", "148306"), (stryMutAct_9fa48("148307") ? upper.endsWith('COMMIT') : (stryCov_9fa48("148307"), upper.startsWith(stryMutAct_9fa48("148308") ? "" : (stryCov_9fa48("148308"), 'COMMIT')))) || (stryMutAct_9fa48("148309") ? upper.endsWith('ROLLBACK') : (stryCov_9fa48("148309"), upper.startsWith(stryMutAct_9fa48("148310") ? "" : (stryCov_9fa48("148310"), 'ROLLBACK')))))) {
            if (stryMutAct_9fa48("148311")) {
              {}
            } else {
              stryCov_9fa48("148311");
              this._session.setTransactionState(PG_TRANSACTION_STATE.IDLE);
            }
          }
        }
      } catch (err) {
        if (stryMutAct_9fa48("148312")) {
          {}
        } else {
          stryCov_9fa48("148312");
          // On error in a transaction, mark as failed
          if (stryMutAct_9fa48("148315") ? this._session.getTransactionState() !== PG_TRANSACTION_STATE.IN_TRANSACTION : stryMutAct_9fa48("148314") ? false : stryMutAct_9fa48("148313") ? true : (stryCov_9fa48("148313", "148314", "148315"), this._session.getTransactionState() === PG_TRANSACTION_STATE.IN_TRANSACTION)) {
            if (stryMutAct_9fa48("148316")) {
              {}
            } else {
              stryCov_9fa48("148316");
              this._session.setTransactionState(PG_TRANSACTION_STATE.FAILED);
            }
          }
          this._sendError(PG_SEVERITY.ERROR, PG_ERROR_CODE.INTERNAL_ERROR, err.message);
        }
      }
    }
  }

  // --- Error sending ---

  /**
   * Send an ErrorResponse message to the client.
   *
   * @param {string} severity - PG_SEVERITY value.
   * @param {string} code - SQLSTATE code.
   * @param {string} message - Error message.
   * @private
   */
  _sendError(severity, code, message) {
    if (stryMutAct_9fa48("148317")) {
      {}
    } else {
      stryCov_9fa48("148317");
      this._socket.write(buildErrorResponse(severity, code, message));
    }
  }
}
export { PgWireProtocolHandler, HANDLER_PHASE,
// Message builders (exported for testing)
buildAuthOk, buildParameterStatus, buildBackendKeyData, buildReadyForQuery, buildErrorResponse, buildRowDescription, buildDataRow, buildCommandComplete, buildParseComplete, buildBindComplete, buildCloseComplete, buildNoData, buildEmptyQueryResponse,
// Parsers (exported for testing)
parseStartupParams, parseQueryMessage, parseParseMessage, parseBindMessage, parseDescribeMessage, parseExecuteMessage, parseCloseMessage,
// Helpers (exported for testing)
deriveCommandTag, extractColumns, extractRowValues, writeCString, readCString };