import { normalizeIndianPhone, isValidIndianPhone } from './lib/phone';

const validTests = [
    { input: "+919876543210", expected: "9876543210" },
    { input: "+91 98765 43210", expected: "9876543210" },
    { input: "919876543210", expected: "9876543210" },
    { input: "09876543210", expected: "9876543210" },
    { input: "9876543210", expected: "9876543210" },
    { input: "6000000000", expected: "6000000000" }, // starts with 6
    { input: "7000-000-000", expected: "7000000000" }, // starts with 7
];

const invalidTests = [
    { input: "1234567890", expected: null }, // doesn't start with 6-9
    { input: "5555555555", expected: null }, // doesn't start with 6-9
    { input: "+911234", expected: null }, // too short
    { input: "abcdefghij", expected: null }, // not numbers
    { input: "0000000000", expected: null }, // emergency fake (should return null)
    { input: "", expected: null },
    { input: "9919876543210", expected: null }, // too long
];

let success = true;

console.log("--- RUNNING VALID TESTS ---");
for (const test of validTests) {
    const result = normalizeIndianPhone(test.input);
    if (result !== test.expected) {
        console.error(`FAIL: expected ${test.expected} for ${test.input}, got ${result}`);
        success = false;
    } else {
        console.log(`PASS: ${test.input} -> ${result}`);
    }
}

console.log("\n--- RUNNING INVALID TESTS ---");
for (const test of invalidTests) {
    const result = normalizeIndianPhone(test.input);
    if (result !== test.expected) {
        console.error(`FAIL: expected ${test.expected} for ${test.input}, got ${result}`);
        success = false;
    } else {
        console.log(`PASS: ${test.input} rejected as expected (${result})`);
    }
}

if (success) {
    console.log("\n--- ALL TESTS PASSED SUCCESSFULLY! ---");
} else {
    console.log("\n--- SOME TESTS FAILED ---");
}
