
import { createAdminClient } from "./supabase/admin";
import { hashPhone } from "./crypto";

const WHATSAPP_API_URL = "https://graph.facebook.com/v17.0"; // Or latest version

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function sendWhatsApp(to: string, templateName: string, components: any[], businessId: string, tokenId?: string) {
    const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_ID;
    const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_BEARER_TOKEN;

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
        message_type: "MANUAL",
        status,
        provider_response: response
    });
}

// -------------------------------------------------------------------------------------------------
// Phase 6 WhatsApp Interactive Additions
// -------------------------------------------------------------------------------------------------

export async function sendWhatsAppInteractiveButtons(to: string, bodyText: string, buttons: { id: string, title: string }[], businessId: string, tokenId?: string) {
    const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_ID;
    const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_BEARER_TOKEN;

    if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) return { success: true, mock: true };

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
                type: "interactive",
                interactive: {
                    type: "button",
                    body: { text: bodyText },
                    action: {
                        buttons: buttons.map(b => ({
                            type: "reply",
                            reply: {
                                id: b.id,
                                title: b.title.substring(0, 20) // max 20 chars
                            }
                        }))
                    }
                }
            }),
        });

        const data = await response.json();
        const status = response.ok ? "SENT" : "FAILED";
        await logMessage(businessId, tokenId, status, data);
        return { success: response.ok, data };
    } catch (error) {
        console.error("WhatsApp Interactive Exception:", error);
        return { success: false, error };
    }
}

export async function sendWhatsAppInteractiveList(to: string, bodyText: string, listTitle: string, options: { id: string, title: string, description?: string }[], businessId: string, tokenId?: string) {
    const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_ID;
    const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_BEARER_TOKEN;

    if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) return { success: true, mock: true };

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
                type: "interactive",
                interactive: {
                    type: "list",
                    body: { text: bodyText },
                    action: {
                        button: listTitle.substring(0, 20),
                        sections: [
                            {
                                title: "Options",
                                rows: options.map(o => ({
                                    id: o.id,
                                    title: o.title.substring(0, 24),
                                    description: o.description ? o.description.substring(0, 72) : undefined
                                }))
                            }
                        ]
                    }
                }
            }),
        });

        const data = await response.json();
        const status = response.ok ? "SENT" : "FAILED";
        await logMessage(businessId, tokenId, status, data);
        return { success: response.ok, data };
    } catch (error) {
        console.error("WhatsApp List Exception:", error);
        return { success: false, error };
    }
}


// Queue system to decouple HTTP request from User action
// DPDP FIX: phone is NOT stored in provider_response. Instead we store the tokenId
// which allows the async worker to safely retrieve the encrypted phone from tokens table.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function queueWhatsAppMessage(businessId: string, tokenId: string, templateName: string, phone: string, components: any[]) {
    const supabase = createAdminClient();

    // Store HMAC hash of phone + components. The worker uses token_id to look up
    // the encrypted phone and decrypt it at send time — never stored in plaintext here.
    let phoneHash: string | null = null;
    try {
        phoneHash = hashPhone(phone);
    } catch {
        // Fallback: if crypto keys not set, store masked phone for debugging only
        phoneHash = phone.replace(/\d(?=\d{4})/g, "*");
    }

    await supabase.from("message_logs").insert({
        business_id: businessId,
        token_id: tokenId,
        message_type: templateName,
        status: "PENDING",
        // Store phone_hash (not plaintext) + components for the async worker
        // Worker retrieves actual phone via: tokens.patient_phone_encrypted → decryptPhone()
        provider_response: { phone_hash: phoneHash, token_id: tokenId, components }
    });
}
