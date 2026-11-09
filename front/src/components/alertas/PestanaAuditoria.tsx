import { useEffect, useMemo, useRef, useState } from 'react';
import { AUDIT_ACTIONS, type AuditAction, type AuditPage, type ErrorCode, type User } from '@pippos/shared';
import {
  codigoDe,
  descargarAuditoriaCsv,
  listarUsuarios,
  obtenerAuditoria,
  type FiltrosAuditoria,
} from '../../api/client';
import { descargarArchivo } from '../../descargas';
import { useI18n } from '../../i18n';
import { TESTIDS } from '../../testids';
import { finDelDia, inicioDelDia, opcion } from '../transacciones/valores';
import FiltrosBitacora from './FiltrosBitacora';
import TablaAuditoria from './TablaAuditoria';

const TAMANO_PAGINA = 20;
const BOTON = 'rounded border border-border bg-surface px-3 py-1 disabled:opacity-50';

// Solo el administrador ve esta pestaña (la sección la monta solo para él). La API también lo exige.
export default function PestanaAuditoria() {
  const { t } = useI18n();
  const [accion, setAccion] = useState<AuditAction | undefined>(undefined);
  const [actorId, setActorId] = useState<string | undefined>(undefined);
  // Texto de las fechas (YYYY-MM-DD): el filtro solo cambia cuando el texto se convierte en milisegundos.
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [pagina, setPagina] = useState(1);
  const [usuarios, setUsuarios] = useState<readonly User[]>([]);
  const [resultado, setResultado] = useState<AuditPage | null>(null);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [exportando, setExportando] = useState(false);
  const [errorExportar, setErrorExportar] = useState<ErrorCode | null>(null);
  // Verdadero mientras corre una exportación: un segundo clic no lanza otra petición.
  const enExportacion = useRef(false);

  const from = inicioDelDia(desde);
  const to = finDelDia(hasta);
  // «Desde» posterior a «Hasta»: no se pide nada y se avisa.
  const rangoInvalido = from !== undefined && to !== undefined && from > to;
  const filtros = useMemo<FiltrosAuditoria>(() => ({ action: accion, actorId, from, to }), [accion, actorId, from, to]);

  useEffect(() => {
    let vigente = true;
    // Si esto falla, el selector de actor se queda con «todos los actores»: la pestaña de auditoría sigue funcionando.
    listarUsuarios()
      .then((lista) => {
        if (vigente) setUsuarios(lista);
      })
      .catch(() => undefined);
    return () => {
      vigente = false;
    };
  }, []);

  useEffect(() => {
    if (rangoInvalido) return undefined;
    let vigente = true;
    setError(null);
    obtenerAuditoria({ ...filtros, page: pagina, pageSize: TAMANO_PAGINA })
      .then((respuesta) => {
        if (vigente) setResultado(respuesta);
      })
      .catch((fallo: unknown) => {
        if (vigente) setError(codigoDe(fallo));
      });
    return () => {
      vigente = false;
    };
  }, [filtros, pagina, rangoInvalido]);

  // Cualquier cambio de filtro vuelve a la página 1.
  function alCambiarAccion(valor: string): void {
    setAccion(opcion(AUDIT_ACTIONS, valor));
    setPagina(1);
  }

  function alCambiarActor(valor: string): void {
    setActorId(valor || undefined);
    setPagina(1);
  }

  function alCambiarDesde(valor: string): void {
    setDesde(valor);
    setPagina(1);
  }

  function alCambiarHasta(valor: string): void {
    setHasta(valor);
    setPagina(1);
  }

  async function exportar(): Promise<void> {
    if (rangoInvalido || enExportacion.current) return;
    enExportacion.current = true;
    setExportando(true);
    setErrorExportar(null);
    try {
      const archivo = await descargarAuditoriaCsv(filtros);
      descargarArchivo(archivo, `auditoria-${filtros.from ?? 'todo'}-${filtros.to ?? 'todo'}.csv`);
    } catch (fallo: unknown) {
      setErrorExportar(codigoDe(fallo));
    } finally {
      enExportacion.current = false;
      setExportando(false);
    }
  }

  const paginaActual = resultado?.page ?? 1;
  const paginas = resultado === null ? 1 : Math.max(1, Math.ceil(resultado.total / resultado.pageSize));

  return (
    <div className="flex flex-col gap-4">
      <FiltrosBitacora
        accion={accion}
        actorId={actorId}
        desde={desde}
        hasta={hasta}
        usuarios={usuarios}
        onAccion={alCambiarAccion}
        onActor={alCambiarActor}
        onDesde={alCambiarDesde}
        onHasta={alCambiarHasta}
      />
      {rangoInvalido && (
        <p role="alert" data-testid={TESTIDS['audit-range-error']}>
          {t('audit.rangeError')}
        </p>
      )}
      {error !== null && (
        <p role="alert" data-testid={TESTIDS['audit-error']}>
          {t(`error.${error}` as const)}
        </p>
      )}
      {error === null && resultado === null && <p>{t('audit.loading')}</p>}
      {resultado !== null && resultado.items.length === 0 && <p data-testid={TESTIDS['audit-empty']}>{t('audit.empty')}</p>}
      {resultado !== null && resultado.items.length > 0 && <TablaAuditoria items={resultado.items} />}
      <nav aria-label={t('pagination.label')} className="flex flex-wrap items-center gap-3 text-sm">
        <span>
          {t('audit.total')} <span data-testid={TESTIDS['audit-total']}>{resultado === null ? '' : resultado.total}</span>
        </span>
        <button
          type="button"
          data-testid={TESTIDS['audit-prev']}
          disabled={resultado === null || paginaActual <= 1}
          onClick={() => setPagina(paginaActual - 1)}
          className={BOTON}
        >
          {t('audit.prev')}
        </button>
        <span data-testid={TESTIDS['audit-page-info']}>{resultado === null ? '' : `${resultado.page} / ${paginas}`}</span>
        <button
          type="button"
          data-testid={TESTIDS['audit-next']}
          disabled={resultado === null || paginaActual >= paginas}
          onClick={() => setPagina(paginaActual + 1)}
          className={BOTON}
        >
          {t('audit.next')}
        </button>
      </nav>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          data-testid={TESTIDS['audit-export']}
          disabled={rangoInvalido || exportando}
          onClick={() => void exportar()}
          className="rounded bg-accent px-3 py-2 text-surface disabled:opacity-50"
        >
          {exportando ? t('audit.exporting') : t('audit.export')}
        </button>
        {errorExportar !== null && (
          <p role="alert" data-testid={TESTIDS['audit-export-error']}>
            {t(`error.${errorExportar}` as const)}
          </p>
        )}
      </div>
    </div>
  );
}
