const MOUNT_HOST_PATTERN = /^(?:\*|[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::\d{1,5})?)$/u;
const MOUNT_PATH_PREFIX_PATTERN = /^\/(?:[a-zA-Z0-9._~-]+(?:\/[a-zA-Z0-9._~-]+)*)?$/u;
const ABSOLUTE_HTTP_URL_PATTERN = /^(https?):\/\/([^/?#]+)(\/[^#]*)?$/iu;
const FORBIDDEN_ENCODED_PATH_SEPARATOR_PATTERN = /%(?:2f|5c|00)/iu;
const INVALID_PERCENT_ENCODING_PATTERN = /%(?![0-9a-fA-F]{2})/u;
const DEFAULT_MOUNT_HOST = '*';
const ANY_REQUEST_METHOD = 'ANY';
const ROOT_PATH_PREFIX = '/';
const PATH_SEPARATOR = '/';
const QUERY_SEPARATOR = '?';
const FRAGMENT_SEPARATOR = '#';
const BACKSLASH_CHAR = '\\';
const NULL_CHAR = '\0';
const DOUBLE_SLASH = '//';
const DOT_SEGMENT_SINGLE = '.';
const DOT_SEGMENT_DOUBLE = '..';
const DEFAULT_CANONICAL_SCHEME = 'http';
const DEFAULT_CANONICAL_HOST = 'localhost';
const REQUEST_SOURCE_KIND = 'request';
const INVALID_ADMITTED_URL_MESSAGE =
  'request URL contains invalid or ambiguous path encoding';

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isValidMountPathPrefix(pathPrefix) {
  if (
    typeof pathPrefix !== 'string' ||
    !MOUNT_PATH_PREFIX_PATTERN.test(pathPrefix)
  ) {
    return false;
  }
  const segments = pathPrefix.split(PATH_SEPARATOR).filter(Boolean);
  return !segments.some(
    (segment) =>
      segment === DOT_SEGMENT_SINGLE || segment === DOT_SEGMENT_DOUBLE,
  );
}

function isSupportedMountMethod(method, requestMethods) {
  return method === ANY_REQUEST_METHOD || requestMethods.includes(method);
}

function normalizeMountRequestSource(source, requestMethods, onInvalid) {
  const hostValue =
    source.host === undefined ? DEFAULT_MOUNT_HOST : source.host;
  if (
    source.path !== undefined ||
    typeof hostValue !== 'string' ||
    !MOUNT_HOST_PATTERN.test(hostValue.toLowerCase()) ||
    !isValidMountPathPrefix(source.path_prefix) ||
    (source.method !== undefined &&
      !isSupportedMountMethod(source.method, requestMethods))
  ) {
    onInvalid();
  }
  const normalized = {
    host: hostValue.toLowerCase(),
    kind: source.kind,
    path_prefix: source.path_prefix,
  };
  if (source.method !== undefined) {
    normalized.method = source.method;
  }
  return normalized;
}

function matchesMountPathPrefix(requestPath, pathPrefix) {
  if (
    typeof requestPath !== 'string' ||
    typeof pathPrefix !== 'string' ||
    !requestPath.startsWith(ROOT_PATH_PREFIX) ||
    !pathPrefix.startsWith(ROOT_PATH_PREFIX)
  ) {
    return false;
  }
  if (pathPrefix === ROOT_PATH_PREFIX) {
    return true;
  }
  return (
    requestPath === pathPrefix ||
    requestPath.startsWith(`${pathPrefix}${PATH_SEPARATOR}`)
  );
}

function normalizeSourceMountDescriptor(source) {
  if (!isPlainObject(source) || source.kind !== REQUEST_SOURCE_KIND) {
    return null;
  }
  const pathPrefix = source.path_prefix ?? source.path;
  if (
    typeof pathPrefix !== 'string' ||
    !pathPrefix.startsWith(ROOT_PATH_PREFIX)
  ) {
    return null;
  }
  const host = typeof source.host === 'string' && source.host.length > 0 ?
    source.host.toLowerCase() :
    DEFAULT_MOUNT_HOST;
  const method = typeof source.method === 'string' && source.method.length > 0 ?
    source.method :
    ANY_REQUEST_METHOD;
  return {host, method, pathPrefix};
}

function mountHostsOverlap(hostA, hostB) {
  return (
    hostA === DEFAULT_MOUNT_HOST ||
    hostB === DEFAULT_MOUNT_HOST ||
    hostA === hostB
  );
}

function mountMethodsOverlap(methodA, methodB) {
  return (
    methodA === ANY_REQUEST_METHOD ||
    methodB === ANY_REQUEST_METHOD ||
    methodA === methodB
  );
}

function mountsOverlap(sourceA, sourceB) {
  const left = normalizeSourceMountDescriptor(sourceA);
  const right = normalizeSourceMountDescriptor(sourceB);
  if (left === null || right === null) {
    return false;
  }
  if (
    !mountHostsOverlap(left.host, right.host) ||
    !mountMethodsOverlap(left.method, right.method)
  ) {
    return false;
  }
  return (
    matchesMountPathPrefix(left.pathPrefix, right.pathPrefix) ||
    matchesMountPathPrefix(right.pathPrefix, left.pathPrefix)
  );
}

function resolveRawTargetInput(rawInput) {
  if (typeof rawInput === 'string') {
    return rawInput;
  }
  return rawInput?.url ?? rawInput?.path;
}

function resolveFallbackHost(rawInput, options) {
  return String(
    rawInput?.host ?? options?.host ?? DEFAULT_CANONICAL_HOST,
  ).toLowerCase();
}

function extractRawUrlParts(rawInput, options, onInvalid) {
  const rawTarget = resolveRawTargetInput(rawInput);
  if (
    typeof rawTarget !== 'string' ||
    rawTarget.length === 0 ||
    rawTarget.includes(FRAGMENT_SEPARATOR)
  ) {
    onInvalid(INVALID_ADMITTED_URL_MESSAGE);
  }
  const absoluteMatch = ABSOLUTE_HTTP_URL_PATTERN.exec(rawTarget);
  if (absoluteMatch) {
    const [, schemeGroup, hostGroup, pathGroup] = absoluteMatch;
    return {
      host: hostGroup.toLowerCase(),
      rawPathAndQuery: pathGroup || ROOT_PATH_PREFIX,
      scheme: schemeGroup.toLowerCase(),
    };
  }
  if (!rawTarget.startsWith(ROOT_PATH_PREFIX)) {
    onInvalid(INVALID_ADMITTED_URL_MESSAGE);
  }
  return {
    host: resolveFallbackHost(rawInput, options),
    rawPathAndQuery: rawTarget,
    scheme: DEFAULT_CANONICAL_SCHEME,
  };
}

function splitPathAndQuery(rawPathAndQuery) {
  const queryIndex = rawPathAndQuery.indexOf(QUERY_SEPARATOR);
  if (queryIndex < 0) {
    return {hasQuery: false, rawPath: rawPathAndQuery, rawQuery: ''};
  }
  return {
    hasQuery: true,
    rawPath: rawPathAndQuery.slice(0, queryIndex),
    rawQuery: rawPathAndQuery.slice(queryIndex + 1),
  };
}

function assertSafeRawPathAndQuery(rawPath, rawQuery, onInvalid) {
  if (
    !rawPath.startsWith(ROOT_PATH_PREFIX) ||
    rawPath.includes(BACKSLASH_CHAR) ||
    rawPath.includes(NULL_CHAR) ||
    rawPath.includes(DOUBLE_SLASH) ||
    FORBIDDEN_ENCODED_PATH_SEPARATOR_PATTERN.test(rawPath) ||
    INVALID_PERCENT_ENCODING_PATTERN.test(rawPath) ||
    INVALID_PERCENT_ENCODING_PATTERN.test(rawQuery)
  ) {
    onInvalid(INVALID_ADMITTED_URL_MESSAGE);
  }
}

function decodeAndValidatePathSegments(rawPath, onInvalid) {
  if (rawPath === ROOT_PATH_PREFIX) {
    return [];
  }
  const rawSegments = rawPath.slice(1).split(PATH_SEPARATOR);
  const decodedSegments = [];
  for (const rawSegment of rawSegments) {
    let decoded;
    try {
      decoded = decodeURIComponent(rawSegment);
    } catch (_error) {
      onInvalid(INVALID_ADMITTED_URL_MESSAGE);
    }
    if (
      decoded.length === 0 ||
      decoded === DOT_SEGMENT_SINGLE ||
      decoded === DOT_SEGMENT_DOUBLE ||
      decoded.includes(PATH_SEPARATOR) ||
      decoded.includes(BACKSLASH_CHAR) ||
      decoded.includes(NULL_CHAR)
    ) {
      onInvalid(INVALID_ADMITTED_URL_MESSAGE);
    }
    decodedSegments.push(decoded);
  }
  return decodedSegments;
}

function canonicalizeAdmittedRequestUrlWithFailure(
  rawInput,
  options = {},
  onInvalid,
) {
  const {host, rawPathAndQuery, scheme} = extractRawUrlParts(
    rawInput,
    options,
    onInvalid,
  );
  const {hasQuery, rawPath, rawQuery} = splitPathAndQuery(rawPathAndQuery);
  assertSafeRawPathAndQuery(rawPath, rawQuery, onInvalid);
  const decodedSegments = decodeAndValidatePathSegments(rawPath, onInvalid);
  const decodedPath = decodedSegments.length === 0 ?
    ROOT_PATH_PREFIX :
    `${ROOT_PATH_PREFIX}${decodedSegments.join(PATH_SEPARATOR)}`;
  const querySuffix = hasQuery ? `${QUERY_SEPARATOR}${rawQuery}` : '';
  return Object.freeze({
    host,
    path: decodedPath,
    query: rawQuery,
    rawPath,
    url: `${scheme}://${host}${rawPath}${querySuffix}`,
  });
}

export {
  canonicalizeAdmittedRequestUrlWithFailure,
  matchesMountPathPrefix,
  mountsOverlap,
  normalizeMountRequestSource,
};
