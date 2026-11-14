<div align="center">

<img src="../../web/public/favicon.svg" width="72" height="72" alt="Logo d’AicialNote">

# AicialNote

**Vos comptes et vos notes, dans votre propre espace cloud.**

Un gestionnaire open source pour vos identifiants, mots de passe, 2FA, e-mails de récupération et proxys.<br>
Aucune base de données côté serveur : vos données restent dans votre Google Drive ou votre OneDrive, sous forme de
fichiers ordinaires.

[![Site web](https://img.shields.io/badge/site_web-aicialnotes.com-3e63dd)](https://aicialnotes.com)
[![Licence : AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-3e63dd)](../../LICENSE)
[![CI](https://github.com/Eric-kbo/AnNote/actions/workflows/ci.yml/badge.svg)](https://github.com/Eric-kbo/AnNote/actions/workflows/ci.yml)
![Statut : alpha](https://img.shields.io/badge/status-alpha-orange)

**[Ouvrir AicialNote sur aicialnotes.com](https://aicialnotes.com)** ·
[Auto-hébergement](../../docs/self-hosting.md) ·
[Format des données](../../docs/data-format.md) ·
[Signaler un bug](https://github.com/Eric-kbo/AnNote/issues)

[English](../../README.md) · [简体中文](../../README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) ·
[한국어](README.ko.md) · [Español](README.es.md) · [Deutsch](README.de.md) ·
**Français** · [Português](README.pt-BR.md) · [Русский](README.ru.md)

![Liste des comptes dans AicialNote](../../docs/images/list.png)

</div>

## Sommaire

- [Pourquoi AicialNote](#pourquoi-aicialnote)
- [Fonctionnalités](#fonctionnalités)
- [Prise en main](#prise-en-main)
- [Fonctionnement](#fonctionnement)
- [Modèle de sécurité](#modèle-de-sécurité)
- [Développement](#développement)
- [Feuille de route](#feuille-de-route)
- [Contribuer](#contribuer)
- [Licence](#licence)

## Pourquoi AicialNote

La plupart des gestionnaires de mots de passe conservent votre coffre sur leurs serveurs, dans un format que seule leur
application sait lire. AicialNote fait l’inverse :

- **Les fichiers vous appartiennent.** Tout est stocké en JSON dans **votre** Google Drive ou OneDrive (ou dans un
  dossier local), avec des copies Markdown et CSV générées à côté. Si AicialNote disparaît demain, vous pourrez
  toujours ouvrir vos données dans n’importe quel éditeur de texte ou dans Excel.
- **Le serveur ne voit jamais vos données.** Le navigateur communique directement avec Google et Microsoft. Le petit
  serveur Go se contente de finaliser la connexion OAuth et ne stocke rien.
- **Vos données sont difficiles à perdre.** Chaque écrasement conserve la version précédente, chaque suppression passe
  par un dossier corbeille, et en cas de conflit de synchronisation, les deux versions sont conservées.

> [!WARNING]
> **AicialNote est un logiciel en version alpha.** Le mode démo et le dossier local sont bien testés ; la
> synchronisation avec Google Drive et OneDrive est récente. Gardez une sauvegarde (**Export data… → Full backup
> (JSON)**) tant que l’application n’a pas fait ses preuves chez vous, et lisez le
> [modèle de sécurité](#modèle-de-sécurité) avant d’y enregistrer de vrais mots de passe.

## Fonctionnalités

- **Une seule liste pour toutes vos identités.** Chaque ID contient des fiches : Google, Apple ID, Microsoft, OpenAI, Claude,
  e-mail, site web, clé API, proxy, serveur, Wi-Fi, carte bancaire, adresse de livraison, profil, pièce d'identité ou
  personnalisée. Filtrez par statut, étiquette, type de fiche ou échéance proche.
- **Copie en un clic.** Cliquez sur n’importe quelle valeur pour la copier. Les champs 2FA affichent le code TOTP en
  temps réel.
- **Collage intelligent.** Collez `Email: a@gmail.com Password: …`, `email----password----recovery----2FA`,
  `ip:port:user:pass`, ou une centaine de lignes de ce type, et AicialNote remplit les champs.
- **Blocs-notes.** Blocs-notes, sections et pages avec un éditeur de texte enrichi, dans l’esprit de OneNote. Les
  comptes peuvent être rangés dans des sections à côté de vos notes.
- **Local d’abord.** Lectures et écritures sont instantanées et fonctionnent hors ligne. La synchronisation se fait en
  arrière-plan.
- **Import et export.** Sauvegardes JSON complètes, exports CSV et Markdown, et restauration depuis n’importe quelle
  copie dans `trash/`.
- **Pensé pour le clavier.** `Ctrl/⌘ K`, `/`, `J`/`K`, `N`, `Ctrl/⌘ V`. Thèmes clair et sombre, interface en chinois et
  en anglais.

<p align="center">
  <img src="../../docs/images/detail.png" width="49%" alt="Détail d’un compte">
  <img src="../../docs/images/paste.png" width="49%" alt="Collage intelligent">
</p>

## Prise en main

### Utiliser la version hébergée

Rendez-vous sur **[aicialnotes.com](https://aicialnotes.com)**, connectez-vous avec Google ou Microsoft, et c’est tout.
Rien à installer. Le site n’obtient l’accès qu’aux fichiers qu’il crée :

| Fournisseur   | Autorisation                     | Ce à quoi AicialNote a accès                        |
| ------------- | -------------------------------- | --------------------------------------------------- |
| Google Drive  | `drive.file`                     | Uniquement les fichiers créés par AicialNote        |
| OneDrive      | `Files.ReadWrite.AppFolder`      | Uniquement le dossier `Apps/AicialNote`             |
| Dossier local | Accès aux fichiers du navigateur | Uniquement le dossier choisi (navigateurs Chromium) |

### L’héberger vous-même

AicialNote est distribué sous la forme d’un binaire unique (ou d’un conteneur) qui embarque l’application web.
Enregistrez une application OAuth auprès de Google et/ou de Microsoft, définissez quatre variables d’environnement et
lancez-le. Voir [docs/self-hosting.md](../../docs/self-hosting.md).

## Fonctionnement

```text
┌────────────────────┐   OAuth only    ┌─────────────────────────┐
│  Browser (React)   │ ───────────────▶│ AicialNote server (Go)  │  no database,
│  IndexedDB cache   │                 │ token broker + SPA      │  never sees data
└─────────┬──────────┘                 └─────────────────────────┘
          │ files (JSON / MD / CSV), directly
          ▼
   Google Drive  ·  OneDrive  ·  local folder
```

Voici ce que vous trouverez dans votre espace de stockage :

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

Le format stocké est un contrat public et versionné : [docs/data-format.md](../../docs/data-format.md).

## Modèle de sécurité

- **AicialNote ne chiffre pas encore vos données.** Les fichiers de votre espace de stockage et le cache local du
  navigateur (IndexedDB) sont en clair. Ils sont aussi sûrs que votre compte cloud et votre appareil : activez donc la
  validation en deux étapes sur votre compte cloud. Un chiffrement de bout en bout optionnel figure sur la feuille de
  route.
- **Le serveur ne voit jamais vos données.** Il se contente de finaliser la connexion OAuth. Le jeton d’actualisation
  est conservé dans un cookie HttpOnly chiffré en AES-GCM ; le serveur n’a pas de base de données et ne stocke rien.
- **Autorisations restreintes.** Voir le tableau dans [Prise en main](#utiliser-la-version-hébergée).
- **CSP stricte.** `script-src 'self'`, et `connect-src` ne liste que les hôtes de Google Drive et de OneDrive.

Vous avez trouvé une vulnérabilité ? Merci de la signaler en privé, comme indiqué dans [SECURITY.md](../../SECURITY.md).

## Développement

Prérequis : Node 22+, pnpm 10+, Go 1.26+.

```sh
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 pnpm install
pnpm dev            # web app on http://localhost:5173
pnpm dev:server     # OAuth broker on :8080 (needs server/.env, see server/.env.example)
```

En développement, la page d’accueil propose un bouton **Open demo data** qui fonctionne entièrement en mémoire : vous
n’avez donc pas besoin d’identifiants OAuth pour travailler sur l’interface.

```sh
pnpm test           # unit tests (TypeScript + Go)
pnpm typecheck
pnpm lint
pnpm smoke          # end-to-end checks in Chrome against `pnpm dev`
pnpm screenshots    # UI screenshots in light/dark, zh/en
pnpm build          # single binary with the web app embedded: server/bin/aicialnote
```

| Chemin             | Contenu                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------- |
| `packages/core`    | modèle de données, collage intelligent, TOTP, exports lisibles, opérations sur le coffre |
| `packages/storage` | adaptateurs de stockage : Google Drive, OneDrive, dossier local, mémoire                 |
| `web`              | application React : cache local, moteur de synchronisation, interface                    |
| `server`           | Go : intermédiaire OAuth et serveur de fichiers statiques                                |
| `docs`             | format des données, principes de design, auto-hébergement                                |

État du projet, choix de conception et notes pour les contributeurs : [docs/status.md](../../docs/status.md),
[docs/decisions.md](../../docs/decisions.md), [CLAUDE.md](../../CLAUDE.md).

## Feuille de route

- [ ] Chiffrement de bout en bout optionnel (mêmes fichiers, dans une enveloppe chiffrée)
- [ ] Copie miroir vers un second espace de stockage
- [ ] Modèles et statuts personnalisés dans les paramètres
- [ ] Import depuis OneNote / CSV, export vers une visionneuse HTML hors ligne
- [ ] Davantage de langues pour l’interface
- [ ] Versions bureau et mobile

## Contribuer

Les issues et les pull requests sont les bienvenues, en anglais ou en chinois. Commencez par
[CONTRIBUTING.md](../../CONTRIBUTING.md). Pour tout ce qui dépasse une correction de bug, ouvrez d’abord une issue
afin que nous puissions nous mettre d’accord sur l’approche.

## Licence

AicialNote est un logiciel libre, distribué sous la **[GNU Affero General Public License v3.0](../../LICENSE)**.

Vous pouvez l’utiliser, l’étudier, le modifier et le redistribuer. Si vous exécutez une version modifiée et la mettez à
la disposition d’autres personnes via un réseau, vous devez publier votre code source sous la même licence.

Copyright © 2026 Eric-kbo
