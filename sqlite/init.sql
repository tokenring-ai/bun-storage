CREATE TABLE IF NOT EXISTS "AgentCheckpoints"
(
 "id"        integer PRIMARY KEY AUTOINCREMENT NOT NULL,
 "sessionId" text                              NOT NULL,
 "agentId"   text                              NOT NULL,
 "agentType" text                              NOT NULL,
 "name"      text                              NOT NULL,
 "state"     text                              NOT NULL,
 "createdAt" integer                           NOT NULL
);

CREATE TABLE IF NOT EXISTS "AppCheckpoints"
(
 "id"                 integer PRIMARY KEY AUTOINCREMENT NOT NULL,
 "sessionId"          text                              NOT NULL,
 "hostname"           text                              NOT NULL,
 "workspaceDirectory" text                              NOT NULL,
 "state"              text                              NOT NULL,
 "createdAt"          integer                           NOT NULL
);

