
import { getClinicDate } from "../lib/date";

console.log("Testing Date Generation:");
console.log("Current Date (Asia/Kolkata):", getClinicDate());

const d = new Date();
console.log("Server System Time:", d.toISOString());
console.log("Locale String (en-CA):", d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));
