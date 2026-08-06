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