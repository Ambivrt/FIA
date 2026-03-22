import { resolveDisplayStatus, type DisplayStatus } from "../src/shared/display-status";

describe("resolveDisplayStatus", () => {
  // Priority 1: Kill switch trumps everything
  it("returns killed when kill switch is active, even if agent is in error", () => {
    const result = resolveDisplayStatus({ status: "error" }, true, false);
    expect(result.status).toBe("killed");
  });

  it("returns killed when kill switch is active, even if agent is paused", () => {
    const result = resolveDisplayStatus({ status: "paused" }, true, false);
    expect(result.status).toBe("killed");
  });

  it("returns killed when kill switch is active, even with running tasks", () => {
    const result = resolveDisplayStatus({ status: "active" }, true, true);
    expect(result.status).toBe("killed");
  });

  // Priority 2: Error trumps paused and working
  it("returns error when agent status is error", () => {
    const result = resolveDisplayStatus({ status: "error" }, false, false);
    expect(result.status).toBe("error");
  });

  it("returns error even with running tasks", () => {
    const result = resolveDisplayStatus({ status: "error" }, false, true);
    expect(result.status).toBe("error");
  });

  // Priority 3: Paused trumps working
  it("returns paused when agent status is paused", () => {
    const result = resolveDisplayStatus({ status: "paused" }, false, false);
    expect(result.status).toBe("paused");
  });

  it("returns paused even with running tasks", () => {
    const result = resolveDisplayStatus({ status: "paused" }, false, true);
    expect(result.status).toBe("paused");
  });

  // Priority 4: Working when running tasks
  it("returns working when agent has running tasks", () => {
    const result = resolveDisplayStatus({ status: "active" }, false, true);
    expect(result.status).toBe("working");
  });

  it("returns working for idle agent with running tasks", () => {
    const result = resolveDisplayStatus({ status: "idle" }, false, true);
    expect(result.status).toBe("working");
  });

  // Priority 5: Online otherwise
  it("returns online for active agent without running tasks", () => {
    const result = resolveDisplayStatus({ status: "active" }, false, false);
    expect(result.status).toBe("online");
  });

  it("returns online for idle agent without running tasks", () => {
    const result = resolveDisplayStatus({ status: "idle" }, false, false);
    expect(result.status).toBe("online");
  });

  // All five statuses return correct metadata
  describe("metadata for each status", () => {
    const cases: { status: DisplayStatus; label: string; labelSv: string; color: string; symbol: string }[] = [
      { status: "online", label: "Online", labelSv: "Redo", color: "#22c55e", symbol: "●" },
      { status: "working", label: "Working", labelSv: "Arbetar", color: "#eab308", symbol: "●" },
      { status: "paused", label: "Paused", labelSv: "Pausad", color: "#9ca3af", symbol: "●" },
      { status: "killed", label: "Killed", labelSv: "Avstängd", color: "#000000", symbol: "⬤" },
      { status: "error", label: "Error", labelSv: "Fel", color: "#ef4444", symbol: "✗" },
    ];

    for (const c of cases) {
      it(`${c.status} returns correct label, labelSv, color, symbol`, () => {
        let result;
        switch (c.status) {
          case "online":
            result = resolveDisplayStatus({ status: "active" }, false, false);
            break;
          case "working":
            result = resolveDisplayStatus({ status: "active" }, false, true);
            break;
          case "paused":
            result = resolveDisplayStatus({ status: "paused" }, false, false);
            break;
          case "killed":
            result = resolveDisplayStatus({ status: "active" }, true, false);
            break;
          case "error":
            result = resolveDisplayStatus({ status: "error" }, false, false);
            break;
        }

        expect(result.status).toBe(c.status);
        expect(result.label).toBe(c.label);
        expect(result.labelSv).toBe(c.labelSv);
        expect(result.color).toBe(c.color);
        expect(result.symbol).toBe(c.symbol);
      });
    }
  });
});
