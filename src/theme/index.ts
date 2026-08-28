// Design tokens — see PRD §25 "Design Direction"
// Red = risk, Green = healthy, Yellow = attention, Purple/Blue = revenue

export const colors = {
  background: '#F4F5FA',
  surface: '#FFFFFF',
  surfaceMuted: '#F8F9FC',
  text: '#0F172A',
  textSecondary: '#5B6478',
  textMuted: '#94A0B4',
  border: '#E6E8F0',

  brand: '#6D28D9', // purple — revenue & primary actions
  brandDark: '#5B21B6',
  brandLight: '#F3EEFC',

  success: '#10B981', // active / renewed
  successLight: '#E7F8F1',

  warning: '#F59E0B', // watch / renewal soon
  warningLight: '#FEF4E0',

  danger: '#EF4444', // at risk
  dangerLight: '#FDEBEB',

  critical: '#E11D48', // critical
  criticalLight: '#FCE8EE',

  info: '#2563EB',
  infoLight: '#E8EFFD',

  whatsapp: '#22C55E',
  call: '#2563EB',

  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(15, 23, 42, 0.45)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 40,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 28, fontWeight: '800' as const, lineHeight: 36, letterSpacing: -0.4 },
  title: { fontSize: 22, fontWeight: '700' as const, lineHeight: 30, letterSpacing: -0.3 },
  heading: { fontSize: 18, fontWeight: '700' as const, lineHeight: 26 },
  body: { fontSize: 15, fontWeight: '400' as const, lineHeight: 22 },
  bodyStrong: { fontSize: 15, fontWeight: '600' as const, lineHeight: 22 },
  caption: { fontSize: 13, fontWeight: '400' as const, lineHeight: 18 },
  captionStrong: { fontSize: 13, fontWeight: '600' as const, lineHeight: 18 },
  label: { fontSize: 12, fontWeight: '600' as const, lineHeight: 16, letterSpacing: 0.3 },
  small: { fontSize: 11, fontWeight: '500' as const, lineHeight: 15 },
} as const;

export const shadows = {
  card: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  header: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
} as const;
