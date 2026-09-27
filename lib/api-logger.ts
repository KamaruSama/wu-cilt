import { NextRequest, NextResponse } from 'next/server';
import { createRequestId, logError, logInfo } from './logger';

type ApiHandler = (request: NextRequest) => Promise<NextResponse>;

export function withApiLogging(route: string, handler: ApiHandler): ApiHandler {
  return async (request) => {
    const requestId = createRequestId(request.headers.get('x-request-id'));
    const startedAt = Date.now();

    logInfo('api.request.started', {
      requestId,
      route,
      method: request.method,
    });

    try {
      const response = await handler(request);
      response.headers.set('x-request-id', requestId);
      logInfo('api.request.completed', {
        requestId,
        route,
        method: request.method,
        status: response.status,
        durationMs: Date.now() - startedAt,
      });
      return response;
    } catch (error) {
      const errorId = logError('api.request.failed', error, {
        requestId,
        route,
        method: request.method,
        durationMs: Date.now() - startedAt,
      });

      const response = NextResponse.json(
        { success: false, error: 'เกิดข้อผิดพลาดในการประมวลผล', requestId, errorId },
        { status: 500 },
      );
      response.headers.set('x-request-id', requestId);
      return response;
    }
  };
}
