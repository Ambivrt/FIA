// Tester för CLI-formatering

import { relativeTime, shortId, formatCost, formatTokens, progressBar } from "../../cli/lib/formatters";

describe("relativeTime", () => {
  it("returnerar '—' för null", () => {
    expect(relativeTime(null)).toBe("—");
  });

  it("returnerar sekunder för nyliga tider", () => {
    const now = new Date(Date.now() - 5000).toISOString();
    expect(relativeTime(now)).toMatch(/^\d+s ago$/);
  });

  it("returnerar minuter för äldre tider", () => {
    const fiveMin = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(relativeTime(fiveMin)).toBe("5m ago");
  });

  it("returnerar timmar", () => {
    const twoHours = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    expect(relativeTime(twoHours)).toBe("2h ago");
  });

  it("returnerar dagar", () => {
    const threeDays = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(relativeTime(threeDays)).toBe("3d ago");
  });
});

describe("shortId", () => {
  it("returnerar de första 6 tecknen av ett UUID", () => {
    expect(shortId("abc123-def-456-ghi")).toBe("abc123");
  });

  it("hanterar korta strängar", () => {
    expect(shortId("ab")).toBe("ab");
  });
});

describe("formatCost", () => {
  it("formaterar kostnader i SEK", () => {
    expect(formatCost(4.2)).toBe("4.2 kr");
  });

  it("returnerar '—' för null", () => {
    expect(formatCost(null)).toBe("—");
  });

  it("hanterar noll", () => {
    expect(formatCost(0)).toBe("0.0 kr");
  });
});

describe("formatTokens", () => {
  it("visar tusentals med k-suffix", () => {
    expect(formatTokens(2847)).toBe("2.8k");
  });

  it("visar låga tal rakt av", () => {
    expect(formatTokens(500)).toBe("500");
  });

  it("returnerar '—' för null", () => {
    expect(formatTokens(null)).toBe("—");
  });
});

describe("progressBar", () => {
  it("visar full bar vid ratio 1", () => {
    const bar = progressBar(1, 5);
    expect(bar).toBe("\u2593\u2593\u2593\u2593\u2593");
  });

  it("visar tom bar vid ratio 0", () => {
    const bar = progressBar(0, 5);
    expect(bar).toBe("\u2591\u2591\u2591\u2591\u2591");
  });

  it("visar blandad bar", () => {
    const bar = progressBar(0.6, 5);
    expect(bar).toBe("\u2593\u2593\u2593\u2591\u2591");
  });
});
