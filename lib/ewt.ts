/**
 * lib/ewt.ts
 * 
 * QLINK: Estimated Wait Time (EWT) Prediction Engine
 * 
 * Uses a rolling average of actual consultation times to dynamically 
 * predict wait times rather than relying on a hardcoded constant.
 */

export interface EWTInput {
    /** Number of patients currently WAITING ahead in the queue */
    patientsAhead: number;
    /** Recorded consultation times (in seconds) from recent visits  */
    consultationTimeSamples: number[];
    /** Peak hour sessions flag - adds a corrections factor */
    isPeakHour?: boolean;
}

export interface EWTResult {
    estimatedMinutes: number;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    label: string;
}

const FALLBACK_AVG_MINUTES = 10;

/**
 * Calculate Estimated Wait Time using a rolling weighted average.
 * 
 * - Weights recent samples more heavily (exponential decay).
 * - Falls back to clinic-level setting if no samples available.
 * - Returns a human-friendly label.
 */
export function calculateEWT(input: EWTInput): EWTResult {
    const { patientsAhead, consultationTimeSamples, isPeakHour } = input;

    if (patientsAhead === 0) {
        return { estimatedMinutes: 0, confidence: 'HIGH', label: 'Your turn is next' };
    }

    let avgSeconds: number;
    let confidence: 'HIGH' | 'MEDIUM' | 'LOW';

    if (consultationTimeSamples.length >= 5) {
        // Exponential Weighted Moving Average (EWMA)
        // More recent samples (end of array) are weighted higher
        const alpha = 0.3; // Smoothing factor
        let ewma = consultationTimeSamples[0];
        for (let i = 1; i < consultationTimeSamples.length; i++) {
            ewma = alpha * consultationTimeSamples[i] + (1 - alpha) * ewma;
        }
        avgSeconds = ewma;
        confidence = consultationTimeSamples.length >= 10 ? 'HIGH' : 'MEDIUM';
    } else if (consultationTimeSamples.length > 0) {
        avgSeconds = consultationTimeSamples.reduce((a, b) => a + b, 0) / consultationTimeSamples.length;
        confidence = 'MEDIUM';
    } else {
        avgSeconds = FALLBACK_AVG_MINUTES * 60;
        confidence = 'LOW';
    }

    let avgMinutes = avgSeconds / 60;

    // Peak hour correction: add 20% overhead
    if (isPeakHour) {
        avgMinutes *= 1.2;
    }

    const totalMinutes = Math.ceil(avgMinutes * patientsAhead);

    // Human-readable label
    let label: string;
    if (totalMinutes < 5) {
        label = 'Less than 5 mins';
    } else if (totalMinutes < 60) {
        label = `~${totalMinutes} mins`;
    } else {
        const hours = Math.floor(totalMinutes / 60);
        const mins = totalMinutes % 60;
        label = mins > 0 ? `~${hours}h ${mins}m` : `~${hours} hour${hours > 1 ? 's' : ''}`;
    }

    return { estimatedMinutes: totalMinutes, confidence, label };
}

/**
 * Helper: Check if current time is a "peak hour" for OPD (8-11 AM, 5-7 PM IST)
 */
export function isCurrentlyPeakHour(): boolean {
    const now = new Date();
    const istHour = parseInt(
        now.toLocaleString('en-US', { hour: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })
    );
    return (istHour >= 8 && istHour < 11) || (istHour >= 17 && istHour < 19);
}
