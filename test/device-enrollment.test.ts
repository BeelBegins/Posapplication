import assert from "node:assert/strict";
import test from "node:test";
import { parseEnrollmentPayload } from "../src/mobile/device-enrollment";

test("device enrollment accepts the supervisor QR JSON contract",()=>{
  assert.deepEqual(parseEnrollmentPayload('{"url":"https://erp.example.com/","token":"one-time"}'),{baseUrl:"https://erp.example.com",token:"one-time"});
});

test("device enrollment URL requires a token",()=>{
  assert.deepEqual(parseEnrollmentPayload("https://erp.example.com/enroll?token=one-time"),{baseUrl:"https://erp.example.com",token:"one-time"});
  assert.throws(()=>parseEnrollmentPayload("https://erp.example.com/enroll"),/token/i);
  assert.throws(()=>parseEnrollmentPayload("http://erp.example.com/enroll?token=one-time"),/HTTPS/i);
});
