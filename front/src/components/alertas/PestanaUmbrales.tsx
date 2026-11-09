import { useEffect, useState } from 'react';
import { codigoDe, guardarUmbrales, obtenerUmbrales } from '../../api/client';
import { useI18n, type MessageKey } from '../../i18n';
import { TESTIDS } from '../../testids';
import { umbralesValidos } from './valores';

interface Props {
  // Solo el administrador cambia umbrales; el resto ve los valores deshabilitados.
  puedeEditar: boolean;
  onGuardado: () => void;
}

export default function PestanaUmbrales({ puedeEditar, onGuardado }: Props) {
  const { t } = useI18n();
  // Texto crudo de los campos: así se ve lo que escribe, y la validación decide antes de enviar.
  const [bateria, setBateria] = useState('');
  const [importe, setImporte] = useState('');
  const [error, setError] = useState<MessageKey | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vigente = true;
    obtenerUmbrales()
      .then((umbrales) => {
        if (!vigente) return;
        setBateria(String(umbrales.batteryBelowPct));
        setImporte(umbrales.voidAtLeastAmount);
      })
      .catch((fallo: unknown) => {
        if (vigente) setError(`error.${codigoDe(fallo)}` as const);
      });
    return () => {
      vigente = false;
    };
  }, []);

  async function guardar(): Promise<void> {
    setGuardado(false);
    const umbrales = umbralesValidos(bateria, importe);
    if (umbrales === null) {
      setError('alerts.settings.invalid');
      return;
    }
    setError(null);
    setGuardando(true);
    try {
      await guardarUmbrales(umbrales);
      setGuardado(true);
      onGuardado();
    } catch (fallo: unknown) {
      setError(`error.${codigoDe(fallo)}` as const);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {!puedeEditar && <p className="text-sm">{t('alerts.settings.readOnly')}</p>}
      <label className="flex flex-col gap-1 text-sm">
        <span>{t('alerts.settings.battery')}</span>
        <input
          type="text"
          inputMode="numeric"
          data-testid={TESTIDS['alert-battery']}
          value={bateria}
          disabled={!puedeEditar}
          onChange={(evento) => setBateria(evento.target.value)}
          className="w-32 rounded border border-border bg-surface px-2 py-1"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span>{t('alerts.settings.voidAmount')}</span>
        <input
          type="text"
          inputMode="numeric"
          data-testid={TESTIDS['alert-void-amount']}
          value={importe}
          disabled={!puedeEditar}
          onChange={(evento) => setImporte(evento.target.value)}
          className="w-40 rounded border border-border bg-surface px-2 py-1"
        />
      </label>
      {puedeEditar && (
        <button
          type="button"
          data-testid={TESTIDS['alert-settings-save']}
          disabled={guardando}
          onClick={() => void guardar()}
          className="self-start rounded bg-accent px-3 py-2 text-surface disabled:opacity-50"
        >
          {t('alerts.settings.save')}
        </button>
      )}
      {error !== null && (
        <p role="alert" data-testid={TESTIDS['alert-settings-error']}>
          {t(error)}
        </p>
      )}
      {guardado && <p data-testid={TESTIDS['alert-settings-saved']}>{t('alerts.settings.saved')}</p>}
    </div>
  );
}
