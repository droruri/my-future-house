import { z } from 'zod';
import { validateHouse, type House } from './house';

export const STORAGE_KEY = 'my-future-house/v1';

export type Loaded = { house: House; baseline: House; repairs: string[] };

const SavedSchema = z.object({ house: z.unknown(), baseline: z.unknown() });

export const serializeHouse = (house: House): string => JSON.stringify(house, null, 2);

/** Parse an imported file's text. Repairs are reported; a non-house is an error. */
export function parseImport(text: string): { ok: true; house: House; repairs: string[] } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'הקובץ אינו JSON תקין' };
  }
  const r = validateHouse(raw);
  return r.ok ? r : { ok: false, error: 'הקובץ אינו בית תקין' };
}

/** Read the saved house and baseline; null if nothing usable is stored or storage is blocked. */
export function loadSaved(storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): Loaded | null {
  try {
    const text = storage?.getItem(STORAGE_KEY);
    if (!text) return null;
    const saved = SavedSchema.safeParse(JSON.parse(text));
    if (!saved.success) return null;
    const house = validateHouse(saved.data.house);
    if (!house.ok) return null;
    const baseline = validateHouse(saved.data.baseline);
    return {
      house: house.house,
      baseline: baseline.ok ? baseline.house : house.house,
      repairs: house.repairs,
    };
  } catch {
    return null;
  }
}

/** Returns an error message, or null on success. Never throws. */
export function save(
  house: House,
  baseline: House,
  storage: Pick<Storage, 'setItem'> | undefined = safeStorage(),
): string | null {
  try {
    if (!storage) return 'האחסון בדפדפן חסום — השינויים לא יישמרו';
    storage.setItem(STORAGE_KEY, JSON.stringify({ house, baseline }));
    return null;
  } catch {
    return 'האחסון בדפדפן מלא או חסום — השינויים לא יישמרו';
  }
}

function safeStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}
