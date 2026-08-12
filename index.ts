/**
 * @tokenring-ai/bun-storage
 *
 * A multi-database storage solution for Token Ring AI agent state checkpoints and metrics using Bun.
 *
 * This package provides storage classes that implement AgentCheckpointStorage,
 * AppCheckpointStorage, and MetricsStorage interfaces. It supports SQLite, MySQL,
 * and PostgreSQL databases through Bun's native SQL client.
 *
 * @example
 * ```typescript
 * import { BunStorage } from '@tokenring-ai/bun-storage';
 *
 * const storage = new BunStorage({
 *   connectionString: "sqlite://./agent_state.db"
 * });
 *
 * await storage.start();
 * ```
 */

export { BunStorage, bunStorageConfigSchema, type CleanupStats, detectDatabaseDialect, type RetentionConfig } from "./BunStorage.js";
export { parseDurationMs, RetentionConfigSchema } from "./retention.js";
export { type BunStorageConfig, BunStorageConfigSchema } from "./schema.js";
