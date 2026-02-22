/**
 * Strips all non-numeric characters from a string.
 */
function stripNonNumeric(input: string): string {
    return input.replace(/\D/g, '');
}

/**
 * Normalizes an Indian mobile number.
 * 
 * Rules:
 * - Strips +91, 91, 0 prefixes if length equates properly.
 * - Extracts exactly 10 digits.
 * - Enforces that the 10 digits must begin with 6, 7, 8, or 9 (standard Indian mobile format).
 * 
 * @param input The raw input string from the user or device
 * @returns The strictly normalized 10-digit number as a string, or `null` if the input is entirely invalid.
 */
export function normalizeIndianPhone(input: string | undefined | null): string | null {
    if (!input) return null;

    let numbers = stripNonNumeric(input);

    // 1. Length adjustments
    if (numbers.length === 12 && numbers.startsWith('91')) {
        numbers = numbers.slice(2);
    } else if (numbers.length === 11 && numbers.startsWith('0')) {
        numbers = numbers.slice(1);
    }

    // 2. Exact length enforcement
    if (numbers.length !== 10) {
        return null;
    }

    // 3. Prefix enforcement (Indian mobiles must start with 6, 7, 8, or 9)
    if (!/^[6-9]/.test(numbers)) {
        return null; // Reject landlines (start with 1-5 usually) or junk
    }

    return numbers;
}

/**
 * Convenience method for UI forms to simply output a boolean instead of the normalized string.
 */
export function isValidIndianPhone(input: string | undefined | null): boolean {
    return normalizeIndianPhone(input) !== null;
}
