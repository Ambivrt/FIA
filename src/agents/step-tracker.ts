/**
 * Tracks agent pipeline steps with timestamps for process visualization.
 * Each agent phase transition is recorded so the frontend can render
 * a stepper showing completed, active, and failed steps.
 */

export interface StepEntry {
  name: string;
  status: "active" | "completed" | "error";
  started_at: string;
  completed_at?: string;
  error?: string;
}

export class StepTracker {
  private steps: StepEntry[] = [];

  /** Mark the previous active step as completed and start a new one. */
  startStep(name: string): void {
    const prev = this.steps.find((s) => s.status === "active");
    if (prev) {
      prev.status = "completed";
      prev.completed_at = new Date().toISOString();
    }
    this.steps.push({ name, status: "active", started_at: new Date().toISOString() });
  }

  /** Mark the current active step as failed with an error message. */
  failStep(error: string): void {
    const active = this.steps.find((s) => s.status === "active");
    if (active) {
      active.status = "error";
      active.completed_at = new Date().toISOString();
      active.error = error;
    }
  }

  /** Mark the current active step as completed (call at end of pipeline). */
  complete(): void {
    const active = this.steps.find((s) => s.status === "active");
    if (active) {
      active.status = "completed";
      active.completed_at = new Date().toISOString();
    }
  }

  /** Return a copy of the steps array for storage in content_json. */
  toArray(): StepEntry[] {
    return [...this.steps];
  }
}
