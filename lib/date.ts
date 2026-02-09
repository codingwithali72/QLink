
export function getClinicDate(): string {
    // Returns date in YYYY-MM-DD format for Asia/Kolkata
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}
