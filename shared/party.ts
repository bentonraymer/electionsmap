import type { Party } from './types.js';

export function partyCode(p: string | undefined): Party {
  const s = (p ?? '').toLowerCase();
  if (s.startsWith('democrat')) return 'D';
  if (s.startsWith('republican')) return 'R';
  if (s.startsWith('libertarian')) return 'L';
  if (s.startsWith('green')) return 'G';
  if (s.startsWith('independent') || s === 'unenrolled') return 'I';
  if (s.startsWith('nonpartisan') || !s) return 'N';
  return 'O';
}
