import type { TokenRingPlugin } from "@tokenring-ai/app";
import AgentCheckpointService from "@tokenring-ai/checkpoint/AgentCheckpointService";
import AppCheckpointService from "@tokenring-ai/checkpoint/AppCheckpointService";
import type { ZodNever } from "zod";
import { z } from "zod";
import { BunStorage } from "./BunStorage.ts";
import packageJSON from "./package.json" with { type: "json" };
import { BunStorageConfigSchema } from "./schema.ts";

const packageConfigSchema = z.object({
  bunStorage: BunStorageConfigSchema,
});

export default {
  name: packageJSON.name,
  displayName: "Bun Storage",
  version: packageJSON.version,
  description: packageJSON.description,
  earlyInstall(app, config) {
    const storageService = app.addService(new BunStorage(config.bunStorage, app));

    app.waitForService(AgentCheckpointService, checkpointService => {
      checkpointService.setCheckpointProvider(storageService);
    });
    app.waitForService(AppCheckpointService, checkpointService => {
      checkpointService.setCheckpointProvider(storageService);
    });
  },
  immutableConfigSchema: packageConfigSchema,
} satisfies TokenRingPlugin<ZodNever, typeof packageConfigSchema>;
