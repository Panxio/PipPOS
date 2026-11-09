import { useState, type ChangeEvent } from 'react';
import type { ErrorCode, ImportResult } from '@pippos/shared';
import { codigoDe, importarTerminales } from '../../api/client';
import { useI18n } from '../../i18n';
import { TESTIDS } from '../../testids';

interface Props {
  onImportado: () => void;
}

export default function ImportarTerminales({ onImportado }: Props) {
  const { t } = useI18n();
  const [resultado, setResultado] = useState<ImportResult | null>(null);
  const [error, setError] = useState<ErrorCode | null>(null);

  async function alElegirArchivo(evento: ChangeEvent<HTMLInputElement>): Promise<void> {
    const entrada = evento.target;
    const archivo = entrada.files?.[0];
    if (archivo === undefined) return;
    setResultado(null);
    setError(null);
    try {
      const csv = await archivo.text();
      entrada.value = '';
      setResultado(await importarTerminales(csv));
      onImportado();
    } catch (fallo) {
      setError(codigoDe(fallo));
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded border border-border bg-surface p-4">
      <h3 className="font-semibold">{t('import.title')}</h3>
      <div className="flex flex-col gap-1">
        <label htmlFor={TESTIDS['terminal-import-file']}>{t('import.file')}</label>
        <input
          id={TESTIDS['terminal-import-file']}
          type="file"
          accept=".csv,text/csv"
          data-testid={TESTIDS['terminal-import-file']}
          onChange={alElegirArchivo}
          className="text-sm"
        />
      </div>
      {error !== null && (
        <p role="alert" data-testid={TESTIDS['terminal-import-error']}>
          {t(`error.${error}` as const)}
        </p>
      )}
      {resultado !== null && (
        <div data-testid={TESTIDS['terminal-import-result']} className="flex flex-col gap-2 text-sm">
          <p>
            {t('import.created')} <span data-testid={TESTIDS['terminal-import-created']}>{resultado.created}</span>
          </p>
          {resultado.invalid.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="font-semibold">{t('import.invalidTitle')}</p>
              {resultado.invalid.map((fila) => (
                <p key={fila.row} data-testid={TESTIDS['terminal-import-invalid-row']}>
                  {`${t('import.row')} ${fila.row}: ${t(`import.${fila.code}` as const)}`}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
