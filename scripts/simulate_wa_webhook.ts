import crypto from 'crypto';

const WEBHOOK_URL = 'http://127.0.0.1:3000/api/whatsapp/webhook';
const APP_SECRET = process.env.WHATSAPP_APP_SECRET || '';

async function simulateWebhook(phone: string, text: string, name: string = "Test User") {
    const payload = {
        object: 'whatsapp_business_account',
        entry: [
            {
                id: '1234567890',
                changes: [
                    {
                        value: {
                            messaging_product: 'whatsapp',
                            metadata: {
                                display_phone_number: '1234567890',
                                phone_number_id: '1234567890'
                            },
                            contacts: [
                                {
                                    profile: { name },
                                    wa_id: phone
                                }
                            ],
                            messages: [
                                {
                                    from: phone,
                                    id: 'wamid.HBgL' + Math.random().toString(36).substring(7),
                                    timestamp: Math.floor(Date.now() / 1000).toString(),
                                    text: { body: text },
                                    type: 'text'
                                }
                            ]
                        },
                        field: 'messages'
                    }
                ]
            }
        ]
    };

    const rawBody = JSON.stringify(payload);

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };

    if (APP_SECRET) {
        const signature = `sha256=${crypto.createHmac('sha256', APP_SECRET).update(rawBody).digest('hex')}`;
        headers['x-hub-signature-256'] = signature;
    }

    console.log(`Sending simulated WhatsApp message to ${WEBHOOK_URL}...`);
    console.log(`From: ${phone} | Name: ${name} | Text: "${text}"\n`);

    try {
        const response = await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers,
            body: rawBody
        });

        const data = await response.json().catch(() => response.text());
        console.log(`Status Code: ${response.status}`);
        console.log(`Response:`, data);
        console.log('\n---');
        console.log('Check your Supabase "tokens" table or the QLink Reception Dashboard to see if the token was created.');
    } catch (error) {
        console.error('Failed to send request:', error);
    }
}

// Get arguments from command line
const args = process.argv.slice(2);
const defaultPhone = '919876543210';
const defaultClinic = 'democlinic'; // Change to an actual open clinic slug in your DB

const command = args[0] || `JOIN_${defaultClinic}`;
const phone = args[1] || defaultPhone;

simulateWebhook(phone, command);
