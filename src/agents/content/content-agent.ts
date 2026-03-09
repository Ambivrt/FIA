import { BaseAgent, AgentTask, AgentResult } from "../base-agent";

export class ContentAgent extends BaseAgent {
  readonly name = "Content Agent";
  readonly slug = "content";

  async execute(task: AgentTask): Promise<AgentResult> {
    return super.execute(task);
  }
}
