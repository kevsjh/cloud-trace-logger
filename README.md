# @kevsjh/cloud-trace-logger

Structured JSON logger for Google Cloud. Correlates logs with [Cloud Trace](https://cloud.google.com/trace) and annotates errors for [Cloud Error Reporting](https://cloud.google.com/error-reporting) — zero dependencies.

## Install

```bash
bun add @kevsjh/cloud-trace-logger
# or
npm install @kevsjh/cloud-trace-logger
```

## Usage

```ts
import { createCloudTraceLogger } from "@kevsjh/cloud-trace-logger";

const log = createCloudTraceLogger({ projectId: "my-project" });

log({ message: "Server started", severity: "INFO" });
```

### With request tracing (Express, Fastify, etc.)

Pass the request object to correlate logs with Cloud Trace:

```ts
app.get("/", (req, res) => {
  log({ message: "Handling request", req });
  res.send("ok");
});
```

The logger reads the `x-cloud-trace-context` header and adds the `logging.googleapis.com/trace` field automatically.

### With error reporting

```ts
try {
  await doSomething();
} catch (err) {
  log({ message: "doSomething failed", severity: "ERROR", error: err });
}
```

In production, errors are annotated with the Cloud Error Reporting `@type` so they appear in the Error Reporting console.

### With structured data

```ts
log({ message: "User signed up", data: { userId: "abc", plan: "pro" } });
```

Data fields are spread into the top-level log entry.

## Configuration

```ts
const log = createCloudTraceLogger({
  // Google Cloud project ID.
  // Falls back to PROJECT_ID or GOOGLE_CLOUD_PROJECT env vars.
  projectId: "my-project",

  // Suppress DEBUG logs. Defaults to true when NODE_ENV=production.
  suppressDebug: true,

  // Add Cloud Error Reporting @type on error-class severities.
  // Defaults to true when NODE_ENV=production.
  errorReporting: true,
});
```

All options are optional — env vars are used as defaults.

## Severity levels

All [Google Cloud Logging severity levels](https://cloud.google.com/logging/docs/reference/v2/rest/v2/LogEntry#LogSeverity) are supported:

`DEBUG` | `INFO` | `WARNING` | `ERROR` | `CRITICAL` | `ALERT` | `EMERGENCY`

`WARN` is accepted as an alias for `WARNING`.

## Output

Each call writes a single JSON line to stdout via `console.log`, which Cloud Logging picks up automatically on Cloud Run, Cloud Functions, and GKE.

```json
{
  "logging.googleapis.com/trace": "projects/my-project/traces/abc123",
  "severity": "ERROR",
  "message": "doSomething failed",
  "error": {
    "errorMessage": "connection refused",
    "errorStack": "Error: connection refused\n    at ...",
    "errorName": "Error"
  },
  "@type": "type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent"
}
```

## License

MIT
