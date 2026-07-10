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
{{- if or (eq $name "ADMIN_WEBSOCKET_HOST") (eq $name "ADMIN_ALLOW_INSECURE_EXTERNAL_BIND") (eq $name "ADMIN_WEBSOCKET_PORT") -}}
{{- fail (printf "node.extraEnv name %s is reserved by the admin safety policy" $name) -}}
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
    containerPort: {{ int .Values.node.restPort }}
  - name: transport-ws
    containerPort: {{ add (int .Values.node.restPort) 2 }}
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
  value: {{ .Values.node.restPort | quote }}
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
  value: {{ printf "$(POD_NAME).%s.$(POD_NAMESPACE).svc.cluster.local:%d" (include "lagrange-node.headlessService" .) (int .Values.node.restPort) | quote }}
- name: NODE_ADVERTISED_WS_ADDRESS
  value: {{ printf "$(POD_NAME).%s.$(POD_NAMESPACE).svc.cluster.local:%d" (include "lagrange-node.headlessService" .) (add (int .Values.node.restPort) 2) | quote }}
{{- with .Values.node.extraEnv }}
{{ toYaml . }}
{{- end }}
{{- end -}}

{{/* Seed node REST address joiners bootstrap from (http:// is auto-prefixed) */}}
{{- define "lagrange-node.seedAddress" -}}
{{- printf "%s-seed-0.%s.%s.svc.cluster.local:%d" (include "lagrange-node.fullname" .) (include "lagrange-node.headlessService" .) .Release.Namespace (int .Values.node.restPort) -}}
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
