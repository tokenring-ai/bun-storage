# @tokenring-ai/bun-storage

## Overview

`@tokenring-ai/bun-storage` provides a multi-database persistence layer for TokenRing AI agents and applications. It implements both `AgentCheckpointStorage` and `AppCheckpointStorage` interfaces using Bun's native `SQL` client, enabling seamless storage and retrieval of agent and application state checkpoints.

This package supports SQLite, MySQL, and PostgreSQL databases through a unified API, with automatic database dialect detection based on the connection string.

### Key Features

- **Multi-database support**: SQLite, MySQL, and PostgreSQL through a single API
- **Automatic dialect detection**: Database type inferred from connection string
- **Dual storage interfaces**: Implements both agent and app checkpoint storage
- **Type-safe**: Full TypeScript support with Zod schemas for configuration validation
- **Schema initialization**: Automatic table creation on startup
- **Plugin architecture**: Integrates seamlessly with TokenRing plugin system

### Integration Points

- `@tokenring-ai/checkpoint`: Provides `AgentCheckpointStorage` and `AppCheckpointStorage` implementations
- `@tokenring-ai/app`: TokenRing plugin integration via `TokenRingPlugin` interface
- Bun SQL: Native database client for all database operations

## Installation

```bash
bun add @tokenring-ai/bun-storage
```

## Configuration

The package is configured through the TokenRing plugin system using a `bunStorage` configuration object.

### Configuration Example

```yaml

bunStorage:
  connectionString: "sqlite://./agent_state.db"

```

### Database Connection Examples

**SQLite:**

```yaml

bunStorage:
  connectionString: "sqlite://./agent_state.db"

```

**SQLite (in-memory):**

```yaml

bunStorage:
  connectionString: ":memory:"

```

**MySQL:**

```yaml

bunStorage:
  connectionString: "mysql://user:password@localhost:3306/database"

```

**PostgreSQL:**

```yaml

bunStorage:
  connectionString: "postgres://user:password@localhost:5432/database"

```

### Configuration Options

| Option             | Type     | Required | Description                                      |
|--------------------|----------|----------|--------------------------------------------------|
| `connectionString` | `string` | Yes      | Bun SQL connection string for database connection |
| `migrationsFolder` | `string` | No       | Reserved for migration support; currently unused |

### Environment Variables

This package does not define environment variables directly. Any environment-driven database configuration should be resolved before constructing the plugin config.

## Usage

### Basic Usage

```typescript
import { BunStorage } from "@tokenring-ai/bun-storage";

const storage = new BunStorage({
  connectionString: "sqlite://./agent_state.db",
});

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

// List all agent checkpoints
const checkpoints = await storage.listAgentCheckpoints();

await storage.stop();
```

### Plugin Integration

```typescript
import { App } from "@tokenring-ai/app";
import bunStoragePlugin from "@tokenring-ai/bun-storage/plugin";

const app = new App();

await app.install(bunStoragePlugin, {
  bunStorage: {
    connectionString: "sqlite://./agent_state.db",
  },
});

await app.start();
```

### Database Dialect Detection

The package automatically detects the database dialect from the connection string:

- **SQLite**: `sqlite://...`, `sqlite:...`, `file://...`, `file:...`, `:memory:`
- **MySQL**: `mysql://...`, `mysql2://...`
- **PostgreSQL**: All other connection strings (default fallback)

You can manually detect the dialect using the exported function:

```typescript
import { detectDatabaseDialect } from "@tokenring-ai/bun-storage";

const dialect = detectDatabaseDialect("sqlite://./db.sqlite");
// Returns: "sqlite"
```

## API Reference

### Classes

#### BunStorage

The main storage class implementing `TokenRingService`, `AgentCheckpointStorage`, and `AppCheckpointStorage` interfaces.

**Properties:**

| Property     | Type     | Description                              |
|--------------|----------|------------------------------------------|
| `name`       | `string` | Service name: `"BunStorage"`             |
| `description`| `string` | Service description: `"Bun SQL storage provider"` |
| `displayName`| `string` | Human-readable name with dialect and connection info |
| `dialect`    | `string` | Detected database dialect: `"sqlite"`, `"mysql"`, or `"postgres"` |
| `sql`        | `SQL`    | Bun SQL client instance                  |
| `queries`    | `object` | Dialect-specific query implementation    |
| `config`     | `object` | Configuration object                     |

**Methods:**

##### Lifecycle Methods

| Method         | Description                              |
|----------------|------------------------------------------|
| `start()`      | Initialize database connection and create tables |
| `stop()`       | Close database connection                |

##### Agent Checkpoint Storage

| Method                              | Description                                    |
|-------------------------------------|------------------------------------------------|
| `storeAgentCheckpoint(checkpoint)`  | Store a named agent checkpoint, returns ID     |
| `retrieveAgentCheckpoint(id)`       | Retrieve an agent checkpoint by ID             |
| `listAgentCheckpoints()`            | List all agent checkpoints (without state)     |

##### App Checkpoint Storage

| Method                              | Description                                    |
|-------------------------------------|------------------------------------------------|
| `storeAppCheckpoint(checkpoint)`    | Store an app session checkpoint, returns ID    |
| `retrieveAppCheckpoint(id)`         | Retrieve an app checkpoint by ID               |
| `listAppCheckpoints()`              | List all app checkpoints (without state)       |
| `retrieveLatestAppCheckpoint()`     | Retrieve the most recent app checkpoint        |

### Exports

#### Named Exports

| Export                        | Type     | Description                                      |
|-------------------------------|----------|--------------------------------------------------|
| `BunStorage`                  | `class`  | Main storage implementation class                |
| `bunStorageConfigSchema`      | `ZodSchema` | Zod schema for configuration validation        |
| `detectDatabaseDialect`       | `function` | Function to detect database dialect from connection string |

#### Type Exports

| Export                    | Type  | Description                                      |
|---------------------------|-------|--------------------------------------------------|
| `BunStorageConfig`        | `type` | Configuration type for BunStorage               |
| `BunStorageConfigSchema`  | `type` | Zod schema type for configuration               |

### Plugin Export

The package exports a default plugin object for TokenRing integration:

```typescript
import bunStoragePlugin from "@tokenring-ai/bun-storage/plugin";
```

**Plugin Properties:**

| Property      | Type     | Description                              |
|---------------|----------|------------------------------------------|
| `name`        | `string` | Package name: `"@tokenring-ai/bun-storage"` |
| `displayName` | `string` | Display name: `"Bun Storage"`            |
| `version`     | `string` | Package version                          |
| `description` | `string` | Package description                      |
| `install()`   | `function` | Plugin installation hook                |
| `config`      | `ZodSchema` | Configuration schema                    |

## Database Schema

The package creates two tables on `start()`:

### AgentCheckpoints Table

Stores agent checkpoint data for AI agent state persistence.

| Column      | Type           | Description                   |
|-------------|----------------|-------------------------------|
| `id`        | Integer/BIGINT | Auto-increment primary key    |
| `sessionId` | TEXT           | Session identifier            |
| `agentId`   | TEXT           | Agent identifier              |
| `agentType` | TEXT           | Agent type (e.g., "general", "specialized") |
| `name`      | TEXT           | Checkpoint name               |
| `state`     | TEXT           | JSON-serialized state payload |
| `createdAt` | Integer/BIGINT | Unix timestamp                |

**SQLite Type:** `integer`, `text`, `integer`  
**MySQL Type:** `bigint`, `text`, `bigint`  
**PostgreSQL Type:** `BIGSERIAL`, `text`, `bigint`

### AppCheckpoints Table

Stores application session checkpoint data for TokenRing apps.

| Column             | Type           | Description                   |
|--------------------|----------------|-------------------------------|
| `id`               | Integer/BIGINT | Auto-increment primary key    |
| `sessionId`        | TEXT           | Session identifier            |
| `hostname`         | TEXT           | Hostname of the app instance  |
| `workspaceDirectory` | TEXT           | Project directory path        |
| `state`            | TEXT           | JSON-serialized state payload |
| `createdAt`        | Integer/BIGINT | Unix timestamp                |

**SQLite Type:** `integer`, `text`, `text`, `text`, `integer`  
**MySQL Type:** `bigint`, `text`, `text`, `text`, `bigint`  
**PostgreSQL Type:** `BIGSERIAL`, `text`, `text`, `text`, `bigint`

## Developer Reference

### Core Components

#### BunStorage (BunStorage.ts)

The main storage implementation that:

- Detects database dialect from connection string
- Initializes Bun SQL client
- Selects appropriate query implementation based on dialect
- Implements checkpoint storage interfaces
- Handles type conversions and data normalization

#### Query Implementations

Three dialect-specific query classes handle database operations:

- **SQLiteQueries** (`sqlite/SQLiteQueries.ts`): SQLite-specific queries using `$1` parameter syntax and `lastInsertRowid`
- **MySQLQueries** (`mysql/MySQLQueries.ts`): MySQL-specific queries using `$1` parameter syntax and `lastInsertRowid`
- **PostgresQueries** (`postgres/PostgresQueries.ts`): PostgreSQL-specific queries using `$1` parameter syntax and `RETURNING` clause

#### Schema Definition (schema.ts)

Re-exports configuration schema and types for external consumption:

- `BunStorageConfigSchema`: Zod schema for configuration validation
- `BunStorageConfig`: TypeScript type for configuration object

### Services

#### TokenRingService Implementation

`BunStorage` implements the `TokenRingService` interface with:

- `name`: Service identifier
- `description`: Human-readable description
- `displayName`: Enhanced display name with connection info
- `start()`: Lifecycle initialization
- `stop()`: Lifecycle cleanup

#### AgentCheckpointStorage Implementation

Implements agent state persistence:

- `storeAgentCheckpoint()`: Stores checkpoint with metadata
- `retrieveAgentCheckpoint()`: Fetches checkpoint by ID
- `listAgentCheckpoints()`: Lists checkpoints without state data

#### AppCheckpointStorage Implementation

Implements app session persistence:

- `storeAppCheckpoint()`: Stores app session checkpoint
- `retrieveAppCheckpoint()`: Fetches checkpoint by ID
- `listAppCheckpoints()`: Lists checkpoints without state data
- `retrieveLatestAppCheckpoint()`: Fetches most recent checkpoint

### Plugin Integration (plugin.ts)

The plugin module provides:

- Configuration schema validation using Zod
- Service registration in app registry
- Automatic checkpoint provider setup for both agent and app services
- Integration with `AgentCheckpointService` and `AppCheckpointService`

### Type Definitions

#### AgentCheckpointRow

```typescript
type AgentCheckpointRow = {
  id: number | string | bigint;
  sessionId: string;
  agentId: string;
  name: string;
  agentType: string;
  state: string | Record<string, unknown>;
  createdAt: number | string | bigint;
};
```

#### AppCheckpointRow

```typescript
type AppCheckpointRow = {
  id: number | string | bigint;
  sessionId: string;
  hostname: string;
  workspaceDirectory: string;
  state: string | Record<string, unknown>;
  createdAt: number | string | bigint;
};
```

### Helper Functions

- **`detectDatabaseDialect(connectionString: string)`**: Detects database type from connection string
- **`sanitizedConnectionString(connectionString: string)`**: Masks password in connection string for display
- **`toNumber(value: number | string | bigint)`**: Converts database numeric types to JavaScript numbers
- **`parseStoredState(value: string | Record<string, unknown>)`**: Parses JSON-stringified state back to object

### Testing

The package includes comprehensive tests in `BunAgentStateStorage.test.ts`:

```bash
# Run tests with Bun
bun test

# Run tests in watch mode
bun run test:watch

# Run tests with coverage
bun run test:coverage

# Type check
bun run build
```

**Note:** Tests require Bun runtime due to dependency on Bun's native SQL client. MySQL and PostgreSQL tests are skipped unless Docker is available.

### Dependencies

| Package                          | Version    | Purpose                                    |
|----------------------------------|------------|--------------------------------------------|
| `@tokenring-ai/app`              | workspace:*| Base app class and service interfaces      |
| `@tokenring-ai/checkpoint`       | workspace:*| Checkpoint storage interfaces              |
| `zod`                            | ^4.4.3     | Schema validation                          |
| `bun-types` (dev)                | ^1.3.11    | Bun type definitions                       |
| `typescript` (dev)               | ^6.0.2     | TypeScript compiler                        |

### Related Components

- `@tokenring-ai/checkpoint`: Checkpoint storage interfaces and schemas
- `@tokenring-ai/app`: TokenRing application framework
- `@tokenring-ai/agent`: Agent management and orchestration

## License

MIT License - see LICENSE file for details.
