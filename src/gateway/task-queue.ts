/// <reference types="node" />
import { SupabaseClient } from "@supabase/supabase-js";
import { AppConfig } from "../utils/config";
import { Logger } from "./logger";
import { AgentTask, AgentResult, ProgressCallback } from "../agents/base-agent";
import { createAgent } from "../agents/agent-factory";

const PRIORITY_ORDER: Record<string, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export type QueueCompleteCallback = (
  item: QueueItem,
  result?: AgentResult,
  error?: string
) => Promise<void>;

export interface QueueItem {
  id: string;
  agentSlug: string;
  task: AgentTask;
  priority: string;
  enqueuedAt: Date;
  status: "queued" | "running" | "completed" | "failed";
  result?: AgentResult;
  error?: string;
  onComplete?: QueueCompleteCallback;
}

export interface QueueStatus {
  paused: boolean;
  maxConcurrency: number;
  queued: number;
  running: number;
  completed: number;
  failed: number;
  items: Array<{ id: string; agentSlug: string; priority: string; status: string }>;
}

export class TaskQueue {
  private queue: QueueItem[] = [];
  private running: Map<string, QueueItem> = new Map();
  private completed: number = 0;
  private failed: number = 0;
  private paused: boolean = false;
  private counter: number = 0;

  constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger,
    private readonly supabase: SupabaseClient,
    private readonly maxConcurrency: number
  ) {}

  enqueue(
    agentSlug: string,
    task: AgentTask,
    priority: string = "normal",
    onComplete?: QueueCompleteCallback
  ): string {
    const id = `q-${Date.now()}-${++this.counter}`;
    const item: QueueItem = {
      id,
      agentSlug,
      task: { ...task, priority },
      priority,
      enqueuedAt: new Date(),
      status: "queued",
      onComplete,
    };

    this.queue.push(item);
    this.sortQueue();

    this.logger.info(`Task queued: ${agentSlug}/${task.type} (${priority})`, {
      action: "queue_enqueue",
      agent: agentSlug,
      details: { queue_id: id, priority, queue_size: this.queue.length },
    });

    // Trigger processing on next tick
    setImmediate(() => this.processNext());

    return id;
  }

  pause(): void {
    this.paused = true;
    this.logger.info("Task queue paused", { action: "queue_pause" });
  }

  resume(): void {
    this.paused = false;
    this.logger.info("Task queue resumed", { action: "queue_resume" });
    setImmediate(() => this.processNext());
  }

  drain(): QueueItem[] {
    const drained = this.queue.splice(0);
    this.logger.info(`Task queue drained: ${drained.length} items removed`, {
      action: "queue_drain",
      details: { count: drained.length },
    });
    return drained;
  }

  getStatus(): QueueStatus {
    const items = [
      ...this.queue.map((i) => ({
        id: i.id,
        agentSlug: i.agentSlug,
        priority: i.priority,
        status: i.status,
      })),
      ...[...this.running.values()].map((i) => ({
        id: i.id,
        agentSlug: i.agentSlug,
        priority: i.priority,
        status: i.status,
      })),
    ];

    return {
      paused: this.paused,
      maxConcurrency: this.maxConcurrency,
      queued: this.queue.length,
      running: this.running.size,
      completed: this.completed,
      failed: this.failed,
      items,
    };
  }

  isPaused(): boolean {
    return this.paused;
  }

  private sortQueue(): void {
    this.queue.sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority] ?? 2;
      const pb = PRIORITY_ORDER[b.priority] ?? 2;
      if (pa !== pb) return pa - pb;
      return a.enqueuedAt.getTime() - b.enqueuedAt.getTime();
    });
  }

  private processNext(): void {
    if (this.paused) return;
    if (this.running.size >= this.maxConcurrency) return;
    if (this.queue.length === 0) return;

    const item = this.queue.shift()!;
    item.status = "running";
    this.running.set(item.id, item);

    this.executeItem(item).then(() => {
      // Try to process more items
      setImmediate(() => this.processNext());
    });

    // Fill remaining concurrency slots
    if (this.running.size < this.maxConcurrency && this.queue.length > 0) {
      setImmediate(() => this.processNext());
    }
  }

  private async executeItem(item: QueueItem): Promise<void> {
    try {
      const agent = createAgent(
        item.agentSlug,
        this.config,
        this.logger,
        this.supabase
      );

      const result = await agent.execute(item.task);
      item.status = "completed";
      item.result = result;
      this.completed++;

      this.logger.info(`Queue item completed: ${item.agentSlug}/${item.task.type}`, {
        action: "queue_complete",
        agent: item.agentSlug,
        task_id: result.taskId,
        details: { queue_id: item.id, status: result.status },
      });

      await item.onComplete?.(item, result);
    } catch (err) {
      item.status = "failed";
      item.error = (err as Error).message;
      this.failed++;

      this.logger.error(`Queue item failed: ${item.agentSlug}/${item.task.type}: ${item.error}`, {
        action: "queue_error",
        agent: item.agentSlug,
        error: item.error,
        details: { queue_id: item.id },
      });

      await item.onComplete?.(item, undefined, item.error);
    } finally {
      this.running.delete(item.id);
    }
  }
}
