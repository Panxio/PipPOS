// Sin librería de rutas: `/` es la landing sin sesión; `/ingresar` es el login. Con sesión, cualquier ruta es la app.
export const RUTA_LOGIN = '/ingresar';

// Solo el clic simple se resuelve dentro de la app; con tecla modificadora (nueva pestaña) manda el navegador.
export function esClicSimple(evento: {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): boolean {
  return evento.button === 0 && !evento.metaKey && !evento.ctrlKey && !evento.shiftKey && !evento.altKey;
}
