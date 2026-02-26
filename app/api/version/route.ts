import { successResponse, generateRequestId, errorResponse } from '@/lib/api-response';

export async function GET() {
    const requestId = generateRequestId();
    try {
        // Simple version exposing, in a real app this might read package.json
        return successResponse({
            version: '2.0.0',
            build: process.env.VERCEL_GIT_COMMIT_SHA || 'local',
            tier: 'production-grade'
        }, requestId);
    } catch {
        return errorResponse("Version check failed", 500, requestId);
    }
}
