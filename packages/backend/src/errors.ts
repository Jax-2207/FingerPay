import type { ErrorRequestHandler } from 'express';
import { API_ERROR_CODES, type ApiErrorResponse } from '@fingerpay/shared';
import type { Logger } from 'pino';

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

function safeHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;

  if (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    error.type === 'entity.too.large'
  ) {
    return new HttpError(413, API_ERROR_CODES.invalidRequest, 'Request body is too large');
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    error.type === 'entity.parse.failed'
  ) {
    return new HttpError(
      400,
      API_ERROR_CODES.invalidRequest,
      'Request body must contain valid JSON',
    );
  }

  return new HttpError(500, API_ERROR_CODES.internal, 'Internal server error');
}

export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, request, response, next) => {
    if (response.headersSent) {
      next(error);
      return;
    }

    const safeError = safeHttpError(error);
    if (safeError.statusCode >= 500) {
      logger.error(
        { requestId: request.id, errorName: error instanceof Error ? error.name : 'UnknownError' },
        'Request failed',
      );
    }

    const body: ApiErrorResponse = {
      error: { code: safeError.code, message: safeError.message },
    };
    response.status(safeError.statusCode).json(body);
  };
}
