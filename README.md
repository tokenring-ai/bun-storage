# @tokenring-ai/bun-storage

Multi-database persistence layer for agent and app checkpoints and agent metrics, powered by Bun's native SQL driver.

## Overview

`@tokenring-ai/bun-storage` provides a multi-database persistence layer for TokenRing agents and applications. It implements the `AgentCheckpointStorage`, `AppCheckpointStorage`, and `MetricsStorage` interfaces using Bun's native `SQL` client, storing agent checkpoints, app checkpoints, and per-agent metrics in a single database.

The package supports SQLite, MySQL (including MariaDB), and PostgreSQL through a unified API, with automatic dialect detection based on the connection string. Tables and indexes are created automatically on `start()`, and optional retention policies prune old checkpoints and metrics, either on a schedule or on demand.

### Key Features

- **Multi-database support**: SQLite, MySQL/MariaDB, and PostgreSQL through a single API
- **Automatic dialect detection**: database type inferred from the connection string (`sqlite:`, `file:`, `mysql://`, `mariadb://`, `postgres://`)
- **Three storage interfaces**: `AgentCheckpointStorage`, `AppCheckpointStorage`, and `MetricsStorage`
- **Filtered, paginated listing**: checkpoint lists support `limit`, `offset`, `before`/`after` timestamps, `orderBy`/`orderDir`, and filtering by `sessionId`, `agentId`, or `agentType`
- **Retention policies**: age- and count-based cleanup for agent checkpoints, app checkpoints, and agent metrics
- **Schema initialization**: automatic table and index creation on startup
- **Type-safe**: full TypeScript support with Zod schemas for configuration validation
- **Plugin architecture**: integrates with the TokenRing plugin system

### Integration Points

- `@tokenring-ai/checkpoint`: implements `AgentCheckpointStorage` and `AppCheckpointStorage`, consumed by `AgentCheckpointService` and `AppCheckpointService`
- `@tokenring-ai/metrics`: implements `MetricsStorage`, consumed by `MetricsService`
- `@tokenring-ai/app`: TokenRing plugin integration via the `TokenRingPlugin` interface
- Bun SQL: native database client for all database operations

## Installation

```bash
bun add @tokenring-ai/bun-storage
```

## Chat Commands

This package does not define any chat commands.

## Tools

This package does not define any tools.

## Configuration

The package is configured through the TokenRing plugin system using a `bunStorage` configuration object.

```yaml
bunStorage:
  connectionString: "sqlite://./agent_state.db"
  retention:
    agentCheckpoints:
      maxAge: "30d"
      maxPerAgent: 10
      keepLatest: true
    appCheckpoints:
      maxAge: "90d"
      maxTotal: 1000
    agentMetrics:
      maxAge: "60d"
    cleanupInterval: "24h"
```

The whole `bunStorage` block is optional and defaults to `{}`. When `connectionString` is omitted, the storage uses `sqlite:<workspaceDirectory>/database.sqlite`.

### Configuration Options

| Field                              | Type     | Required | Default                                  | Description                                        |
|------------------------------------|----------|----------|------------------------------------------|----------------------------------------------------|
| `bunStorage`                       | `object` | no       | `{}`                                     | Storage settings                                   |
| `bunStorage.connectionString`      | `string` | no       | `sqlite:<workspaceDirectory>/database.sqlite` | Bun SQL connection string; dialect auto-detected   |
| `bunStorage.retention`             | `object` | no       | —                                        | Retention policies for checkpoints and metrics     |
| `bunStorage.retention.cleanupInterval` | `string` | no    | `"24h"`                                  | How often periodic retention cleanup runs          |

#### Retention Policies

Duration strings use the form `\d+(ms|s|m|h|d)`, for example `"30d"`, `"1h"`, `"15m"`, `"60s"`, or `"500ms"`.

| Field                                          | Type      | Required | Default | Description                                                    |
|------------------------------------------------|-----------|----------|---------|----------------------------------------------------------------|
| `bunStorage.retention.agentCheckpoints`        | `object`  | no       | —       | Agent checkpoint policy                                        |
| `bunStorage.retention.agentCheckpoints.maxAge` | `string`  | no       | —       | Delete agent checkpoints older than this duration              |
| `bunStorage.retention.agentCheckpoints.maxPerAgent` | `number` | no   | —       | Keep only the newest `maxPerAgent` checkpoints per agent       |
| `bunStorage.retention.agentCheckpoints.keepLatest` | `boolean` | no   | `true`  | Never delete the newest checkpoint per agent during `maxAge` pruning |
| `bunStorage.retention.appCheckpoints`          | `object`  | no       | —       | App checkpoint policy                                          |
| `bunStorage.retention.appCheckpoints.maxAge`   | `string`  | no       | —       | Delete app checkpoints older than this duration                |
| `bunStorage.retention.appCheckpoints.maxTotal` | `number`  | no       | —       | Keep only the newest `maxTotal` app checkpoints overall        |
| `bunStorage.retention.agentMetrics`            | `object`  | no       | —       | Agent metrics policy                                           |
| `bunStorage.retention.agentMetrics.maxAge`     | `string`  | no       | —       | Delete agent metrics older than this duration                  |

When any retention policy is configured, `start()` runs one cleanup pass and schedules another every `cleanupInterval` (default `"24h"`). Cleanup can also be triggered on demand with `storage.cleanup()`.

**Cleanup behavior:**

- `agentCheckpoints.maxAge` — deletes the oldest checkpoints beyond the age cutoff. With `keepLatest: true` (the default) the newest checkpoint per agent is always preserved, even when it is older than `maxAge`.
- `agentCheckpoints.maxPerAgent` — keeps only the newest `N` checkpoints per agent.
- `appCheckpoints.maxAge` / `appCheckpoints.maxTotal` — age-based or global newest-`N` pruning for app checkpoints.
- `agentMetrics.maxAge` — deletes metrics rows whose `updatedAt` falls beyond the cutoff.

Deletion is batched (500 rows per delete statement) and reports the number of rows and approximate payload bytes freed.

#### Database Connection Examples

**SQLite (file):**

```yaml
bunStorage:
  connectionString: "sqlite://./agent_state.db"
```

**SQLite (in-memory):**

```yaml
bunStorage:
  connectionString: ":memory:"
```

**SQLite (file URI):**

```yaml
bunStorage:
  connectionString: "file://./agent_state.db"
```

**MySQL:**

```yaml
bunStorage:
  connectionString: "mysql://user:password@localhost:3306/database"
```

**MariaDB:**

```yaml
bunStorage:
  connectionString: "mariadb://user:password@localhost:3306/database"
```

**PostgreSQL:**

```yaml
bunStorage:
  connectionString: "postgres://user:password@localhost:5432/database"
```

#### Environment Variables

This package does not define environment variables directly. Any environment-driven database configuration should be resolved before constructing the plugin config. The `connectionString` field is marked `sensitive` in the config schema, so it is masked in the config UI, and the service display name masks the password out of URL-form connection strings for display.

#### Schema Metadata

The `bunStorage` config schema uses `.meta()` annotations for config UI integration:

| Field                               | `.meta()` annotation                                                                                     |
|-------------------------------------|----------------------------------------------------------------------------------------------------------|
| `bunStorage`                        | `{ label: "Bun Storage", description: "SQL-backed checkpoint and metrics storage using Bun's SQL client" }` |
| `bunStorage.connectionString`       | `{ sensitive: true, restartRequired: true, description: "Database connection string (sqlite:, mysql://, postgres://)" }` |
| `bunStorage.retention`              | `{ description: "Data retention and auto-cleanup policies for checkpoints and metrics" }`                |

Changing `connectionString` requires an app restart (`restartRequired: true`), and the plugin does not support live reconfiguration of the storage.

## Usage

### Basic Storage Usage

`BunStorage` is constructed with a config object and the `TokenRingApp` instance (used for workspace path resolution and service logging):

```typescript
import TokenRingApp from "@tokenring-ai/app";
import { BunStorage } from "@tokenring-ai/bun-storage";

const app = new TokenRingApp({
  app: {
    workingDirectory: process.cwd(),
    workspaceDirectory: process.cwd(),
    configDirectories: [],
  },
});

const storage = new BunStorage(
  { connectionString: "sqlite://./agent_state.db" },
  app,
);

await storage.start();

// Store an agent checkpoint
const id = await storage.storeAgentCheckpoint({
  agentId: "my-agent",
  sessionId: "session-1",
  agentType: "general",
  name: "checkpoint-1",
  state: { /* agent state data */ },
  createdAt: Date.now(),
});

// Retrieve an agent checkpoint
const checkpoint = await storage.retrieveAgentCheckpoint(id);

// List agent checkpoints (filtered and paginated)
const page = await storage.listAgentCheckpoints({ limit: 50 });

await storage.stop();
```

### Plugin Integration

Register the plugin, exported from the `plugin` subpath (it is not re-exported from the package entry):

```typescript
import bunStoragePlugin from "@tokenring-ai/bun-storage/plugin";

export default {
  plugins: [bunStoragePlugin],
};
```

Once installed, the plugin registers `BunStorage` as a service and wires it as the checkpoint provider for `AgentCheckpointService` and `AppCheckpointService`, and as the metrics provider for `MetricsService`.

### Database Dialect Detection

The package infers the database dialect from the connection string:

- **SQLite**: `:memory:`, `sqlite://...`, `sqlite:...`, `file://...`, `file:...`
- **MySQL**: `mysql://...`, `mysql2://...`, `mariadb://...`
- **PostgreSQL**: everything else (default fallback)

```typescript
import { detectDatabaseDialect } from "@tokenring-ai/bun-storage";

const dialect = detectDatabaseDialect("sqlite://./db.sqlite");
// "sqlite"
```

## Core Components

### BunStorage

The main storage class implementing `TokenRingService`, `AgentCheckpointStorage`, `AppCheckpointStorage`, and `MetricsStorage`.

**File:** `BunStorage.ts`

**Constructor:** `new BunStorage(config: BunStorageConfig, app: TokenRingApp)`

**Properties:**

| Property      | Type                                                        | Description                                                     |
|---------------|-------------------------------------------------------------|-----------------------------------------------------------------|
| `name`        | `"BunStorage"`                                              | Service identifier                                              |
| `description` | `"Bun SQL storage provider"`                                | Service description                                             |
| `displayName` | `string`                                                    | `Bun SQL <dialect> (<sanitized connection string>)`; password masked |
| `dialect`     | `"sqlite" \| "mysql" \| "postgres"`                         | Detected database dialect                                       |
| `sql`         | `SQL`                                                       | Bun SQL client instance                                         |
| `queries`     | `SQLiteQueries \| MySQLQueries \| PostgresQueries`          | Dialect-specific query implementation                           |
| `retention`   | `RetentionConfig \| undefined`                              | Configured retention policies                                   |

**Lifecycle methods:**

| Method                   | Description                                                                                  |
|--------------------------|----------------------------------------------------------------------------------------------|
| `start()`                | Create tables and indexes, run an initial retention cleanup when configured, and schedule periodic cleanup |
| `stop()`                 | Cancel the cleanup schedule and close the database connection                                |
| `scheduleCleanup(interval)` | Schedule periodic retention cleanup every `interval` (a duration string such as `"1h"`); replaces any existing schedule |
| `cleanup()`              | Run one retention cleanup pass according to the configured policies; returns `CleanupStats`  |

**Agent checkpoint storage methods:**

| Method                              | Description                                                              |
|-------------------------------------|--------------------------------------------------------------------------|
| `storeAgentCheckpoint(checkpoint)`  | Store a named agent checkpoint; returns the storage-assigned numeric ID  |
| `retrieveAgentCheckpoint(id)`       | Retrieve an agent checkpoint by ID with full state, or `null`            |
| `listAgentCheckpoints(options?)`    | List agent checkpoints without state data, honoring `CheckpointListOptions` |

**App checkpoint storage methods:**

| Method                              | Description                                                              |
|-------------------------------------|--------------------------------------------------------------------------|
| `storeAppCheckpoint(checkpoint)`    | Store an app session checkpoint; returns the storage-assigned numeric ID |
| `retrieveAppCheckpoint(id)`         | Retrieve an app checkpoint by ID with full state, or `null`              |
| `listAppCheckpoints(options?)`      | List app checkpoints without state data, honoring `CheckpointListOptions` |
| `retrieveLatestAppCheckpoint()`     | Retrieve the most recent app checkpoint (used by `AppCheckpointService.start()`) |

**Metrics storage methods:**

| Method                          | Description                                                       |
|---------------------------------|-------------------------------------------------------------------|
| `storeAgentMetrics(data)`       | Upsert aggregated metrics for an agent (keyed by `agentId`)       |
| `retrieveAgentMetrics(agentId)` | Retrieve stored metrics for an agent, or `null`                   |
| `listAgentMetrics()`            | List summary rows for every agent with stored metrics             |
| `listAllAgentMetrics()`         | Full stored metrics (incl. spend history) for every agent         |
| `deleteAgentMetrics(agentId)`   | Remove stored metrics for an agent                                |

**List options.** Both list methods accept `CheckpointListOptions` (defined in `@tokenring-ai/checkpoint`) — `sessionId`, `agentId`, `agentType`, `limit` (default 50), `offset`, `before`/`after` (millisecond `createdAt` bounds), `orderBy` (`"createdAt"` default \| `"id"`), `orderDir` (`"DESC"` default \| `"ASC"`) — and return `PaginatedResult<T>` (`{ items, total, hasMore, limit, offset }`). `listAppCheckpoints` ignores the `agentId` and `agentType` filters, since app rows carry no agent identity.

### Row Types

The raw database row shapes are exported from `BunStorage.ts` and importable from the module subpath:

```typescript
import type {
  AgentCheckpointRow,
  AgentMetricsRow,
  AppCheckpointRow,
} from "@tokenring-ai/bun-storage/BunStorage";

type AgentCheckpointRow = {
  id: number | string | bigint;
  sessionId: string;
  agentId: string;
  name: string;
  agentType: string;
  state: string | Record<string, unknown>;
  createdAt: number | string | bigint;
};

type AppCheckpointRow = {
  id: number | string | bigint;
  sessionId: string;
  hostname: string;
  workspaceDirectory: string;
  state: string | Record<string, unknown>;
  createdAt: number | string | bigint;
};

type AgentMetricsRow = {
  agentId: string;
  metrics: string | Record<string, unknown>;
  updatedAt: number | string | bigint;
};
```

The storage methods normalize these rows into the zod-validated `StoredAgentCheckpoint`, `StoredAppCheckpoint`, and `StoredAgentMetrics` shapes: numeric IDs are converted to `number`, and JSON-stringified state is parsed back to objects.

### Retention

Retention policies are defined in `retention.ts` and validated by `RetentionConfigSchema`, which backs the `bunStorage.retention` config field.

**Export:** `RetentionConfigSchema` (value) and the `RetentionConfig` and `CleanupStats` types are exported from the package entry, along with `parseDurationMs`.

**`parseDurationMs(value)`:** converts a duration string (`"30d"`, `"1h"`, `"15m"`, `"60s"`, `"500ms"`) to milliseconds and throws on malformed input.

**`CleanupStats`:**

```typescript
type CleanupStats = {
  agentCheckpointsDeleted: number;
  appCheckpointsDeleted: number;
  agentMetricsDeleted: number;
  spaceFreedBytes: number;
};
```

Cleanup runs in batches of 500 rows (`CLEANUP_BATCH_SIZE` in `retention.ts`) per delete statement.

### Query Implementations

Three dialect-specific query classes handle all SQL operations:

- **SQLiteQueries** (`sqlite/SQLiteQueries.ts`): `$1`-style parameters and `lastInsertRowid`
- **MySQLQueries** (`mysql/MySQLQueries.ts`): `?`-style parameters and `lastInsertRowid`
- **PostgresQueries** (`postgres/PostgresQueries.ts`): `$1`-style parameters and `RETURNING` id clauses

List filter building (parameterized WHERE/ORDER/LIMIT clauses over fixed column names) lives in `listQuery.ts` and is internal to the package.

### Database Schema

`start()` creates three tables, plus indexes, on the configured database.

**AgentCheckpoints** — agent checkpoint rows.

| Column       | SQLite     | MySQL   | PostgreSQL | Description                     |
|--------------|------------|---------|------------|---------------------------------|
| `id`         | `integer`  | `bigint`| `bigserial`| Auto-increment primary key      |
| `sessionId`  | `text`     | `text`  | `text`     | Session identifier              |
| `agentId`    | `text`     | `text`  | `text`     | Agent identifier                |
| `agentType`  | `text`     | `text`  | `text`     | Agent type                      |
| `name`       | `text`     | `text`  | `text`     | Checkpoint name                 |
| `state`      | `text`     | `text`  | `text`     | JSON-serialized state payload   |
| `createdAt`  | `integer`  | `bigint`| `bigint`   | Unix timestamp (ms)             |

**AppCheckpoints** — app session checkpoint rows.

| Column                | SQLite     | MySQL   | PostgreSQL | Description                     |
|-----------------------|------------|---------|------------|---------------------------------|
| `id`                  | `integer`  | `bigint`| `bigserial`| Auto-increment primary key      |
| `sessionId`           | `text`     | `text`  | `text`     | Session identifier              |
| `hostname`            | `text`     | `text`  | `text`     | Hostname of the app instance    |
| `workspaceDirectory`  | `text`     | `text`  | `text`     | Project directory path          |
| `state`               | `text`     | `text`  | `text`     | JSON-serialized state payload   |
| `createdAt`           | `integer`  | `bigint`| `bigint`   | Unix timestamp (ms)             |

**AgentMetrics** — per-agent metrics aggregates (one row per `agentId`).

| Column      | SQLite     | MySQL         | PostgreSQL | Description                     |
|-------------|------------|---------------|------------|---------------------------------|
| `agentId`   | `text`     | `varchar(255)`| `text`     | Agent identifier (primary key)  |
| `metrics`   | `text`     | `text`        | `text`     | JSON-serialized metrics payload |
| `updatedAt` | `integer`  | `bigint`      | `bigint`   | Last update Unix timestamp (ms) |

Indexes are created on the checkpoint `sessionId`, `agentId`, `createdAt` (plus the `agentId` + `sessionId` pair) columns and on `AgentMetrics.updatedAt` to support listing, filtering, and retention cleanup.

## Services / Plugin Lifecycle

### Service Registration

The plugin registers `BunStorage` as a service during `earlyInstall` and wires it to the checkpoint and metrics services:

```typescript
const storageService = app.addService(new BunStorage(config.bunStorage, app));

app.waitForService(AgentCheckpointService, checkpointService => {
  checkpointService.setCheckpointProvider(storageService);
});
app.waitForService(AppCheckpointService, checkpointService => {
  checkpointService.setCheckpointProvider(storageService);
});
app.waitForService(MetricsService, metricsService => {
  metricsService.setMetricsProvider(storageService);
});
```

### Plugin Lifecycle

`plugin/bun-storage/plugin.ts` defines the plugin metadata and an `earlyInstall` hook. The plugin defines no agent lifecycle hooks.

| Field                  | Value                                                        |
|------------------------|--------------------------------------------------------------|
| `name`                 | `@tokenring-ai/bun-storage` (from package.json)              |
| `displayName`          | `Bun Storage`                                                |
| `version`              | package version                                              |
| `description`          | package description                                          |
| `immutableConfigSchema`| `z.object({ bunStorage: bunStorageConfigSchema })`           |

- **`earlyInstall(app, config)`** — constructs `BunStorage` from `config.bunStorage`, registers it as a service, and wires it as the checkpoint provider for `AgentCheckpointService` and `AppCheckpointService`, and as the metrics provider for `MetricsService`, as soon as those services are available.

Because the plugin declares no mutable `configSchema` and no `reconfigure` handler, its configuration is fixed at startup: changing `connectionString` or `retention` requires an app restart.

## RPC

This package does not expose any RPC endpoints directly. It provides storage services that are consumed by other TokenRing components.

## Exports

The package entry (`index.ts`) exports:

| Export                    | Type         | Description                                                  |
|---------------------------|--------------|--------------------------------------------------------------|
| `BunStorage`              | `class`      | Main storage implementation class                            |
| `bunStorageConfigSchema`  | `ZodSchema`  | Zod schema for the `bunStorage` config (alias of `BunStorageConfigSchema`) |
| `BunStorageConfigSchema`  | `ZodSchema`  | Zod schema for the `bunStorage` config                       |
| `detectDatabaseDialect`   | `function`   | Detect the database dialect from a connection string         |
| `parseDurationMs`         | `function`   | Parse a duration string into milliseconds                    |
| `RetentionConfigSchema`   | `ZodSchema`  | Zod schema for retention policies                            |

| Type Export          | Description                                       |
|----------------------|---------------------------------------------------|
| `BunStorageConfig`   | Configuration type for `BunStorage`               |
| `CleanupStats`       | Deletion statistics returned by `cleanup()`       |
| `RetentionConfig`    | Retention policy input type                       |

The plugin definition is exported as the default export of `@tokenring-ai/bun-storage/plugin` (it is not re-exported from the package entry).

## Dependencies

| Package                         | Version    | Purpose                                               |
|---------------------------------|------------|-------------------------------------------------------|
| `@tokenring-ai/app`             | workspace:*| TokenRing app, plugin/service types, app schema       |
| `@tokenring-ai/checkpoint`      | workspace:*| Agent/app checkpoint storage interfaces and schemas    |
| `@tokenring-ai/metrics`         | workspace:*| Metrics storage interface and schemas                 |
| `zod`                           | ^4.4.3     | Schema validation                                     |
| `typescript` (dev)              | ^7.0.2     | Type checking (`tsc --noEmit`)                        |
| `@testcontainers/mariadb` (dev) | ^12.0.4    | MariaDB container for MySQL-dialect tests             |
| `@testcontainers/postgresql` (dev) | ^12.0.4 | PostgreSQL container for dialect tests                |

Database access uses Bun's native `SQL` client at runtime, so the package relies on the Bun runtime rather than a separate database driver dependency.

## Testing

```bash
cd plugin/bun-storage
bun test               # run all tests
bun run test:watch     # watch mode
bun run test:coverage  # with coverage
bun run build          # type check (tsc --noEmit)
```

The suite (`BunAgentStateStorage.test.ts`) covers storing, retrieving, and listing agent and app checkpoints, filtering and pagination, complex state round-tripping, metrics upsert/retrieve/list/delete, retention pruning, and `retrieveLatestAppCheckpoint()`.

**Note:** The tests require the Bun runtime because the implementation uses Bun's native `SQL` client. The MySQL/MariaDB and PostgreSQL suites use Testcontainers and are skipped unless Docker is available.

## License

MIT License — see LICENSE file for details.
