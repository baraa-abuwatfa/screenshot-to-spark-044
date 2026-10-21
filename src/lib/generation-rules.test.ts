import { describe, expect, it } from "vitest";
import { canStartGeneration } from "./generation-rules";

const now = new Date("2026-10-21T12:00:00Z").getTime();
const ago = (ms: number) => new Date(now - ms).toISOString();

describe("canStartGeneration", () => {
  it("allows a pending request", () => expect(canStartGeneration("pending", false, ago(0), now)).toBe(true));
  it("allows retrying a failed request", () => expect(canStartGeneration("failed", false, ago(0), now)).toBe(true));
  it("blocks a completed request", () => expect(canStartGeneration("completed", false, ago(0), now)).toBe(false));
  it("blocks any request that already has a plan", () => expect(canStartGeneration("failed", true, ago(0), now)).toBe(false));
  it("blocks a request that is currently processing", () =>
    expect(canStartGeneration("processing", false, ago(60_000), now)).toBe(false));
  it("allows retry when processing has been stuck over 5 minutes", () =>
    expect(canStartGeneration("processing", false, ago(6 * 60_000), now)).toBe(true));
});
