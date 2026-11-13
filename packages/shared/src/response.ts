/**
 * Standard API response format
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
    details?: any;
  };
  meta?: {
    timestamp: string;
    requestId?: string;
    [key: string]: any;
  };
}

/**
 * Create a success response
 */
export function successResponse<T>(data: T, meta?: Record<string, any>): ApiResponse<T> {
  return {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta,
    },
  };
}

/**
 * Create an error response
 */
export function errorResponse(
  message: string,
  options?: {
    code?: string;
    details?: any;
    meta?: Record<string, any>;
  }
): ApiResponse {
  return {
    success: false,
    error: {
      message,
      code: options?.code,
      details: options?.details,
    },
    meta: {
      timestamp: new Date().toISOString(),
      ...options?.meta,
    },
  };
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  meta: {
    timestamp: string;
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

/**
 * Create a paginated response
 */
export function paginatedResponse<T>(
  data: T[],
  page: number,
  limit: number,
  total: number
): PaginatedResponse<T> {
  const totalPages = Math.ceil(total / limit);

  return {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      page,
      limit,
      total,
      totalPages,
      hasMore: page < totalPages,
    },
  };
}
