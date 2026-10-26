import { LOGO_PATHS, LOGO_VIEWBOX } from '../logoPaths';

export function Logo({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox={LOGO_VIEWBOX} fill="currentColor" aria-label="TUTV">
      {LOGO_PATHS.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}
