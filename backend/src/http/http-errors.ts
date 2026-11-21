import type { ErrorRequestHandler, RequestHandler } from "express";

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/** An expected, client-facing error. Message is safe to show to users. */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(
    new HttpError(404, "not_found", `No route for ${req.method} ${req.path}.`),
  );
};

/** Shape of errors raised by Express's own body parser (body-parser / http-errors). */
interface ParserError {
  status: number;
  type?: string;
  expose?: boolean;
  message: string;
}

function isParserError(err: unknown): err is ParserError {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    typeof (err as { status: unknown }).status === "number" &&
    "expose" in err
  );
}

const PARSER_ERROR_CODES: Record<string, string> = {
  "entity.parse.failed": "invalid_json",
  "entity.too.large": "payload_too_large",
  "encoding.unsupported": "unsupported_encoding",
  "charset.unsupported": "unsupported_charset",
};

export function createErrorHandler(options: {
  exposeInternalErrors: boolean;
}): ErrorRequestHandler {
  // Express identifies error handlers by their four-argument signature.
  return (err: unknown, req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }

    let status = 500;
    let body: ApiErrorBody;

    if (err instanceof HttpError) {
      status = err.status;
      body = { error: { code: err.code, message: err.message } };
      if (err.details !== undefined) body.error.details = err.details;
    } else if (isParserError(err) && err.status >= 400 && err.status < 500) {
      status = err.status;
      const code = (err.type && PARSER_ERROR_CODES[err.type]) ?? "bad_request";
      const message =
        code === "invalid_json"
          ? "Request body is not valid JSON."
          : code === "payload_too_large"
            ? "Request body is too large."
            : err.message;
      body = { error: { code, message } };
    } else {
      // Unexpected failure: always log it; only reveal details outside production.
      console.error(`[error] ${req.method} ${req.originalUrl}`, err);
      const message =
        options.exposeInternalErrors && err instanceof Error
          ? err.message
          : "Something went wrong on the server.";
      body = { error: { code: "internal_error", message } };
    }

    res.status(status).json(body);
  };
}
