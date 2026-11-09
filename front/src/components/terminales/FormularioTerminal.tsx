import { useState, type ChangeEvent, type FormEvent } from 'react';
import type { CreateTerminalInput, ErrorCode } from '@pippos/shared';
import { codigoDe, crearTerminal } from '../../api/client';
import { useI18n } from '../../i18n';
import { TESTIDS } from '../../testids';

const CAMPOS = ['serial', 'alias', 'model', 'branch', 'till'] as const;
const VACIO: CreateTerminalInput = { serial: '', alias: '', model: '', branch: '', till: '' };

interface Props {
  onGuardado: () => void;
  onCancelar: () => void;
}

export default function FormularioTerminal({ onGuardado, onCancelar }: Props) {
  const { t } = useI18n();
  const [datos, setDatos] = useState<CreateTerminalInput>(VACIO);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [enviando, setEnviando] = useState(false);

  function cambiarCampo(campo: keyof CreateTerminalInput, evento: ChangeEvent<HTMLInputElement>): void {
    const valor = evento.target.value;
    setDatos((actual) => ({ ...actual, [campo]: valor }));
  }

  async function enviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await crearTerminal(datos);
      onGuardado();
    } catch (fallo) {
      setError(codigoDe(fallo));
      setEnviando(false);
    }
  }

  return (
    <form
      onSubmit={enviar}
      data-testid={TESTIDS['terminal-form']}
      className="flex w-full max-w-[720px] flex-col gap-3 rounded border border-border bg-surface p-4"
    >
      <h3 className="font-semibold">{t('terminals.new')}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {CAMPOS.map((campo) => {
          const id = TESTIDS[`terminal-field-${campo}` as const];
          return (
            <div key={campo} className="flex flex-col gap-1">
              <label htmlFor={id}>{t(`terminals.field.${campo}` as const)}</label>
              <input
                id={id}
                data-testid={id}
                required
                value={datos[campo]}
                onChange={(evento) => cambiarCampo(campo, evento)}
                className="rounded border border-border bg-surface px-3 py-2"
              />
            </div>
          );
        })}
      </div>
      {error !== null && (
        <p role="alert" data-testid={TESTIDS['terminal-form-error']}>
          {t(`error.${error}` as const)}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          data-testid={TESTIDS['terminal-form-submit']}
          disabled={enviando}
          className="rounded bg-accent px-4 py-2 text-surface"
        >
          {t('terminals.form.submit')}
        </button>
        <button
          type="button"
          data-testid={TESTIDS['terminal-form-cancel']}
          onClick={onCancelar}
          className="rounded border border-border bg-surface px-4 py-2"
        >
          {t('terminals.form.cancel')}
        </button>
      </div>
    </form>
  );
}
