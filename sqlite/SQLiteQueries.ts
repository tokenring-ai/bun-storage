import type { SQL } from "bun";
import type { AgentCheckpointRow, AgentMetricsRow, AppCheckpointRow } from "../BunStorage.ts";
import { buildListFilters, type NormalizedListOptions } from "../listQuery.ts";
import { CLEANUP_BATCH_SIZE } from "../retention.ts";
import sqliteInitSQL from "./init.sql" with { type: "text" };

const q = (ident: string) => `"${ident}"`;

export class SQLiteQueries {
  constructor(private readonly sql: SQL) {}

  async init(): Promise<void> {
    for (const statement of sqliteInitSQL.split(";")) {
      const trimmed = statement.trim();
      if (trimmed) {
        await this.sql.unsafe(trimmed);
      }
    }
  }

  async insertAgent(agentId: string, sessionId: string, name: string, agentType: string, state: string, createdAt: number): Promise<number> {
    const result = await this.sql.unsafe<{ lastInsertRowid: number }>(
      'INSERT INTO "AgentCheckpoints" ("agentId", "sessionId", "name", "agentType", "state", "createdAt") VALUES ($1, $2, $3, $4, $5, $6)',
      [agentId, sessionId, name, agentType, state, createdAt],
    );
    return Number(result.lastInsertRowid);
  }

  async insertApp(sessionId: string, hostname: string, workspaceDirectory: string, state: string, createdAt: number): Promise<number> {
    const result = await this.sql.unsafe<{ lastInsertRowid: number }>(
      'INSERT INTO "AppCheckpoints" ("sessionId", "hostname", "workspaceDirectory", "state", "createdAt") VALUES ($1, $2, $3, $4, $5)',
      [sessionId, hostname, workspaceDirectory, state, createdAt],
    );
    return Number(result.lastInsertRowid);
  }

  async selectAgentById(id: number): Promise<AgentCheckpointRow | null> {
    const result = await this.sql.unsafe<AgentCheckpointRow[]>('SELECT * FROM "AgentCheckpoints" WHERE "id" = $1 LIMIT 1', [id]);
    return result.length > 0 ? result[0]! : null;
  }

  async selectAppById(id: number): Promise<AppCheckpointRow | null> {
    const result = await this.sql.unsafe<AppCheckpointRow[]>('SELECT * FROM "AppCheckpoints" WHERE "id" = $1 LIMIT 1', [id]);
    return result.length > 0 ? result[0]! : null;
  }

  async listAgents(options: NormalizedListOptions): Promise<Omit<AgentCheckpointRow, "state">[]> {
    const f = buildListFilters("dollar", options, q, { sessionId: true, agentId: true, agentType: true });
    return await this.sql.unsafe<Omit<AgentCheckpointRow, "state">[]>(
      `SELECT "id", "sessionId", "name", "agentId", "agentType", "createdAt" FROM "AgentCheckpoints" ${f.whereSql} ${f.orderSql} ${f.limitSql}`,
      [...f.params, ...f.limitParams],
    );
  }

  async countAgents(options: NormalizedListOptions): Promise<number> {
    const f = buildListFilters("dollar", options, q, { sessionId: true, agentId: true, agentType: true });
    const rows = await this.sql.unsafe<{ count: number | string | bigint }[]>(`SELECT COUNT(*) AS "count" FROM "AgentCheckpoints" ${f.whereSql}`, f.params);
    return Number(rows[0]?.count ?? 0);
  }

  async listApps(options: NormalizedListOptions): Promise<Omit<AppCheckpointRow, "state">[]> {
    const f = buildListFilters("dollar", options, q, { sessionId: true, agentId: false, agentType: false });
    return await this.sql.unsafe<Omit<AppCheckpointRow, "state">[]>(
      `SELECT "id", "sessionId", "hostname", "workspaceDirectory", "createdAt" FROM "AppCheckpoints" ${f.whereSql} ${f.orderSql} ${f.limitSql}`,
      [...f.params, ...f.limitParams],
    );
  }

  async countApps(options: NormalizedListOptions): Promise<number> {
    const f = buildListFilters("dollar", options, q, { sessionId: true, agentId: false, agentType: false });
    const rows = await this.sql.unsafe<{ count: number | string | bigint }[]>(`SELECT COUNT(*) AS "count" FROM "AppCheckpoints" ${f.whereSql}`, f.params);
    return Number(rows[0]?.count ?? 0);
  }

  async latestApp(): Promise<AppCheckpointRow | null> {
    const rows = await this.sql.unsafe<AppCheckpointRow[]>('SELECT * FROM "AppCheckpoints" ORDER BY "createdAt" DESC LIMIT 1');
    return rows.length > 0 ? rows[0]! : null;
  }

  async upsertAgentMetrics(agentId: string, metrics: string, updatedAt: number): Promise<void> {
    await this.sql.unsafe(
      'INSERT INTO "AgentMetrics" ("agentId", "metrics", "updatedAt") VALUES ($1, $2, $3) ON CONFLICT("agentId") DO UPDATE SET "metrics" = excluded."metrics", "updatedAt" = excluded."updatedAt"',
      [agentId, metrics, updatedAt],
    );
  }

  async selectAgentMetricsByAgentId(agentId: string): Promise<AgentMetricsRow | null> {
    const result = await this.sql.unsafe<AgentMetricsRow[]>('SELECT * FROM "AgentMetrics" WHERE "agentId" = $1 LIMIT 1', [agentId]);
    return result.length > 0 ? result[0]! : null;
  }

  async listAgentMetrics(): Promise<AgentMetricsRow[]> {
    return await this.sql.unsafe<AgentMetricsRow[]>('SELECT * FROM "AgentMetrics" ORDER BY "updatedAt" DESC');
  }

  async deleteAgentMetrics(agentId: string): Promise<void> {
    await this.sql.unsafe('DELETE FROM "AgentMetrics" WHERE "agentId" = $1', [agentId]);
  }

  /** Delete agent checkpoints older than cutoff; optionally preserve newest per agent. Returns { deleted, bytes }. */
  async deleteAgentCheckpointsOlderThan(cutoffMs: number, keepLatest: boolean, batchSize = CLEANUP_BATCH_SIZE): Promise<{ deleted: number; bytes: number }> {
    let deleted = 0;
    let bytes = 0;
    for (;;) {
      const keepClause = keepLatest
        ? `AND "id" NOT IN (
            SELECT "id" FROM (
              SELECT "id", ROW_NUMBER() OVER (PARTITION BY "agentId" ORDER BY "createdAt" DESC, "id" DESC) AS rn
              FROM "AgentCheckpoints"
            ) ranked WHERE rn = 1
          )`
        : "";
      const candidates = await this.sql.unsafe<{ id: number; bytes: number | string | bigint }[]>(
        `SELECT "id", LENGTH("state") AS "bytes" FROM "AgentCheckpoints"
         WHERE "createdAt" < $1 ${keepClause}
         ORDER BY "createdAt" ASC
         LIMIT $2`,
        [cutoffMs, batchSize],
      );
      if (candidates.length === 0) break;
      const ids = candidates.map(r => r.id);
      bytes += candidates.reduce((sum, r) => sum + Number(r.bytes), 0);
      const placeholders = ids.map((_, idx) => `$${idx + 1}`).join(", ");
      await this.sql.unsafe(`DELETE FROM "AgentCheckpoints" WHERE "id" IN (${placeholders})`, ids);
      deleted += ids.length;
      if (candidates.length < batchSize) break;
    }
    return { deleted, bytes };
  }

  /** Keep only the newest maxPerAgent checkpoints per agent. */
  async deleteAgentCheckpointsBeyondPerAgent(maxPerAgent: number, batchSize = CLEANUP_BATCH_SIZE): Promise<{ deleted: number; bytes: number }> {
    let deleted = 0;
    let bytes = 0;
    for (;;) {
      const candidates = await this.sql.unsafe<{ id: number; bytes: number | string | bigint }[]>(
        `SELECT "id", LENGTH("state") AS "bytes" FROM (
           SELECT "id", "state",
                  ROW_NUMBER() OVER (PARTITION BY "agentId" ORDER BY "createdAt" DESC, "id" DESC) AS rn
           FROM "AgentCheckpoints"
         ) ranked
         WHERE rn > $1
         LIMIT $2`,
        [maxPerAgent, batchSize],
      );
      if (candidates.length === 0) break;
      const ids = candidates.map(r => r.id);
      bytes += candidates.reduce((sum, r) => sum + Number(r.bytes), 0);
      const placeholders = ids.map((_, idx) => `$${idx + 1}`).join(", ");
      await this.sql.unsafe(`DELETE FROM "AgentCheckpoints" WHERE "id" IN (${placeholders})`, ids);
      deleted += ids.length;
      if (candidates.length < batchSize) break;
    }
    return { deleted, bytes };
  }

  async deleteAppCheckpointsOlderThan(cutoffMs: number, batchSize = CLEANUP_BATCH_SIZE): Promise<{ deleted: number; bytes: number }> {
    let deleted = 0;
    let bytes = 0;
    for (;;) {
      const candidates = await this.sql.unsafe<{ id: number; bytes: number | string | bigint }[]>(
        `SELECT "id", LENGTH("state") AS "bytes" FROM "AppCheckpoints"
         WHERE "createdAt" < $1
         ORDER BY "createdAt" ASC
         LIMIT $2`,
        [cutoffMs, batchSize],
      );
      if (candidates.length === 0) break;
      const ids = candidates.map(r => r.id);
      bytes += candidates.reduce((sum, r) => sum + Number(r.bytes), 0);
      const placeholders = ids.map((_, idx) => `$${idx + 1}`).join(", ");
      await this.sql.unsafe(`DELETE FROM "AppCheckpoints" WHERE "id" IN (${placeholders})`, ids);
      deleted += ids.length;
      if (candidates.length < batchSize) break;
    }
    return { deleted, bytes };
  }

  async deleteAppCheckpointsBeyondTotal(maxTotal: number, batchSize = CLEANUP_BATCH_SIZE): Promise<{ deleted: number; bytes: number }> {
    let deleted = 0;
    let bytes = 0;
    for (;;) {
      const candidates = await this.sql.unsafe<{ id: number; bytes: number | string | bigint }[]>(
        `SELECT "id", LENGTH("state") AS "bytes" FROM (
           SELECT "id", "state",
                  ROW_NUMBER() OVER (ORDER BY "createdAt" DESC, "id" DESC) AS rn
           FROM "AppCheckpoints"
         ) ranked
         WHERE rn > $1
         LIMIT $2`,
        [maxTotal, batchSize],
      );
      if (candidates.length === 0) break;
      const ids = candidates.map(r => r.id);
      bytes += candidates.reduce((sum, r) => sum + Number(r.bytes), 0);
      const placeholders = ids.map((_, idx) => `$${idx + 1}`).join(", ");
      await this.sql.unsafe(`DELETE FROM "AppCheckpoints" WHERE "id" IN (${placeholders})`, ids);
      deleted += ids.length;
      if (candidates.length < batchSize) break;
    }
    return { deleted, bytes };
  }

  async deleteAgentMetricsOlderThan(cutoffMs: number, batchSize = CLEANUP_BATCH_SIZE): Promise<{ deleted: number; bytes: number }> {
    let deleted = 0;
    let bytes = 0;
    for (;;) {
      const candidates = await this.sql.unsafe<{ agentId: string; bytes: number | string | bigint }[]>(
        `SELECT "agentId", LENGTH("metrics") AS "bytes" FROM "AgentMetrics"
         WHERE "updatedAt" < $1
         ORDER BY "updatedAt" ASC
         LIMIT $2`,
        [cutoffMs, batchSize],
      );
      if (candidates.length === 0) break;
      const agentIds = candidates.map(r => r.agentId);
      bytes += candidates.reduce((sum, r) => sum + Number(r.bytes), 0);
      const placeholders = agentIds.map((_, idx) => `$${idx + 1}`).join(", ");
      await this.sql.unsafe(`DELETE FROM "AgentMetrics" WHERE "agentId" IN (${placeholders})`, agentIds);
      deleted += agentIds.length;
      if (candidates.length < batchSize) break;
    }
    return { deleted, bytes };
  }
}
