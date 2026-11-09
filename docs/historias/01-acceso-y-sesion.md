# Acceso y sesión

Cuentas de demo (ficticias, las crea la semilla): `admin@pippos.test`, `supervisor@pippos.test` y `cajero@pippos.test`, contraseña `demo-pippos-2026`. Para mover el reloj del servidor y volver a los datos de partida usa las rutas de prueba descritas en el [README](../../README.es.md).

### Entrar y ver solo lo que mi rol permite
**Nivel:** fácil

**Como** persona usuaria del portal, **quiero** ingresar con mi correo y mi contraseña **para** trabajar solo con las secciones que mi rol permite.

- **Dado** un administrador, un supervisor y un cajero con credenciales válidas, **cuando** cada uno ingresa, **entonces** ve el nombre del comercio y su rol, y su menú tiene exactamente estas secciones: administrador, siete (inicio, terminales, usuarios, transacciones, reportes, alertas y liquidaciones); supervisor, cinco (inicio, terminales, transacciones, reportes y alertas); cajero, dos (inicio y transacciones).
- **Dado** una contraseña equivocada para un correo existente y un correo que no existe, **cuando** se intenta ingresar con cada uno, **entonces** el mensaje y la respuesta son indistinguibles: la app no revela si el correo existe.
- **Dado** una sesión abierta, **cuando** la persona cierra sesión, **entonces** vuelve a la pantalla de ingreso y la sesión anterior ya no sirve para consultar nada.
- **Dado** un ingreso correcto, **cuando** se inspecciona la cookie de sesión, **entonces** no es legible desde scripts de la página y no viaja en peticiones de otros sitios.

**Fuera de alcance:** recuperar contraseña, ingreso con redes sociales y verificación en dos pasos (no existen).

### Bloqueo de cuenta tras intentos fallidos
**Nivel:** media

**Como** administrador del comercio, **quiero** que una cuenta se bloquee tras varios intentos fallidos **para** frenar el adivinado de contraseñas.

- **Dado** una cuenta activa, **cuando** se fallan tres contraseñas seguidas, **entonces** los tres fallos responden como una contraseña incorrecta cualquiera y la cuenta queda bloqueada durante 15 minutos.
- **Dado** una cuenta bloqueada, **cuando** se intenta ingresar con la contraseña correcta antes de que pasen los 15 minutos, **entonces** el ingreso se rechaza con un aviso de cuenta bloqueada y el plazo no se alarga.
- **Dado** una cuenta bloqueada, **cuando** pasan los 15 minutos, **entonces** el ingreso con la contraseña correcta funciona.
- **Dado** una cuenta con uno o dos fallos acumulados, **cuando** la persona ingresa bien, **entonces** el conteo vuelve a cero.
- **Dado** un correo desconocido, una cuenta invitada que no fijó contraseña o una cuenta desactivada, **cuando** se fallan muchos intentos, **entonces** nunca aparece el aviso de bloqueo (solo el error de credenciales).

**Fuera de alcance:** desbloqueo manual por parte de un administrador (no existe).

### Límite de intentos, sesión que vence y peticiones sospechosas
**Nivel:** difícil

**Como** persona de seguridad del comercio, **quiero** que el acceso resista el abuso y las sesiones viejas **para** reducir el riesgo de que alguien entre sin permiso.

- **Dado** una sola dirección de origen, **cuando** envía más de cinco peticiones de ingreso en un minuto (buenas o malas), **entonces** las siguientes responden «demasiadas peticiones» hasta que pase la ventana.
- **Dado** una sesión abierta, **cuando** pasan más de 8 horas, **entonces** la siguiente acción lleva a la pantalla de ingreso con un aviso de sesión expirada, y las consultas a la API responden «no autenticado».
- **Dado** una petición que cambia datos con el encabezado `Origin` de otro sitio, **cuando** llega a la API, **entonces** se rechaza con «origen no permitido»; sin encabezado `Origin` (un cliente que no es navegador) pasa.
- **Dado** una cookie ausente, vacía o inventada, **cuando** se consulta quién es la persona conectada, **entonces** la respuesta es «no autenticado» siempre con el mismo cuerpo de error.
- **Dado** una ruta que no existe, **cuando** se consulta, **entonces** la respuesta es un 404 sin trazas internas y con un identificador de correlación.
- **Dado** cualquier respuesta de la API, **cuando** se revisan sus encabezados, **entonces** trae las cabeceras de seguridad habituales y ninguna cabecera que delate el framework.

**Fuera de alcance:** cifrado del tráfico (la demo escucha solo en `127.0.0.1`) y cierre de sesión por inactividad.
