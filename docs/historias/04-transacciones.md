# Transacciones

El cobro habla con un switch de tarjetas **simulado**: su respuesta depende solo de los últimos 4 dígitos. Terminan en `0051`: rechazada por fondos insuficientes (código 51). Terminan en `0005`: rechazada, no autorizar (código 05). Terminan en `0408`: el switch no responde. Cualquier otro final: aprobada (código 00). Los importes son pesos enteros, sin decimales (en pantalla `$2.500`).

### Cobrar y ver el resultado
**Nivel:** fácil

**Como** cajero, **quiero** cobrar con una tarjeta o billetera en un terminal activo **para** saber al instante si el pago fue aprobado.

- **Dado** un terminal activo, **cuando** cobro con tarjeta cuyo final no es especial, **entonces** el resultado dice «aprobada», con código 00, un código de autorización de 6 dígitos y un folio correlativo.
- **Dado** los finales `0051` o `0005`, **cuando** cobro, **entonces** el resultado dice «rechazada» con su código (51 o 05) y sin código de autorización.
- **Dado** el final `0408`, **cuando** cobro, **entonces** el resultado dice «sin respuesta», sin código de respuesta ni de autorización.
- **Dado** los tres resultados anteriores, **cuando** miro el listado, **entonces** los tres aparecen con sus folios, el más reciente primero. Un rechazo es un resultado del cobro, no un error de la app.
- **Dado** un importe fuera de 1 a 99.999.999, con ceros a la izquierda o con decimales, o unos últimos dígitos que no son cuatro números, **cuando** envío el cobro, **entonces** se rechaza por validación y no se crea nada.
- **Dado** un terminal inactivo, **cuando** intento cobrar, **entonces** se rechaza y no se crea ninguna transacción.

**Fuera de alcance:** cobros reales, propinas, cuotas y monedas distintas al peso.

### Filtrar el feed y abrir el detalle y el comprobante
**Nivel:** media

**Como** supervisor, **quiero** revisar las transacciones del comercio con filtros **para** encontrar una venta concreta y entregar su comprobante.

- **Dado** transacciones de varios estados, marcas y montos, **cuando** filtro por estado, marca, monto mínimo o máximo, **entonces** veo solo las que cumplen; combinar filtros las exige todas a la vez y los límites de monto son inclusivos.
- **Dado** el listado abierto, **cuando** entra una transacción nueva (por ejemplo, un cobro desde otro lugar), **entonces** aparece sin que yo recargue ni toque nada, tras unos segundos.
- **Dado** el detalle de una transacción, **cuando** la abro, **entonces** veo su estado, montos, marca, últimos 4 dígitos y la historia de eventos (creada, anulada, devuelta) en orden.
- **Dado** una transacción aprobada, anulada o devuelta, **cuando** abro su comprobante, **entonces** se abre en una pestaña aparte, sin el marco de la app, con folio, comercio, terminal, importe, estado y los últimos 4 dígitos (nunca la tarjeta completa).
- **Dado** una transacción rechazada o sin respuesta, **cuando** miro su detalle, **entonces** no ofrece comprobante y pedirlo por la API responde conflicto.
- **Dado** un cajero, **cuando** consulta el listado, el detalle o el comprobante, **entonces** solo accede a lo que cobró él; el identificador de otra persona responde «no encontrado» y no «prohibido».

**Fuera de alcance:** buscar por texto libre, exportar el feed y reimprimir comprobantes de otro comercio.

### Anular, devolver y no cobrar dos veces
**Nivel:** difícil

**Como** supervisor, **quiero** anular o devolver ventas con reglas claras **para** corregir errores sin descuadrar el dinero.

- **Dado** un cobro enviado dos veces seguidas (doble clic o reintento con el mismo identificador de solicitud), **cuando** llega, **entonces** se crea una sola transacción, con un solo folio; el reintento devuelve la misma. Reutilizar el identificador con otro cuerpo responde conflicto. Dos peticiones simultáneas con el mismo identificador siguen creando una sola.
- **Dado** una venta aprobada, sin devoluciones y de menos de 24 horas, **cuando** la anulo y confirmo, **entonces** queda «anulada» y ya no ofrece anular ni devolver.
- **Dado** una venta aprobada de más de 24 horas, o una que ya tiene devoluciones, **cuando** intento anularla, **entonces** se rechaza con un conflicto y sigue aprobada (o parcialmente devuelta).
- **Dado** una venta aprobada, **cuando** devuelvo una parte, **entonces** queda «devuelta parcialmente» con el monto devuelto acumulado; al devolver el resto, queda «devuelta» y ya no acepta más.
- **Dado** una devolución mayor a lo que queda por devolver, o sobre una venta anulada, rechazada o sin respuesta, **cuando** la envío, **entonces** se rechaza con un conflicto y los montos no cambian. En ningún momento lo devuelto supera el monto cobrado.
- **Dado** un cajero, **cuando** mira una venta, **entonces** no tiene controles de anular ni devolver y la API responde «prohibido» si lo intenta.

**Fuera de alcance:** contracargos, devoluciones a otra tarjeta y revertir una anulación.
