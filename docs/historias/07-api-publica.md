# API pública

Una API para automatizar sin interfaz (Postman, Karate, k6, tu propio cliente). Vive en `/public/v1` y su contrato, en `/public/v1/openapi.json` (abierto, sin llave). Se autentica con `Authorization: Bearer <llave>`. Las llaves las crea un administrador desde la sesión web (`POST /api/v1/api-keys` con un nombre de 1 a 60 caracteres y el alcance `read` o `write`); la pantalla de llaves no existe, por eso es parte del ejercicio. Cada comercio solo ve lo suyo.

### Crear una llave y leer con ella
**Nivel:** fácil

**Como** integrador, **quiero** una llave de lectura **para** consultar terminales, transacciones y reportes desde mi propio programa.

- **Dado** un administrador con sesión, **cuando** crea una llave, **entonces** la respuesta trae la llave completa una sola vez; después solo se listan su nombre, alcance, prefijo y fechas, nunca el secreto. Un supervisor o un cajero reciben «prohibido».
- **Dado** una llave válida, **cuando** consulto terminales, un terminal, el resumen o las ventas agrupadas de reportes, o una transacción, **entonces** recibo la misma forma de datos y los mismos montos que ve la aplicación web, de todo el comercio.
- **Dado** una llave ausente, mal formada, inventada o revocada, **cuando** consulto cualquier ruta, **entonces** recibo «no autenticado» con exactamente el mismo cuerpo en todos los casos.
- **Dado** una cookie de sesión web, **cuando** la uso en la API pública, o una llave en la API web, **entonces** no vale en ninguno de los dos sentidos.
- **Dado** una llave que acabo de revocar, **cuando** la uso otra vez, **entonces** deja de funcionar de inmediato.
- **Dado** el contrato OpenAPI, **cuando** lo descargo sin llave, **entonces** lista las rutas públicas y el esquema de autenticación `Bearer`.

**Fuera de alcance:** anular, devolver, administrar usuarios o llaves y las rutas de prueba por la API pública: esas rutas no existen ahí (404).

### Recorrer las transacciones por cursor
**Nivel:** media

**Como** integrador, **quiero** paginar el listado de transacciones **para** traerlas todas sin repetir ni saltarme ninguna.

- **Dado** un listado con filtros de estado, medio de pago, marca, terminal, fechas y montos, **cuando** los combino, **entonces** vuelven solo las transacciones que cumplen todos, la más reciente primero.
- **Dado** un `limit` de 1 a 100 (20 si no lo indico), **cuando** consulto, **entonces** recibo hasta ese número de elementos y un cursor opaco para la página siguiente; en la última página el cursor es nulo, también cuando el `limit` es justo el total.
- **Dado** un recorrido en curso, **cuando** entran cobros nuevos entre una página y otra, **entonces** el recorrido no repite ni salta filas ya vistas.
- **Dado** un `limit` fuera de rango, un cursor inválido o un parámetro desconocido, **cuando** consulto, **entonces** recibo un error de validación.
- **Dado** el identificador de una transacción que no existe (o de otro comercio), **cuando** la consulto, **entonces** recibo «no encontrada» sin distinguir ambos casos.

**Fuera de alcance:** ordenar por otro campo y saltar a una página por número.

### Cobrar con idempotencia y respetar el límite de uso
**Nivel:** difícil

**Como** integrador, **quiero** cobrar por la API sin duplicar cobros ante un reintento **para** que un corte de red no cobre dos veces.

- **Dado** una llave de solo lectura, **cuando** intento cobrar, **entonces** recibo «prohibido»; con una llave de escritura, el cobro funciona con los mismos campos y reglas que el web (terminal activo, importe, marca, medio y últimos 4 dígitos), pero sin identificador de solicitud propio.
- **Dado** un cobro, **cuando** falta la cabecera `Idempotency-Key` o no es un UUID, **entonces** se rechaza por validación.
- **Dado** el mismo `Idempotency-Key` y el mismo cuerpo, **cuando** reintento, **entonces** recibo la misma transacción con otro código de estado que el primer envío (creado la primera vez, correcto después) y no se crea una segunda. Con el mismo `Idempotency-Key` y otro cuerpo recibo conflicto. Con dos envíos simultáneos con la misma clave, se crea una sola.
- **Dado** una tarjeta cuyo final provoca rechazo o falta de respuesta, **cuando** cobro, **entonces** la respuesta sigue siendo «creado» y el estado de la transacción dice qué ocurrió.
- **Dado** una llave, **cuando** supera 60 peticiones en un minuto, **entonces** las siguientes reciben «demasiadas peticiones» con la cabecera `Retry-After`; otra llave distinta no se ve afectada.
- **Dado** cualquier error de la API pública, **cuando** reviso el cuerpo y los registros, **entonces** el cuerpo trae un identificador de correlación y la llave no aparece en ninguna parte.

**Fuera de alcance:** webhooks, y cobros en lote.
