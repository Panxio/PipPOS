import { useState, type FormEvent } from 'react';
import type { ErrorCode, SessionUser } from '@pippos/shared';
import { ApiError, login } from '../api/client';
import { useI18n } from '../i18n';
import { TESTIDS } from '../testids';

// Avisos que el login muestra al volver sin sesión (sesión expirada o contraseña cambiada).
export type AvisoLogin = 'login.sessionExpired' | 'login.passwordChanged';

interface Props {
  onLogin: (sesion: SessionUser) => void;
  aviso: AvisoLogin | null;
}

function codigoDe(fallo: unknown): ErrorCode {
  return fallo instanceof ApiError ? fallo.code : 'INTERNAL_ERROR';
}

// Pantalla de acceso: siempre oscura, con ondas decorativas detrás de la tarjeta del formulario.
export default function LoginPage({ onLogin, aviso }: Props) {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<ErrorCode | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      onLogin(await login(email, password));
    } catch (fallo) {
      setError(codigoDe(fallo));
      setEnviando(false);
    }
  }

  return (
    <div data-testid={TESTIDS['login-page']} className="login-page">
      <div data-testid={TESTIDS['login-waves']} aria-hidden="true" className="login-waves">
        <span />
        <span />
        <span />
        <span />
      </div>
      <main className="relative z-10 w-full max-w-sm rounded-xl border border-border bg-surface p-6 text-fg">
        <p className="text-sm font-semibold">{t('app.title')}</p>
        <h1 className="mb-6 text-xl font-semibold">{t('login.title')}</h1>
        {aviso !== null && (
          <p role="status" data-testid={TESTIDS['login-notice']} className="mb-4 rounded border border-border p-3">
            {t(aviso)}
          </p>
        )}
        <form data-testid={TESTIDS['login-form']} onSubmit={enviar} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="login-email">{t('login.email')}</label>
            <input
              id="login-email"
              data-testid={TESTIDS['login-email']}
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded border border-border bg-bg px-3 py-2 text-fg"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="login-password">{t('login.password')}</label>
            <input
              id="login-password"
              data-testid={TESTIDS['login-password']}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded border border-border bg-bg px-3 py-2 text-fg"
            />
          </div>
          {error !== null && (
            <p role="alert" data-testid={TESTIDS['login-error']}>
              {t(`error.${error}` as const)}
            </p>
          )}
          <button
            type="submit"
            data-testid={TESTIDS['login-submit']}
            disabled={enviando}
            className="rounded bg-accent px-4 py-2 font-semibold text-surface"
          >
            {t('login.submit')}
          </button>
        </form>
      </main>
    </div>
  );
}
