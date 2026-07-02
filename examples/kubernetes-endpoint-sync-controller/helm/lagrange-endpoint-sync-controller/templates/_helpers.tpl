{{/* Expand the chart name. */}}
{{- define "system-endpoint-sync-controller.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/* Create a default fully qualified app name. */}}
{{- define "system-endpoint-sync-controller.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := include "system-endpoint-sync-controller.name" . -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/* Chart label value. */}}
{{- define "system-endpoint-sync-controller.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/* Common labels. */}}
{{- define "system-endpoint-sync-controller.labels" -}}
helm.sh/chart: {{ include "system-endpoint-sync-controller.chart" . }}
{{ include "system-endpoint-sync-controller.selectorLabels" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- with .Values.commonLabels }}
{{ toYaml . }}
{{- end }}
{{- end -}}

{{/* Selector labels. */}}
{{- define "system-endpoint-sync-controller.selectorLabels" -}}
app.kubernetes.io/name: {{ include "system-endpoint-sync-controller.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/* ServiceAccount name. */}}
{{- define "system-endpoint-sync-controller.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "system-endpoint-sync-controller.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}
