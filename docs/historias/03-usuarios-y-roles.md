# Usuarios y roles

Solo el administrador gestiona usuarios, sucursales y cajas. Con los datos de demo hay tres usuarios (uno por rol) y dos sucursales (Centro con dos cajas y Norte con una). No existe un correo real: las invitaciones llegan a una bandeja simulada dentro de la propia app.

### Ver usuarios y organizar sucursales y cajas
**Nivel:** fácil

**Como** administrador, **quiero** ver a las personas del comercio y organizar sus sucursales y cajas **para** asignar a cada cajero un lugar de trabajo.

- **Dado** la sección de usuarios, **cuando** entro como administrador, **entonces** veo a cada persona con su nombre, correo, rol, estado (invitado, activo o inactivo) y la sucursal a la que pertenece (vacía si no tiene).
- **Dado** el formulario de sucursales, **cuando** creo una sucursal y luego una caja dentro de ella, **entonces** ambas aparecen en la lista de sucursales y quedan disponibles para asignarlas.
- **Dado** una sucursal que ya existe, **cuando** intento crear otra con el mismo nombre (sin importar mayúsculas), **entonces** veo un error y la lista no cambia; lo mismo para una caja repetida dentro de la misma sucursal.
- **Dado** un supervisor o un cajero, **cuando** intentan abrir la sección de usuarios (por pantalla o directo por la API), **entonces** no la tienen o reciben «prohibido». El supervisor sí puede consultar la lista de sucursales; el cajero no.

**Fuera de alcance:** renombrar o eliminar sucursales y cajas, y cambiar el rol de un usuario existente desde la pantalla.

### Invitar a una persona y su primer ingreso
**Nivel:** media

**Como** administrador, **quiero** invitar a una persona nueva **para** que fije su propia contraseña y empiece a trabajar con el rol correcto.

- **Dado** el asistente de alta, **cuando** completo nombre, correo, rol y (si el rol es cajero) sucursal, **entonces** veo un resumen antes de confirmar y al confirmar la persona queda como «invitada» y llega un mensaje con un enlace a la bandeja.
- **Dado** un cajero sin sucursal, **cuando** intento avanzar, **entonces** el asistente no me deja; para supervisor y administrador la sucursal es opcional.
- **Dado** un correo ya usado por otra persona (aunque con otras mayúsculas o espacios), **cuando** intento invitar, **entonces** se rechaza con un conflicto y no se crea nada.
- **Dado** el enlace de la invitación, **cuando** la persona lo abre y fija una contraseña de entre 10 y 128 caracteres con al menos una letra y un número, **entonces** su estado pasa a «activo» y puede ingresar con ella viendo solo las secciones de su rol. Una contraseña más débil se rechaza.
- **Dado** un enlace ya usado, caducado (más de 48 horas) o inventado, **cuando** se abre e intenta fijar una contraseña, **entonces** falla con el mismo error de «no encontrado» y no cambia nada.
- **Dado** una persona invitada, **cuando** el administrador reenvía la invitación, **entonces** llega un mensaje nuevo a la bandeja y el enlace anterior deja de valer. El reenvío solo está disponible mientras la persona sigue invitada.

**Fuera de alcance:** envío de correos reales y reglas de contraseña distintas a las descritas.

### Desactivar usuarios y cambiar mi contraseña
**Nivel:** difícil

**Como** administrador, **quiero** desactivar cuentas y que cada persona cambie su contraseña **para** cortar accesos sin dejar al comercio sin administrador.

- **Dado** un usuario activo, **cuando** el administrador lo desactiva, **entonces** la app pide confirmación; al aceptar, el usuario queda «inactivo» (también tras recargar), sus sesiones abiertas dejan de valer y su ingreso falla igual que con una contraseña equivocada.
- **Dado** el propio administrador, **cuando** intenta desactivarse o cambiarse el rol, **entonces** la API lo rechaza con un conflicto y la fila de su usuario no ofrece esos controles: siempre queda al menos un administrador.
- **Dado** un usuario desactivado que vuelve a activarse, **cuando** ya había fijado una contraseña, **entonces** queda «activo»; si nunca la fijó, vuelve a «invitado».
- **Dado** una persona con sesión, **cuando** cambia su contraseña indicando la actual y una nueva válida, **entonces** vuelve a la pantalla de ingreso con un aviso, la contraseña vieja ya no sirve, la nueva sí y todas sus otras sesiones se cierran.
- **Dado** el cambio de contraseña, **cuando** la actual es incorrecta, **entonces** responde «credenciales inválidas» y no cambia nada; si la nueva es débil o igual a la actual, falla por validación.

**Fuera de alcance:** restablecer la contraseña de otra persona y el historial de contraseñas.
