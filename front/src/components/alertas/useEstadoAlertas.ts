import { useCallback, useEffect, useRef, useState } from 'react';
import type { AlertList, ErrorCode } from '@pippos/shared';
import { codigoDe, obtenerAlertas } from '../../api/client';

const LIMITE_CAMPANA = 10;
const INTERVALO_SONDEO_MS = 5000;

export interface EstadoAlertas {
  lista: AlertList | null;
  error: ErrorCode | null;
  // Sube con cada cambio hecho por el usuario: la sección abierta vuelve a pedir su lista.
  version: number;
  // Vuelve a pedir la campana y avisa a la sección. Lo llaman marcar alertas y guardar umbrales.
  avisarCambio: () => void;
}

// Campana y sección ven lo mismo: la campana sondea cada 5 s; un cambio la vuelve a pedir de inmediato.
export function useEstadoAlertas(activo: boolean): EstadoAlertas {
  const [lista, setLista] = useState<AlertList | null>(null);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [version, setVersion] = useState(0);
  // Número de la última consulta: una respuesta anterior se descarta.
  const numeroUltima = useRef(0);
  // Verdadero mientras la última consulta no responde: el sondeo no lanza otra encima.
  const enCurso = useRef(false);

  const consultar = useCallback((): void => {
    const numero = numeroUltima.current + 1;
    numeroUltima.current = numero;
    enCurso.current = true;
    obtenerAlertas({ limit: LIMITE_CAMPANA })
      .then((respuesta) => {
        if (numero !== numeroUltima.current) return;
        setLista(respuesta);
        setError(null);
      })
      .catch((fallo: unknown) => {
        if (numero === numeroUltima.current) setError(codigoDe(fallo));
      })
      .finally(() => {
        if (numero === numeroUltima.current) enCurso.current = false;
      });
  }, []);

  useEffect(() => {
    if (!activo) return undefined;
    consultar();
    const reloj = setInterval(() => {
      if (!enCurso.current) consultar();
    }, INTERVALO_SONDEO_MS);
    return () => clearInterval(reloj);
  }, [activo, consultar]);

  const avisarCambio = useCallback((): void => {
    consultar();
    setVersion((actual) => actual + 1);
  }, [consultar]);

  return { lista, error, version, avisarCambio };
}
