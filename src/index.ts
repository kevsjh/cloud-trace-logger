export type Severity =
  | "DEBUG"
  | "INFO"
  | "WARNING"
  | "WARN"
  | "ERROR"
  | "CRITICAL"
  | "ALERT"
  | "EMERGENCY";

export type LoggableRequest = {
  headers: Record<string, string | string[] | undefined>;
};

export type ServiceContext = {
  service: string;
  version?: string;
};

export type LoggerOptions = {
  /** Google Cloud project ID. Falls back to PROJECT_ID then GOOGLE_CLOUD_PROJECT env vars. */
  projectId?: string;
  /** Suppress DEBUG-level logs. Defaults to true when NODE_ENV === "production". */
  suppressDebug?: boolean;
  /** Add Cloud Error Reporting @type on error-class severities. Defaults to true when NODE_ENV === "production". */
  errorReporting?: boolean;
  /** Service context for Cloud Error Reporting. Auto-detected from K_SERVICE/K_REVISION env vars on Cloud Run if not provided. */
  serviceContext?: ServiceContext;
};

export type LogOptions = {
  message: string;
  req?: LoggableRequest;
  severity?: Severity;
  data?: Record<string, any> | string;
  error?: unknown;
};

const ERROR_SEVERITIES = ["ERROR", "CRITICAL", "ALERT", "EMERGENCY"];

export function createCloudTraceLogger(options: LoggerOptions = {}) {
  const projectId =
    options.projectId ??
    process.env.PROJECT_ID ??
    process.env.GOOGLE_CLOUD_PROJECT;

  const suppressDebug =
    options.suppressDebug ?? process.env.NODE_ENV === "production";

  const errorReporting =
    options.errorReporting ?? process.env.NODE_ENV === "production";

  const serviceContext: ServiceContext | undefined =
    options.serviceContext ??
    (process.env.K_SERVICE
      ? {
          service: process.env.K_SERVICE,
          ...(process.env.K_REVISION && { version: process.env.K_REVISION }),
        }
      : undefined);

  return function log({
    message,
    req,
    severity = "INFO",
    data,
    error,
  }: LogOptions): void {
    try {
      const normalizedSeverity = severity === "WARN" ? "WARNING" : severity;

      if (suppressDebug && normalizedSeverity === "DEBUG") {
        return;
      }

      // Trace extraction
      let trace: string | undefined;
      if (req && projectId) {
        const traceHeader =
          req.headers["x-cloud-trace-context"] ??
          req.headers["X-Cloud-Trace-Context"];

        if (traceHeader) {
          const traceValue = Array.isArray(traceHeader)
            ? traceHeader[0]
            : traceHeader;
          const traceId = traceValue?.split("/")[0];
          if (traceId) {
            trace = `projects/${projectId}/traces/${traceId}`;
          }
        }
      }

      // Data normalization
      const dataFields: Record<string, any> =
        data === undefined
          ? {}
          : typeof data === "object" && data !== null && !Array.isArray(data)
            ? data
            : { payload: data };

      // Error serialization
      const errorFields =
        error === undefined
          ? undefined
          : error instanceof Error
            ? {
                errorMessage: error.message,
                errorStack: error.stack,
                errorName: error.name,
              }
            : { errorValue: String(error) };

      const isErrorReport =
        errorReporting && ERROR_SEVERITIES.includes(normalizedSeverity);

      const stackTrace =
        isErrorReport && error instanceof Error && error.stack
          ? error.stack
          : undefined;

      const entry = {
        ...(trace && { "logging.googleapis.com/trace": trace }),
        ...dataFields,
        ...(errorFields && { error: errorFields }),
        severity: normalizedSeverity,
        message,
        ...(isErrorReport && {
          "@type":
            "type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent",
          ...(stackTrace && { stack_trace: stackTrace }),
          ...(serviceContext && { serviceContext }),
        }),
      };

      console.log(JSON.stringify(entry));
    } catch (err) {
      console.error(
        JSON.stringify({
          loggingInternalError: `Error during logging execution: ${err instanceof Error ? err.message : String(err)}`,
          originalSeverity: severity,
          originalMessage: message,
          severity: "ERROR",
        }),
      );
    }
  };
}
