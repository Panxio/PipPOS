# Historias de usuario

Ejercicios para practicar automatización de pruebas (QA Automation / QA Engineer) sobre PipPOS. Cada historia describe **qué debe hacer el producto**, no cómo probarlo: tú decides el framework (Playwright, Selenium, Cypress, Karate, Postman, k6…), la estructura y qué automatizar. No hay una solución de referencia en este repositorio: la suite de pruebas de extremo a extremo del autor no se publica, porque sería la clave de respuestas.

Para levantar la app, las cuentas de demo y las rutas de prueba (reiniciar datos, mover el reloj, inyectar telemetría), mira el [README](../../README.es.md).

English version: [User stories](en/README.md).

## Módulos

| Módulo | Historias | Niveles |
|---|---|---|
| [Acceso y sesión](01-acceso-y-sesion.md) | 3 | fácil · media · difícil |
| [Terminales](02-terminales.md) | 3 | fácil · media · difícil |
| [Usuarios y roles](03-usuarios-y-roles.md) | 3 | fácil · media · difícil |
| [Transacciones](04-transacciones.md) | 3 | fácil · media · difícil |
| [Reportes](05-reportes.md) | 3 | fácil · media · difícil |
| [Alertas y auditoría](06-alertas-y-auditoria.md) | 3 | fácil · media · difícil |
| [API pública](07-api-publica.md) | 3 | fácil · media · difícil |
| [Preferencias de idioma y tema](08-preferencias.md) | 2 | fácil · media |

## Cómo leer una historia

- **Nivel.** *Fácil*: un flujo directo con datos de demo. *Media*: varios estados, roles o datos que tienes que preparar. *Difícil*: tiempo, concurrencia, archivos, permisos cruzados o reglas de borde.
- **Criterios.** Cada uno sigue la forma *Dado / Cuando / Entonces* y describe un comportamiento observable. Convertirlo en una prueba (o decidir que no vale la pena) es tu trabajo.
- **Fuera de alcance.** Lo que la app no hace. No lo pruebes como si debiera existir.
- **Cifras.** Los importes son pesos chilenos enteros, con punto de miles (`$2.500`), y los porcentajes llevan coma decimal (`75,00 %`), tal como se ven en pantalla.
- Si un criterio y la app no coinciden, no ajustes la prueba hasta que pase: anota la diferencia y trátala como un hallazgo (o como una duda sobre la especificación).

## Lista de autoevaluación de calidad

Antes de dar por terminada una solución, revisa:

- [ ] **Pruebas independientes.** Cada una prepara sus datos y puede correr sola, en cualquier orden y en paralelo; ninguna depende de lo que dejó otra.
- [ ] **Datos por API, no por pantalla.** Lo que no es lo que estás probando (crear un usuario, una venta, un terminal) se prepara por la API o con las rutas de prueba; la pantalla se reserva para lo que verificas.
- [ ] **Sin esperas fijas.** No hay `sleep` ni pausas de tiempo: esperas por condiciones observables (un elemento, una respuesta, un cambio de estado). El reloj se mueve con la ruta de prueba, no con la espera real.
- [ ] **Localizadores estables.** Usas los identificadores estables de la app (ver el README) y no textos ni estilos, así que tus pruebas sobreviven a un cambio de idioma o de tema.
- [ ] **Cobertura por rol.** Cada permiso importante se prueba al menos desde el rol que sí puede y desde uno que no; lo negativo es tan parte del criterio como lo positivo.
- [ ] **La prueba puede fallar.** Viste cada prueba nueva en rojo (rompiendo a propósito el producto o el dato) antes de confiar en que está en verde.
- [ ] **Aserciones sobre el resultado.** Verificas el valor, el estado o el archivo descargado, no solo que «apareció algo». Cuando hay un número, lo calculas tú aparte.
- [ ] **Qué no se automatiza, y por qué.** Dejaste por escrito lo que decidiste no automatizar (por costo, fragilidad o porque lo mira mejor una persona) y la razón.
- [ ] **Hallazgos reportados.** Cada diferencia entre un criterio y la app queda anotada con pasos para reproducirla, no escondida con un ajuste en la prueba.
- [ ] **Se ejecuta desde cero.** Otra persona clona tu solución, sigue tus instrucciones y obtiene el mismo resultado.

## Comparte tu solución

Si resolviste una o más historias, comparte tu enfoque: abre un *issue* o una *discusión* en este repositorio con el título «Solución: <módulo>», el enlace a tu repositorio, el framework que usaste, qué decidiste no automatizar y lo que aprendiste. Las preguntas sobre un criterio ambiguo también son bienvenidas: una ambigüedad bien descrita es un buen aporte.
