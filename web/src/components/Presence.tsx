import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Keeps a graphic mounted while it animates out. `k` changes trigger a fresh animate-in
 * (e.g. a different race on the lower third).
 */
export function Presence({ show, k, children, outMs = 500 }: { show: boolean; k?: string | number; children: ReactNode; outMs?: number }) {
  const [phase, setPhase] = useState<'in' | 'out' | 'gone'>(show ? 'in' : 'gone');
  const [key, setKey] = useState(k);
  const last = useRef<ReactNode>(children);
  if (show) last.current = children;

  useEffect(() => {
    if (show) { setPhase('in'); setKey(k); return; }
    if (phase === 'gone') return;
    setPhase('out');
    const t = setTimeout(() => setPhase('gone'), outMs);
    return () => clearTimeout(t);
  }, [show, k]);

  if (phase === 'gone') return null;
  return <div key={String(key)} className={phase === 'in' ? 'anim-in' : 'anim-out'}>{last.current}</div>;
}

export function Shards() {
  return <div className="shards"><i /><i /><i /><i /></div>;
}
