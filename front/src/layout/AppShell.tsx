import { useEffect, useRef, useState } from 'react';
import type { Section, SessionUser } from '@pippos/shared';
import CampanaAlertas from '../components/alertas/CampanaAlertas';
import { useEstadoAlertas } from '../components/alertas/useEstadoAlertas';
import CambiarContrasena from '../components/cuenta/CambiarContrasena';
import AlertsPage from '../pages/AlertsPage';
import HomePage from '../pages/HomePage';
import PlaceholderPage from '../pages/PlaceholderPage';
import ReportsPage from '../pages/ReportsPage';
import TerminalsPage from '../pages/TerminalsPage';
import TransactionsPage from '../pages/TransactionsPage';
import UsersPage from '../pages/UsersPage';
import { isLanguage, useI18n } from '../i18n';
import { TESTIDS } from '../testids';
import type { Theme } from '../theme/theme';

interface Props {
  user: SessionUser;
  theme: Theme;
  onToggleTheme: () => void;
  onLogout: () => Promise<void>;
  onContrasenaCambiada: () => void;
}

type GrupoId = 'operacion' | 'analisis' | 'admin';

// Grupos de la barra en el orden de pantalla. Un grupo sin secciones visibles no se dibuja.
const GRUPOS: readonly { id: GrupoId; secciones: readonly Section[] }[] = [
  { id: 'operacion', secciones: ['terminales', 'transacciones'] },
  { id: 'analisis', secciones: ['reportes', 'alertas'] },
  { id: 'admin', secciones: ['usuarios', 'liquidaciones'] },
];

const ESTILO_BOTON_BARRA =
  'rounded-lg px-3 py-2 text-accent hover:bg-accent/10 aria-expanded:bg-accent/10 aria-[current=page]:bg-accent/15 aria-[current=page]:font-semibold';

export default function AppShell({ user, theme, onToggleTheme, onLogout, onContrasenaCambiada }: Props) {
  const { t, lang, setLang } = useI18n();
  const [seccion, setSeccion] = useState<Section>('inicio');
  const [abierto, setAbierto] = useState<GrupoId | null>(null);
  const gruposRef = useRef<Partial<Record<GrupoId, HTMLDivElement | null>>>({});
  const botonesRef = useRef<Partial<Record<GrupoId, HTMLButtonElement | null>>>({});
  // La campana y la sección Alertas comparten estado; sin permiso de alertas no hay consultas.
  const puedeVerAlertas = user.sections.includes('alertas');
  const alertas = useEstadoAlertas(puedeVerAlertas);

  // Con un menú abierto: un clic fuera de los grupos lo cierra; Escape lo cierra y, si el foco estaba dentro, lo devuelve a su botón.
  useEffect(() => {
    if (abierto === null) return undefined;
    const grupoAbierto = abierto;
    function alHacerClic(evento: MouseEvent): void {
      const dentro = Object.values(gruposRef.current).some((grupo) => grupo?.contains(evento.target as Node | null) === true);
      if (!dentro) setAbierto(null);
    }
    function alPulsarTecla(evento: KeyboardEvent): void {
      if (evento.key !== 'Escape') return;
      const teniaFoco = gruposRef.current[grupoAbierto]?.contains(document.activeElement) === true;
      setAbierto(null);
      if (teniaFoco) botonesRef.current[grupoAbierto]?.focus();
    }
    document.addEventListener('click', alHacerClic);
    document.addEventListener('keydown', alPulsarTecla);
    return () => {
      document.removeEventListener('click', alHacerClic);
      document.removeEventListener('keydown', alPulsarTecla);
    };
  }, [abierto]);

  function elegir(nueva: Section): void {
    setSeccion(nueva);
    setAbierto(null);
  }

  function botonSeccion(s: Section) {
    return (
      <button
        key={s}
        type="button"
        data-testid={TESTIDS[`nav-${s}` as const]}
        aria-current={s === seccion ? 'page' : undefined}
        onClick={() => elegir(s)}
        className={`${ESTILO_BOTON_BARRA} text-left`}
      >
        {t(`nav.${s}`)}
      </button>
    );
  }

  return (
    <div data-testid={TESTIDS['app-shell']} className="min-h-screen bg-bg text-fg">
      <header>
        <p data-testid={TESTIDS['demo-banner']} className="border-b border-border bg-surface px-4 py-2 text-sm text-accent">
          {t('demo.banner')}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-border bg-surface px-4 py-3">
        <h1 className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
          <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" aria-hidden="true" className="h-6 w-6 text-accent">
            <path d="M9 11a8 8 0 0 1 0 10" />
            <path d="M15 7a14 14 0 0 1 0 18" />
            <path d="M21 3a20 20 0 0 1 0 26" />
          </svg>
          {t('app.title')}
        </h1>
        <nav data-testid={TESTIDS.nav} className="relative flex flex-wrap items-center gap-1 max-sm:w-full">
          {user.sections.includes('inicio') && botonSeccion('inicio')}
          {GRUPOS.map((grupo) => {
            const secciones = grupo.secciones.filter((s) => user.sections.includes(s));
            if (secciones.length === 0) return null;
            const estaAbierto = abierto === grupo.id;
            const listaId = `nav-group-${grupo.id}-list`;
            return (
              <div
                key={grupo.id}
                ref={(elemento) => {
                  gruposRef.current[grupo.id] = elemento;
                }}
                className="static sm:relative"
              >
                <button
                  type="button"
                  data-testid={TESTIDS[`nav-group-${grupo.id}` as const]}
                  ref={(elemento) => {
                    botonesRef.current[grupo.id] = elemento;
                  }}
                  aria-expanded={estaAbierto}
                  aria-controls={listaId}
                  aria-current={secciones.includes(seccion) ? 'true' : undefined}
                  onClick={() => setAbierto(estaAbierto ? null : grupo.id)}
                  className={`${ESTILO_BOTON_BARRA} inline-flex items-center gap-1.5 font-semibold`}
                >
                  {t(`nav.group.${grupo.id}` as const)}
                  <svg viewBox="0 0 12 12" aria-hidden="true" className={`h-3 w-3 ${estaAbierto ? 'rotate-180' : ''}`}>
                    <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <div
                  id={listaId}
                  data-testid={TESTIDS[`nav-group-${grupo.id}-list` as const]}
                  hidden={!estaAbierto}
                  className={`absolute top-full right-0 left-0 z-30 mt-2 flex flex-col gap-1 rounded-xl border border-border bg-surface p-2 shadow-lg sm:min-w-56 ${grupo.id === 'admin' ? 'sm:right-0 sm:left-auto' : 'sm:right-auto sm:left-0'}`}
                >
                  {secciones.map((s) => botonSeccion(s))}
                </div>
              </div>
            );
          })}
        </nav>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span data-testid={TESTIDS['user-name']}>{user.name}</span>
          <span data-testid={TESTIDS['user-role']}>{t(`role.${user.role}`)}</span>
          <select
            aria-label={t('prefs.language')}
            data-testid={TESTIDS['lang-select']}
            value={lang}
            onChange={(e) => {
              if (isLanguage(e.target.value)) setLang(e.target.value);
            }}
            className="rounded border border-border bg-surface px-2 py-1"
          >
            <option value="es">{t('lang.es')}</option>
            <option value="en">{t('lang.en')}</option>
          </select>
          <button
            type="button"
            data-testid={TESTIDS['theme-toggle']}
            aria-pressed={theme === 'dark'}
            onClick={onToggleTheme}
            className="rounded border border-border bg-surface px-2 py-1"
          >
            {theme === 'dark' ? t('prefs.themeLight') : t('prefs.theme')}
          </button>
          {puedeVerAlertas && <CampanaAlertas estado={alertas} onVerTodas={() => setSeccion('alertas')} />}
          <CambiarContrasena onCambiada={onContrasenaCambiada} />
          <button
            type="button"
            data-testid={TESTIDS['logout-button']}
            onClick={onLogout}
            className="rounded bg-accent px-2 py-1 text-surface"
          >
            {t('logout')}
          </button>
        </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1400px] px-6 py-4">
        {seccion === 'inicio' ? (
          <HomePage merchantName={user.merchantName} />
        ) : seccion === 'terminales' ? (
          <TerminalsPage user={user} />
        ) : seccion === 'usuarios' ? (
          <UsersPage usuario={user} />
        ) : seccion === 'transacciones' ? (
          <TransactionsPage user={user} />
        ) : seccion === 'reportes' ? (
          <ReportsPage />
        ) : seccion === 'alertas' ? (
          <AlertsPage user={user} version={alertas.version} onCambio={alertas.avisarCambio} />
        ) : (
          <PlaceholderPage seccion={seccion} />
        )}
      </main>
    </div>
  );
}
