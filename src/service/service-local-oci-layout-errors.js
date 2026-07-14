const SERVICE_LOCAL_OCI_LAYOUT_ERROR_CODE = Object.freeze({
  BLOB_READ_FAILED: 'blob_read_failed',
  DESCRIPTOR_INVALID: 'descriptor_invalid',
  DESCRIPTOR_SIZE_MISMATCH: 'descriptor_size_mismatch',
  DIGEST_MISMATCH: 'digest_mismatch',
  EXPORT_FAILED: 'export_failed',
  INPUT_INVALID: 'input_invalid',
  LAYOUT_INVALID: 'layout_invalid',
  MEDIA_TYPE_MISMATCH: 'media_type_mismatch',
  OUTPUT_ROOT_INVALID: 'output_root_invalid',
});

const SERVICE_LOCAL_OCI_LAYOUT_PATH = Object.freeze({
  CONTAINER: '/container',
  CONTAINER_BUILD_ARGS: '/container/buildArgs',
  CONTAINER_CONTEXT: '/container/contextPath',
  CONTAINER_DOCKERFILE: '/container/dockerfilePath',
  CONTAINER_SOURCE_FINGERPRINT: '/container/sourceFingerprint',
  INDEX_MANIFEST: '/index.json/manifests/0',
  INDEX_MANIFEST_MEDIA: '/index.json/manifests/0/mediaType',
  INDEX_MANIFEST_PLATFORM: '/index.json/manifests/0/platform',
  INDEX_MANIFESTS: '/index.json/manifests',
  INDEX: '/index.json',
  MANIFEST: '/manifest',
  MANIFEST_CONFIG: '/manifest/config',
  OCI_LAYOUT_VERSION: '/oci-layout/imageLayoutVersion',
  OCI_LAYOUT: '/oci-layout',
  OUTPUT_ROOT: '/outputRoot',
  PLATFORM: '/platform',
  REQUEST: '/',
  RUNTIME_KIND: '/runtimeKind',
  SOURCE_DATE_EPOCH: '/sourceDateEpoch',
  WASM: '/wasm',
  WASM_PAYLOAD: '/wasm/payloadPath',
});

const SERVICE_LOCAL_OCI_LAYOUT_FAILURE_MESSAGE = Object.freeze({
  BLOB_DIGEST_MISMATCH: 'OCI blob digest does not match its descriptor',
  BLOB_MISSING: 'referenced OCI blob is missing',
  BLOB_NOT_FILE: 'referenced OCI blob is not a regular file',
  BLOB_READ_FAILED: 'referenced OCI blob could not be read',
  BLOB_SIZE_MISMATCH: 'OCI blob size does not match its descriptor',
  BUILD_ARGS_INVALID: 'buildArgs must be an object',
  BUILD_ARGS_VALUES_INVALID:
    'build argument names and string values must be explicit',
  BUILD_REQUEST_INVALID: 'build request must be an object',
  CONTAINER_EXPORT_FAILED: 'container OCI layout export failed',
  CONTAINER_INPUT_INVALID: 'one container context input is required',
  CONTAINER_MEDIA_INVALID:
    'container layout contains a non-container config or layer media type',
  CONTAINER_PATHS_INVALID:
    'container context and Dockerfile types are invalid',
  CONTAINER_PATHS_UNREADABLE:
    'container context and Dockerfile must be readable',
  DESCRIPTOR_INVALID: 'OCI descriptor is invalid',
  DOCKERFILE_OUTSIDE_CONTEXT:
    'Dockerfile must be contained by the build context',
  EXISTING_LAYOUT_MISMATCH:
    'existing digest-addressed layout has a different manifest',
  EXPORTER_INVALID: 'containerExporter.exportLayout must be a function',
  LAYOUT_FILE_INVALID:
    'OCI layout metadata file is invalid or exceeds its bound',
  LAYOUT_FILE_UNREADABLE: 'OCI layout file could not be read',
  LAYOUT_JSON_INVALID: 'OCI layout JSON is invalid',
  LAYOUT_MANIFEST_CARDINALITY:
    'OCI image layout must select exactly one manifest',
  LAYOUT_ROOT_INVALID: 'OCI layout root must be a real directory',
  LAYOUT_VERSION_INVALID: 'OCI image layout version is unsupported',
  MANIFEST_JSON_INVALID: 'OCI image manifest JSON is invalid',
  MANIFEST_SHAPE_INVALID: 'OCI image manifest shape is invalid',
  OUTPUT_ROOT_INVALID: 'output root must be a real directory',
  OUTPUT_ROOT_UNAVAILABLE: 'output root could not be prepared',
  PLATFORM_INVALID: 'platform must use os/architecture[/variant] syntax',
  PLATFORM_MISMATCH: 'OCI top descriptor platform does not match the request',
  RUNTIME_KIND_INVALID: 'an external service runtime kind is required',
  SOURCE_DATE_EPOCH_INVALID:
    'sourceDateEpoch must be a non-negative safe integer',
  SOURCE_FINGERPRINT_INVALID: 'source fingerprint must be sha256',
  STRING_REQUIRED: 'a non-empty string is required',
  TOP_MEDIA_INVALID: 'top descriptor must be an OCI image manifest',
  WASM_INPUT_INVALID: 'one prebuilt WASM input is required',
  WASM_MEDIA_INVALID:
    'WASM layout requires one application/wasm layer and empty config',
  WASM_PAYLOAD_INVALID: 'WASM payload must be a regular file',
  WASM_PAYLOAD_UNREADABLE: 'WASM payload could not be read',
});

class ServiceLocalOciLayoutFailure extends Error {
  constructor(code, pathValue, message, options = {}) {
    super(message, options);
    this.code = code;
    this.pathValue = pathValue;
  }
}

function failServiceLocalOciLayout(code, pathValue, message, cause) {
  const options = cause === undefined ? {} : {cause};
  throw new ServiceLocalOciLayoutFailure(code, pathValue, message, options);
}

export {
  SERVICE_LOCAL_OCI_LAYOUT_ERROR_CODE,
  SERVICE_LOCAL_OCI_LAYOUT_FAILURE_MESSAGE,
  SERVICE_LOCAL_OCI_LAYOUT_PATH,
  ServiceLocalOciLayoutFailure,
  failServiceLocalOciLayout,
};
