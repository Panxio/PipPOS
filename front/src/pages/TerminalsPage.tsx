import { useEffect, useState } from 'react';
import type { ErrorCode, ListTerminalsQuery, SessionUser, TerminalPage } from '@pippos/shared';
import { codigoDe, listarTerminales } from '../api/client';
import DetalleTerminal from '../components/terminales/DetalleTerminal';
import FiltrosTerminales from '../components/terminales/FiltrosTerminales';
import FormularioTerminal from '../components/terminales/FormularioTerminal';
import ImportarTerminales from '../components/terminales/ImportarTerminales';
import ListaTerminales from '../components/terminales/ListaTerminales';
import { useI18n } from '../i18n';
import { TESTIDS } from '../testids';

interface Props {
  user: SessionUser;
}

const CONSULTA_INICIAL: ListTerminalsQuery = { sort: 'serial', order: 'asc', page: 1, pageSize: 20 };

export default function TerminalsPage({ user }: Props) {
  const { t } = useI18n();
  // La API es la autoridad: esto solo decide qué controles se muestran.
  const esAdmin = user.role === 'admin';
  const [consulta, setConsulta] = useState<ListTerminalsQuery>(CONSULTA_INICIAL);
  const [recargas, setRecargas] = useState(0);
  const [pagina, setPagina] = useState<TerminalPage | null>(null);
  const [errorLista, setErrorLista] = useState<ErrorCode | null>(null);
  const [formularioAbierto, setFormularioAbierto] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);

  useEffect(() => {
    // Una respuesta de una consulta anterior se descarta: solo cuenta la última.
    let vigente = true;
    setPagina(null);
    setErrorLista(null);
    listarTerminales(consulta)
      .then((respuesta) => {
        if (vigente) setPagina(respuesta);
      })
      .catch((fallo: unknown) => {
        if (vigente) setErrorLista(codigoDe(fallo));
      });
    return () => {
      vigente = false;
    };
  }, [consulta, recargas]);

  function recargar(): void {
    setRecargas((actual) => actual + 1);
  }

  function cambiarFiltro(cambio: Partial<ListTerminalsQuery>): void {
    setConsulta((actual) => ({ ...actual, ...cambio, page: 1 }));
  }

  function irAPagina(page: number): void {
    setConsulta((actual) => ({ ...actual, page }));
  }

  function alGuardarFormulario(): void {
    setFormularioAbierto(false);
    recargar();
  }

  return (
    <section data-testid={TESTIDS['terminals-page']} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{t('terminals.title')}</h2>
        {esAdmin && (
          <button
            type="button"
            data-testid={TESTIDS['terminal-new-button']}
            onClick={() => setFormularioAbierto(true)}
            className="rounded bg-accent px-3 py-2 text-surface"
          >
            {t('terminals.new')}
          </button>
        )}
      </div>
      <FiltrosTerminales consulta={consulta} onCambiar={cambiarFiltro} />
      {esAdmin && <ImportarTerminales onImportado={recargar} />}
      {esAdmin && formularioAbierto && (
        <FormularioTerminal onGuardado={alGuardarFormulario} onCancelar={() => setFormularioAbierto(false)} />
      )}
      <ListaTerminales
        pagina={pagina}
        error={errorLista}
        onAbrir={(id) => setAbierta(id)}
        onIrAPagina={irAPagina}
      />
      {abierta !== null && (
        <DetalleTerminal
          key={abierta}
          id={abierta}
          esAdmin={esAdmin}
          onCerrar={() => setAbierta(null)}
          onCambiado={recargar}
        />
      )}
    </section>
  );
}
