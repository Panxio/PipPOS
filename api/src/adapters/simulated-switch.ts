import type { PeticionSwitch, Switch } from '../application/ports';
import { type RespuestaSwitch, codigoDeAutorizacion, respuestaDelSwitch } from '../domain/transaccion';

// Switch simulado (C3): la decisión sale solo de last4; no hay azar, reloj ni espera real.
// El authCode es determinista: el mismo cobro siempre recibe el mismo código.
export class SimulatedSwitch implements Switch {
  async authorize(peticion: PeticionSwitch): Promise<RespuestaSwitch> {
    const resultado = respuestaDelSwitch(peticion.last4);
    if (resultado.resultado === 'timeout') return { timeout: true };
    if (resultado.resultado === 'declined') return { code: resultado.codigo };
    const semilla = `${peticion.amount}|${peticion.method}|${peticion.brand}|${peticion.last4}`;
    return { code: '00', authCode: codigoDeAutorizacion(semilla) };
  }
}
