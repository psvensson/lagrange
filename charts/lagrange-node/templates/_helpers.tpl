{{/* Chart name */}}
{{- define "lagrange-node.name" -}}
{{- .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Fully qualified base name. Truncated to 45 so the longest derived names stay
inside the 63-char DNS-label limit: StatefulSet pod hostnames append
"-joiner-<ordinal>" and the headless service appends "-hl".
*/}}
{{- define "lagrange-node.fullname" -}}
{{- if contains .Chart.Name .Release.Name -}}
{{- .Release.Name | trunc 45 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 45 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{/* Headless service name — the DNS domain every pod gets its stable identity in */}}
{{- define "lagrange-node.headlessService" -}}
{{- printf "%s-hl" (include "lagrange-node.fullname" .) -}}
{{- end -}}

{{/* Common labels */}}
{{- define "lagrange-node.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
app.kubernetes.io/name: {{ include "lagrange-node.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/* Selector labels shared by every node pod (seed and joiners) */}}
{{- define "lagrange-node.selectorLabels" -}}
app.kubernetes.io/name: {{ include "lagrange-node.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/* Image reference */}}
{{- define "lagrange-node.image" -}}
{{- printf "%s:%s" .Values.image.repository (.Values.image.tag | default .Chart.AppVersion) -}}
{{- end -}}

{{/* Canonical listener-port family. Optional WS values derive from REST. */}}
{{- define "lagrange-node.integerListenerPort" -}}
{{- $name := index . 0 -}}
{{- $value := index . 1 -}}
{{- $numericKinds := list "int" "int8" "int16" "int32" "int64" "uint" "uint8" "uint16" "uint32" "uint64" "float32" "float64" -}}
{{- if not (has (kindOf $value) $numericKinds) -}}
{{- fail (printf "%s listener port must be an integer; received %s" $name (kindOf $value)) -}}
{{- end -}}
{{- $integer := int64 $value -}}
{{- if ne (float64 $integer) (float64 $value) -}}
{{- fail (printf "%s listener port must be an integer; received %v" $name $value) -}}
{{- end -}}
{{- $integer -}}
{{- end -}}

{{- define "lagrange-node.restPort" -}}
{{- include "lagrange-node.integerListenerPort" (list "REST" .Values.node.restPort) -}}
{{- end -}}

{{- define "lagrange-node.adminWebsocketPort" -}}
{{- if hasKey .Values.admin "websocketPort" -}}
{{- include "lagrange-node.integerListenerPort" (list "admin WebSocket" .Values.admin.websocketPort) -}}
{{- else -}}
{{- add (int64 (include "lagrange-node.restPort" .)) 1 -}}
{{- end -}}
{{- end -}}

{{- define "lagrange-node.transportWebsocketPort" -}}
{{- if hasKey .Values.node "wsPort" -}}
{{- include "lagrange-node.integerListenerPort" (list "transport WebSocket" .Values.node.wsPort) -}}
{{- else -}}
{{- add (int64 (include "lagrange-node.restPort" .)) 2 -}}
{{- end -}}
{{- end -}}

{{- define "lagrange-node.validateListenerPorts" -}}
{{- $restPort := int64 (include "lagrange-node.restPort" .) -}}
{{- $adminPort := int64 (include "lagrange-node.adminWebsocketPort" .) -}}
{{- $transportPort := int64 (include "lagrange-node.transportWebsocketPort" .) -}}
{{- if or (lt $restPort 1) (gt $restPort 65535) (lt $adminPort 1) (gt $adminPort 65535) (lt $transportPort 1) (gt $transportPort 65535) -}}
{{- fail (printf "listener ports must be between 1 and 65535: REST=%d, admin WS=%d, transport WS=%d" $restPort $adminPort $transportPort) -}}
{{- end -}}
{{- if or (eq $restPort $adminPort) (eq $restPort $transportPort) (eq $adminPort $transportPort) -}}
{{- fail (printf "listener ports must be distinct: REST=%d, admin WS=%d, transport WS=%d" $restPort $adminPort $transportPort) -}}
{{- end -}}
{{- end -}}

{{/*
Fail closed even when an operator skips values.schema.json validation. The
chart does not provide authenticated admin ingress, so neither first-class
values nor extraEnv may make the pod-local admin listener externally reachable.
*/}}
{{- define "lagrange-node.validateAdminSafety" -}}
{{- if ne (toString .Values.admin.websocketHost) "127.0.0.1" -}}
{{- fail "admin.websocketHost must remain 127.0.0.1 (loopback)" -}}
{{- end -}}
{{- if .Values.admin.allowInsecureExternalBind -}}
{{- fail "admin.allowInsecureExternalBind must remain false" -}}
{{- end -}}
{{- range .Values.node.extraEnv -}}
{{- $name := toString .name -}}
{{- if or (eq $name "ADMIN_WEBSOCKET_HOST") (eq $name "ADMIN_ALLOW_INSECURE_EXTERNAL_BIND") (eq $name "ADMIN_WEBSOCKET_PORT") (eq $name "REST_API_PORT") (eq $name "NODE_WS_PORT") -}}
{{- fail (printf "node.extraEnv name %s is reserved by the listener port or admin safety policy" $name) -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/*
Shared container spec for a node. The runtime image is distroless with
ENTRYPOINT /nodejs/bin/node, so `args` supplies everything node receives.
Per-pod stable DNS identity is composed with Kubernetes $(VAR) env expansion
(no shell in the image): the advertised WS address is
<pod>.<headless-service>.<namespace>.svc.cluster.local:<restPort+2>, the
name-first addressing path that survives pod restarts with new IPs.
*/}}
{{- define "lagrange-node.containerCommon" -}}
image: {{ include "lagrange-node.image" . }}
imagePullPolicy: {{ .Values.image.pullPolicy }}
args:
  - {{ printf "--max-old-space-size=%d" (int .Values.node.maxOldSpaceSizeMb) | quote }}
  - "src/index.js"
{{- if .Values.persistence.enabled }}
  - "--data-dir"
  - {{ .Values.persistence.mountPath | quote }}
{{- end }}
ports:
  - name: rest
    containerPort: {{ include "lagrange-node.restPort" . }}
  - name: transport-ws
    containerPort: {{ include "lagrange-node.transportWebsocketPort" . }}
livenessProbe:
  httpGet:
    path: {{ .Values.probes.liveness.path }}
    port: rest
  initialDelaySeconds: {{ .Values.probes.liveness.initialDelaySeconds }}
  periodSeconds: {{ .Values.probes.liveness.periodSeconds }}
  failureThreshold: {{ .Values.probes.liveness.failureThreshold }}
readinessProbe:
  httpGet:
    path: {{ .Values.probes.readiness.path }}
    port: rest
  initialDelaySeconds: {{ .Values.probes.readiness.initialDelaySeconds }}
  periodSeconds: {{ .Values.probes.readiness.periodSeconds }}
  failureThreshold: {{ .Values.probes.readiness.failureThreshold }}
resources:
{{ toYaml .Values.resources | indent 2 }}
{{- if .Values.persistence.enabled }}
volumeMounts:
  - name: data
    mountPath: {{ .Values.persistence.mountPath | quote }}
{{- end }}
{{- end -}}

{{/* Env vars shared by seed and joiner pods */}}
{{- define "lagrange-node.envCommon" -}}
{{- include "lagrange-node.validateAdminSafety" . -}}
{{- include "lagrange-node.validateListenerPorts" . -}}
- name: POD_NAME
  valueFrom:
    fieldRef:
      fieldPath: metadata.name
- name: POD_NAMESPACE
  valueFrom:
    fieldRef:
      fieldPath: metadata.namespace
# NODE_ID is deliberately NOT set: join admission requires a UUID, so the
# runtime mints one on first boot and restores it from the data directory
# (rejoin hints) on every restart — identity is durable via the PVC.
- name: REST_API_PORT
  value: {{ include "lagrange-node.restPort" . | quote }}
- name: ADMIN_WEBSOCKET_PORT
  value: {{ include "lagrange-node.adminWebsocketPort" . | quote }}
- name: NODE_WS_PORT
  value: {{ include "lagrange-node.transportWebsocketPort" . | quote }}
- name: LOG_LEVEL
  value: {{ .Values.node.logLevel | quote }}
- name: ADMIN_WEBSOCKET_HOST
  value: {{ .Values.admin.websocketHost | quote }}
- name: ADMIN_ALLOW_INSECURE_EXTERNAL_BIND
  value: {{ .Values.admin.allowInsecureExternalBind | quote }}
# Bind wide, advertise + register the stable per-pod DNS name (name-first
# addressing). NODE_ADDRESS must be unique per node — the default would
# register every pod as localhost:<restPort> and collide at join admission.
- name: TRANSPORT_WS_HOST
  value: "0.0.0.0"
- name: NODE_ADDRESS
  value: {{ printf "$(POD_NAME).%s.$(POD_NAMESPACE).svc.cluster.local:%s" (include "lagrange-node.headlessService" .) (include "lagrange-node.restPort" .) | quote }}
- name: NODE_ADVERTISED_WS_ADDRESS
  value: {{ printf "$(POD_NAME).%s.$(POD_NAMESPACE).svc.cluster.local:%s" (include "lagrange-node.headlessService" .) (include "lagrange-node.transportWebsocketPort" .) | quote }}
{{- with .Values.node.extraEnv }}
{{ toYaml . }}
{{- end }}
{{- end -}}

{{/* Seed node REST address joiners bootstrap from (http:// is auto-prefixed) */}}
{{- define "lagrange-node.seedAddress" -}}
{{- printf "%s-seed-0.%s.%s.svc.cluster.local:%s" (include "lagrange-node.fullname" .) (include "lagrange-node.headlessService" .) .Release.Namespace (include "lagrange-node.restPort" .) -}}
{{- end -}}

{{/* PVC template shared by both StatefulSets */}}
{{- define "lagrange-node.volumeClaimTemplates" -}}
{{- if .Values.persistence.enabled }}
volumeClaimTemplates:
  - metadata:
      name: data
    spec:
      accessModes: ["ReadWriteOnce"]
      {{- with .Values.persistence.storageClass }}
      storageClassName: {{ . | quote }}
      {{- end }}
      resources:
        requests:
          storage: {{ .Values.persistence.size | quote }}
{{- end }}
{{- end -}}
