import { useCallback, useEffect, useRef, useState } from 'react';
import { isLanguage, useI18n } from '../../i18n';
import { TESTIDS } from '../../testids';
import EnlaceIngreso from './EnlaceIngreso';
import MenuDesplegable, { type EnlaceMenu } from './MenuDesplegable';

type Menu = 'producto' | 'automatizacion';

const MENU_PRODUCTO: readonly EnlaceMenu[] = [
  { testId: 'landing-link-terminales', ancla: '#producto', titulo: 'landing.link.terminales', detalle: 'landing.link.terminales.detalle' },
  { testId: 'landing-link-cobros', ancla: '#producto', titulo: 'landing.link.cobros', detalle: 'landing.link.cobros.detalle' },
  { testId: 'landing-link-alertas', ancla: '#producto', titulo: 'landing.link.alertas', detalle: 'landing.link.alertas.detalle' },
];

const MENU_AUTOMATIZACION: readonly EnlaceMenu[] = [
  { testId: 'landing-link-contrato', ancla: '#automatizacion', titulo: 'landing.link.contrato', detalle: 'landing.link.contrato.detalle' },
  { testId: 'landing-link-selectores', ancla: '#selectores', titulo: 'landing.link.selectores', detalle: 'landing.link.selectores.detalle' },
];

const DESTINOS_MOVIL = ['producto', 'automatizacion', 'entrar'] as const;

function IconoPip() {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" aria-hidden="true">
      <path d="M9 11a8 8 0 0 1 0 10" />
      <path d="M15 7a14 14 0 0 1 0 18" />
      <path d="M21 3a20 20 0 0 1 0 26" />
    </svg>
  );
}

interface Props {
  onEntrar: () => void;
}

// Barra fija: marca, menús de escritorio, selector de idioma, CTA y menú móvil (solo < 860 px).
export default function LandingBar({ onEntrar }: Props) {
  const { t, lang, setLang } = useI18n();
  const barraRef = useRef<HTMLElement>(null);
  const [menuAbierto, setMenuAbierto] = useState<Menu | null>(null);
  const [movilAbierto, setMovilAbierto] = useState(false);

  const cerrarTodo = useCallback((): void => {
    setMenuAbierto(null);
    setMovilAbierto(false);
  }, []);

  // Escape y clic fuera de la barra cierran los menús. El clic dentro lo resuelve cada botón.
  useEffect(() => {
    const alClic = (evento: MouseEvent): void => {
      if (!barraRef.current?.contains(evento.target as Node)) cerrarTodo();
    };
    const alTecla = (evento: KeyboardEvent): void => {
      if (evento.key === 'Escape') cerrarTodo();
    };
    document.addEventListener('click', alClic);
    document.addEventListener('keydown', alTecla);
    return () => {
      document.removeEventListener('click', alClic);
      document.removeEventListener('keydown', alTecla);
    };
  }, [cerrarTodo]);

  function alternarMenu(menu: Menu): void {
    setMovilAbierto(false);
    setMenuAbierto((actual) => (actual === menu ? null : menu));
  }

  function alternarMovil(): void {
    setMenuAbierto(null);
    setMovilAbierto((abierto) => !abierto);
  }

  return (
    <header ref={barraRef} className="landing-bar" data-testid={TESTIDS['landing-bar']}>
      <div className="landing-bar-in">
        <a href="#inicio" className="landing-brand" data-testid={TESTIDS['landing-brand']}>
          <IconoPip />
          {t('app.title')}
        </a>
        <nav className="landing-menus" aria-label={t('landing.nav.label')} data-testid={TESTIDS['landing-nav']}>
          <MenuDesplegable
            nombre="producto"
            abierto={menuAbierto === 'producto'}
            onAlternar={() => alternarMenu('producto')}
            onElegir={cerrarTodo}
            enlaces={MENU_PRODUCTO}
          />
          <MenuDesplegable
            nombre="automatizacion"
            abierto={menuAbierto === 'automatizacion'}
            onAlternar={() => alternarMenu('automatizacion')}
            onElegir={cerrarTodo}
            enlaces={MENU_AUTOMATIZACION}
          />
        </nav>
        <select
          className="landing-lang"
          aria-label={t('prefs.language')}
          data-testid={TESTIDS['landing-lang']}
          value={lang}
          onChange={(e) => {
            if (isLanguage(e.target.value)) setLang(e.target.value);
          }}
        >
          <option value="es">{t('lang.es')}</option>
          <option value="en">{t('lang.en')}</option>
        </select>
        <EnlaceIngreso testId="landing-cta-bar" clase="landing-btn landing-btn-principal" onEntrar={onEntrar}>
          {t('landing.cta')}
        </EnlaceIngreso>
        <button
          type="button"
          className="landing-menu-toggle"
          data-testid={TESTIDS['landing-menu-toggle']}
          aria-expanded={movilAbierto}
          aria-controls="landing-mobile-nav"
          onClick={alternarMovil}
        >
          {t('landing.menu.toggle')}
        </button>
        <nav
          id="landing-mobile-nav"
          className="landing-mobile-nav"
          aria-label={t('landing.nav.movil')}
          data-testid={TESTIDS['landing-mobile-nav']}
          hidden={!movilAbierto}
        >
          {DESTINOS_MOVIL.map((destino) => (
            <a
              key={destino}
              href={`#${destino}`}
              data-testid={TESTIDS[`landing-mobile-link-${destino}` as const]}
              onClick={cerrarTodo}
            >
              {t(`landing.menu.${destino}` as const)}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}
