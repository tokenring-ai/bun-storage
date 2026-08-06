import type { SQL } from "bun";
import type { AgentCheckpointRow, AppCheckpointRow } from "../BunStorage.ts";
import mysqlInitSQL from "./init.sql" with { type: "text" };

export class MySQLQueries {
  constructor(private readonly sql: SQL) {}

  async init(): Promise<void> {
    for (const statement of mysqlInitSQL.split(";")) {
      const trimmed = statement.trim();
      if (trimmed) {
        await this.sql.unsafe(trimmed);
      }
    }
  }

  async insertAgent(agentId: string, sessionId: string, name: string, agentType: string, state: string, createdAt: number): Promise<number> {
    const result = await this.sql.unsafe<{ lastInsertRowid: number }>(
      "INSERT INTO `AgentCheckpoints` (`agentId`, `sessionId`, `name`, `agentType`, `state`, `createdAt`) VALUES (?, ?, ?, ?, ?, ?)",
      [agentId, sessionId, name, agentType, state, createdAt],
    );
    return Number(result.lastInsertRowid);
  }

  async insertApp(sessionId: string, hostname: string, workspaceDirectory: string, state: string, createdAt: number): Promise<number> {
    const result = await this.sql.unsafe<{ lastInsertRowid: number }>(
      "INSERT INTO `AppCheckpoints` (`sessionId`, `hostname`, `workspaceDirectory`, `state`, `createdAt`) VALUES (?, ?, ?, ?, ?)",
      [sessionId, hostname, workspaceDirectory, state, createdAt],
    );
    return Number(result.lastInsertRowid);
  }

  async selectAgentById(id: number): Promise<AgentCheckpointRow | null> {
    const result = await this.sql.unsafe<AgentCheckpointRow[]>("SELECT * FROM `AgentCheckpoints` WHERE `id` = ? LIMIT 1", [id]);
    return result.length > 0 ? result[0]! : null;
  }

  async selectAppById(id: number): Promise<AppCheckpointRow | null> {
    const result = await this.sql.unsafe<AppCheckpointRow[]>("SELECT * FROM `AppCheckpoints` WHERE `id` = ? LIMIT 1", [id]);
    return result.length > 0 ? result[0]! : null;
  }

  async listAgents(): Promise<Omit<AgentCheckpointRow, "state">[]> {
    return await this.sql.unsafe<Omit<AgentCheckpointRow, "state">[]>(
      "SELECT `id`, `sessionId`, `name`, `agentId`, `agentType`, `createdAt` FROM `AgentCheckpoints` ORDER BY `createdAt` DESC",
    );
  }

  async listApps(): Promise<Omit<AppCheckpointRow, "state">[]> {
    return await this.sql.unsafe<Omit<AppCheckpointRow, "state">[]>(
      "SELECT `id`, `sessionId`, `hostname`, `workspaceDirectory`, `createdAt` FROM `AppCheckpoints` ORDER BY `createdAt` DESC",
    );
  }

  async latestApp(): Promise<AppCheckpointRow | null> {
    const rows = await this.sql.unsafe<AppCheckpointRow[]>("SELECT * FROM `AppCheckpoints` ORDER BY `createdAt` DESC LIMIT 1");
    return rows.length > 0 ? rows[0]! : null;
  }
}
