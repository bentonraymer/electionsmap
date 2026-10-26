import type { Party } from '../../shared/types';

// TUTV brand palette (from the logo and the existing lower-third package).
export const brand = {
  navy: '#003595',
  navyDeep: '#001a4d',
  ink: '#0a1f4d',
  plateLight: '#f4f3f3',
  plateDark: '#b8b7b7',
  pastelBlue: '#bed0fd',
  pastelBlueMid: '#aebfe9',
  pastelRed: '#f6c6cb',
  white: '#ffffff',
};

export const partyColor: Record<Party, string> = {
  D: '#2f6bdb',
  R: '#d43a44',
  I: '#7a7f87',
  L: '#c9a227',
  G: '#3f9b4f',
  O: '#7a7f87',
  N: '#6b5fb5',
};

// Pastel tints for "leading, not called".
export const partyTint: Record<Party, string> = {
  D: '#9bb8f0',
  R: '#efa3a8',
  I: '#c3c6cb',
  L: '#e6d491',
  G: '#a5d3ad',
  O: '#c3c6cb',
  N: '#bcb5e3',
};

/** Yes/No ballot measures get their own colours rather than party colours. */
export function candidateColor(name: string, party: Party) {
  if (/^yes$/i.test(name)) return '#2a9d8f';
  if (/^no$/i.test(name)) return '#e07a2f';
  return partyColor[party];
}
export function candidateTint(name: string, party: Party) {
  if (/^yes$/i.test(name)) return '#9fd6cf';
  if (/^no$/i.test(name)) return '#f2bf95';
  return partyTint[party];
}
