import { createMMKV } from 'react-native-mmkv';

// One storage for the whole app. MMKV saves to a file on the device and is synchronous:
// no await, so you can read saved values while rendering.
export const storage = createMMKV();

export function getString(key{: string}){: string | undefined} {
  return storage.getString(key);
}

export function setString(key{: string}, value{: string}) {
  storage.set(key, value);
}

// Objects and arrays are saved as JSON text.
export function getJSON<T>(key: string): T | undefined { <!-- ts -->
export function getJSON(key) { <!-- js -->
  const text = storage.getString(key);
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text) as T; <!-- ts -->
    return JSON.parse(text); <!-- js -->
  } catch {
    return undefined; // not valid JSON, e.g. saved with setString
  }
}

export function setJSON(key{: string}, value{: unknown}) {
  storage.set(key, JSON.stringify(value));
}

export function remove(key{: string}) {
  storage.remove(key);
}
