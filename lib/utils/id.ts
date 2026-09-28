/** Collision-resistant id for locally created records. Supabase will issue UUIDs later. */
export function createId(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}-${random}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
