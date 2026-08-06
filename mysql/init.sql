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