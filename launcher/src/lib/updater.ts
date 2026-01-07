import { check } from "@tauri-apps/plugin-updater";

export async function checkForUpdates() {
  const update = await check();
  return update;
}
