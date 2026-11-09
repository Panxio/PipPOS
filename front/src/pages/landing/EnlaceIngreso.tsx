import type { MouseEvent, ReactNode } from 'react';
import { RUTA_LOGIN, esClicSimple } from '../../rutas';
import { TESTIDS } from '../../testids';

interface Props {
  testId: 'landing-cta-bar' | 'landing-cta-login' | 'landing-cta-final';
  clase: string;
  onEntrar: () => void;
  children: ReactNode;
}

// CTA de entrada: es un enlace real a /ingresar, pero el clic simple navega sin recargar la página.
export default function EnlaceIngreso({ testId, clase, onEntrar, children }: Props) {
  function alHacerClic(evento: MouseEvent<HTMLAnchorElement>): void {
    if (!esClicSimple(evento)) return;
    evento.preventDefault();
    onEntrar();
  }

  return (
    <a href={RUTA_LOGIN} data-testid={TESTIDS[testId]} className={clase} onClick={alHacerClic}>
      {children}
    </a>
  );
}
