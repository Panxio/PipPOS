import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import type { Preferences, SessionUser } from '@pippos/shared';
import { alExpirarSesion, getMe, logout, savePreferences } from './api/client';
import { I18nProvider, isLanguage, type Language } from './i18n';
import AppShell from './layout/AppShell';
import InvitationPage from './pages/InvitationPage';
import LandingPage from './pages/landing/LandingPage';
import LoginPage, { type AvisoLogin } from './pages/LoginPage';
import ReceiptPage from './pages/ReceiptPage';
import { RUTA_LOGIN } from './rutas';
import { applyTheme, type Theme } from './theme/theme';

const LANG_KEY = 'pippos.language';
const RUTA_INVITACION = '/invitacion';
const RUTA_COMPROBANTE = /^\/comprobante\/([^/]+)$/;

function idiomaGuardado(): Language {
  try {
    const valor = localStorage.getItem(LANG_KEY);
    return isLanguage(valor) ? valor : 'es';
  } catch {
    return 'es';
  }
}

function guardarIdioma(lang: Language): void {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    // Sin almacenamiento el idioma dura solo mientras la página esté abierta.
  }
}

// Sin router: la ruta pública de invitación se lee de window.location.
function tokenDeInvitacion(): string | null {
  return new URLSearchParams(window.location.search).get('token') || null;
}

// Sin router: el id del comprobante sale de la ruta /comprobante/:id.
function idDelComprobante(ruta: string): string | null {
  const coincidencia = RUTA_COMPROBANTE.exec(ruta);
  return coincidencia === null ? null : coincidencia[1];
}

export default function App() {
  const [lang, setLang] = useState<Language>(idiomaGuardado);
  const [theme, setTheme] = useState<Theme>('light');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [restaurando, setRestaurando] = useState(true);
  const [aviso, setAviso] = useState<AvisoLogin | null>(null);
  // Sin router: la ruta vive en estado y cada navegación vuelve a pintar la vista.
  const [ruta, setRuta] = useState(() => window.location.pathname);

  useLayoutEffect(() => applyTheme(theme), [theme]);
  useLayoutEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  useEffect(() => guardarIdioma(lang), [lang]);

  // Navega sin recargar. `reemplazar` cambia la entrada actual del historial (cierre de sesión, cambio de clave).
  const navegar = useCallback((nueva: string, reemplazar = false): void => {
    if (reemplazar) window.history.replaceState({}, '', nueva);
    else window.history.pushState({}, '', nueva);
    setRuta(nueva);
  }, []);

  // Atrás y adelante del navegador vuelven a pintar la vista de la ruta.
  useEffect(() => {
    const alVolver = (): void => setRuta(window.location.pathname);
    window.addEventListener('popstate', alVolver);
    return () => window.removeEventListener('popstate', alVolver);
  }, []);

  function adoptar(sesion: SessionUser): void {
    setAviso(null);
    setUser(sesion);
    setLang(sesion.preferences.language);
    setTheme(sesion.preferences.theme);
  }

  function guardarPreferencias(preferencias: Preferences): void {
    if (user === null) return;
    setUser({ ...user, preferences: preferencias });
    savePreferences(preferencias).catch(() => undefined);
  }

  function cambiarIdioma(nuevo: Language): void {
    setLang(nuevo);
    guardarPreferencias({ language: nuevo, theme });
  }

  function alternarTema(): void {
    const nuevo: Theme = theme === 'light' ? 'dark' : 'light';
    setTheme(nuevo);
    guardarPreferencias({ language: lang, theme: nuevo });
  }

  async function cerrarSesion(): Promise<void> {
    await logout().catch(() => undefined);
    setUser(null);
    navegar(RUTA_LOGIN, true);
  }

  function alCambiarContrasena(): void {
    setUser(null);
    setAviso('login.passwordChanged');
    navegar(RUTA_LOGIN, true);
  }

  useEffect(() => {
    let vigente = true;
    getMe()
      .then((sesion) => {
        if (vigente) adoptar(sesion);
      })
      .catch(() => undefined)
      .finally(() => {
        if (vigente) setRestaurando(false);
      });
    return () => {
      vigente = false;
    };
  }, []);

  // Solo con sesión abierta: un 401 de cualquier petición devuelve al login con el aviso.
  useEffect(() => {
    if (user === null) return undefined;
    return alExpirarSesion(() => {
      setUser(null);
      setAviso('login.sessionExpired');
      navegar(RUTA_LOGIN, true);
    });
  }, [user, navegar]);

  if (ruta === RUTA_INVITACION) {
    return (
      <I18nProvider lang={lang} onChange={cambiarIdioma}>
        <InvitationPage token={tokenDeInvitacion()} />
      </I18nProvider>
    );
  }

  // El comprobante no espera la sesión: se ve con o sin login, y sin barra de la app.
  const comprobanteId = idDelComprobante(ruta);
  if (comprobanteId !== null) {
    return (
      <I18nProvider lang={lang} onChange={cambiarIdioma}>
        <ReceiptPage id={comprobanteId} />
      </I18nProvider>
    );
  }

  if (restaurando) return null;

  // Sin sesión: `/ingresar` es el login y cualquier otra ruta, la landing pública.
  function vistaSinSesion() {
    if (ruta === RUTA_LOGIN) return <LoginPage onLogin={adoptar} aviso={aviso} />;
    return <LandingPage onEntrar={() => navegar(RUTA_LOGIN)} />;
  }

  return (
    <I18nProvider lang={lang} onChange={cambiarIdioma}>
      {user === null ? (
        vistaSinSesion()
      ) : (
        <AppShell
          user={user}
          theme={theme}
          onToggleTheme={alternarTema}
          onLogout={cerrarSesion}
          onContrasenaCambiada={alCambiarContrasena}
        />
      )}
    </I18nProvider>
  );
}
