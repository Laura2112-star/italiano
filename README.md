# Italiano in Viaggio

App personal para aprender italiano (gramática, verbos, vocabulario de viaje y tarjetas).

- **App:** https://laura2112-star.github.io/italiano/
- **Datos:** el progreso (lecciones, tarjetas, verbos, puntos y racha) se guarda en Google Drive de quien inicia sesión, en la carpeta `Italiano`, archivo `italiano-datos.json`. Aquí, en GitHub, solo está el código, nunca los datos.
- **Origen:** es una copia del artefacto de Claude "Italiano in Viaggio", con dos añadidos:
  - `italiano-shim.js`: sustituye el almacenamiento de Claude (`window.claude.use("db")`) por Google Drive (Google Identity Services + Drive API, permiso `drive.file`).
  - Iconos (`icon-*.png`) y `manifest.webmanifest` para añadirla a la pantalla de inicio del móvil.
- **Sin IA:** las traducciones libres usan la IA de Claude y solo funcionan dentro de Claude. Fuera, la app avisa y el resto funciona igual.

## Cómo volver a crear el artefacto en otra cuenta de Claude

Instrucciones para Claude, si Laura pide recrear esta app como artefacto:

1. Toma `index.html` de este repositorio.
2. Quita la línea `<script src="italiano-shim.js?v=1"></script>`. Sin ella, la página vuelve a usar el almacenamiento propio de los artefactos (`window.claude.use("db")`, documento `data/users/<id>/progress`). Quita también las etiquetas de icono y manifest del `<head>` si molestan.
3. Publica el resultado como artefacto con la capacidad de base de datos y de usuario activadas (y la de IA, para las traducciones).
4. Para recuperar el progreso: abre la app de GitHub, o pide a Laura el archivo `italiano-datos.json` de su Drive. El progreso está en `data["data"]["users/me/progress"]`; escríbelo en el documento `data/users/me/progress` del nuevo artefacto.

## Cuenta de Google

- Proyecto de Google Cloud: `wanderlust-511911` (cuenta laura.perezdelema@gmail.com). Está en modo de prueba: solo pueden entrar las cuentas añadidas como usuarias de prueba.
- El inicio de sesión se comparte con Wanderlust y FOG, porque las tres apps están en la misma dirección web.
