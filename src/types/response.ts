import { z } from 'zod';

/**
 * Standard API Response Format
 * - code: 0 for success, non-zero for errors
 * - msg: empty for success, error message for failures
 * - data: response payload
 */

// Generic response schema creator
export function createResponseSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    code: z.number(),
    msg: z.string(),
    data: dataSchema,
  });
}

// Success response with data
export function successResponse<T>(data: T) {
  return {
    code: 0,
    msg: '',
    data,
  };
}

// Error response
export function errorResponse(code: number, msg: string) {
  return {
    code,
    msg,
    data: null,
  };
}

// Common error codes
export const ErrorCode = {
  SUCCESS: 0,
  INVALID_PARAMS: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_ERROR: 500,
  AUTH_FAILED: 1001,
  GITHUB_API_ERROR: 1002,
  WEBHOOK_VERIFICATION_FAILED: 1003,
} as const;

// Error response schema
export const errorResponseSchema = z.object({
  code: z.number(),
  msg: z.string(),
  data: z.null(),
});
