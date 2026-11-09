# Reportes

Solo administración y supervisión ven reportes. **Qué cuenta como venta:** una transacción aprobada, devuelta parcialmente o devuelta del todo; su **neto** es el monto menos lo devuelto. Una anulada no es venta (se cuenta aparte); una rechazada o sin respuesta solo cuenta como intento. Una transacción cae en el rango por su fecha de creación. Con los datos de demo hay unos 400 cobros repartidos en los últimos 30 días, así que para cuadrar números a mano conviene un comercio recién reiniciado (ruta de prueba descrita en el [README](../../README.es.md)) o rangos sin datos de demo.

### Las tarjetas del resumen
**Nivel:** fácil

**Como** supervisor, **quiero** un resumen del período **para** saber cómo va el día de un vistazo.

- **Dado** un comercio recién reiniciado con cuatro cobros del día: una venta de $10.000, una venta de $4.000 con $1.000 devueltos, una venta de $6.000 anulada y un rechazo de $2.000, **cuando** miro «Hoy», **entonces** las tarjetas muestran: ventas netas $13.000, 2 ventas, ticket promedio $6.500, 4 intentos, aprobación 75,00 % y 1 anulación por $6.000.
- **Dado** la regla anterior, **cuando** calculo la aprobación a mano, **entonces** es (ventas + anuladas) ÷ intentos, truncada a dos decimales: una anulada fue aprobada en su momento.
- **Dado** un período sin ventas, **cuando** miro las tarjetas, **entonces** el ticket promedio es $0 y no hay errores de división.
- **Dado** un período sin período anterior con datos para comparar, **cuando** miro la variación, **entonces** muestra «—» y no un porcentaje inventado.
- **Dado** los accesos rápidos (hoy, 7 días, 30 días, mes actual), **cuando** elijo uno, **entonces** el rango y las tarjetas cambian; «Mes actual» incluye lo de hoy.

**Fuera de alcance:** otras monedas, y reportes por sucursal.

### Agrupar las ventas y exportarlas
**Nivel:** media

**Como** supervisor, **quiero** ver las ventas agrupadas y descargarlas **para** conciliarlas con otra planilla.

- **Dado** un rango de varios días, **cuando** agrupo por día, **entonces** aparecen todos los días del rango, también los de cero ventas, en orden cronológico, y el gráfico tiene una tabla equivalente como alternativa accesible.
- **Dado** el mismo rango, **cuando** agrupo por hora, **entonces** aparecen siempre las 24 horas, sumando todos los días.
- **Dado** la agrupación por terminal, cajero, medio de pago o marca, **cuando** la miro, **entonces** solo aparecen grupos con ventas, cada uno con su etiqueta legible (alias del terminal, nombre del cajero) y ordenados de mayor a menor importe neto.
- **Dado** cualquier agrupación, **cuando** sumo las filas, **entonces** el total y el número de ventas coinciden con las tarjetas del resumen del mismo rango.
- **Dado** una vista agrupada, **cuando** descargo el CSV, **entonces** el archivo se llama `ventas-<agrupación>-<desde>-<hasta>.csv`, su cabecera es `key,label,sales,totalNet`, cada línea (la última incluida) termina en CRLF y trae exactamente las filas de la vista.
- **Dado** una etiqueta que empieza con `=`, `+`, `-` o `@` (por ejemplo un alias de terminal), **cuando** se descarga el CSV, **entonces** la celda sale con un apóstrofo delante para que una hoja de cálculo no la ejecute; las comas y comillas se escapan según el formato CSV habitual.

**Fuera de alcance:** exportar a Excel o PDF y programar envíos.

### Rangos, zona horaria y permisos
**Nivel:** difícil

**Como** persona que concilia, **quiero** que los límites del rango y los permisos sean precisos **para** confiar en las cifras.

- **Dado** un rango personalizado, **cuando** el «desde» es posterior al «hasta», o el rango pasa de 366 días, **entonces** la pantalla avisa, el botón de descarga queda deshabilitado y la API responde error de validación.
- **Dado** una venta creada justo en el primer o el último milisegundo del rango, **cuando** consulto, **entonces** entra; una creada un milisegundo antes o después, no.
- **Dado** que el navegador está en una zona horaria distinta de UTC, **cuando** agrupo por día u hora, **entonces** los días y las horas son los locales de quien mira, no los del servidor.
- **Dado** que activo la comparación, **cuando** hay un período anterior con ventas, **entonces** cada tarjeta muestra su variación porcentual respecto de ese período.
- **Dado** un cajero, **cuando** intenta abrir reportes, **entonces** no tiene la sección y la API responde «prohibido»; un supervisor ve la sección y sus tarjetas igual que un administrador.

**Fuera de alcance:** cambios de horario de verano dentro del rango (se aplica un desfase fijo) y rangos de más de un año.
