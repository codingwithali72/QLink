"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var supabase_js_1 = require("@supabase/supabase-js");
var dotenv = __importStar(require("dotenv"));
dotenv.config({ path: '.env.local' });
var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
var supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Need admin for bypassing RLS during testing
var supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
function runChaosTest() {
    return __awaiter(this, void 0, void 0, function () {
        var bData, newB, clinicId, deptData, newDept, deptId, todayIST, dateString, sData, newS, sessionId, burstPromises, startTime, i, req, results, endTime, successes, errors, tokens, _i, results_1, res, uniqueTokens, hasGaps, prev, _a, tokens_1, t, e_1;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 11, , 12]);
                    console.log("🔥 STARTING QLINK CHAOS TEST: PHASE 2 & 8 (CONCURRENCY DESTRUCTION) 🔥");
                    // 1. Setup Data - Auto-Seeding required foreign keys
                    console.log("Setting up mock hospital data...");
                    return [4 /*yield*/, supabase.from('businesses').select('id').limit(1).single()];
                case 1:
                    bData = (_b.sent()).data;
                    if (!!bData) return [3 /*break*/, 3];
                    return [4 /*yield*/, supabase.from('businesses').insert({ name: 'Chaos Hospital', slug: 'chaos-' + Date.now(), user_id: '00000000-0000-0000-0000-000000000000' }).select('id').single()];
                case 2:
                    newB = (_b.sent()).data;
                    bData = newB;
                    _b.label = 3;
                case 3:
                    clinicId = bData.id;
                    return [4 /*yield*/, supabase.from('departments').select('id').eq('clinic_id', clinicId).limit(1).single()];
                case 4:
                    deptData = (_b.sent()).data;
                    if (!!deptData) return [3 /*break*/, 6];
                    return [4 /*yield*/, supabase.from('departments').insert({ clinic_id: clinicId, name: 'General OPD', routing_strategy: 'POOLED' }).select('id').single()];
                case 5:
                    newDept = (_b.sent()).data;
                    deptData = newDept;
                    _b.label = 6;
                case 6:
                    deptId = deptData.id;
                    todayIST = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
                    dateString = new Date(todayIST).toISOString().split('T')[0];
                    return [4 /*yield*/, supabase.from('sessions').select('id').eq('business_id', clinicId).eq('date', dateString).eq('status', 'OPEN').limit(1).single()];
                case 7:
                    sData = (_b.sent()).data;
                    if (!!sData) return [3 /*break*/, 9];
                    return [4 /*yield*/, supabase.from('sessions').insert({ business_id: clinicId, date: dateString, status: 'OPEN', daily_token_count: 0 }).select('id').single()];
                case 8:
                    newS = (_b.sent()).data;
                    sData = newS;
                    _b.label = 9;
                case 9:
                    sessionId = sData.id;
                    console.log("Target Session: ".concat(sessionId, " | Target Dept: ").concat(deptId));
                    // 2. The Burst (Simulating 50 receptionists clicking "Add Walk-In" at the exact same millisecond)
                    console.log("\n\uD83D\uDE80 FIRING 50 CONCURRENT REQUESTS (Simulation: Double Clicks & Cross-Receptionist Race Conditions)");
                    burstPromises = [];
                    startTime = Date.now();
                    for (i = 0; i < 50; i++) {
                        req = supabase.rpc('rpc_create_clinical_visit', {
                            p_clinic_id: clinicId,
                            p_session_id: sessionId,
                            p_patient_name: "Chaos Tester ".concat(i),
                            p_patient_phone: "+9199999000".concat(i.toString().padStart(2, '0')),
                            p_phone_encrypted: null,
                            p_phone_hash: null,
                            p_department_id: deptId,
                            p_is_priority: false,
                            p_source: 'WALK_IN'
                        });
                        burstPromises.push(req);
                    }
                    return [4 /*yield*/, Promise.all(burstPromises)];
                case 10:
                    results = _b.sent();
                    endTime = Date.now();
                    console.log("\n\u23F1\uFE0F BURST COMPLETE in ".concat(endTime - startTime, "ms"));
                    successes = 0;
                    errors = 0;
                    tokens = [];
                    for (_i = 0, results_1 = results; _i < results_1.length; _i++) {
                        res = results_1[_i];
                        if (res.error) {
                            errors++;
                            console.error("Supabase Error:", res.error.message);
                        }
                        else if (res.data && res.data.success === false) {
                            errors++;
                            console.error("Logic Error:", res.data.error);
                        }
                        else if (res.data && res.data.success === true) {
                            successes++;
                            tokens.push(res.data.token_number);
                        }
                    }
                    // Sort tokens to check for duplicates
                    tokens.sort(function (a, b) { return a - b; });
                    uniqueTokens = new Set(tokens);
                    console.log("\n\uD83D\uDCCA RESULTS:");
                    console.log("- Total Requests: 50");
                    console.log("- Successes: ".concat(successes));
                    console.log("- Errors/Rejections: ".concat(errors));
                    console.log("- Duplicate Tokens Generated: ".concat(tokens.length - uniqueTokens.size));
                    if (tokens.length > 0) {
                        console.log("- Token Sequence Generated: ".concat(tokens[0], " to ").concat(tokens[tokens.length - 1]));
                        hasGaps = false;
                        prev = tokens[0] - 1;
                        for (_a = 0, tokens_1 = tokens; _a < tokens_1.length; _a++) {
                            t = tokens_1[_a];
                            if (t !== prev + 1) {
                                console.log("\u26A0\uFE0F SEQUENCE GAP FOUND between ".concat(prev, " and ").concat(t));
                                hasGaps = true;
                            }
                            prev = t;
                        }
                        if (!hasGaps) {
                            console.log("\u2705 EXACT MATHEMATICAL SEQUENCE VALIDATED. NO GAPS.");
                        }
                    }
                    if (tokens.length - uniqueTokens.size === 0) {
                        console.log("\u2705 ISOLATION VALIDATED. NO DUPLICATE TOKENS ISSUED.");
                    }
                    else {
                        console.error("\u274C RACE CONDITION DETECTED! DUPLICATE TOKENS GENERATED!");
                    }
                    return [3 /*break*/, 12];
                case 11:
                    e_1 = _b.sent();
                    console.error("💥 FATAL SCRIPT ERROR:", e_1);
                    if (e_1.message)
                        console.error("Error Message:", e_1.message);
                    if (e_1.stack)
                        console.error("Stack Trace:", e_1.stack);
                    return [3 /*break*/, 12];
                case 12: return [2 /*return*/];
            }
        });
    });
}
runChaosTest();
