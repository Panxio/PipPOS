# Preferencias: idioma y tema

Cada persona elige el idioma (español o inglés) y el tema (claro u oscuro) de la aplicación. Se guardan en su cuenta, no en el navegador.

### Cambiar el idioma
**Nivel:** fácil

**Como** persona usuaria, **quiero** usar la aplicación en mi idioma **para** entender cada pantalla sin esfuerzo.

- **Dado** una sesión abierta en español, **cuando** cambio el idioma a inglés, **entonces** los textos de la interfaz cambian en todas las secciones y el menú sigue teniendo las mismas secciones para mi rol.
- **Dado** el idioma elegido, **cuando** recargo la página, **entonces** se mantiene.
- **Dado** el idioma elegido, **cuando** cierro sesión y vuelvo a ingresar (incluso desde otro navegador), **entonces** la app vuelve a abrirse en ese idioma.
- **Dado** que una persona cambia su idioma, **cuando** otra persona del mismo comercio ingresa, **entonces** ve el suyo: la preferencia es por usuario.

**Fuera de alcance:** idiomas distintos al español y al inglés, y formatos de fecha configurables.

### Cambiar el tema y no romper la automatización
**Nivel:** media

**Como** persona usuaria, **quiero** un tema claro u oscuro **para** trabajar cómoda; y como automatizadora, **quiero** que cambiarlo no mueva los identificadores de la interfaz.

- **Dado** el tema claro, **cuando** activo el oscuro, **entonces** los colores de la aplicación cambian de inmediato y el contenido y la estructura siguen igual.
- **Dado** el tema elegido, **cuando** recargo la página o vuelvo a ingresar, **entonces** se mantiene.
- **Dado** un cambio de idioma o de tema, **cuando** comparo los identificadores estables que la app pone en cada elemento interactivo (ver el [README](../../README.es.md)), **entonces** son los mismos antes y después: no dependen del texto ni del tema.
- **Dado** una petición para guardar preferencias con un idioma o un tema que no existen, o con un campo de menos, **cuando** llega a la API, **entonces** se rechaza por validación y las preferencias guardadas no cambian.
- **Dado** una persona sin sesión, **cuando** intenta guardar preferencias por la API, **entonces** recibe «no autenticado».

**Fuera de alcance:** temas personalizados y la detección automática del tema del sistema operativo.
