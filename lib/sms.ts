import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

const client = (accountSid && authToken) ? twilio(accountSid, authToken) : null;

export async function sendSMS(to: string, message: string) {
    // 1. Validate Phone Number (Basic clean up)
    // Twilio needs E.164 format (e.g., +919123456789)
    // We assume input might be local "0912..." or "912..." or "+91..."
    // For MVP, simplistic cleaning:
    let cleanPhone = to.replace(/\D/g, ''); // Remove non-digits

    // Assume India (+91) if not present and length looks like mobile
    if (cleanPhone.length === 10) {
        cleanPhone = `+91${cleanPhone}`;
    } else if (cleanPhone.length === 12 && cleanPhone.startsWith('91')) {
        cleanPhone = `+${cleanPhone}`;
    } else if (!cleanPhone.startsWith('+')) {
        // Fallback for demo
        cleanPhone = `+${cleanPhone}`;
    }

    if (!client || !process.env.TWILIO_PHONE_NUMBER) {
        console.log(`[MOCK SMS] To: ${cleanPhone} | Msg: ${message}`);
        return { success: true, mock: true };
    }

    try {
        await client.messages.create({
            body: message,
            from: fromNumber,
            to: cleanPhone,
        });
        console.log(`[REAL SMS] Sent to ${cleanPhone}`);
        return { success: true };
    } catch (error) {
        console.error("[SMS ERROR]", error);
        return { success: false, error };
    }
}
