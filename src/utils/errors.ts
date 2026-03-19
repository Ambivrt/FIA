export class FIAError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "FIAError";
  }
}

export class LLMError extends FIAError {
  constructor(
    message: string,
    public readonly model: string,
  ) {
    super(message, "LLM_ERROR");
    this.name = "LLMError";
  }
}

export class AgentError extends FIAError {
  constructor(
    message: string,
    public readonly agentSlug: string,
  ) {
    super(message, "AGENT_ERROR");
    this.name = "AgentError";
  }
}

export class EscalationError extends FIAError {
  constructor(
    message: string,
    public readonly agentSlug: string,
    public readonly taskId: string,
  ) {
    super(message, "ESCALATION_REQUIRED");
    this.name = "EscalationError";
  }
}
