import type { SecureStorage } from "../mobile/secure-storage";

const prefix = "aimatic.shopping.secure.";
const keyFor = (key: string) => `${prefix}${key}`;

export const sessionSecureStorage: SecureStorage = {
  async get(key) { return globalThis.sessionStorage.getItem(keyFor(key)); },
  async set(key, value) { globalThis.sessionStorage.setItem(keyFor(key), value); },
  async remove(key) { globalThis.sessionStorage.removeItem(keyFor(key)); },
  async clear() {
    for (let index = globalThis.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = globalThis.sessionStorage.key(index);
      if (key?.startsWith(prefix)) globalThis.sessionStorage.removeItem(key);
    }
  }
};
