// Daily counters that keep AWS spend bounded (Bedrock calls, Polly voices, new rooms).
const used = new Map<string, { day: string; n: number }>();

export function allow(key: string, perDay: number) {
  const day = new Date().toISOString().slice(0, 10);
  const u = used.get(key);
  const next = u && u.day === day ? u.n + 1 : 1;
  if (next > perDay) return false;
  used.set(key, { day, n: next });
  return true;
}
