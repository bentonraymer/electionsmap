import '@fontsource/inter/300.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import { createRoot } from 'react-dom/client';
import { GfxScreen, TvScreen } from './components/Screens';
import { Stage } from './components/Stage';
import { useLiveState } from './live';
import { Booth } from './pages/Booth';
import { Control } from './pages/Control';
import { Studio } from './pages/Studio';
import './styles.css';

function Output({ kind }: { kind: 'tv' | 'gfx' }) {
  const { state, connected } = useLiveState();
  return (
    <Stage>
      {state && (kind === 'tv' ? <TvScreen s={state} /> : <GfxScreen s={state} />)}
      {/* small amber dot only on the TV output when the server connection drops */}
      {kind === 'tv' && !connected && <div className="offline" title="Reconnecting" />}
    </Stage>
  );
}

const PAGES = { tv: 'TUTV TV', gfx: 'TUTV GFX', studio: 'TUTV Studio', booth: 'TUTV Booth', control: 'TUTV Election Night' } as const;
type Page = keyof typeof PAGES;
const path = location.pathname.replace(/\/+$/, '') || '/';
const page: Page = (path.slice(1) in PAGES ? path.slice(1) : 'control') as Page;
document.body.className = page === 'tv' || page === 'gfx' ? page : 'control';
document.title = PAGES[page];
if (page === 'control' && path !== '/control') history.replaceState(null, '', '/control');

const root = { tv: <Output kind="tv" />, gfx: <Output kind="gfx" />, studio: <Studio />, booth: <Booth />, control: <Control /> }[page];
createRoot(document.getElementById('root')!).render(root);
