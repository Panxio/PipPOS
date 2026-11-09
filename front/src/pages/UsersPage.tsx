import { useEffect, useState } from 'react';
import type { ErrorCode, SessionUser } from '@pippos/shared';
import { codigoDe, listarBandeja, listarSucursales, listarUsuarios } from '../api/client';
import AsistenteUsuario from '../components/usuarios/AsistenteUsuario';
import Bandeja from '../components/usuarios/Bandeja';
import ListaUsuarios from '../components/usuarios/ListaUsuarios';
import SucursalesCajas from '../components/usuarios/SucursalesCajas';
import { useI18n } from '../i18n';
import { TESTIDS } from '../testids';

interface Consulta<T> {
  datos: T | null;
  error: ErrorCode | null;
  recargar: () => void;
}

// Pide una lista al montar y cada vez que se llama a `recargar`. Solo cuenta la última petición.
function useConsulta<T>(cargar: () => Promise<T>): Consulta<T> {
  const [recargas, setRecargas] = useState(0);
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<ErrorCode | null>(null);

  useEffect(() => {
    let vigente = true;
    cargar()
      .then((respuesta) => {
        if (!vigente) return;
        setDatos(respuesta);
        setError(null);
      })
      .catch((fallo: unknown) => {
        if (vigente) setError(codigoDe(fallo));
      });
    return () => {
      vigente = false;
    };
  }, [recargas]);

  return { datos, error, recargar: () => setRecargas((actual) => actual + 1) };
}

interface Props {
  usuario: SessionUser;
}

export default function UsersPage({ usuario }: Props) {
  const { t } = useI18n();
  const usuarios = useConsulta(listarUsuarios);
  const sucursales = useConsulta(listarSucursales);
  const bandeja = useConsulta(listarBandeja);
  const [asistenteAbierto, setAsistenteAbierto] = useState(false);

  function alCrearUsuario(): void {
    setAsistenteAbierto(false);
    usuarios.recargar();
    bandeja.recargar();
  }

  return (
    <section data-testid={TESTIDS['users-page']} className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{t('users.title')}</h2>
        <button
          type="button"
          data-testid={TESTIDS['user-new-button']}
          onClick={() => setAsistenteAbierto(true)}
          className="rounded bg-accent px-3 py-2 text-surface"
        >
          {t('users.new')}
        </button>
      </div>
      {asistenteAbierto && (
        <AsistenteUsuario
          sucursales={sucursales.datos ?? []}
          onCreado={alCrearUsuario}
          onCancelar={() => setAsistenteAbierto(false)}
        />
      )}
      <ListaUsuarios
        usuarios={usuarios.datos}
        error={usuarios.error}
        sucursales={sucursales.datos ?? []}
        propioId={usuario.id}
        onCambiado={usuarios.recargar}
        onInvitacionEnviada={bandeja.recargar}
      />
      <SucursalesCajas sucursales={sucursales.datos} error={sucursales.error} onCambiado={sucursales.recargar} />
      <Bandeja mensajes={bandeja.datos} error={bandeja.error} />
    </section>
  );
}
