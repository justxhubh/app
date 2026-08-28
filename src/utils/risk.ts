// At-risk business logic — PRD §19
import type { RiskInfo, RiskLevel, RiskThresholds } from '../types';
import { daysSince } from './format';

// Default thresholds — 0–4 Active 🟢, 5–9 Watch 🟡, 10–14 At Risk 🔴, 15+ Critical 🚨.
export const DEFAULT_RISK_THRESHOLDS: RiskThresholds = {
  activeMax: 4,
  watchMax: 9,
  atRiskMax: 14,
};

export function computeRisk(
  lastCheckInAt: string | null,
  thresholds: RiskThresholds = DEFAULT_RISK_THRESHOLDS,
): RiskInfo {
  const daysInactive = daysSince(lastCheckInAt);
  let level: RiskLevel;
  if (daysInactive <= thresholds.activeMax) level = 'ACTIVE';
  else if (daysInactive <= thresholds.watchMax) level = 'WATCH';
  else if (daysInactive <= thresholds.atRiskMax) level = 'AT_RISK';
  else level = 'CRITICAL';
  return { level, daysInactive: daysInactive === Number.MAX_SAFE_INTEGER ? -1 : daysInactive };
}

export const RISK_META: Record<
  RiskLevel,
  { label: string; emoji: string; color: string; bg: string; order: number }
> = {
  ACTIVE: { label: 'Active', emoji: '🟢', color: '#10B981', bg: '#E7F8F1', order: 0 },
  WATCH: { label: 'Watch', emoji: '🟡', color: '#F59E0B', bg: '#FEF4E0', order: 1 },
  AT_RISK: { label: 'At Risk', emoji: '🔴', color: '#EF4444', bg: '#FDEBEB', order: 2 },
  CRITICAL: { label: 'Critical', emoji: '🚨', color: '#E11D48', bg: '#FCE8EE', order: 3 },
};

export function isRisking(level: RiskLevel): boolean {
  return level === 'AT_RISK' || level === 'CRITICAL';
}

// Bucket members by draft thresholds — used by the owner settings screen to
// preview how a change would re-classify members.
export function riskLevelForDays(
  daysInactive: number,
  thresholds: RiskThresholds = DEFAULT_RISK_THRESHOLDS,
): RiskLevel {
  if (daysInactive <= thresholds.activeMax) return 'ACTIVE';
  if (daysInactive <= thresholds.watchMax) return 'WATCH';
  if (daysInactive <= thresholds.atRiskMax) return 'AT_RISK';
  return 'CRITICAL';
}
