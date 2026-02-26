import { successResponse, generateRequestId, errorResponse } from '@/lib/api-response';

export async function GET() {
    const requestId = generateRequestId();
    try {
        return successResponse({
            status: 'ok',
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV
        }, requestId);
    } catch {
        return errorResponse("Health check failed", 500, requestId);
    }
}
