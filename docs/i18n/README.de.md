<div align="center">

<img src="../../web/public/favicon.svg" width="72" height="72" alt="AicialNote-Logo">

# AicialNote

**Deine Konten und Notizen, in deinem eigenen Cloud-Speicher.**

Ein Open-Source-Manager für Logins, Passwörter, 2FA, Wiederherstellungs-E-Mails und Proxys.<br>
Keine Datenbank auf dem Server: Deine Daten bleiben als normale Dateien in deinem Google Drive oder OneDrive.

[![Webseite](https://img.shields.io/badge/webseite-aicialnotes.com-3e63dd)](https://aicialnotes.com)
[![Lizenz: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-3e63dd)](../../LICENSE)
[![CI](https://github.com/Eric-kbo/AnNote/actions/workflows/ci.yml/badge.svg)](https://github.com/Eric-kbo/AnNote/actions/workflows/ci.yml)
![Status: Alpha](https://img.shields.io/badge/status-alpha-orange)

**[AicialNote auf aicialnotes.com öffnen](https://aicialnotes.com)** ·
[Selbst hosten](../../docs/self-hosting.md) ·
[Datenformat](../../docs/data-format.md) ·
[Fehler melden](https://github.com/Eric-kbo/AnNote/issues)

[English](../../README.md) · [简体中文](../../README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) ·
[한국어](README.ko.md) · [Español](README.es.md) · **Deutsch** ·
[Français](README.fr.md) · [Português](README.pt-BR.md) · [Русский](README.ru.md)

![Kontenliste in AicialNote](../../docs/images/list.png)

</div>

## Inhalt

- [Warum AicialNote](#warum-aicialnote)
- [Funktionen](#funktionen)
- [Erste Schritte](#erste-schritte)
- [So funktioniert es](#so-funktioniert-es)
- [Sicherheitsmodell](#sicherheitsmodell)
- [Entwicklung](#entwicklung)
- [Roadmap](#roadmap)
- [Mitwirken](#mitwirken)
- [Lizenz](#lizenz)

## Warum AicialNote

Die meisten Passwortmanager speichern deinen Tresor auf ihren eigenen Servern, in einem Format, das nur ihre App lesen
kann. AicialNote macht es umgekehrt:

- **Die Dateien gehören dir.** Alles wird als JSON in **deinem** Google Drive oder OneDrive (oder in einem lokalen
  Ordner) gespeichert, daneben werden Kopien in Markdown und CSV erzeugt. Sollte es AicialNote morgen nicht mehr geben,
  kannst du deine Daten weiterhin in jedem Texteditor oder in Excel öffnen.
- **Der Server sieht deine Daten nie.** Der Browser spricht direkt mit Google und Microsoft. Der kleine Go-Server
  übernimmt nur die OAuth-Anmeldung und speichert nichts.
- **Daten gehen kaum verloren.** Jedes Überschreiben behält die vorherige Version, jedes Löschen landet in einem
  Papierkorb-Ordner, und bei einem Synchronisierungskonflikt bleiben beide Seiten erhalten.

> [!WARNING]
> **AicialNote ist Alpha-Software.** Der Demomodus und der lokale Ordner sind gut getestet; die Synchronisierung mit
> Google Drive und OneDrive ist neu. Lege eine Sicherung an (**Export data… → Full backup (JSON)**), bis sich die App
> für dich bewährt hat, und lies das [Sicherheitsmodell](#sicherheitsmodell), bevor du echte Passwörter speicherst.

## Funktionen

- **Eine Liste für alle Identitäten.** Jede ID enthält Karten: Google, Apple ID, Microsoft, OpenAI, Claude, E-Mail,
  Website, API-Schlüssel, Proxy, Server, WLAN, Bankkarte, Lieferadresse, Profil, Ausweisdokument oder benutzerdefiniert. Filtern nach Status, Tag, Kartentyp oder bald ablaufenden Einträgen.
- **Mit einem Klick kopieren.** Klicke auf einen beliebigen Wert, um ihn zu kopieren. 2FA-Felder zeigen den aktuellen
  TOTP-Code an.
- **Intelligentes Einfügen.** Füge `Email: a@gmail.com Password: …`, `email----password----recovery----2FA`,
  `ip:port:user:pass` oder hundert solcher Zeilen ein, und AicialNote füllt die Felder aus.
- **Notizbücher.** Notizbücher, Abschnitte und Seiten mit einem Rich-Text-Editor, im Stil von OneNote. Konten lassen
  sich neben deinen Notizen in Abschnitte einsortieren.
- **Local-first.** Lesen und Schreiben geschieht sofort und funktioniert offline. Die Synchronisierung läuft im
  Hintergrund.
- **Import und Export.** Vollständige JSON-Sicherungen, Export als CSV und Markdown sowie Wiederherstellung aus jeder
  Kopie in `trash/`.
- **Für die Tastatur gemacht.** `Ctrl/⌘ K`, `/`, `J`/`K`, `N`, `Ctrl/⌘ V`. Helles und dunkles Design, Oberfläche auf
  Chinesisch und Englisch.

<p align="center">
  <img src="../../docs/images/detail.png" width="49%" alt="Kontodetails">
  <img src="../../docs/images/paste.png" width="49%" alt="Intelligentes Einfügen">
</p>

## Erste Schritte

### Gehostete Version nutzen

Öffne **[aicialnotes.com](https://aicialnotes.com)**, melde dich mit Google oder Microsoft an, fertig. Es muss nichts
installiert werden. Die Seite erhält nur Zugriff auf die Dateien, die sie selbst anlegt:

| Anbieter       | Berechtigung                | Worauf AicialNote zugreifen kann                |
| -------------- | --------------------------- | ----------------------------------------------- |
| Google Drive   | `drive.file`                | Nur auf Dateien, die AicialNote angelegt hat    |
| OneDrive       | `Files.ReadWrite.AppFolder` | Nur auf den Ordner `Apps/AicialNote`            |
| Lokaler Ordner | Dateizugriff im Browser     | Nur auf den gewählten Ordner (Chromium-basiert) |

### Selbst hosten

AicialNote wird als einzelne Binärdatei (oder als ein Container) mit eingebetteter Web-App ausgeliefert. Registriere
eine OAuth-App bei Google und/oder Microsoft, setze vier Umgebungsvariablen und starte sie. Siehe
[docs/self-hosting.md](../../docs/self-hosting.md).

## So funktioniert es

```text
┌────────────────────┐   OAuth only    ┌─────────────────────────┐
│  Browser (React)   │ ───────────────▶│ AicialNote server (Go)  │  no database,
│  IndexedDB cache   │                 │ token broker + SPA      │  never sees data
└─────────┬──────────┘                 └─────────────────────────┘
          │ files (JSON / MD / CSV), directly
          ▼
   Google Drive  ·  OneDrive  ·  local folder
```

Das findest du in deinem Cloud-Speicher:

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

Das Format im Cloud-Speicher ist ein öffentlicher, versionierter Vertrag: [docs/data-format.md](../../docs/data-format.md).

## Sicherheitsmodell

- **AicialNote verschlüsselt deine Daten noch nicht.** Die Dateien in deinem Cloud-Speicher und der lokale Cache des
  Browsers (IndexedDB) liegen im Klartext vor. Sie sind so sicher wie dein Cloud-Konto und dein Gerät, also aktiviere
  die Bestätigung in zwei Schritten für dein Cloud-Konto. Optionale Ende-zu-Ende-Verschlüsselung steht auf der Roadmap.
- **Der Server sieht deine Daten nie.** Er übernimmt nur die OAuth-Anmeldung. Das Refresh-Token liegt in einem mit
  AES-GCM verschlüsselten HttpOnly-Cookie; der Server hat keine Datenbank und speichert nichts.
- **Minimale Berechtigungen.** Siehe die Tabelle unter [Erste Schritte](#gehostete-version-nutzen).
- **Strikte CSP.** `script-src 'self'`, und `connect-src` enthält nur die Hosts von Google Drive und OneDrive.

Du hast eine Sicherheitslücke gefunden? Bitte melde sie vertraulich, wie in [SECURITY.md](../../SECURITY.md)
beschrieben.

## Entwicklung

Voraussetzungen: Node 22+, pnpm 10+, Go 1.26+.

```sh
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 pnpm install
pnpm dev            # web app on http://localhost:5173
pnpm dev:server     # OAuth broker on :8080 (needs server/.env, see server/.env.example)
```

In der Entwicklungsumgebung gibt es auf der Startseite die Schaltfläche **Open demo data**, die komplett im
Arbeitsspeicher läuft. Für die Arbeit an der Oberfläche brauchst du also keine OAuth-Zugangsdaten.

```sh
pnpm test           # unit tests (TypeScript + Go)
pnpm typecheck
pnpm lint
pnpm smoke          # end-to-end checks in Chrome against `pnpm dev`
pnpm screenshots    # UI screenshots in light/dark, zh/en
pnpm build          # single binary with the web app embedded: server/bin/aicialnote
```

| Pfad               | Inhalt                                                                         |
| ------------------ | ------------------------------------------------------------------------------ |
| `packages/core`    | Datenmodell, intelligentes Einfügen, TOTP, lesbare Exporte, Tresor-Operationen |
| `packages/storage` | Speicheradapter: Google Drive, OneDrive, lokaler Ordner, Arbeitsspeicher       |
| `web`              | React-App: lokaler Cache, Synchronisierungs-Engine, Oberfläche                 |
| `server`           | Go: OAuth-Broker und Server für statische Dateien                              |
| `docs`             | Datenformat, Designprinzipien, Selbst-Hosting                                  |

Projektstatus, Designentscheidungen und Hinweise für Mitwirkende: [docs/status.md](../../docs/status.md),
[docs/decisions.md](../../docs/decisions.md), [CLAUDE.md](../../CLAUDE.md).

## Roadmap

- [ ] Optionale Ende-zu-Ende-Verschlüsselung (dieselben Dateien, in einem verschlüsselten Umschlag)
- [ ] Spiegelung auf einen zweiten Cloud-Speicher
- [ ] Eigene Vorlagen und Status in den Einstellungen
- [ ] Import aus OneNote / CSV, Export in einen Offline-HTML-Viewer
- [ ] Weitere Sprachen für die Oberfläche
- [ ] Desktop- und Mobilversionen

## Mitwirken

Issues und Pull Requests sind willkommen, auf Englisch oder Chinesisch. Fang mit
[CONTRIBUTING.md](../../CONTRIBUTING.md) an. Bei allem, was über eine Fehlerbehebung hinausgeht, eröffne bitte zuerst
ein Issue, damit wir uns auf das Vorgehen einigen können.

## Lizenz

AicialNote ist freie Software, lizenziert unter der **[GNU Affero General Public License v3.0](../../LICENSE)**.

Du darfst sie nutzen, untersuchen, verändern und weitergeben. Wenn du eine veränderte Version betreibst und andere sie
über ein Netzwerk nutzen lässt, musst du deinen Quellcode unter derselben Lizenz veröffentlichen.

Copyright © 2026 Eric-kbo
