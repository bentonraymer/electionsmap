// /control: landing page that points each crew position at its desk.
import { Logo } from '../components/Logo';
import './control.css';

export function Control() {
  return (
    <div className="landing">
      <Logo className="login-logo" />
      <h1>Election Night 2026</h1>
      <div className="landing-cards">
        <a className="landing-card" href="/studio">
          <b>Studio</b>
          <span>Analysts: dig through results and counties, call races, choose what is on the studio TV.</span>
        </a>
        <a className="landing-card" href="/booth">
          <b>Booth</b>
          <span>Producers: air race-call graphics, run the lower third, ticker and BoP bug on the key.</span>
        </a>
      </div>
      <div className="muted">Outputs: <a href="/tv" target="_blank">/tv</a> · <a href="/gfx" target="_blank">/gfx</a></div>
    </div>
  );
}
