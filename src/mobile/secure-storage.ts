import { registerPlugin } from "@capacitor/core";

interface NativeSecureStoragePlugin {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
  clear(): Promise<void>;
}

export interface SecureStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
}

const nativePlugin = registerPlugin<NativeSecureStoragePlugin>("AimaticSecureStorage");

export const androidSecureStorage: SecureStorage = {
  async get(key) { return (await nativePlugin.get({ key })).value; },
  async set(key, value) { await nativePlugin.set({ key, value }); },
  async remove(key) { await nativePlugin.remove({ key }); },
  async clear() { await nativePlugin.clear(); }
};

export class MemorySecureStorage implements SecureStorage {
  private readonly values = new Map<string, string>();
  async get(key: string) { return this.values.get(key) ?? null; }
  async set(key: string, value: string) { this.values.set(key, value); }
  async remove(key: string) { this.values.delete(key); }
  async clear() { this.values.clear(); }
}
