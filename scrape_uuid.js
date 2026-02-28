const url = 'https://qlink-zeta.vercel.app/primecare';

async function scrapeClinicId() {
    try {
        console.log(`Fetching ${url}...`);
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`Failed: HTTP ${response.status}`);
            return;
        }

        const html = await response.text();

        // Log lengths, try to find businessId UUID
        const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
        const matches = html.match(uuidRegex);

        if (matches) {
            const uniqueSlugs = [...new Set(matches)];
            console.log("Found UUIDs in HTML:", uniqueSlugs);
        } else {
            console.log("No UUIDs found in the HTML.");

            // Backup: Just print some of the script chunks
            const chunks = html.match(/<script.*?>(.*?)<\/script>/gs);
            if (chunks) {
                console.log(`Found ${chunks.length} script tags.`);
                // let's look for "businessId":"..."
                const regex2 = /"businessId":"(.*?)"/g;
                let m;
                while ((m = regex2.exec(html)) !== null) {
                    console.log("Found explicitly labeled businessId:", m[1]);
                }
            }
        }
    } catch (e) {
        console.error("Error fetching URL:", e);
    }
}

scrapeClinicId();
