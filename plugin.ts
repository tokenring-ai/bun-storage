import type { TokenRingPlugin } from "@tokenring-ai/app";
import AgentCheckpointService from "@tokenring-ai/checkpoint/AgentCheckpointService";
import AppCheckpointService from "@tokenring-ai/checkpoint/AppCheckpointService";
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
  install(app, config) {
    const storage = config.bunStorage;
    const storageService = new BunStorage(storage);
    app.services.register(storageService);
    app.services.waitForItemByType(AgentCheckpointService, checkpointService => {
      checkpointService.setCheckpointProvider(storageService);
    });
    app.services.waitForItemByType(AppCheckpointService, checkpointService => {
      checkpointService.setCheckpointProvider(storageService);
    });
  },
  configSchema: packageConfigSchema,
} satisfies TokenRingPlugin<typeof packageConfigSchema>;
