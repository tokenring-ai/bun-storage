import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { AppSessionCheckpoint } from "@tokenring-ai/app/schema";
import createTestingApp from "@tokenring-ai/app/test/createTestingApp.test";
import type { NamedAgentCheckpoint } from "@tokenring-ai/checkpoint/AgentCheckpointStorage";
import type { BunStorage } from "./BunStorage.ts";

const isBun = typeof Bun !== "undefined";

function isDockerAvailable(): boolean {
  try {
    const result = Bun.spawnSync(["docker", "info"], {
      stdout: "ignore",
      stderr: "ignore",
    });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

const hasDocker = isBun && isDockerAvailable();

/**
 * BunStorage Tests
 *
 * Note: These tests require Bun runtime because the storage implementation
 * uses Bun's native `SQL` client. Tests will be skipped when running in
 * Node.js environment.
 *
 * MySQL (MariaDB) and PostgreSQL coverage uses Testcontainers and needs Docker:
 *   bun test pkg/bun-storage
 */

describe("BunAgentStateStorage - SQLite (Bun Required)", () => {
  if (!isBun) {
    it.skip("SQLite tests require Bun runtime", () => {
      // This test is skipped when Bun is not available
      expect(true).toBe(true);
    });
    return;
  }

  describe("SQLite Storage Operations", () => {
    let storage: BunStorage;
    const dbPath = "./test-agent-state.db";

    beforeAll(async () => {
      // Use dynamic import to avoid Bun SQL import errors in Node.js
      const { BunStorage } = await import("./BunStorage.js");
      storage = new BunStorage(
        {
          connectionString: `sqlite://${dbPath}`,
        },
        createTestingApp(),
      );
      await storage.start();
    });

    afterAll(async () => {
      await storage.stop();
      // Cleanup: remove test database file
      const { unlinkSync, existsSync } = await import("node:fs");
      if (existsSync(dbPath)) {
        unlinkSync(dbPath);
      }
    });

    it("should have displayName property", () => {
      expect(storage.displayName).toBeDefined();
      expect(typeof storage.displayName).toBe("string");
    });

    it("should store and retrieve checkpoint", async () => {
      const checkpoint: NamedAgentCheckpoint = {
        agentId: "test-agent-1",
        sessionId: "session-1",
        agentType: "general",
        name: "session-1",
        state: { agentState: { messages: { hello: "world" } }, toolsEnabled: ["foo"], hooksEnabled: ["bar"] },
        createdAt: Date.now(),
      };

      const id = await storage.storeAgentCheckpoint(checkpoint);
      expect(id).toBeDefined();
      expect(typeof id).toBe("number");

      const retrieved = await storage.retrieveAgentCheckpoint(id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.agentId).toBe(checkpoint.agentId);
      expect(retrieved?.name).toBe(checkpoint.name);
      expect(retrieved?.state).toEqual(checkpoint.state);
      expect(retrieved?.sessionId).toBe(checkpoint.sessionId);
      expect(retrieved?.agentType).toBe(checkpoint.agentType);
    });

    it("should list checkpoints", async () => {
      const list = await storage.listAgentCheckpoints();
      expect(Array.isArray(list.items)).toBe(true);
      expect(typeof list.total).toBe("number");
      expect(typeof list.hasMore).toBe("boolean");
      expect(list.limit).toBe(50);
      expect(list.offset).toBe(0);
      if (list.items.length > 0) {
        expect(list.items[0]).toHaveProperty("id");
        expect(list.items[0]).toHaveProperty("name");
        expect(list.items[0]).toHaveProperty("agentId");
        expect(list.items[0]).toHaveProperty("createdAt");
      }
    });

    it("should return null for non-existent checkpoint", async () => {
      const retrieved = await storage.retrieveAgentCheckpoint(999999);
      expect(retrieved).toBeNull();
    });

    it("should handle multiple checkpoints", async () => {
      const checkpoint1: NamedAgentCheckpoint = {
        agentId: "test-agent-2",
        sessionId: "session-2",
        agentType: "general",
        name: "session-2",
        state: { messages: { test: "value1" } },
        createdAt: Date.now(),
      };

      const checkpoint2: NamedAgentCheckpoint = {
        agentId: "test-agent-3",
        sessionId: "session-3",
        agentType: "specialized",
        name: "session-3",
        state: { messages: { test: "value2" } },
        createdAt: Date.now(),
      };

      const id1 = await storage.storeAgentCheckpoint(checkpoint1);
      const id2 = await storage.storeAgentCheckpoint(checkpoint2);

      const retrieved1 = await storage.retrieveAgentCheckpoint(id1);
      const retrieved2 = await storage.retrieveAgentCheckpoint(id2);

      expect(retrieved1?.name).toBe("session-2");
      expect(retrieved2?.name).toBe("session-3");
    });

    it("should preserve complex state structures", async () => {
      const complexState = {
        agentState: {
          messages: [
            { role: "user", content: "Hello" },
            { role: "assistant", content: "Hi there!" },
          ],
          toolsEnabled: ["tool1", "tool2"],
          hooksEnabled: ["hook1"],
        },
        metadata: {
          version: "1.0",
          timestamp: Date.now(),
        },
      };

      const checkpoint: NamedAgentCheckpoint = {
        agentId: "test-agent-complex",
        sessionId: "complex-session",
        agentType: "general",
        name: "complex-session",
        state: complexState,
        createdAt: Date.now(),
      };

      const id = await storage.storeAgentCheckpoint(checkpoint);
      const retrieved = await storage.retrieveAgentCheckpoint(id);

      expect(retrieved?.state).toEqual(complexState);
    });

    it("should store, retrieve, list, upsert, and delete agent metrics", async () => {
      const agentId = "metrics-agent-1";
      await storage.storeAgentMetrics({
        agentId,
        updatedAt: Date.now(),
        metrics: {
          costs: { Chat: 0.12 },
          tokens: {
            totalInputTokens: 100,
            totalOutputTokens: 40,
            totalCachedTokens: 5,
            totalReasoningTokens: 2,
          },
          tokensByCategory: {
            Chat: {
              totalInputTokens: 100,
              totalOutputTokens: 40,
              totalCachedTokens: 5,
              totalReasoningTokens: 2,
            },
          },
          latency: {
            requestCount: 2,
            totalElapsedMs: 300,
            totalTimeToFirstTokenMs: 50,
            timeToFirstTokenCount: 1,
            totalTokensPerSecond: 40,
            tokensPerSecondCount: 1,
            recentElapsedMs: [100, 200],
            recentTimeToFirstTokenMs: [50],
          },
          errors: {
            errorsByProvider: { openai: 1 },
            errorsByType: { timeout: 1 },
            retryCount: 1,
          },
          activity: {
            totalSteps: 4,
            totalToolCalls: 3,
            toolCallsByName: { read_file: 3 },
          },
        },
      });

      const retrieved = await storage.retrieveAgentMetrics(agentId);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.metrics.costs.Chat).toBe(0.12);
      expect(retrieved?.metrics.tokens.totalInputTokens).toBe(100);
      expect(retrieved?.metrics.activity.totalSteps).toBe(4);

      await storage.storeAgentMetrics({
        agentId,
        updatedAt: Date.now() + 1,
        metrics: {
          ...retrieved!.metrics,
          costs: { Chat: 0.25 },
        },
      });

      const upserted = await storage.retrieveAgentMetrics(agentId);
      expect(upserted?.metrics.costs.Chat).toBe(0.25);

      const listed = await storage.listAgentMetrics();
      expect(listed.some(row => row.agentId === agentId)).toBe(true);
      const summary = listed.find(row => row.agentId === agentId);
      expect(summary?.totalCost).toBe(0.25);
      expect(summary?.totalInputTokens).toBe(100);

      await storage.deleteAgentMetrics(agentId);
      expect(await storage.retrieveAgentMetrics(agentId)).toBeNull();
    });

    it("should filter and paginate agent checkpoints", async () => {
      const base = Date.now();
      for (let i = 0; i < 5; i++) {
        await storage.storeAgentCheckpoint({
          agentId: i < 3 ? "filter-agent-a" : "filter-agent-b",
          sessionId: i % 2 === 0 ? "sess-even" : "sess-odd",
          agentType: i < 3 ? "general" : "specialized",
          name: `page-cp-${i}`,
          state: { n: i },
          createdAt: base + i,
        });
      }

      const page1 = await storage.listAgentCheckpoints({
        agentId: "filter-agent-a",
        limit: 2,
        offset: 0,
        orderBy: "createdAt",
        orderDir: "DESC",
      });
      expect(page1.total).toBe(3);
      expect(page1.items).toHaveLength(2);
      expect(page1.hasMore).toBe(true);
      expect(page1.limit).toBe(2);
      expect(page1.offset).toBe(0);
      expect(page1.items.every(i => i.agentId === "filter-agent-a")).toBe(true);

      const page2 = await storage.listAgentCheckpoints({
        agentId: "filter-agent-a",
        limit: 2,
        offset: 2,
      });
      expect(page2.items).toHaveLength(1);
      expect(page2.hasMore).toBe(false);

      const bySession = await storage.listAgentCheckpoints({ sessionId: "sess-even", limit: 50 });
      expect(bySession.items.every(i => i.sessionId === "sess-even")).toBe(true);
      expect(bySession.total).toBeGreaterThanOrEqual(3);

      const byType = await storage.listAgentCheckpoints({ agentType: "specialized", limit: 50 });
      expect(byType.items.every(i => i.agentType === "specialized")).toBe(true);

      const after = await storage.listAgentCheckpoints({ after: base + 2, limit: 50 });
      expect(after.items.every(i => i.createdAt > base + 2)).toBe(true);

      const before = await storage.listAgentCheckpoints({ before: base + 2, agentId: "filter-agent-a", limit: 50 });
      expect(before.items.every(i => i.createdAt < base + 2)).toBe(true);
    });

    it("should prune data according to retention policies", async () => {
      const retainDbPath = "./test-agent-retention.db";
      const { unlinkSync, existsSync } = await import("node:fs");
      if (existsSync(retainDbPath)) unlinkSync(retainDbPath);

      const { BunStorage } = await import("./BunStorage.js");
      const seed = new BunStorage({ connectionString: `sqlite://${retainDbPath}` }, createTestingApp());
      await seed.start();

      const now = Date.now();
      const day = 86_400_000;

      for (let i = 0; i < 4; i++) {
        await seed.storeAgentCheckpoint({
          agentId: "retain-agent",
          sessionId: "retain-sess",
          agentType: "general",
          name: `retain-${i}`,
          state: { i },
          createdAt: now - (3 - i) * day,
        });
      }

      await seed.storeAgentCheckpoint({
        agentId: "old-agent",
        sessionId: "old-sess",
        agentType: "general",
        name: "very-old",
        state: { old: true },
        createdAt: now - 60 * day,
      });

      await seed.storeAppCheckpoint({
        sessionId: "old-app",
        hostname: "host",
        workspaceDirectory: "/tmp",
        state: {},
        createdAt: now - 120 * day,
      });
      await seed.storeAppCheckpoint({
        sessionId: "new-app",
        hostname: "host",
        workspaceDirectory: "/tmp",
        state: {},
        createdAt: now,
      });

      const emptyMetrics = {
        costs: {},
        tokens: { totalInputTokens: 0, totalOutputTokens: 0, totalCachedTokens: 0, totalReasoningTokens: 0 },
        tokensByCategory: {},
        latency: {
          requestCount: 0,
          totalElapsedMs: 0,
          totalTimeToFirstTokenMs: 0,
          timeToFirstTokenCount: 0,
          totalTokensPerSecond: 0,
          tokensPerSecondCount: 0,
          recentElapsedMs: [] as number[],
          recentTimeToFirstTokenMs: [] as number[],
        },
        errors: { errorsByProvider: {}, errorsByType: {}, retryCount: 0 },
        activity: { totalSteps: 0, totalToolCalls: 0, toolCallsByName: {} },
      };

      await seed.storeAgentMetrics({
        agentId: "old-metrics",
        updatedAt: now - 90 * day,
        metrics: emptyMetrics,
      });
      await seed.storeAgentMetrics({
        agentId: "fresh-metrics",
        updatedAt: now,
        metrics: { ...emptyMetrics, tokens: { ...emptyMetrics.tokens, totalInputTokens: 1 } },
      });
      await seed.stop();

      const retained = new BunStorage(
        {
          connectionString: `sqlite://${retainDbPath}`,
          retention: {
            agentCheckpoints: { maxAge: "30d", maxPerAgent: 2, keepLatest: true },
            appCheckpoints: { maxAge: "90d", maxTotal: 1000 },
            agentMetrics: { maxAge: "60d" },
          },
        },
        createTestingApp(),
      );
      try {
        await retained.start();

        const agentList = await retained.listAgentCheckpoints({ agentId: "retain-agent", limit: 50 });
        expect(agentList.total).toBe(2);
        expect(agentList.items.every(i => i.agentId === "retain-agent")).toBe(true);

        const oldAgent = await retained.listAgentCheckpoints({ agentId: "old-agent", limit: 50 });
        // keepLatest preserves the single latest (even if older than maxAge)
        expect(oldAgent.total).toBe(1);

        const apps = await retained.listAppCheckpoints({ limit: 50 });
        expect(apps.items.some(a => a.sessionId === "old-app")).toBe(false);
        expect(apps.items.some(a => a.sessionId === "new-app")).toBe(true);

        expect(await retained.retrieveAgentMetrics("old-metrics")).toBeNull();
        expect(await retained.retrieveAgentMetrics("fresh-metrics")).not.toBeNull();

        const stats = await retained.cleanup();
        expect(stats.agentCheckpointsDeleted).toBe(0);
        expect(stats.appCheckpointsDeleted).toBe(0);
        expect(stats.agentMetricsDeleted).toBe(0);
      } finally {
        await retained.stop();
        if (existsSync(retainDbPath)) unlinkSync(retainDbPath);
      }
    });
  });

  describe("SQLite App Checkpoint Storage", () => {
    let storage: BunStorage;
    const dbPath = "./test-app-state.db";

    beforeAll(async () => {
      // Use dynamic import to avoid Bun SQL import errors in Node.js
      const { BunStorage } = await import("./BunStorage.js");
      storage = new BunStorage(
        {
          connectionString: `sqlite://${dbPath}`,
        },
        createTestingApp(),
      );
      await storage.start();
    });

    afterAll(async () => {
      await storage.stop();
      // Cleanup: remove test database file
      const { unlinkSync, existsSync } = await import("node:fs");
      if (existsSync(dbPath)) {
        unlinkSync(dbPath);
      }
    });

    it("should store and retrieve app checkpoint", async () => {
      const checkpoint: AppSessionCheckpoint = {
        sessionId: "app-session-1",
        hostname: "localhost",
        workspaceDirectory: "/test/project",
        state: { activeTools: ["tool1"], settings: { theme: "dark" } },
        createdAt: Date.now(),
      };

      const id = await storage.storeAppCheckpoint(checkpoint);
      expect(id).toBeDefined();
      expect(typeof id).toBe("number");

      const retrieved = await storage.retrieveAppCheckpoint(id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.sessionId).toBe(checkpoint.sessionId);
      expect(retrieved?.hostname).toBe(checkpoint.hostname);
      expect(retrieved?.workspaceDirectory).toBe(checkpoint.workspaceDirectory);
      expect(retrieved?.state).toEqual(checkpoint.state);
    });

    it("should list app checkpoints", async () => {
      const list = await storage.listAppCheckpoints();
      expect(Array.isArray(list.items)).toBe(true);
      expect(typeof list.total).toBe("number");
      if (list.items.length > 0) {
        expect(list.items[0]).toHaveProperty("id");
        expect(list.items[0]).toHaveProperty("sessionId");
        expect(list.items[0]).toHaveProperty("hostname");
        expect(list.items[0]).toHaveProperty("workspaceDirectory");
        expect(list.items[0]).toHaveProperty("createdAt");
      }
    });

    it("should return null for non-existent app checkpoint", async () => {
      const retrieved = await storage.retrieveAppCheckpoint(999999);
      expect(retrieved).toBeNull();
    });

    it("should retrieve latest app checkpoint", async () => {
      const checkpoint1: AppSessionCheckpoint = {
        sessionId: "app-session-1",
        hostname: "localhost",
        workspaceDirectory: "/test/project",
        state: { activeTools: ["tool1"] },
        createdAt: Date.now() - 1000,
      };

      const checkpoint2: AppSessionCheckpoint = {
        sessionId: "app-session-2",
        hostname: "localhost",
        workspaceDirectory: "/test/project",
        state: { activeTools: ["tool2"] },
        createdAt: Date.now(),
      };

      await storage.storeAppCheckpoint(checkpoint1);
      const id2 = await storage.storeAppCheckpoint(checkpoint2);

      const latest = await storage.retrieveLatestAppCheckpoint();
      expect(latest).toBeDefined();
      expect(latest?.sessionId).toBe("app-session-2");
      expect(latest?.id).toBe(id2);
    });
  });
});

describe("BunAgentStateStorage - MySQL & PostgreSQL", () => {
  if (!isBun || !hasDocker) {
    it.skip("Database tests require Bun runtime and Docker", () => {
      // This test is skipped when Bun or Docker is not available
      expect(true).toBe(true);
    });
    return;
  }

  const sampleCheckpoint: NamedAgentCheckpoint = {
    agentId: "tc-agent-1",
    sessionId: "tc-session-1",
    agentType: "general",
    name: "tc-session-1",
    state: {
      agentState: { messages: { hello: "world" } },
      toolsEnabled: ["foo"],
      hooksEnabled: ["bar"],
    },
    createdAt: Date.now(),
  };

  async function assertStoreAndRetrieve(connectionString: string) {
    const { BunStorage } = await import("./BunStorage.ts");
    const storage = new BunStorage({ connectionString }, createTestingApp());
    try {
      await storage.start();

      const id = await storage.storeAgentCheckpoint(sampleCheckpoint);
      expect(id).toBeDefined();
      expect(typeof id).toBe("number");

      const retrieved = await storage.retrieveAgentCheckpoint(id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.agentId).toBe(sampleCheckpoint.agentId);
      expect(retrieved?.name).toBe(sampleCheckpoint.name);
      expect(retrieved?.state).toEqual(sampleCheckpoint.state);
      expect(retrieved?.sessionId).toBe(sampleCheckpoint.sessionId);
      expect(retrieved?.agentType).toBe(sampleCheckpoint.agentType);

      const list = await storage.listAgentCheckpoints();
      expect(list.items.some(item => item.id === id)).toBe(true);

      const missing = await storage.retrieveAgentCheckpoint(999_999_999);
      expect(missing).toBeNull();
    } finally {
      await storage.stop();
    }
  }

  describe("MySQL (testcontainers / MariaDB)", () => {
    let container: import("@testcontainers/mariadb").StartedMariaDbContainer | undefined;

    beforeAll(async () => {
      const { MariaDbContainer } = await import("@testcontainers/mariadb");
      container = await new MariaDbContainer("mariadb:11").withDatabase("testdb").withUsername("testuser").withUserPassword("testpass").start();
    }, 120_000);

    afterAll(async () => {
      await container?.stop();
    }, 60_000);

    it("should store and retrieve checkpoint in MySQL", async () => {
      if (!container) throw new Error("MariaDB container failed to start");
      // Bun's SQL driver expects mysql://; MariaDB testcontainers returns mariadb://
      const connectionString = container.getConnectionUri().replace(/^mariadb:/, "mysql:");
      await assertStoreAndRetrieve(connectionString);
    }, 60_000);
  });

  describe("PostgreSQL (testcontainers)", () => {
    let container: import("@testcontainers/postgresql").StartedPostgreSqlContainer | undefined;

    beforeAll(async () => {
      const { PostgreSqlContainer } = await import("@testcontainers/postgresql");
      container = await new PostgreSqlContainer("postgres:16-alpine").withDatabase("testdb").withUsername("testuser").withPassword("testpass").start();
    }, 120_000);

    afterAll(async () => {
      await container?.stop();
    }, 60_000);

    it("should store and retrieve checkpoint in PostgreSQL", async () => {
      if (!container) throw new Error("PostgreSQL container failed to start");
      await assertStoreAndRetrieve(container.getConnectionUri());
    }, 60_000);
  });
});
