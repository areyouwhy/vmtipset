import { describe, it, expect } from "vitest";
import {
  SWISH_AMOUNT_SEK,
  SWISH_PHONE,
  buildSwishPayload,
} from "./swish";

describe("buildSwishPayload", () => {
  it("encodes phone, amount, message, and lock flag", () => {
    expect(buildSwishPayload("user@example.com")).toBe(
      `C${SWISH_PHONE};${SWISH_AMOUNT_SEK};user@example.com;0`,
    );
  });

  it("strips semicolons and newlines from the message so it can't break the payload format", () => {
    const payload = buildSwishPayload("a;b\nc");
    expect(payload).toBe(`C${SWISH_PHONE};${SWISH_AMOUNT_SEK};a b c;0`);
    // Exactly 3 semicolons total — separating the 4 fields.
    expect(payload.split(";").length).toBe(4);
  });

  it("truncates messages over 50 chars", () => {
    const long = "x".repeat(80);
    const payload = buildSwishPayload(long);
    const message = payload.split(";")[2];
    expect(message.length).toBe(50);
  });

  it("uses the configured phone and amount constants", () => {
    expect(SWISH_PHONE).toBe("0703064211");
    expect(SWISH_AMOUNT_SEK).toBe(300);
  });
});
