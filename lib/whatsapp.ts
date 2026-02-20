
import { createAdminClient } from "./supabase/admin";

const WHATSAPP_API_URL = "https://graph.facebook.com/v17.0"; // Or latest version

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sendWhatsApp(to: string, templateName: string, components: any[], businessId: string, tokenId?: string) {
    const { PHONE_NUMBER_ID, ACCESS_TOKEN } = process.env;

    if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
        console.log("⚠️ WhatsApp Mock Send:", { to, templateName, components });
        await logMessage(businessId, tokenId, "MOCK_SENT", { to, templateName, components });
        return { success: true, mock: true };
    }

    try {
        const response = await fetch(`${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}/messages`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${ACCESS_TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                messaging_product: "whatsapp",
                to: to,
                type: "template",
                template: {
                    name: templateName,
                    language: { code: "en" },
                    components: components
                }
            }),
        });

        const data = await response.json();
        const status = response.ok ? "SENT" : "FAILED";

        await logMessage(businessId, tokenId, status, data);

        if (!response.ok) {
            console.error("WhatsApp Error:", data);
            return { success: false, error: data };
        }

        return { success: true, data };
    } catch (error) {
        console.error("WhatsApp Exception:", error);
        await logMessage(businessId, tokenId, "EXCEPTION", { error: (error as Error).message });
        return { success: false, error };
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function logMessage(businessId: string, tokenId: string | undefined, status: string, response: any) {
    const supabase = createAdminClient();
    await supabase.from("message_logs").insert({
        business_id: businessId,
        token_id: tokenId,
        status,
        provider_response: response
    });
}
