CREATE TABLE IF NOT EXISTS "AgentCheckpoints"
(
 "id"        bigserial PRIMARY KEY NOT NULL,
 "sessionId" text                  NOT NULL,
 "agentId"   text                  NOT NULL,
 "name"      text                  NOT NULL,
 "agentType" text                  NOT NULL,
 "state"     text                  NOT NULL,
 "createdAt" bigint                NOT NULL
);
CREATE TABLE IF NOT EXISTS "AppCheckpoints"
(
 "id"               bigserial PRIMARY KEY NOT NULL,
 "sessionId"        text                  NOT NULL,
 "hostname"         text                  NOT NULL,
 "workspaceDirectory" text                  NOT NULL,
 "state"            text                  NOT NULL,
 "createdAt"        bigint                NOT NULL
);

CREATE TABLE IF NOT EXISTS "AgentMetrics"
(
 "agentId"   text   PRIMARY KEY NOT NULL,
 "metrics"   text               NOT NULL,
 "updatedAt" bigint             NOT NULL
);

-- Agent checkpoints
CREATE INDEX IF NOT EXISTS idx_agent_checkpoints_session ON "AgentCheckpoints" ("sessionId");
CREATE INDEX IF NOT EXISTS idx_agent_checkpoints_agent_id ON "AgentCheckpoints" ("agentId");
CREATE INDEX IF NOT EXISTS idx_agent_checkpoints_created ON "AgentCheckpoints" ("createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_agent_checkpoints_agent_session ON "AgentCheckpoints" ("agentId", "sessionId");

-- App checkpoints
CREATE INDEX IF NOT EXISTS idx_app_checkpoints_session ON "AppCheckpoints" ("sessionId");
CREATE INDEX IF NOT EXISTS idx_app_checkpoints_created ON "AppCheckpoints" ("createdAt" DESC);

-- Agent metrics
CREATE INDEX IF NOT EXISTS idx_agent_metrics_updated ON "AgentMetrics" ("updatedAt" DESC);
