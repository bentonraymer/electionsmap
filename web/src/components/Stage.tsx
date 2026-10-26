import { useEffect, useState, type ReactNode } from 'react';

/** Renders children on a fixed 1920x1080 canvas scaled to `width` (or to fit the window). */
export function Stage({ children, width, className }: { children: ReactNode; width?: number; className?: string }) {
  const [win, setWin] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    if (width) return;
    const on = () => setWin({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [width]);
  const scale = width ? width / 1920 : Math.min(win.w / 1920, win.h / 1080);
  return (
    <div className={`stage-wrap ${className ?? ''}`} style={{ width: 1920 * scale, height: 1080 * scale }}>
      <div className="stage" style={{ transform: `scale(${scale})` }}>{children}</div>
    </div>
  );
}
