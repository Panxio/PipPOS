# Alertas y auditoría

Las alertas las ven administración y supervisión; la bitácora de auditoría, solo el administrador. Con los datos de demo existe el terminal «Terraza» sin conexión y con 12 % de batería, así que el primer día ya hay dos alertas abiertas. Para cambiar la batería o la conexión de un terminal usa la ruta de prueba de telemetría descrita en el [README](../../README.es.md).

### La campana y las alertas no leídas
**Nivel:** fácil

**Como** supervisor, **quiero** una campana con las alertas pendientes **para** enterarme de los problemas sin tener que buscarlos.

- **Dado** las alertas abiertas, **cuando** entro a la app, **entonces** la campana muestra un contador con las no leídas y el panel las lista con su texto, la más reciente primero.
- **Dado** una alerta no leída, **cuando** la marco como leída, **entonces** el contador baja en uno y la alerta queda como leída en el panel.
- **Dado** varias alertas no leídas, **cuando** uso «marcar todas», **entonces** el contador desaparece.
- **Dado** que una persona marca una alerta como leída, **cuando** otra persona con acceso mira las suyas, **entonces** para ella sigue sin leer: la lectura es por usuario.
- **Dado** un cajero, **cuando** entra, **entonces** no tiene campana ni sección de alertas y consultarlas por la API responde «prohibido».

**Fuera de alcance:** notificaciones fuera de la app (correo, push) y silenciar alertas.

### Umbrales y cuándo nace o se resuelve una alerta
**Nivel:** media

**Como** administrador, **quiero** definir los umbrales que disparan alertas **para** adaptar los avisos a mi operación.

- **Dado** los umbrales por defecto (batería bajo 20 % y anulaciones desde $100.000), **cuando** abro la pestaña de umbrales, **entonces** veo esos valores; como supervisor los veo deshabilitados y sin botón de guardar, y la API rechaza mi intento de cambiarlos con «prohibido».
- **Dado** el formulario de umbrales, **cuando** guardo una batería de 1 a 99 y un monto positivo, **entonces** se guardan y aparece la confirmación; con 0, 100 o un monto cero o con decimales, la API responde error de validación y no guarda nada.
- **Dado** un terminal activo con la batería estrictamente por debajo del umbral, **cuando** se evalúa, **entonces** hay una alerta de batería baja; con la batería igual al umbral no la hay.
- **Dado** una alerta de batería abierta, **cuando** el administrador baja el umbral por debajo de la batería, **entonces** la alerta pasa a «resuelta»; si después llega telemetría con la batería baja, nace una alerta nueva y la campana la cuenta.
- **Dado** un terminal activo sin conexión, **cuando** se evalúa, **entonces** hay una alerta de «sin conexión»; un terminal inactivo no genera alertas. Nunca hay dos alertas abiertas por la misma causa y el mismo terminal.
- **Dado** el umbral de anulación, **cuando** se anula una venta de ese monto o más, **entonces** nace una alerta con el folio de la venta; una devolución, por grande que sea, no alerta, y cambiar el umbral no crea alertas por anulaciones anteriores.

**Fuera de alcance:** umbrales por terminal y alertas por correo.

### La bitácora de auditoría
**Nivel:** difícil

**Como** administrador, **quiero** una bitácora que no se pueda alterar **para** saber quién hizo qué y cuándo.

- **Dado** acciones sensibles (ingreso, ingreso fallido, alta y cambios de usuarios, cambio de contraseña, alta, edición e importación de terminales, anulaciones y devoluciones, cambio de umbrales, creación, revocación y rotación de llaves de API), **cuando** ocurren con éxito, **entonces** cada una deja una entrada con número correlativo, instante, quién la hizo, acción, objeto afectado y detalle. Cobrar, listar y consultar no dejan entrada.
- **Dado** un ingreso fallido para un correo que existe, **cuando** reviso la bitácora, **entonces** hay una entrada, y en ninguna parte (detalle o CSV) aparece la contraseña, una llave o un token. Para un correo que no existe no se registra nada.
- **Dado** la bitácora, **cuando** filtro por acción, actor, tipo de objeto, objeto o rango de fechas, **entonces** los filtros se combinan con «y», el total refleja el filtro y el orden es del más reciente al más antiguo.
- **Dado** un filtro aplicado, **cuando** descargo el CSV, **entonces** el archivo trae las mismas filas, sin paginar (hasta 5.000), con la cabecera `seq,atMs,actorId,actorName,action,entityType,entityId,detail` y fines de línea CRLF; su nombre lleva `todo` donde falta el desde o el hasta.
- **Dado** la bitácora, **cuando** alguien intenta modificar o borrar entradas por la API (PUT, PATCH o DELETE), **entonces** la ruta no existe (404): la bitácora solo admite altas.
- **Dado** un supervisor, **cuando** intenta ver la bitácora, **entonces** la pestaña no existe y la API responde «prohibido».

**Fuera de alcance:** retención o archivado de la bitácora y registrar las consultas de lectura.
