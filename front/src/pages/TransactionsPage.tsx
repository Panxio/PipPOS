import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ErrorCode,
  ListTerminalsQuery,
  ListTransactionsQuery,
  Role,
  SessionUser,
  Terminal,
  TransactionPage,
} from '@pippos/shared';
import { codigoDe, listarTerminales, listarTransacciones } from '../api/client';
import DetalleTransaccion from '../components/transacciones/DetalleTransaccion';
import FiltrosTransacciones from '../components/transacciones/FiltrosTransacciones';
import FormularioCobro from '../components/transacciones/FormularioCobro';
import ListaTransacciones from '../components/transacciones/ListaTransacciones';
import { useI18n } from '../i18n';
import { TESTIDS } from '../testids';

interface Props {
  user: SessionUser;
}

const CONSULTA_INICIAL: ListTransactionsQuery = { page: 1, pageSize: 20 };
const CONSULTA_TERMINALES: ListTerminalsQuery = { sort: 'alias', order: 'asc', page: 1, pageSize: 100 };
const INTERVALO_SONDEO_MS = 5000;
// La API manda en los permisos; esto solo decide qué controles se muestran.
const ROLES_QUE_GESTIONAN: readonly Role[] = ['admin', 'supervisor'];

export default function TransactionsPage({ user }: Props) {
  const { t } = useI18n();
  const puedeGestionar = ROLES_QUE_GESTIONAN.includes(user.role);
  const [terminales, setTerminales] = useState<Terminal[]>([]);
  const [errorTerminales, setErrorTerminales] = useState<ErrorCode | null>(null);
  const [consulta, setConsulta] = useState<ListTransactionsQuery>(CONSULTA_INICIAL);
  const [pagina, setPagina] = useState<TransactionPage | null>(null);
  const [errorLista, setErrorLista] = useState<ErrorCode | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  // Número de la última consulta del feed: una respuesta de una consulta anterior se descarta.
  const numeroUltima = useRef(0);
  // Verdadero mientras la última consulta no ha respondido: el sondeo no lanza otra encima.
  const enCurso = useRef(false);
  // Filtros y página vigentes, para que el sondeo repita la última consulta.
  const consultaVigente = useRef(CONSULTA_INICIAL);
  const aliases = useMemo(() => new Map(terminales.map((terminal) => [terminal.id, terminal.alias])), [terminales]);

  // Lanza la consulta sin esperar a un render: así el sondeo no depende del ciclo de React.
  // La tabla anterior se conserva hasta que llegue la respuesta de la última consulta.
  const consultar = useCallback((porConsultar: ListTransactionsQuery): void => {
    const numero = numeroUltima.current + 1;
    numeroUltima.current = numero;
    enCurso.current = true;
    listarTransacciones(porConsultar)
      .then((respuesta) => {
        if (numero !== numeroUltima.current) return;
        setPagina(respuesta);
        setErrorLista(null);
      })
      .catch((fallo: unknown) => {
        if (numero === numeroUltima.current) setErrorLista(codigoDe(fallo));
      })
      .finally(() => {
        if (numero === numeroUltima.current) enCurso.current = false;
      });
  }, []);

  useEffect(() => {
    let vigente = true;
    listarTerminales(CONSULTA_TERMINALES)
      .then((respuesta) => {
        if (vigente) setTerminales(respuesta.items);
      })
      .catch((fallo: unknown) => {
        if (vigente) setErrorTerminales(codigoDe(fallo));
      });
    return () => {
      vigente = false;
    };
  }, []);

  useEffect(() => {
    consultaVigente.current = consulta;
    consultar(consulta);
  }, [consulta, consultar]);

  // Un único reloj: repite la última consulta mientras la sección está abierta; se limpia al salir.
  useEffect(() => {
    const reloj = setInterval(() => {
      if (!enCurso.current) consultar(consultaVigente.current);
    }, INTERVALO_SONDEO_MS);
    return () => clearInterval(reloj);
  }, [consultar]);

  const recargar = useCallback(() => consultar(consultaVigente.current), [consultar]);

  // Cambiar cualquier filtro vuelve a la página 1.
  function cambiarFiltro(cambio: Partial<ListTransactionsQuery>): void {
    setConsulta((actual) => ({ ...actual, ...cambio, page: 1 }));
  }

  function irAPagina(page: number): void {
    setConsulta((actual) => ({ ...actual, page }));
  }

  return (
    <section data-testid={TESTIDS['transactions-page']} className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">{t('transactions.title')}</h2>
      <FormularioCobro terminales={terminales} errorTerminales={errorTerminales} onCobrado={recargar} />
      <FiltrosTransacciones consulta={consulta} terminales={terminales} onCambiar={cambiarFiltro} />
      <ListaTransacciones
        pagina={pagina}
        error={errorLista}
        aliases={aliases}
        onAbrir={(id) => setAbierta(id)}
        onIrAPagina={irAPagina}
      />
      {abierta !== null && (
        <DetalleTransaccion
          key={abierta}
          id={abierta}
          puedeGestionar={puedeGestionar}
          aliases={aliases}
          onCerrar={() => setAbierta(null)}
          onCambiado={recargar}
        />
      )}
    </section>
  );
}
