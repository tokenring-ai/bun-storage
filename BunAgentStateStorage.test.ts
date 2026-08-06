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
      expect(Array.isArray(list)).toBe(true);
      if (list.length > 0) {
        expect(list[0]).toHaveProperty("id");
        expect(list[0]).toHaveProperty("name");
        expect(list[0]).toHaveProperty("agentId");
        expect(list[0]).toHaveProperty("createdAt");
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
      expect(Array.isArray(list)).toBe(true);
      if (list.length > 0) {
        expect(list[0]).toHaveProperty("id");
        expect(list[0]).toHaveProperty("sessionId");
        expect(list[0]).toHaveProperty("hostname");
        expect(list[0]).toHaveProperty("workspaceDirectory");
        expect(list[0]).toHaveProperty("createdAt");
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
      expect(list.some(item => item.id === id)).toBe(true);

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
