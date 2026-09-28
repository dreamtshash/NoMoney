import type { NoMoneyData } from "@/lib/types/finance";

/**
 * Data-access boundary. The app state layer only talks to this interface.
 *
 * Today: LocalStorageRepository (browser persistence for the prototype).
 * Later: a SupabaseRepository implementing the same methods — the store and
 * every page stay unchanged. A Supabase version would most likely save per
 * entity (upsert transaction, delete goal, …) instead of whole snapshots;
 * the `save` signature receives the full next state so either strategy fits.
 */
export interface LoadResult {
  data: NoMoneyData;
  /** Where the data came from, so the UI can explain it. */
  origin: "stored" | "seed";
  /** Set when stored data existed but couldn't be used. */
  warning?: string;
}

export interface NoMoneyRepository {
  load(): Promise<LoadResult>;
  save(data: NoMoneyData): Promise<void>;
  /** Remove all stored data. The caller decides what to load next. */
  clear(): Promise<void>;
  /** Notify when another tab changes the data. Returns an unsubscribe function. */
  subscribe?(onExternalChange: (data: NoMoneyData) => void): () => void;
}
