<div align="center">

<img src="../../web/public/favicon.svg" width="72" height="72" alt="Logotipo de AicialNote">

# AicialNote

**Tus cuentas y notas, en tu propia nube.**

Un gestor de código abierto para inicios de sesión, contraseñas, 2FA, correos de recuperación y proxies.<br>
Sin base de datos en el servidor: tus datos se quedan en tu Google Drive o OneDrive como archivos normales.

[![Sitio web](https://img.shields.io/badge/sitio_web-aicialnotes.com-3e63dd)](https://aicialnotes.com)
[![Licencia: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-3e63dd)](../../LICENSE)
[![CI](https://github.com/Eric-kbo/AnNote/actions/workflows/ci.yml/badge.svg)](https://github.com/Eric-kbo/AnNote/actions/workflows/ci.yml)
![Estado: alfa](https://img.shields.io/badge/status-alpha-orange)

**[Abrir AicialNote en aicialnotes.com](https://aicialnotes.com)** ·
[Alojamiento propio](../../docs/self-hosting.md) ·
[Formato de datos](../../docs/data-format.md) ·
[Informar de un error](https://github.com/Eric-kbo/AnNote/issues)

[English](../../README.md) · [简体中文](../../README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) ·
[한국어](README.ko.md) · **Español** · [Deutsch](README.de.md) ·
[Français](README.fr.md) · [Português](README.pt-BR.md) · [Русский](README.ru.md)

![Lista de cuentas de AicialNote](../../docs/images/list.png)

</div>

## Contenido

- [Por qué AicialNote](#por-qué-aicialnote)
- [Funciones](#funciones)
- [Primeros pasos](#primeros-pasos)
- [Cómo funciona](#cómo-funciona)
- [Modelo de seguridad](#modelo-de-seguridad)
- [Desarrollo](#desarrollo)
- [Hoja de ruta](#hoja-de-ruta)
- [Contribuir](#contribuir)
- [Licencia](#licencia)

## Por qué AicialNote

La mayoría de los gestores de contraseñas guardan tu bóveda en sus servidores, en un formato que solo su aplicación
puede leer. AicialNote hace lo contrario:

- **Los archivos son tuyos.** Todo se guarda en **tu** Google Drive u OneDrive (o en una carpeta local) como JSON, con
  copias en Markdown y CSV generadas al lado. Si AicialNote desaparece mañana, podrás seguir abriendo tus datos con
  cualquier editor de texto o con Excel.
- **El servidor nunca ve tus datos.** El navegador se comunica directamente con Google y Microsoft. El pequeño servidor
  en Go solo completa el inicio de sesión OAuth y no almacena nada.
- **Es difícil perder datos.** Cada sobrescritura conserva la versión anterior, cada eliminación va a una carpeta de
  papelera y, ante un conflicto de sincronización, se conservan ambas versiones.

> [!WARNING]
> **AicialNote es software en fase alfa.** El modo de demostración y la carpeta local están bien probados; la
> sincronización con Google Drive y OneDrive es reciente. Guarda una copia de seguridad (**Export data… → Full backup
> (JSON)**) hasta que haya demostrado su fiabilidad en tu caso, y lee el [modelo de seguridad](#modelo-de-seguridad)
> antes de guardar contraseñas reales.

## Funciones

- **Una sola lista para todas tus identidades.** Cada ID contiene tarjetas: Google, Apple ID, Microsoft, OpenAI, Claude,
  correo, sitio web, clave de API, proxy, servidor, Wi-Fi, tarjeta bancaria, dirección de envío, perfil, documento de
  identidad o personalizada. Filtra por estado, etiqueta, tipo de tarjeta o vencimiento próximo.
- **Copia con un clic.** Haz clic en cualquier valor para copiarlo. Los campos 2FA muestran el código TOTP en vivo.
- **Pegado inteligente.** Pega `Email: a@gmail.com Password: …`, `email----password----recovery----2FA`,
  `ip:port:user:pass` o cien líneas así, y AicialNote rellena los campos.
- **Blocs de notas.** Blocs de notas, secciones y páginas con un editor de texto enriquecido, al estilo de OneNote. Las
  cuentas se pueden archivar en secciones junto a tus notas.
- **Local primero.** Las lecturas y escrituras son instantáneas y funcionan sin conexión. La sincronización se hace en
  segundo plano.
- **Importación y exportación.** Copias de seguridad completas en JSON, exportaciones a CSV y Markdown, y restauración
  desde cualquier copia en `trash/`.
- **Pensado para el teclado.** `Ctrl/⌘ K`, `/`, `J`/`K`, `N`, `Ctrl/⌘ V`. Temas claro y oscuro; interfaz en chino e
  inglés.

<p align="center">
  <img src="../../docs/images/detail.png" width="49%" alt="Detalle de una cuenta">
  <img src="../../docs/images/paste.png" width="49%" alt="Pegado inteligente">
</p>

## Primeros pasos

### Usar la versión alojada

Ve a **[aicialnotes.com](https://aicialnotes.com)**, inicia sesión con Google o Microsoft y listo. No hay nada que
instalar. El sitio solo obtiene permiso sobre los archivos que crea:

| Proveedor     | Permiso                         | A qué puede acceder AicialNote                      |
| ------------- | ------------------------------- | --------------------------------------------------- |
| Google Drive  | `drive.file`                    | Solo a los archivos que creó AicialNote             |
| OneDrive      | `Files.ReadWrite.AppFolder`     | Solo a la carpeta `Apps/AicialNote`                 |
| Carpeta local | Acceso a archivos del navegador | Solo a la carpeta que elijas (navegadores Chromium) |

### Alojarlo tú mismo

AicialNote se distribuye como un único binario (o un contenedor) con la aplicación web integrada. Registra una
aplicación OAuth en Google o Microsoft (o en ambos), define cuatro variables de entorno y ejecútalo. Consulta
[docs/self-hosting.md](../../docs/self-hosting.md).

## Cómo funciona

```text
┌────────────────────┐   OAuth only    ┌─────────────────────────┐
│  Browser (React)   │ ───────────────▶│ AicialNote server (Go)  │  no database,
│  IndexedDB cache   │                 │ token broker + SPA      │  never sees data
└─────────┬──────────┘                 └─────────────────────────┘
          │ files (JSON / MD / CSV), directly
          ▼
   Google Drive  ·  OneDrive  ·  local folder
```

Esto es lo que encontrarás en tu unidad:

```text
AicialNote/
├── vault.json                 settings
├── items/<id>.json            the data, one file per ID
├── notes/<id>.json            notebooks, sections and pages
├── history/<id>/…             previous versions, kept on every change
├── trash/                     deleted items
├── readable/                  generated Markdown and CSV copies (open in any editor or Excel)
└── index.json                 generated index
```

El formato en la unidad es un contrato público y versionado: [docs/data-format.md](../../docs/data-format.md).

## Modelo de seguridad

- **AicialNote todavía no cifra tus datos.** Los archivos de tu unidad y la caché local del navegador (IndexedDB) están
  en texto plano. Están tan seguros como tu cuenta en la nube y tu dispositivo, así que activa la verificación en dos
  pasos en tu cuenta en la nube. El cifrado de extremo a extremo opcional está en la hoja de ruta.
- **El servidor nunca ve tus datos.** Solo completa el inicio de sesión OAuth. El token de actualización se guarda en
  una cookie HttpOnly cifrada con AES-GCM; el servidor no tiene base de datos y no almacena nada.
- **Permisos mínimos.** Consulta la tabla en [Primeros pasos](#usar-la-versión-alojada).
- **CSP estricta.** `script-src 'self'`, y `connect-src` solo incluye los hosts de Google Drive y OneDrive.

¿Has encontrado una vulnerabilidad? Infórmala de forma privada, como se describe en [SECURITY.md](../../SECURITY.md).

## Desarrollo

Requisitos: Node 22+, pnpm 10+, Go 1.26+.

```sh
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 pnpm install
pnpm dev            # web app on http://localhost:5173
pnpm dev:server     # OAuth broker on :8080 (needs server/.env, see server/.env.example)
```

En desarrollo, la página de inicio tiene un botón **Open demo data** que funciona por completo en memoria, así que no
necesitas credenciales OAuth para trabajar en la interfaz.

```sh
pnpm test           # unit tests (TypeScript + Go)
pnpm typecheck
pnpm lint
pnpm smoke          # end-to-end checks in Chrome against `pnpm dev`
pnpm screenshots    # UI screenshots in light/dark, zh/en
pnpm build          # single binary with the web app embedded: server/bin/aicialnote
```

| Ruta               | Contenido                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------- |
| `packages/core`    | modelo de datos, pegado inteligente, TOTP, exportaciones legibles, operaciones de la bóveda |
| `packages/storage` | adaptadores de almacenamiento: Google Drive, OneDrive, carpeta local, memoria               |
| `web`              | aplicación React: caché local, motor de sincronización, interfaz                            |
| `server`           | Go: intermediario OAuth y servidor de archivos estáticos                                    |
| `docs`             | formato de datos, principios de diseño, alojamiento propio                                  |

Estado del proyecto, decisiones de diseño y notas para colaboradores: [docs/status.md](../../docs/status.md),
[docs/decisions.md](../../docs/decisions.md), [CLAUDE.md](../../CLAUDE.md).

## Hoja de ruta

- [ ] Cifrado de extremo a extremo opcional (los mismos archivos, dentro de un sobre cifrado)
- [ ] Réplica en una segunda unidad
- [ ] Plantillas y estados personalizados en la configuración
- [ ] Importación desde OneNote / CSV, exportación a un visor HTML sin conexión
- [ ] Más idiomas de interfaz
- [ ] Versiones de escritorio y móviles

## Contribuir

Las incidencias y las pull requests son bienvenidas, en inglés o en chino. Empieza por
[CONTRIBUTING.md](../../CONTRIBUTING.md). Para cualquier cambio mayor que una corrección de errores, abre primero una
incidencia para que podamos acordar el enfoque.

## Licencia

AicialNote es software libre, con licencia **[GNU Affero General Public License v3.0](../../LICENSE)**.

Puedes usarlo, estudiarlo, modificarlo y redistribuirlo. Si ejecutas una versión modificada y permites que otras
personas la usen a través de una red, debes publicar tu código fuente bajo la misma licencia.

Copyright © 2026 Eric-kbo
