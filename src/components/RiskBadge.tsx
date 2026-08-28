import React from 'react';
import type { RiskLevel } from '../types';
import { Badge } from './Badge';
import { RISK_META } from '../utils/risk';

export function RiskBadge({ level }: { level: RiskLevel }) {
  const meta = RISK_META[level];
  return <Badge label={meta.label} color={meta.color} bg={meta.bg} emoji={meta.emoji} />;
}
