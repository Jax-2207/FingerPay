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
    'statusCode' in error &&
    'code' in error &&
    typeof (error as Record<string, unknown>).statusCode === 'number' &&
    typeof (error as Record<string, unknown>).code === 'string'
  ) {
    const errObj = error as Record<string, unknown>;
    return new HttpError(
      errObj.statusCode as number,
      errObj.code as string,
      typeof errObj.message === 'string' ? errObj.message : 'Request failed',
    );
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'cause' in error &&
    error.cause instanceof HttpError
  ) {
    return error.cause;
  }

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

  const message = error instanceof Error && error.message ? error.message : 'Internal server error';
  return new HttpError(500, API_ERROR_CODES.internal, message);
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
        {
          requestId: request.id,
          errorName: error instanceof Error ? error.name : 'UnknownError',
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
        },
        'Request failed',
      );
    }

    const body: ApiErrorResponse = {
      error: { code: safeError.code, message: safeError.message },
    };
    response.status(safeError.statusCode).json(body);
  };
}
