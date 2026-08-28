// Centralized query keys for TanStack Query.

export const queryKeys = {
  dashboard: ['dashboard'] as const,
  riskSummary: ['risk-summary'] as const,
  members: (q: unknown) => ['members', q] as const,
  atRisk: ['at-risk'] as const,
  memberProfile: (id: string) => ['member', id] as const,
  attendance: (id: string) => ['attendance', id] as const,
  attendanceSummary: ['attendance-summary'] as const,
  renewals: ['renewals'] as const,
  revenue: ['revenue'] as const,
  opportunities: (category?: string) => ['opportunities', category ?? 'all'] as const,
  services: ['services'] as const,
  notifications: ['notifications'] as const,
  settings: ['settings'] as const,
};
