import assert from "node:assert/strict";
import test from "node:test";
import { phoneNumberError } from "../src/lib/orders/phone";

test("accepts local numbers and any country code", () => {
  for (const value of [
    "09171234567",
    "0917 123 4567",
    "0917-123-4567",
    "(032) 123-4567",
    "9171234567",
    "917 123 4567",
    "+639171234567",
    "+63 917 123 4567",
    "00639171234567",
    "+1 202 555 0147",
    "+44 20 7946 0958",
  ]) {
    assert.equal(phoneNumberError(value), null, value);
  }
});

test("rejects numbers that are not a local or country-code phone", () => {
  assert.match(phoneNumberError(""), /contact number/i);
  assert.match(phoneNumberError("12345") ?? "", /start with 0 or 9/i);
  assert.match(phoneNumberError("0917") ?? "", /start with 0 or 9/i);
  assert.match(phoneNumberError("917123") ?? "", /start with 0 or 9/i);
  assert.match(phoneNumberError("+63") ?? "", /country code/i);
  assert.match(phoneNumberError("call me") ?? "", /digits/i);
  assert.match(phoneNumberError("091712345678") ?? "", /start with 0 or 9/i);
});
