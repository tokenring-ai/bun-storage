import { describe, expect, it } from "bun:test";
import { DurationStringSchema, parseDurationMs } from "./retention.ts";

describe("parseDurationMs", () => {
  it("parses each supported unit", () => {
    expect(parseDurationMs("500ms")).toBe(500);
    expect(parseDurationMs("60s")).toBe(60_000);
    expect(parseDurationMs("15m")).toBe(15 * 60_000);
    expect(parseDurationMs("1h")).toBe(3_600_000);
    expect(parseDurationMs("30d")).toBe(30 * 86_400_000);
  });

  it("rejects invalid strings", () => {
    expect(() => parseDurationMs("")).toThrow("Invalid duration string");
    expect(() => parseDurationMs("30")).toThrow("Invalid duration string");
    expect(() => parseDurationMs("1w")).toThrow("Invalid duration string");
  });

  it("rejects values that overflow Number.MAX_SAFE_INTEGER", () => {
    expect(() => parseDurationMs("999999999999d")).toThrow("exceeds safe integer range");
    expect(DurationStringSchema.safeParse("999999999999d").success).toBe(false);
    expect(DurationStringSchema.safeParse("30d").success).toBe(true);
  });
});
