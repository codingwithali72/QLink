export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    requestId?: string;
}

export function successResponse<T>(data: T, requestId?: string): Response {
    const body: ApiResponse<T> = {
        success: true,
        data,
        requestId
    };
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });
}

export function errorResponse(error: string, status: number = 400, requestId?: string): Response {
    const body: ApiResponse<null> = {
        success: false,
        error,
        requestId
    };
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}

export function generateRequestId(): string {
    return 'req_' + Math.random().toString(36).substring(2, 10);
}
