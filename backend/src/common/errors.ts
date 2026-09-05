import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Raised when an integration has no credential in either `process.env` or the
 * `SystemSetting` fallback tier. Surfaces as 503 (not 500): the app is healthy,
 * the *dependency* is unconfigured, and an admin can fix it in /admin/settings.
 */
export class ServiceUnconfiguredError extends HttpException {
  constructor(
    public readonly serviceKey: string,
    message?: string,
  ) {
    super(
      message ??
        `${serviceKey} is not configured. An administrator must add the credential in Settings before this feature can be used.`,
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}

/** Zero supported entities, or the file is not readable as DXF. Surfaces as 422. */
export class DxfParseError extends HttpException {
  constructor(message: string) {
    super(message, HttpStatus.UNPROCESSABLE_ENTITY);
  }
}

/** The part's bounding box exceeds the usable sheet area. Surfaces as 422. */
export class PartTooLargeError extends HttpException {
  constructor(message: string) {
    super(message, HttpStatus.UNPROCESSABLE_ENTITY);
  }
}
