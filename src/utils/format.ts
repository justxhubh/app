// Date + currency helpers

export const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / DAY_MS);
}

export function daysSince(dateIso: string | null | undefined): number {
  if (!dateIso) return Number.MAX_SAFE_INTEGER;
  return daysBetween(new Date(), new Date(dateIso));
}

export function daysUntil(dateIso: string): number {
  return daysBetween(new Date(dateIso), new Date());
}

export function formatDate(iso: string | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', opts ?? { day: 'numeric', month: 'short' });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function isSameDay(a: string, b: string): boolean {
  return startOfDay(new Date(a)).getTime() === startOfDay(new Date(b)).getTime();
}

export function isWithinDays(iso: string, days: number): boolean {
  return daysUntil(iso) <= days && daysUntil(iso) >= 0;
}

// Indian-style grouping: 142000 -> "1,42,000"
export function formatINR(amount: number): string {
  const s = Math.round(amount).toString();
  if (s.length <= 3) return `₹${s}`;
  const last3 = s.slice(-3);
  let rest = s.slice(0, -3);
  let grouped = '';
  while (rest.length > 2) {
    grouped = `,${rest.slice(-2)}${grouped}`;
    rest = rest.slice(0, -2);
  }
  grouped = rest + grouped;
  return `₹${grouped},${last3}`;
}

export function formatCompactINR(amount: number): string {
  if (amount >= 1_000_000) return `₹${(amount / 1_000_000).toFixed(1)}L`;
  if (amount >= 100_000) return `₹${(amount / 100_000).toFixed(1)}L`;
  if (amount >= 1_000) return `₹${(amount / 1_000).toFixed(1)}K`;
  return `₹${amount}`;
}

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
