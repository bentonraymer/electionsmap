import '@fontsource/inter/300.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import { createRoot } from 'react-dom/client';
import { GfxScreen, TvScreen } from './components/Screens';
import { Stage } from './components/Stage';
import { useLiveState } from './live';
import { Control } from './pages/Control';
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

const path = location.pathname.replace(/\/+$/, '') || '/';
const page = path === '/tv' ? 'tv' : path === '/gfx' ? 'gfx' : 'control';
document.body.className = page;
document.title = page === 'control' ? 'TUTV Election Control' : `TUTV ${page.toUpperCase()}`;
if (page === 'control' && path !== '/control') history.replaceState(null, '', '/control');

createRoot(document.getElementById('root')!).render(page === 'control' ? <Control /> : <Output kind={page} />);
