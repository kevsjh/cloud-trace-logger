type LoggableRequest = {
  headers: Record<string, string | string[] | undefined>;
  raw?: unknown;
};

type LoggingFnProps = {
  message: string;
  req?: LoggableRequest;
  severity?: "DEBUG" | "INFO" | "ERROR";
  data?: Record<string, any> | string;
  error?: unknown;
};

export function loggingFn({
  req,
  severity = "INFO",
  message,
  data,
  error,
}: LoggingFnProps) {
  try {
    if (process.env.NODE_ENV === "production" && severity === "DEBUG") {
      return;
    }

    const globalLogFields: Record<string, any> = {};
    const project = process.env.PROJECT_ID;
    if (typeof req !== "undefined") {
      let traceHeader;

      if ("raw" in req && req.raw) {
        traceHeader = req.headers["x-cloud-trace-context"];
      } else {
        traceHeader =
          req.headers["x-cloud-trace-context"] ||
          req.headers["X-Cloud-Trace-Context"];
      }

      if (traceHeader && project) {
        const traceValue = Array.isArray(traceHeader)
          ? traceHeader[0]
          : traceHeader;
        const [trace] = traceValue?.split("/") || [];
        globalLogFields["logging.googleapis.com/trace"] =
          `projects/${project}/traces/${trace}`;
      }
    }

    let dataToLog: Record<string, any> = {};
    if (data !== undefined) {
      if (typeof data === "object" && data !== null && !Array.isArray(data)) {
        dataToLog = data;
      } else {
        dataToLog = { payload: data };
      }
    }

    let errorDetails: Record<string, any> | undefined;
    if (error !== undefined) {
      if (error instanceof Error) {
        errorDetails = {
          errorMessage: error.message,
          errorStack: error.stack,
          errorName: error.name,
        };
      } else {
        errorDetails = {
          errorValue: String(error),
        };
      }
    }

    const entry = Object.assign(
      {},
      globalLogFields,
      dataToLog,
      errorDetails && { error: errorDetails },
      {
        severity: severity,
        message,
        ...(severity === "ERROR" &&
          process.env.NODE_ENV === "production" && {
            "@type":
              "type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent",
          }),
      },
    );

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
}
