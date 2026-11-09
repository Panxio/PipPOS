import { useState, type FormEvent } from 'react';
import type { ErrorCode } from '@pippos/shared';
import { aceptarInvitacion, codigoDe } from '../api/client';
import { useI18n } from '../i18n';
import { TESTIDS } from '../testids';

interface Props {
  token: string | null;
}

// Página pública: se ve con o sin sesión. Sin token no hay formulario ni petición.
export default function InvitationPage({ token }: Props) {
  const { t } = useI18n();
  const [clave, setClave] = useState('');
  const [error, setError] = useState<ErrorCode | null>(token === null ? 'NOT_FOUND' : null);
  const [hecha, setHecha] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    if (token === null) return;
    setError(null);
    setEnviando(true);
    try {
      await aceptarInvitacion({ token, password: clave });
      setHecha(true);
    } catch (fallo) {
      setError(codigoDe(fallo));
      setEnviando(false);
    }
  }

  return (
    <main data-testid={TESTIDS['invitation-page']} className="mx-auto mt-16 max-w-sm p-4">
      <p className="text-sm font-semibold">{t('app.title')}</p>
      <h1 className="mb-6 text-xl font-semibold">{t('invitation.title')}</h1>
      {hecha ? (
        <div className="flex flex-col gap-3">
          <p data-testid={TESTIDS['invitation-done']}>{t('invitation.done')}</p>
          <a data-testid={TESTIDS['invitation-login']} href="/ingresar" className="text-accent underline">
            {t('invitation.login')}
          </a>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {error !== null && (
            <p role="alert" data-testid={TESTIDS['invitation-error']}>
              {t(`error.${error}` as const)}
            </p>
          )}
          {token !== null && (
            <form onSubmit={enviar} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label htmlFor={TESTIDS['invitation-password']}>{t('invitation.password')}</label>
                <input
                  id={TESTIDS['invitation-password']}
                  data-testid={TESTIDS['invitation-password']}
                  type="password"
                  autoComplete="new-password"
                  required
                  value={clave}
                  onChange={(e) => setClave(e.target.value)}
                  className="rounded border border-border bg-surface px-3 py-2"
                />
                <p className="text-sm">{t('invitation.hint')}</p>
              </div>
              <button
                type="submit"
                data-testid={TESTIDS['invitation-submit']}
                disabled={clave === '' || enviando}
                className="rounded bg-accent px-4 py-2 text-surface"
              >
                {t('invitation.submit')}
              </button>
            </form>
          )}
        </div>
      )}
    </main>
  );
}
