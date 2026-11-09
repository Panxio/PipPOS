import { useI18n } from '../../i18n';
import { TESTIDS } from '../../testids';
import LandingBar from './LandingBar';
import LandingHero from './LandingHero';
import { PanelAreas, PanelAutomatizacion, PanelCierre } from './LandingPaneles';
import './landing.css';

interface Props {
  onEntrar: () => void;
}

function PieLanding() {
  const { t } = useI18n();
  return (
    <footer className="landing-footer" data-testid={TESTIDS['landing-footer']}>
      <a href="#producto" data-testid={TESTIDS['landing-footer-producto']}>
        {t('landing.menu.producto')}
      </a>
      <a href="#automatizacion" data-testid={TESTIDS['landing-footer-automatizacion']}>
        {t('landing.menu.automatizacion')}
      </a>
      <a href="#entrar" data-testid={TESTIDS['landing-footer-entrar']}>
        {t('landing.menu.entrar')}
      </a>
    </footer>
  );
}

// Landing pública: sin sesión, `/` muestra esta página. Fuentes servidas desde el propio front (sin CDN).
export default function LandingPage({ onEntrar }: Props) {
  const { t } = useI18n();
  return (
    <div className="landing" data-testid={TESTIDS.landing}>
      <a href="#contenido" className="landing-skip" data-testid={TESTIDS['landing-skip']}>
        {t('landing.skip')}
      </a>
      <LandingBar onEntrar={onEntrar} />
      <main id="contenido">
        <LandingHero onEntrar={onEntrar} />
        <PanelAreas />
        <PanelAutomatizacion />
        <PanelCierre onEntrar={onEntrar} />
      </main>
      <PieLanding />
    </div>
  );
}
