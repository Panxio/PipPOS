import { useState, type FormEvent } from 'react';
import type { ErrorCode } from '@pippos/shared';
import { cambiarContrasena, codigoDe } from '../../api/client';
import { useI18n } from '../../i18n';
import { TESTIDS } from '../../testids';

interface Props {
  onCambiada: () => void;
}

export default function CambiarContrasena({ onCambiada }: Props) {
  const { t } = useI18n();
  const [abierto, setAbierto] = useState(false);
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [error, setError] = useState<ErrorCode | null>(null);
  const [enviando, setEnviando] = useState(false);

  function cerrar(): void {
    setAbierto(false);
    setActual('');
    setNueva('');
    setError(null);
    setEnviando(false);
  }

  async function enviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await cambiarContrasena({ current: actual, next: nueva });
      onCambiada();
    } catch (fallo) {
      setError(codigoDe(fallo));
      setEnviando(false);
    }
  }

  if (!abierto) {
    return (
      <button
        type="button"
        data-testid={TESTIDS['password-button']}
        onClick={() => setAbierto(true)}
        className="rounded border border-border bg-surface px-2 py-1"
      >
        {t('password.button')}
      </button>
    );
  }

  return (
    <form
      data-testid={TESTIDS['password-form']}
      onSubmit={enviar}
      className="flex flex-wrap items-end gap-2 rounded border border-border bg-surface p-2"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={TESTIDS['password-current']}>{t('password.current')}</label>
        <input
          id={TESTIDS['password-current']}
          data-testid={TESTIDS['password-current']}
          type="password"
          autoComplete="current-password"
          value={actual}
          onChange={(e) => setActual(e.target.value)}
          className="rounded border border-border bg-surface px-2 py-1"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={TESTIDS['password-next']}>{t('password.next')}</label>
        <input
          id={TESTIDS['password-next']}
          data-testid={TESTIDS['password-next']}
          type="password"
          autoComplete="new-password"
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          className="rounded border border-border bg-surface px-2 py-1"
        />
      </div>
      {error !== null && (
        <p role="alert" data-testid={TESTIDS['password-error']}>
          {t(`error.${error}` as const)}
        </p>
      )}
      <button
        type="submit"
        data-testid={TESTIDS['password-submit']}
        disabled={enviando || actual === '' || nueva === ''}
        className="rounded bg-accent px-3 py-1 text-surface"
      >
        {t('password.submit')}
      </button>
      <button
        type="button"
        data-testid={TESTIDS['password-cancel']}
        onClick={cerrar}
        className="rounded border border-border bg-surface px-3 py-1"
      >
        {t('password.cancel')}
      </button>
    </form>
  );
}
