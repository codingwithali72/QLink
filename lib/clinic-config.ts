export const CLINIC_REVIEW_URLS: Record<string, string> = {
    "prime-care": "https://search.google.com/local/writereview?placeid=ChIJ4_-NCUqp5zsRw-VdcGsKSh0",
    // "another-clinic": "..."
};

export const getReviewUrl = (slug: string) => {
    // Check if we have a specific URL for this clinic
    if (CLINIC_REVIEW_URLS[slug]) {
        return CLINIC_REVIEW_URLS[slug];
    }

    // Default fallback: Google Maps Search
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(slug + " clinic")}`;
};
