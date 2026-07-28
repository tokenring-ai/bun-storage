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
  install(_app) {
    // Storage requires a connection string; created in reconfigure.
  },
  reconfigure(app, config) {
    // connectionString is restartRequired — only create once on first configure.
    if (app.getService(BunStorage)) return;

    const storageService = new BunStorage(config.bunStorage);
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
