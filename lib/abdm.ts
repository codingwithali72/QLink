// lib/abdm.ts
// ABDM Integration Module for QLink (M1, M2, M3 + Scan & Share)

import { pushToScanAndShareBuffer } from "./redis";

// Mock ABDM Gateway URL
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ABDM_GATEWAY_URL = process.env.ABDM_GATEWAY_URL || 'https://dev.abdm.gov.in/gateway';

/**
 * ==========================================
 * MILESTONE 1: ABHA CREATION & CAPTURE
 * ==========================================
 */
export async function createAbhaAddress(aadhaarToken: string) {
    // In production, this calls the ABDM /v1/registration/aadhaar/generateOtp
    console.log(`[ABDM M1] Requesting ABHA creation for token: ${aadhaarToken.substring(0, 5)}...`);

    // Simulate Gateway Response
    return {
        success: true,
        abha_address: `demo.patient@abdm`,
        abha_number: `14-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}-${Math.floor(1000 + Math.random() * 9000)}`
    };
}

export async function verifyAbhaAddress(abhaAddress: string) {
    console.log(`[ABDM M1] Verifying ABHA Address: ${abhaAddress}`);
    // Simulate /v1/search/searchByHealthId
    return {
        isValid: true,
        status: "ACTIVE"
    };
}


/**
 * ==========================================
 * MILESTONE 2: HIP (Health Information Provider)
 * ==========================================
 * When external providers request our data with patient consent.
 */
export async function handleHIPConsentNotification(payload: { consent: { id: string } }) {
    console.log(`[ABDM M2] Received Consent Notification to share data.`);
    // 1. Verify consent artifact signature
    // 2. Queue job to generate FHIR documents from QLink DB
    // 3. Encrypt payload using Diffie-Hellman Key Exchange (Ecdh)
    // 4. Push to ABDM gateway Data Push URL

    return { status: 'ACKNOWLEDGED', consentId: payload.consent.id };
}

export async function exportToFHIR(visitId: string) {
    // Extracts QLink Triage, KPI timings and translates to FHIR R4 standard Encounter Resource
    return {
        resourceType: "Encounter",
        id: visitId,
        status: "finished",
        class: {
            system: "http://terminology.hl7.org/CodeSystem/v3-ActCode",
            code: "EMER",
            display: "emergency"
        }
    };
}


/**
 * ==========================================
 * MILESTONE 3: HIU (Health Information User)
 * ==========================================
 * When QLink Doctors request external records.
 */
export async function requestPatientRecords(abhaAddress: string, purpose: string) {
    console.log(`[ABDM M3] Requesting consent to fetch records for ${abhaAddress}. Purpose: ${purpose}`);
    // Generates a Consent Request to the patient's PHR App
    return {
        requestId: `req-${Date.now()}`,
        status: 'CONSENT_REQUEST_SENT'
    };
}

export async function processReceivedFHIRPayload(encryptedPayload: string, dhPrivateKey: string) {
    // 1. Decrypt payload using our Private Key and Sender's Public Key
    // 2. Parse FHIR bundle
    // 3. Render into Doctor UI
    console.log(`[ABDM M3] Decrypting and parsing incoming FHIR payload... Length: ${encryptedPayload.length}. Key used: ${dhPrivateKey.substring(0, 4)}...`);
    return { parsedRecords: 5 };
}


/**
 * ==========================================
 * SCAN & SHARE (Fast-track queueing)
 * ==========================================
 * The core requirement: Acknowledging Webhooks in <300ms.
 */

export async function handleScanAndShareWebhook(payload: { profile: { name: string, healthIdNumber: string, gender: string }, hipId: string }) {
    // 1. Instantly parse demographic payload (Name, ABHA, Gender)
    const patientData = {
        name: payload.profile.name,
        abha: payload.profile.healthIdNumber,
        gender: payload.profile.gender
    };

    // 2. DO NOT write to Postgres yet. That blocks the gateway and causes timeouts.
    // Push the heavy insertion logic to Redis.
    await pushToScanAndShareBuffer({
        clinicId: payload.hipId,
        patientData: patientData,
        source: 'SCAN_AND_SHARE'
    });

    // 3. Return 2xx ACK instantly to Gateway
    return {
        timestamp: new Date().toISOString(),
        status: "ACKNOWLEDGED",
        error: null
    };
}
