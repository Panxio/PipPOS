import { useState, type ChangeEvent, type FormEvent } from 'react';
import type { ErrorCode, Terminal, UpdateTerminalInput } from '@pippos/shared';
import { codigoDe, editarTerminal } from '../../api/client';
import { useI18n } from '../../i18n';
import { TESTIDS } from '../../testids';

const CAMPOS = ['alias', 'branch', 'till'] as const;
type CampoEditable = (typeof CAMPOS)[number];
type Borrador = Record<CampoEditable, string>;

interface Props {
  terminal: Terminal;
  onGuardado: (actualizada: Terminal) => void;
  onCancelar: () => void;
}

// Solo viajan los campos que cambiaron, tal como se escribieron (sin trim): la API valida.
function cambiosDe(terminal: Terminal, borrador: Borrador): UpdateTerminalInput {
  const cambios: UpdateTerminalInput = {};
  for (const campo of CAMPOS) {
    if (borrador[campo] !== terminal[campo]) cambios[campo] = borrador[campo];
  }
  return cambios;
}

export default function EditarTerminal({ terminal, onGuardado, onCancelar }: Props) {
  const { t } = useI18n();
  const [borrador, setBorrador] = useState<Borrador>({
    alias: terminal.alias,
    branch: terminal.branch,
    till: terminal.till,
  });
  const [error, setError] = useState<ErrorCode | null>(null);
  const [enviando, setEnviando] = useState(false);
  const cambios = cambiosDe(terminal, borrador);
  const hayCambios = Object.keys(cambios).length > 0;

  function cambiarCampo(campo: CampoEditable, evento: ChangeEvent<HTMLInputElement>): void {
    const valor = evento.target.value;
    setBorrador((actual) => ({ ...actual, [campo]: valor }));
  }

  async function enviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    if (!hayCambios) return;
    setError(null);
    setEnviando(true);
    try {
      onGuardado(await editarTerminal(terminal.id, cambios));
    } catch (fallo) {
      setError(codigoDe(fallo));
      setEnviando(false);
    }
  }

  return (
    <form
      onSubmit={enviar}
      data-testid={TESTIDS['terminal-edit-form']}
      className="flex w-full max-w-[720px] flex-col gap-3 rounded border border-border bg-surface p-4"
    >
      <h4 className="font-semibold">{t('terminals.edit.title')}</h4>
      <div className="grid gap-3 sm:grid-cols-3">
        {CAMPOS.map((campo) => {
          const id = TESTIDS[`terminal-edit-${campo}` as const];
          return (
            <div key={campo} className="flex flex-col gap-1">
              <label htmlFor={id}>{t(`terminals.field.${campo}` as const)}</label>
              <input
                id={id}
                data-testid={id}
                required
                value={borrador[campo]}
                onChange={(evento) => cambiarCampo(campo, evento)}
                className="rounded border border-border bg-surface px-3 py-2"
              />
            </div>
          );
        })}
      </div>
      {error !== null && (
        <p role="alert" data-testid={TESTIDS['terminal-edit-error']}>
          {t(`error.${error}` as const)}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          data-testid={TESTIDS['terminal-edit-submit']}
          disabled={!hayCambios || enviando}
          className="rounded bg-accent px-4 py-2 text-surface disabled:opacity-50"
        >
          {t('terminals.edit.submit')}
        </button>
        <button
          type="button"
          data-testid={TESTIDS['terminal-edit-cancel']}
          onClick={onCancelar}
          className="rounded border border-border bg-surface px-4 py-2"
        >
          {t('terminals.edit.cancel')}
        </button>
      </div>
    </form>
  );
}
