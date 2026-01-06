// src/lib/tauri.ts
// Tauri v2: nutze @tauri-apps/api/core statt window.__TAURI__

export function isTauri(): boolean {
  // In Tauri v2 ist das zuverlässiger als __TAURI__
  return typeof (window as any).__TAURI_INTERNALS__ !== "undefined";
}

export async function safeInvoke<T = any>(
  cmd: string,
  args?: Record<string, unknown>
): Promise<T> {
  // Dynamischer Import: funktioniert in Tauri und crasht nicht im Browser-Build
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}
