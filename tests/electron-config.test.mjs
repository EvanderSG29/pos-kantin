import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  DEFAULT_CONFIG,
  createRuntimeConfigManager,
} = require("../app/electron/config/default.cjs");

async function createConfigManager() {
  const tempDir = await mkdtemp(path.join(tmpdir(), "pos-kantin-config-"));
  return {
    tempDir,
    configPath: path.join(tempDir, "config.local.json"),
    manager: createRuntimeConfigManager({
      getPath(name) {
        assert.equal(name, "userData");
        return tempDir;
      },
    }),
  };
}

{
  const { configPath, manager } = await createConfigManager();
  const config = manager.getConfig();
  const raw = JSON.parse(await readFile(configPath, "utf8"));

  assert.equal(config.autoSyncEnabled, false);
  assert.equal(config.syncIntervalMs, DEFAULT_CONFIG.syncIntervalMs);
  assert.equal(raw.autoSyncEnabled, false);
}

{
  const { configPath, manager } = await createConfigManager();
  await writeFile(configPath, `${JSON.stringify({
    gasWebAppUrl: "https://script.google.com/macros/s/example/exec",
    requestTimeoutMs: 25000,
    networkProbeIntervalMs: 45000,
    syncIntervalMs: 60000,
  }, null, 2)}\n`, "utf8");

  const settings = manager.updateSyncSettings({
    autoSyncEnabled: true,
    syncIntervalMs: 300000,
    gasWebAppUrl: "",
    networkProbeIntervalMs: 1,
  });
  const raw = JSON.parse(await readFile(configPath, "utf8"));

  assert.deepEqual(settings, {
    autoSyncEnabled: true,
    syncIntervalMs: 300000,
    configPath,
  });
  assert.equal(raw.gasWebAppUrl, "https://script.google.com/macros/s/example/exec");
  assert.equal(raw.requestTimeoutMs, 25000);
  assert.equal(raw.networkProbeIntervalMs, 45000);
  assert.equal(raw.autoSyncEnabled, true);
  assert.equal(raw.syncIntervalMs, 300000);
}

{
  const { manager } = await createConfigManager();

  assert.throws(
    () => manager.updateSyncSettings({ syncIntervalMs: 9000 }),
    /minimal 10 detik/
  );
  assert.throws(
    () => manager.updateSyncSettings({ syncIntervalMs: 24 * 60 * 60 * 1000 + 1 }),
    /maksimal 24 jam/
  );
}

console.log("electron config tests passed");
