CREATE TABLE IF NOT EXISTS `AgentCheckpoints`
(
 `id`        bigint AUTO_INCREMENT NOT NULL,
 `sessionId` text                  NOT NULL,
 `agentId`   text                  NOT NULL,
 `name`      text                  NOT NULL,
 `agentType` text                  NOT NULL,
 `state`     text                  NOT NULL,
 `createdAt` bigint                NOT NULL,
 CONSTRAINT `AgentCheckpoints_id` PRIMARY KEY (`id`)
);

CREATE TABLE IF NOT EXISTS `AppCheckpoints`
(
 `id`               bigint AUTO_INCREMENT NOT NULL,
 `sessionId`        text                  NOT NULL,
 `hostname`         text                  NOT NULL,
 `workspaceDirectory` text                  NOT NULL,
 `state`            text                  NOT NULL,
 `createdAt`        bigint                NOT NULL,
 CONSTRAINT `AppCheckpoints_id` PRIMARY KEY (`id`)
);

CREATE TABLE IF NOT EXISTS `AgentMetrics`
(
 `agentId`   varchar(255) NOT NULL,
 `metrics`   text         NOT NULL,
 `updatedAt` bigint       NOT NULL,
 CONSTRAINT `AgentMetrics_agentId` PRIMARY KEY (`agentId`)
);

-- Agent checkpoints (TEXT columns need prefix lengths under InnoDB key limits)
CREATE INDEX IF NOT EXISTS idx_agent_checkpoints_session ON `AgentCheckpoints` (`sessionId`(255));
CREATE INDEX IF NOT EXISTS idx_agent_checkpoints_agent_id ON `AgentCheckpoints` (`agentId`(255));
CREATE INDEX IF NOT EXISTS idx_agent_checkpoints_created ON `AgentCheckpoints` (`createdAt` DESC);
CREATE INDEX IF NOT EXISTS idx_agent_checkpoints_agent_session ON `AgentCheckpoints` (`agentId`(191), `sessionId`(191));

-- App checkpoints
CREATE INDEX IF NOT EXISTS idx_app_checkpoints_session ON `AppCheckpoints` (`sessionId`(255));
CREATE INDEX IF NOT EXISTS idx_app_checkpoints_created ON `AppCheckpoints` (`createdAt` DESC);

-- Agent metrics
CREATE INDEX IF NOT EXISTS idx_agent_metrics_updated ON `AgentMetrics` (`updatedAt` DESC);
