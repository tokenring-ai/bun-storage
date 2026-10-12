import type TokenRingApp from "@tokenring-ai/app";
import type { ConfigFieldMeta } from "@tokenring-ai/app/config/metadata";
import type { AppSessionCheckpoint } from "@tokenring-ai/app/schema";
import type { TokenRingService } from "@tokenring-ai/app/types";
import {
  type AgentCheckpointListItem,
  AgentCheckpointListItemSchema,
  type AgentCheckpointStorage,
  type CheckpointListOptions,
  type NamedAgentCheckpoint,
  type PaginatedResult,
  type StoredAgentCheckpoint,
  StoredAgentCheckpointSchema,
} from "@tokenring-ai/checkpoint/AgentCheckpointStorage";
import {
  AppCheckpointListItemSchema,
  type AppCheckpointStorage,
  type AppSessionListItem,
  type StoredAppCheckpoint,
  StoredAppCheckpointSchema,
} from "@tokenring-ai/checkpoint/AppCheckpointStorage";
import {
  type AgentMetrics,
  AgentMetricsDataSchema,
  type AgentMetricsListItem,
  AgentMetricsSchema,
  type MetricsStorage,
  type StoredAgentMetrics,
  toAgentMetricsListItem,
} from "@tokenring-ai/metrics/MetricsStorage";
import { SQL } from "bun";
import { z } from "zod";

import { normalizeListOptions } from "./listQuery.ts";
import { MySQLQueries } from "./mysql/MySQLQueries.ts";
import { PostgresQueries } from "./postgres/PostgresQueries.ts";
import { type CleanupStats, DEFAULT_CLEANUP_INTERVAL, parseDurationMs, type RetentionConfig, RetentionConfigSchema } from "./retention.ts";
import { SQLiteQueries } from "./sqlite/SQLiteQueries.ts";

type DatabaseDialect = "sqlite" | "mysql" | "postgres";

export type AgentCheckpointRow = {
  id: number | string | bigint;
  sessionId: string;
  agentId: string;
  name: string;
  agentType: string;
  state: string | Record<string, unknown>;
  createdAt: number | string | bigint;
};

export type AppCheckpointRow = {
  id: number | string | bigint;
  sessionId: string;
  hostname: string;
  workspaceDirectory: string;
  state: string | Record<string, unknown>;
  createdAt: number | string | bigint;
};

export type AgentMetricsRow = {
  agentId: string;
  metrics: string | Record<string, unknown>;
  updatedAt: number | string | bigint;
};

export const bunStorageConfigSchema = z
  .object({
    connectionString: z
      .string()
      .optional()
      .meta({
        sensitive: true,
        restartRequired: true,
        description: "Database connection string (sqlite:, mysql://, postgres://)",
      } satisfies ConfigFieldMeta),
    retention: RetentionConfigSchema.meta({
      description: "Data retention and auto-cleanup policies for checkpoints and metrics",
    } satisfies ConfigFieldMeta),
  })
  .prefault({})
  .meta({ label: "Bun Storage", description: "SQL-backed checkpoint and metrics storage using Bun's SQL client" } satisfies ConfigFieldMeta);

export type { CleanupStats, RetentionConfig };

export function detectDatabaseDialect(connectionString: string): DatabaseDialect {
  if (
    connectionString === ":memory:" ||
    connectionString.startsWith("sqlite://") ||
    connectionString.startsWith("sqlite:") ||
    connectionString.startsWith("file://") ||
    connectionString.startsWith("file:")
  ) {
    return "sqlite";
  }

  if (connectionString.startsWith("mysql://") || connectionString.startsWith("mysql2://") || connectionString.startsWith("mariadb://")) {
    return "mysql";
  }

  return "postgres";
}

function sanitizedConnectionString(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    if (url.password) {
      url.password = "***";
      return url.toString();
    }
  } catch {
    // Non-URL DSNs and malformed strings fall through to regex masking.
  }
  // Mask user:password@host whether or not a scheme:// prefix is present.
  return connectionString.replace(/(\/\/)?([^:/?#\s]+):([^@/\s]+)@/, "$1$2:***@");
}

function toNumber(value: number | string | bigint): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  return Number.parseInt(value, 10);
}

function parseStoredState(value: string | Record<string, unknown>): Record<string, unknown> {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse stored state JSON: ${message}`, { cause: error });
  }
}

function normalizeAgentCheckpointRow(row: AgentCheckpointRow): StoredAgentCheckpoint {
  return StoredAgentCheckpointSchema.parse({
    ...row,
    id: toNumber(row.id),
    state: parseStoredState(row.state),
    createdAt: toNumber(row.createdAt),
  });
}

function normalizeAppCheckpointRow(row: AppCheckpointRow): StoredAppCheckpoint {
  return StoredAppCheckpointSchema.parse({
    ...row,
    id: toNumber(row.id),
    state: parseStoredState(row.state),
    createdAt: toNumber(row.createdAt),
  });
}

function normalizeAgentMetricsRow(row: AgentMetricsRow): StoredAgentMetrics {
  return AgentMetricsSchema.parse({
    agentId: row.agentId,
    metrics: AgentMetricsDataSchema.parse(parseStoredState(row.metrics)),
    updatedAt: toNumber(row.updatedAt),
  });
}

type DialectQueries = SQLiteQueries | MySQLQueries | PostgresQueries;

export class BunStorage implements TokenRingService, AgentCheckpointStorage, AppCheckpointStorage, MetricsStorage {
  name = "BunStorage";
  description = "Bun SQL storage provider";

  readonly dialect: DatabaseDialect;
  readonly sql: SQL;
  readonly displayName: string;
  readonly queries: DialectQueries;
  readonly retention: RetentionConfig | undefined;

  private readonly app: TokenRingApp;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private cleanupRunning = false;
  private cleanupInFlight: Promise<void> | null = null;
  private closed = false;

  constructor(config: z.infer<typeof bunStorageConfigSchema>, app: TokenRingApp) {
    let connectionString = config.connectionString?.trim() || undefined;
    connectionString ??= "sqlite:" + app.getWorkspaceResolvedPath("database.sqlite");
    this.dialect = detectDatabaseDialect(connectionString);
    this.sql = new SQL(connectionString);
    this.displayName = `Bun SQL ${this.dialect} (${sanitizedConnectionString(connectionString)})`;
    this.retention = config.retention;
    this.app = app;

    switch (this.dialect) {
      case "sqlite":
        this.queries = new SQLiteQueries(this.sql);
        break;
      case "mysql":
        this.queries = new MySQLQueries(this.sql);
        break;
      case "postgres":
        this.queries = new PostgresQueries(this.sql);
        break;
    }
  }

  async start() {
    await this.queries.init();

    if (this.retention) {
      try {
        const stats = await this.cleanup();
        this.logCleanupStats(stats, "startup");
      } catch (error) {
        this.app.serviceError(this, "Retention cleanup failed on start:", error);
      }

      const interval = this.retention.cleanupInterval ?? DEFAULT_CLEANUP_INTERVAL;
      this.scheduleCleanup(interval);
    }
  }

  async stop() {
    if (this.closed) return;
    this.closed = true;
    if (this.cleanupTimer != null) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    if (this.cleanupInFlight) {
      await this.cleanupInFlight;
    }
    await this.sql.close();
  }

  /**
   * Schedule periodic retention cleanup. Replaces any existing schedule.
   * @param interval Duration string such as "1h" or "24h"
   */
  scheduleCleanup(interval: string): void {
    if (this.cleanupTimer != null) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    const ms = parseDurationMs(interval);
    this.cleanupTimer = setInterval(() => {
      void this.runScheduledCleanup();
    }, ms);
    // Allow the process to exit even if the timer is still scheduled.
    this.cleanupTimer.unref();
  }

  private async runScheduledCleanup(): Promise<void> {
    if (this.closed || this.cleanupRunning) return;
    this.cleanupRunning = true;
    this.cleanupInFlight = this.executeScheduledCleanup();
    try {
      await this.cleanupInFlight;
    } finally {
      this.cleanupRunning = false;
      this.cleanupInFlight = null;
    }
  }

  private async executeScheduledCleanup(): Promise<void> {
    if (this.closed) return;
    try {
      const stats = await this.cleanup();
      this.logCleanupStats(stats, "scheduled");
    } catch (error) {
      this.app.serviceError(this, "Scheduled retention cleanup failed:", error);
    }
  }

  private async applyCleanupPolicy(label: string, run: () => Promise<{ deleted: number; bytes: number }>): Promise<{ deleted: number; bytes: number }> {
    try {
      return await run();
    } catch (error) {
      this.app.serviceError(this, `${label} cleanup failed:`, error);
      return { deleted: 0, bytes: 0 };
    }
  }

  private logCleanupStats(stats: CleanupStats, reason: string): void {
    const total = stats.agentCheckpointsDeleted + stats.appCheckpointsDeleted + stats.agentMetricsDeleted;
    if (total === 0) return;
    this.app.serviceOutput(
      this,
      `Retention cleanup (${reason}): deleted ${stats.agentCheckpointsDeleted} agent checkpoints, ` +
        `${stats.appCheckpointsDeleted} app checkpoints, ${stats.agentMetricsDeleted} agent metrics ` +
        `(~${stats.spaceFreedBytes} bytes of payload data)`,
    );
  }

  /**
   * Run retention cleanup once according to configured policies.
   * Safe to call when retention is not configured (no-ops with zero stats).
   */
  async cleanup(): Promise<CleanupStats> {
    const stats: CleanupStats = {
      agentCheckpointsDeleted: 0,
      appCheckpointsDeleted: 0,
      agentMetricsDeleted: 0,
      spaceFreedBytes: 0,
    };

    const retention = this.retention;
    if (!retention) return stats;

    const now = Date.now();
    const agentCfg = retention.agentCheckpoints;
    if (agentCfg) {
      if (agentCfg.maxAge) {
        const cutoff = now - parseDurationMs(agentCfg.maxAge);
        const keepLatest = agentCfg.keepLatest ?? true;
        const result = await this.applyCleanupPolicy("Agent checkpoint maxAge", () => this.queries.deleteAgentCheckpointsOlderThan(cutoff, keepLatest));
        stats.agentCheckpointsDeleted += result.deleted;
        stats.spaceFreedBytes += result.bytes;
      }
      if (agentCfg.maxPerAgent != null) {
        const maxPerAgent = agentCfg.maxPerAgent;
        const result = await this.applyCleanupPolicy("Agent checkpoint maxPerAgent", () => this.queries.deleteAgentCheckpointsBeyondPerAgent(maxPerAgent));
        stats.agentCheckpointsDeleted += result.deleted;
        stats.spaceFreedBytes += result.bytes;
      }
    }

    const appCfg = retention.appCheckpoints;
    if (appCfg) {
      if (appCfg.maxAge) {
        const cutoff = now - parseDurationMs(appCfg.maxAge);
        const result = await this.applyCleanupPolicy("App checkpoint maxAge", () => this.queries.deleteAppCheckpointsOlderThan(cutoff));
        stats.appCheckpointsDeleted += result.deleted;
        stats.spaceFreedBytes += result.bytes;
      }
      if (appCfg.maxTotal != null) {
        const maxTotal = appCfg.maxTotal;
        const result = await this.applyCleanupPolicy("App checkpoint maxTotal", () => this.queries.deleteAppCheckpointsBeyondTotal(maxTotal));
        stats.appCheckpointsDeleted += result.deleted;
        stats.spaceFreedBytes += result.bytes;
      }
    }

    const metricsCfg = retention.agentMetrics;
    if (metricsCfg?.maxAge) {
      const cutoff = now - parseDurationMs(metricsCfg.maxAge);
      const result = await this.applyCleanupPolicy("Agent metrics maxAge", () => this.queries.deleteAgentMetricsOlderThan(cutoff));
      stats.agentMetricsDeleted += result.deleted;
      stats.spaceFreedBytes += result.bytes;
    }

    return stats;
  }

  async storeAgentCheckpoint(checkpoint: NamedAgentCheckpoint): Promise<number> {
    const id = await this.queries.insertAgent(
      checkpoint.agentId,
      checkpoint.sessionId,
      checkpoint.name,
      checkpoint.agentType,
      JSON.stringify(checkpoint.state),
      checkpoint.createdAt,
    );
    return StoredAgentCheckpointSchema.shape.id.parse(id);
  }

  async retrieveAgentCheckpoint(id: number): Promise<StoredAgentCheckpoint | null> {
    const row = await this.queries.selectAgentById(id);
    if (!row) return null;
    return normalizeAgentCheckpointRow(row);
  }

  async listAgentCheckpoints(options?: CheckpointListOptions): Promise<PaginatedResult<AgentCheckpointListItem>> {
    const normalized = normalizeListOptions(options);
    const [rows, total] = await Promise.all([this.queries.listAgents(normalized), this.queries.countAgents(normalized)]);
    const items = rows.map(row =>
      AgentCheckpointListItemSchema.parse({
        ...row,
        id: toNumber(row.id),
        createdAt: toNumber(row.createdAt),
      }),
    );
    return {
      items,
      total,
      hasMore: normalized.offset + items.length < total,
      limit: normalized.limit,
      offset: normalized.offset,
    };
  }

  async storeAppCheckpoint(checkpoint: AppSessionCheckpoint): Promise<number> {
    const id = await this.queries.insertApp(
      checkpoint.sessionId,
      checkpoint.hostname,
      checkpoint.workspaceDirectory,
      JSON.stringify(checkpoint.state),
      checkpoint.createdAt,
    );
    return StoredAppCheckpointSchema.shape.id.parse(id);
  }

  async retrieveAppCheckpoint(id: number): Promise<StoredAppCheckpoint | null> {
    const row = await this.queries.selectAppById(id);
    if (!row) return null;
    return normalizeAppCheckpointRow(row);
  }

  async listAppCheckpoints(options?: CheckpointListOptions): Promise<PaginatedResult<AppSessionListItem>> {
    const normalized = normalizeListOptions(options);
    const [rows, total] = await Promise.all([this.queries.listApps(normalized), this.queries.countApps(normalized)]);
    const items = rows.map(row =>
      AppCheckpointListItemSchema.parse({
        ...row,
        id: toNumber(row.id),
        createdAt: toNumber(row.createdAt),
      }),
    );
    return {
      items,
      total,
      hasMore: normalized.offset + items.length < total,
      limit: normalized.limit,
      offset: normalized.offset,
    };
  }

  async retrieveLatestAppCheckpoint(): Promise<StoredAppCheckpoint | null> {
    const row = await this.queries.latestApp();
    if (!row) return null;
    return normalizeAppCheckpointRow(row);
  }

  async storeAgentMetrics(data: AgentMetrics): Promise<void> {
    const parsed = AgentMetricsSchema.parse(data);
    await this.queries.upsertAgentMetrics(parsed.agentId, JSON.stringify(parsed.metrics), parsed.updatedAt);
  }

  async retrieveAgentMetrics(agentId: string): Promise<StoredAgentMetrics | null> {
    const row = await this.queries.selectAgentMetricsByAgentId(agentId);
    if (!row) return null;
    return normalizeAgentMetricsRow(row);
  }

  async listAgentMetrics(): Promise<AgentMetricsListItem[]> {
    const rows = await this.queries.listAgentMetrics();
    return rows.map(row => {
      const stored = normalizeAgentMetricsRow(row);
      return toAgentMetricsListItem(stored.agentId, stored.metrics, stored.updatedAt);
    });
  }

  async listAllAgentMetrics(): Promise<StoredAgentMetrics[]> {
    const rows = await this.queries.listAgentMetrics();
    return rows.map(normalizeAgentMetricsRow);
  }

  async deleteAgentMetrics(agentId: string): Promise<void> {
    await this.queries.deleteAgentMetrics(agentId);
  }
}
