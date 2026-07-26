import { findOverlap, computeDurationMinutes } from "./overlap-detection.logic";

describe("findOverlap", () => {
  it("detects a direct overlap", () => {
    const existing = [{ id: "1", startTime: new Date("2026-07-25T10:00:00Z"), endTime: new Date("2026-07-25T11:00:00Z") }];
    const candidate = { startTime: new Date("2026-07-25T10:30:00Z"), endTime: new Date("2026-07-25T11:30:00Z") };
    expect(findOverlap(candidate, existing)).not.toBeNull();
  });

  it("allows back-to-back entries (half-open range)", () => {
    const existing = [{ id: "1", startTime: new Date("2026-07-25T10:00:00Z"), endTime: new Date("2026-07-25T11:00:00Z") }];
    const candidate = { startTime: new Date("2026-07-25T11:00:00Z"), endTime: new Date("2026-07-25T12:00:00Z") };
    expect(findOverlap(candidate, existing)).toBeNull();
  });

  it("ignores running (open) entries", () => {
    const existing = [{ id: "1", startTime: new Date("2026-07-25T10:00:00Z"), endTime: null }];
    const candidate = { startTime: new Date("2026-07-25T10:30:00Z"), endTime: new Date("2026-07-25T11:00:00Z") };
    expect(findOverlap(candidate, existing)).toBeNull();
  });

  it("excludes the candidate's own id from the comparison (for updates)", () => {
    const existing = [{ id: "1", startTime: new Date("2026-07-25T10:00:00Z"), endTime: new Date("2026-07-25T11:00:00Z") }];
    const candidate = { id: "1", startTime: new Date("2026-07-25T10:00:00Z"), endTime: new Date("2026-07-25T11:30:00Z") };
    expect(findOverlap(candidate, existing)).toBeNull();
  });

  it("detects containment overlap (candidate fully inside an existing entry)", () => {
    const existing = [{ id: "1", startTime: new Date("2026-07-25T09:00:00Z"), endTime: new Date("2026-07-25T12:00:00Z") }];
    const candidate = { startTime: new Date("2026-07-25T10:00:00Z"), endTime: new Date("2026-07-25T11:00:00Z") };
    expect(findOverlap(candidate, existing)).not.toBeNull();
  });

  it("returns null for a running candidate (no endTime)", () => {
    const existing = [{ id: "1", startTime: new Date("2026-07-25T09:00:00Z"), endTime: new Date("2026-07-25T12:00:00Z") }];
    const candidate = { startTime: new Date("2026-07-25T10:00:00Z"), endTime: null };
    expect(findOverlap(candidate, existing)).toBeNull();
  });
});

describe("computeDurationMinutes", () => {
  it("rounds to the nearest minute", () => {
    const start = new Date("2026-07-25T10:00:00Z");
    const end = new Date("2026-07-25T10:30:40Z");
    expect(computeDurationMinutes(start, end)).toBe(31);
  });

  it("has a minimum of 1 minute", () => {
    const start = new Date("2026-07-25T10:00:00Z");
    const end = new Date("2026-07-25T10:00:10Z");
    expect(computeDurationMinutes(start, end)).toBe(1);
  });
});
