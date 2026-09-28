import type { NoMoneyData } from "@/lib/types/finance";
import type { LoadResult, NoMoneyRepository } from "@/lib/data/repository";
import { createSeedData } from "@/lib/data/seed";
import { isNoMoneyData } from "@/lib/data/validate";

/**
 * Browser persistence for the prototype. The ONLY file that touches localStorage.
 *
 * Stored as a versioned envelope so a future schema change can migrate
 * instead of silently misreading old data.
 */
export const STORAGE_KEY = "nomoney:data";
export const SCHEMA_VERSION = 2;

interface Envelope {
  version: number;
  savedAt: string;
  data: NoMoneyData;
}

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null; // e.g. storage disabled in private mode
  }
}

export class LocalStorageRepository implements NoMoneyRepository {
  async load(): Promise<LoadResult> {
    const store = storage();
    if (!store) {
      return {
        data: createSeedData(),
        origin: "seed",
        warning: "Browser storage is unavailable, so changes won't be kept after you close this tab.",
      };
    }
    const raw = store.getItem(STORAGE_KEY);
    if (raw === null) return { data: createSeedData(), origin: "seed" };

    try {
      const parsed = JSON.parse(raw) as Partial<Envelope>;
      if (parsed.version !== SCHEMA_VERSION) {
        return {
          data: createSeedData(),
          origin: "seed",
          warning: "Saved data was from an older version of NoMoney and couldn't be read. Demo data was loaded instead.",
        };
      }
      if (!isNoMoneyData(parsed.data)) throw new Error("invalid shape");
      // Merge settings so newly added settings get defaults.
      const defaults = createSeedData().settings;
      // Older saves may lack newer fields (e.g. import history) — fill them in.
      return {
        data: { ...parsed.data, imports: parsed.data.imports ?? [], settings: { ...defaults, ...parsed.data.settings } },
        origin: "stored",
      };
    } catch {
      return {
        data: createSeedData(),
        origin: "seed",
        warning: "Saved data was damaged and couldn't be read. Demo data was loaded instead.",
      };
    }
  }

  async save(data: NoMoneyData): Promise<void> {
    const store = storage();
    if (!store) throw new Error("Browser storage is unavailable.");
    const envelope: Envelope = { version: SCHEMA_VERSION, savedAt: new Date().toISOString(), data };
    try {
      store.setItem(STORAGE_KEY, JSON.stringify(envelope));
    } catch (e) {
      const quota = e instanceof DOMException && (e.name === "QuotaExceededError" || e.code === 22);
      throw new Error(quota ? "Browser storage is full. Remove some data and try again." : "Couldn't save to browser storage.");
    }
  }

  async clear(): Promise<void> {
    storage()?.removeItem(STORAGE_KEY);
  }

  subscribe(onExternalChange: (data: NoMoneyData) => void): () => void {
    if (typeof window === "undefined") return () => {};
    const handler = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || e.newValue === null) return;
      try {
        const parsed = JSON.parse(e.newValue) as Envelope;
        if (parsed.version === SCHEMA_VERSION && isNoMoneyData(parsed.data)) onExternalChange(parsed.data);
      } catch {
        /* ignore malformed writes from other tabs */
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }
}
