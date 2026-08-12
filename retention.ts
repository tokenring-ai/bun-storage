import { z } from "zod";

/** Duration strings like "30d", "1h", "15m", "60s", "500ms". */
export const DurationStringSchema = z.string().regex(/^\d+(ms|s|m|h|d)$/, 'Expected duration like "30d", "1h", "15m", "60s", or "500ms"');

export type DurationString = z.infer<typeof DurationStringSchema>;

const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

export function parseDurationMs(value: string): number {
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(value);
  if (!match) {
    throw new Error(`Invalid duration string: ${value}`);
  }
  const amount = Number.parseInt(match[1]!, 10);
  const unit = match[2]!;
  return amount * UNIT_MS[unit]!;
}

export const AgentCheckpointRetentionSchema = z
  .object({
    maxAge: DurationStringSchema.optional(),
    maxPerAgent: z.number().int().positive().optional(),
    /** When true (default), never delete the newest checkpoint per agent during maxAge pruning. */
    keepLatest: z.boolean().optional(),
  })
  .optional();

export const AppCheckpointRetentionSchema = z
  .object({
    maxAge: DurationStringSchema.optional(),
    maxTotal: z.number().int().positive().optional(),
  })
  .optional();

export const AgentMetricsRetentionSchema = z
  .object({
    maxAge: DurationStringSchema.optional(),
  })
  .optional();

export const RetentionConfigSchema = z
  .object({
    agentCheckpoints: AgentCheckpointRetentionSchema,
    appCheckpoints: AppCheckpointRetentionSchema,
    agentMetrics: AgentMetricsRetentionSchema,
    /** How often to run cleanup when retention is configured. Default: "24h". */
    cleanupInterval: DurationStringSchema.optional(),
  })
  .optional();

export type RetentionConfig = z.input<typeof RetentionConfigSchema>;

export type CleanupStats = {
  agentCheckpointsDeleted: number;
  appCheckpointsDeleted: number;
  agentMetricsDeleted: number;
  spaceFreedBytes: number;
};

export const DEFAULT_CLEANUP_INTERVAL = "24h";
export const CLEANUP_BATCH_SIZE = 500;
