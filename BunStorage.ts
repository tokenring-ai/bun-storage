import type TokenRingApp from "@tokenring-ai/app";
import type { ConfigFieldMeta } from "@tokenring-ai/app/config/metadata";
import type { AppSessionCheckpoint } from "@tokenring-ai/app/schema";
import type { TokenRingService } from "@tokenring-ai/app/types";
import {
  type AgentCheckpointListItem,
  AgentCheckpointListItemSchema,
  type AgentCheckpointStorage,
  type NamedAgentCheckpoint,
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
import { SQL } from "bun";
import { z } from "zod";

import { MySQLQueries } from "./mysql/MySQLQueries.ts";
import { PostgresQueries } from "./postgres/PostgresQueries.ts";
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
    migrationsFolder: z
      .string()
      .exactOptional()
      .meta({ advanced: true, restartRequired: true, description: "Directory containing SQL migration files" } satisfies ConfigFieldMeta),
  })
  .prefault({})
  .meta({ label: "Bun Storage", description: "SQL-backed checkpoint storage using Bun's SQL client" } satisfies ConfigFieldMeta);

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
    if (url.password) url.password = "***";
    return url.toString();
  } catch {
    return connectionString;
  }
}

function toNumber(value: number | string | bigint): number {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  return Number.parseInt(value, 10);
}

function parseStoredState(value: string | Record<string, unknown>): Record<string, unknown> {
  if (typeof value !== "string") return value;
  return JSON.parse(value) as Record<string, unknown>;
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

type DialectQueries = SQLiteQueries | MySQLQueries | PostgresQueries;

export class BunStorage implements TokenRingService, AgentCheckpointStorage, AppCheckpointStorage {
  name = "BunStorage";
  description = "Bun SQL storage provider";

  readonly dialect: DatabaseDialect;
  readonly sql: SQL;
  readonly displayName: string;
  readonly queries: DialectQueries;
  //readonly config: z.infer<typeof bunStorageConfigSchema> & { connectionString: string };

  constructor({ connectionString }: z.infer<typeof bunStorageConfigSchema>, app: TokenRingApp) {
    connectionString ??= "sqlite:" + app.getWorkspaceResolvedPath("database.sqlite");
    this.dialect = detectDatabaseDialect(connectionString);
    this.sql = new SQL(connectionString);
    this.displayName = `Bun SQL ${this.dialect} (${sanitizedConnectionString(connectionString)})`;

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
  }

  async stop() {
    await this.sql.close();
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

  async listAgentCheckpoints(): Promise<AgentCheckpointListItem[]> {
    const result = await this.queries.listAgents();
    return result.map(row =>
      AgentCheckpointListItemSchema.parse({
        ...row,
        id: toNumber(row.id),
        createdAt: toNumber(row.createdAt),
      }),
    );
  }

  async storeAppCheckpoint(checkpoint: AppSessionCheckpoint): Promise<number> {
    const id = await this.queries.insertApp(
      checkpoint.sessionId,
      checkpoint.hostname,
      checkpoint.workspaceDirectory,
      JSON.stringify(checkpoint.state),
      checkpoint.createdAt,
    );
    return StoredAgentCheckpointSchema.shape.id.parse(id);
  }

  async retrieveAppCheckpoint(id: number): Promise<StoredAppCheckpoint | null> {
    const row = await this.queries.selectAppById(id);
    if (!row) return null;
    return normalizeAppCheckpointRow(row);
  }

  async listAppCheckpoints(): Promise<AppSessionListItem[]> {
    const result = await this.queries.listApps();
    return result.map(row =>
      AppCheckpointListItemSchema.parse({
        ...row,
        id: toNumber(row.id),
        createdAt: toNumber(row.createdAt),
      }),
    );
  }

  async retrieveLatestAppCheckpoint(): Promise<StoredAppCheckpoint | null> {
    const row = await this.queries.latestApp();
    if (!row) return null;
    return normalizeAppCheckpointRow(row);
  }
}
