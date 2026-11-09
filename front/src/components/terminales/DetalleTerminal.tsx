import { useEffect, useId, useState } from 'react';
import type { ErrorCode, Terminal } from '@pippos/shared';
import { cambiarEstadoTerminal, codigoDe, obtenerTerminal } from '../../api/client';
import { useI18n } from '../../i18n';
import { TESTIDS } from '../../testids';
import EditarTerminal from './EditarTerminal';

interface Props {
  id: string;
  esAdmin: boolean;
  onCerrar: () => void;
  onCambiado: () => void;
}

export default function DetalleTerminal({ id, esAdmin, onCerrar, onCambiado }: Props) {
  const { t } = useI18n();
  const idTituloConfirmacion = useId();
  const [terminal, setTerminal] = useState<Terminal | null>(null);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [ocupada, setOcupada] = useState(false);
  const [editando, setEditando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => {
    let vigente = true;
    obtenerTerminal(id)
      .then((encontrada) => {
        if (vigente) setTerminal(encontrada);
      })
      .catch((fallo: unknown) => {
        if (vigente) setError(codigoDe(fallo));
      });
    return () => {
      vigente = false;
    };
  }, [id]);

  async function alternarEstado(): Promise<void> {
    if (terminal === null) return;
    setOcupada(true);
    setError(null);
    try {
      const estado = terminal.status === 'active' ? 'inactive' : 'active';
      setTerminal(await cambiarEstadoTerminal(terminal.id, estado));
      onCambiado();
    } catch (fallo) {
      setError(codigoDe(fallo));
    } finally {
      setOcupada(false);
    }
  }

  // Desactivar pide confirmación y no envía nada hasta aceptar; activar es directo.
  function alPulsarEstado(): void {
    if (terminal?.status === 'active') setConfirmando(true);
    else void alternarEstado();
  }

  function aceptarDesactivar(): void {
    setConfirmando(false);
    void alternarEstado();
  }

  function alGuardarEdicion(actualizada: Terminal): void {
    setTerminal(actualizada);
    setEditando(false);
    onCambiado();
  }

  return (
    <section className="flex flex-col gap-3 rounded border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">{t('terminals.detail.title')}</h3>
        <button
          type="button"
          data-testid={TESTIDS['terminal-detail-close']}
          onClick={onCerrar}
          className="rounded border border-border bg-surface px-3 py-1"
        >
          {t('terminals.detail.close')}
        </button>
      </div>
      {error !== null && (
        <p role="alert" data-testid={TESTIDS['terminal-detail-error']}>
          {t(`error.${error}` as const)}
        </p>
      )}
      {terminal !== null && (
        <div data-testid={TESTIDS['terminal-detail']} className="flex flex-col gap-3">
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <Campo id={TESTIDS['terminal-detail-serial']} etiqueta={t('terminals.field.serial')} valor={terminal.serial} />
            <Campo id={TESTIDS['terminal-detail-alias']} etiqueta={t('terminals.field.alias')} valor={terminal.alias} />
            <Campo id={TESTIDS['terminal-detail-model']} etiqueta={t('terminals.field.model')} valor={terminal.model} />
            <Campo id={TESTIDS['terminal-detail-branch']} etiqueta={t('terminals.field.branch')} valor={terminal.branch} />
            <Campo id={TESTIDS['terminal-detail-till']} etiqueta={t('terminals.field.till')} valor={terminal.till} />
            <Campo
              id={TESTIDS['terminal-detail-status']}
              etiqueta={t('terminals.field.status')}
              valor={t(`terminals.status.${terminal.status}` as const)}
            />
            <Campo
              id={TESTIDS['terminal-detail-firmware']}
              etiqueta={t('terminals.field.firmware')}
              valor={terminal.firmware}
            />
            <Campo
              id={TESTIDS['terminal-detail-battery']}
              etiqueta={t('terminals.field.battery')}
              valor={`${terminal.batteryPct} %`}
            />
            <Campo
              id={TESTIDS['terminal-detail-connection']}
              etiqueta={t('terminals.field.connection')}
              valor={t(`terminals.connection.${terminal.connection}` as const)}
            />
          </dl>
          {esAdmin && (
            <div className="flex flex-wrap items-start gap-2">
              {!editando && (
                <button
                  type="button"
                  data-testid={TESTIDS['terminal-edit-button']}
                  onClick={() => setEditando(true)}
                  className="rounded border border-border bg-surface px-4 py-2"
                >
                  {t('terminals.edit.button')}
                </button>
              )}
              <button
                type="button"
                data-testid={TESTIDS['terminal-toggle-status']}
                disabled={ocupada}
                onClick={alPulsarEstado}
                className="rounded bg-accent px-4 py-2 text-surface"
              >
                {terminal.status === 'active' ? t('terminals.toggle.deactivate') : t('terminals.toggle.activate')}
              </button>
            </div>
          )}
          {esAdmin && confirmando && (
            <div
              role="alertdialog"
              aria-labelledby={idTituloConfirmacion}
              data-testid={TESTIDS['terminal-confirm']}
              className="flex flex-col gap-2 rounded border border-border bg-surface p-3"
            >
              <p id={idTituloConfirmacion} className="font-semibold">
                {t('terminals.confirm.title')}
              </p>
              <p className="text-sm">{t('terminals.confirm.text')}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  data-testid={TESTIDS['terminal-confirm-accept']}
                  onClick={aceptarDesactivar}
                  className="rounded bg-accent px-4 py-2 text-surface"
                >
                  {t('terminals.confirm.accept')}
                </button>
                <button
                  type="button"
                  autoFocus
                  data-testid={TESTIDS['terminal-confirm-cancel']}
                  onClick={() => setConfirmando(false)}
                  className="rounded border border-border bg-surface px-4 py-2"
                >
                  {t('terminals.confirm.cancel')}
                </button>
              </div>
            </div>
          )}
          {esAdmin && editando && (
            <EditarTerminal terminal={terminal} onGuardado={alGuardarEdicion} onCancelar={() => setEditando(false)} />
          )}
        </div>
      )}
    </section>
  );
}

interface CampoProps {
  id: string;
  etiqueta: string;
  valor: string;
}

function Campo({ id, etiqueta, valor }: CampoProps) {
  return (
    <div className="flex flex-col gap-1">
      <dt>{etiqueta}</dt>
      <dd data-testid={id} className="font-medium">
        {valor}
      </dd>
    </div>
  );
}
