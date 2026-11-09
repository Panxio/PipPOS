import { useEffect, useMemo, useRef, useState } from 'react';
import type { ErrorCode, ReportGroupBy, SalesResponse, SummaryResponse } from '@pippos/shared';
import { codigoDe, descargarVentasCsv, obtenerResumen, obtenerVentas } from '../api/client';
import FiltrosReportes from '../components/reportes/FiltrosReportes';
import TarjetasKpi from '../components/reportes/TarjetasKpi';
import VistaVentas from '../components/reportes/VistaVentas';
import { consultaDeFechas, fechasDePreset, type FechasReporte, type PresetReporte } from '../components/reportes/rangos';
import { descargarArchivo } from '../descargas';
import { useI18n } from '../i18n';
import { TESTIDS } from '../testids';

// Sin sondeo: cada consulta sale al abrir la sección, al cambiar el rango o al cambiar el agrupado.
export default function ReportsPage() {
  const { t } = useI18n();
  const [preset, setPreset] = useState<PresetReporte | null>('7d');
  const [fechas, setFechas] = useState<FechasReporte>(() => fechasDePreset('7d', new Date()));
  const [groupBy, setGroupBy] = useState<ReportGroupBy>('day');
  const [resumen, setResumen] = useState<SummaryResponse | null>(null);
  const [errorResumen, setErrorResumen] = useState<ErrorCode | null>(null);
  const [ventas, setVentas] = useState<SalesResponse | null>(null);
  const [errorVentas, setErrorVentas] = useState<ErrorCode | null>(null);
  const [exportando, setExportando] = useState(false);
  const [errorExportar, setErrorExportar] = useState<ErrorCode | null>(null);
  // Verdadero mientras corre una exportación: un segundo clic no lanza otra petición.
  const enExportacion = useRef(false);

  // Null si las fechas no sirven: en ese caso no se pide nada.
  const rango = useMemo(() => consultaDeFechas(fechas), [fechas]);

  // Cada respuesta se descarta si ya hay otra consulta vigente (cleanup marca la anterior como caducada).
  useEffect(() => {
    if (rango === null) return undefined;
    let vigente = true;
    setErrorResumen(null);
    obtenerResumen(rango)
      .then((respuesta) => {
        if (vigente) setResumen(respuesta);
      })
      .catch((fallo: unknown) => {
        if (vigente) setErrorResumen(codigoDe(fallo));
      });
    return () => {
      vigente = false;
    };
  }, [rango]);

  useEffect(() => {
    if (rango === null) return undefined;
    let vigente = true;
    setErrorVentas(null);
    obtenerVentas({ ...rango, groupBy })
      .then((respuesta) => {
        if (vigente) setVentas(respuesta);
      })
      .catch((fallo: unknown) => {
        if (vigente) setErrorVentas(codigoDe(fallo));
      });
    return () => {
      vigente = false;
    };
  }, [rango, groupBy]);

  // «Hoy» se calcula al pulsar el preset, no al montar.
  function elegirPreset(elegido: PresetReporte): void {
    setPreset(elegido);
    setFechas(fechasDePreset(elegido, new Date()));
  }

  function cambiarFecha(campo: keyof FechasReporte, valor: string): void {
    setPreset(null);
    setFechas((actual) => ({ ...actual, [campo]: valor }));
  }

  async function exportar(): Promise<void> {
    if (rango === null || enExportacion.current) return;
    enExportacion.current = true;
    setExportando(true);
    setErrorExportar(null);
    try {
      const archivo = await descargarVentasCsv({ ...rango, groupBy });
      descargarArchivo(archivo, `ventas-${groupBy}-${rango.from}-${rango.to}.csv`);
    } catch (fallo: unknown) {
      setErrorExportar(codigoDe(fallo));
    } finally {
      enExportacion.current = false;
      setExportando(false);
    }
  }

  const errorConsulta = errorResumen ?? errorVentas;

  return (
    <section data-testid={TESTIDS['reports-page']} className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">{t('reports.title')}</h2>
      <FiltrosReportes
        fechas={fechas}
        preset={preset}
        groupBy={groupBy}
        onPreset={elegirPreset}
        onCambiarFecha={cambiarFecha}
        onCambiarGroupBy={setGroupBy}
      />
      {rango === null && (
        <p role="alert" data-testid={TESTIDS['report-range-error']}>
          {t('reports.rangeError')}
        </p>
      )}
      {errorConsulta !== null && (
        <p role="alert" data-testid={TESTIDS['report-error']}>
          {t(`error.${errorConsulta}` as const)}
        </p>
      )}
      {resumen !== null && <TarjetasKpi resumen={resumen} />}
      {ventas !== null && <VistaVentas ventas={ventas} />}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          data-testid={TESTIDS['report-export']}
          disabled={rango === null || exportando}
          onClick={() => void exportar()}
          className="rounded bg-accent px-3 py-2 text-surface disabled:opacity-50"
        >
          {exportando ? t('reports.exporting') : t('reports.export')}
        </button>
        {errorExportar !== null && (
          <p role="alert" data-testid={TESTIDS['report-export-error']}>
            {t(`error.${errorExportar}` as const)}
          </p>
        )}
      </div>
    </section>
  );
}
