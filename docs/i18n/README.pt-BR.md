<div align="center">

<img src="../../web/public/favicon.svg" width="72" height="72" alt="Logo do AicialNote">

# AicialNote

**Suas contas e anotações, no seu próprio armazenamento em nuvem.**

Um gerenciador de código aberto para logins, senhas, 2FA, e-mails de recuperação e proxies.<br>
Sem banco de dados no servidor: seus dados ficam no seu Google Drive ou OneDrive como arquivos comuns.

[![Site](https://img.shields.io/badge/site-aicialnotes.com-3e63dd)](https://aicialnotes.com)
[![Licença: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-3e63dd)](../../LICENSE)
[![CI](https://github.com/Eric-kbo/AnNote/actions/workflows/ci.yml/badge.svg)](https://github.com/Eric-kbo/AnNote/actions/workflows/ci.yml)
![Status: alfa](https://img.shields.io/badge/status-alpha-orange)

**[Abrir o AicialNote em aicialnotes.com](https://aicialnotes.com)** ·
[Hospedagem própria](../../docs/self-hosting.md) ·
[Formato de dados](../../docs/data-format.md) ·
[Relatar um bug](https://github.com/Eric-kbo/AnNote/issues)

[English](../../README.md) · [简体中文](../../README.zh-CN.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) ·
[한국어](README.ko.md) · [Español](README.es.md) · [Deutsch](README.de.md) ·
[Français](README.fr.md) · **Português** · [Русский](README.ru.md)

![Lista de contas do AicialNote](../../docs/images/list.png)

</div>

## Sumário

- [Por que AicialNote](#por-que-aicialnote)
- [Recursos](#recursos)
- [Primeiros passos](#primeiros-passos)
- [Como funciona](#como-funciona)
- [Modelo de segurança](#modelo-de-segurança)
- [Desenvolvimento](#desenvolvimento)
- [Roteiro](#roteiro)
- [Como contribuir](#como-contribuir)
- [Licença](#licença)

## Por que AicialNote

A maioria dos gerenciadores de senhas guarda o seu cofre nos servidores deles, em um formato que só o aplicativo deles
consegue ler. O AicialNote faz o contrário:

- **Os arquivos são seus.** Tudo fica salvo como JSON no **seu** Google Drive ou OneDrive (ou em uma pasta local), com
  cópias em Markdown e CSV geradas ao lado. Se o AicialNote deixar de existir amanhã, você ainda poderá abrir seus
  dados em qualquer editor de texto ou no Excel.
- **O servidor nunca vê seus dados.** O navegador se comunica diretamente com o Google e a Microsoft. O pequeno
  servidor em Go apenas conclui o login OAuth e não armazena nada.
- **É difícil perder dados.** Cada sobrescrita mantém a versão anterior, cada exclusão vai para uma pasta de lixeira e,
  em um conflito de sincronização, as duas versões são mantidas.

> [!WARNING]
> **O AicialNote é um software em fase alfa.** O modo de demonstração e a pasta local estão bem testados; a
> sincronização com Google Drive e OneDrive é recente. Mantenha um backup (**Export data… → Full backup (JSON)**) até
> que ele tenha se mostrado confiável para você, e leia o [modelo de segurança](#modelo-de-segurança) antes de guardar
> senhas reais.

## Recursos

- **Uma lista para todas as identidades.** Cada ID reúne cartões: Google, Apple ID, Microsoft, OpenAI, Claude, e-mail,
  site, chave de API, proxy, servidor, Wi-Fi, cartão bancário, endereço de entrega, perfil, documento de identidade ou
  personalizado. Filtre por status, tag, tipo de cartão ou vencimento próximo.
- **Copie com um clique.** Clique em qualquer valor para copiá-lo. Os campos de 2FA mostram o código TOTP em tempo
  real.
- **Colagem inteligente.** Cole `Email: a@gmail.com Password: …`, `email----password----recovery----2FA`,
  `ip:port:user:pass` ou cem linhas desse tipo, e o AicialNote preenche os campos.
- **Cadernos.** Cadernos, seções e páginas com um editor de texto formatado, no estilo do OneNote. As contas podem ser
  organizadas em seções ao lado das suas anotações.
- **Local primeiro.** Leituras e gravações são instantâneas e funcionam offline. A sincronização acontece em segundo
  plano.
- **Importação e exportação.** Backups completos em JSON, exportações em CSV e Markdown, e restauração a partir de
  qualquer cópia em `trash/`.
- **Feito para o teclado.** `Ctrl/⌘ K`, `/`, `J`/`K`, `N`, `Ctrl/⌘ V`. Temas claro e escuro, interface em chinês e
  inglês.

<p align="center">
  <img src="../../docs/images/detail.png" width="49%" alt="Detalhes da conta">
  <img src="../../docs/images/paste.png" width="49%" alt="Colagem inteligente">
</p>

## Primeiros passos

### Usar a versão hospedada

Acesse **[aicialnotes.com](https://aicialnotes.com)**, entre com sua conta Google ou Microsoft e pronto. Não há nada
para instalar. O site só recebe permissão para os arquivos que ele mesmo cria:

| Provedor     | Permissão                      | O que o AicialNote pode acessar                  |
| ------------ | ------------------------------ | ------------------------------------------------ |
| Google Drive | `drive.file`                   | Apenas os arquivos criados pelo AicialNote       |
| OneDrive     | `Files.ReadWrite.AppFolder`    | Apenas a pasta `Apps/AicialNote`                 |
| Pasta local  | Acesso a arquivos do navegador | Apenas a pasta que você escolher (base Chromium) |

### Hospedar por conta própria

O AicialNote é distribuído como um único binário (ou um contêiner) com o aplicativo web embutido. Registre um
aplicativo OAuth no Google e/ou na Microsoft, defina quatro variáveis de ambiente e execute. Veja
[docs/self-hosting.md](../../docs/self-hosting.md).

## Como funciona

```text
┌────────────────────┐   OAuth only    ┌─────────────────────────┐
│  Browser (React)   │ ───────────────▶│ AicialNote server (Go)  │  no database,
│  IndexedDB cache   │                 │ token broker + SPA      │  never sees data
└─────────┬──────────┘                 └─────────────────────────┘
          │ files (JSON / MD / CSV), directly
          ▼
   Google Drive  ·  OneDrive  ·  local folder
```

O que você vai encontrar no seu armazenamento:

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

O formato no armazenamento é um contrato público e versionado: [docs/data-format.md](../../docs/data-format.md).

## Modelo de segurança

- **O AicialNote ainda não criptografa seus dados.** Os arquivos no seu armazenamento e o cache local do navegador
  (IndexedDB) ficam em texto puro. Eles são tão seguros quanto a sua conta na nuvem e o seu dispositivo, então ative a
  verificação em duas etapas na sua conta na nuvem. A criptografia de ponta a ponta opcional está no roteiro.
- **O servidor nunca vê seus dados.** Ele apenas conclui o login OAuth. O refresh token fica em um cookie HttpOnly
  criptografado com AES-GCM; o servidor não tem banco de dados e não armazena nada.
- **Permissões mínimas.** Veja a tabela em [Primeiros passos](#usar-a-versão-hospedada).
- **CSP rigorosa.** `script-src 'self'`, e `connect-src` lista apenas os hosts do Google Drive e do OneDrive.

Encontrou uma vulnerabilidade? Informe de forma privada, conforme descrito em [SECURITY.md](../../SECURITY.md).

## Desenvolvimento

Requisitos: Node 22+, pnpm 10+, Go 1.26+.

```sh
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 pnpm install
pnpm dev            # web app on http://localhost:5173
pnpm dev:server     # OAuth broker on :8080 (needs server/.env, see server/.env.example)
```

Em desenvolvimento, a página inicial tem um botão **Open demo data** que roda inteiramente na memória, então você não
precisa de credenciais OAuth para trabalhar na interface.

```sh
pnpm test           # unit tests (TypeScript + Go)
pnpm typecheck
pnpm lint
pnpm smoke          # end-to-end checks in Chrome against `pnpm dev`
pnpm screenshots    # UI screenshots in light/dark, zh/en
pnpm build          # single binary with the web app embedded: server/bin/aicialnote
```

| Caminho            | Conteúdo                                                                             |
| ------------------ | ------------------------------------------------------------------------------------ |
| `packages/core`    | modelo de dados, colagem inteligente, TOTP, exportações legíveis, operações no cofre |
| `packages/storage` | adaptadores de armazenamento: Google Drive, OneDrive, pasta local, memória           |
| `web`              | aplicativo React: cache local, mecanismo de sincronização, interface                 |
| `server`           | Go: intermediário OAuth e servidor de arquivos estáticos                             |
| `docs`             | formato de dados, princípios de design, hospedagem própria                           |

Status do projeto, decisões de design e notas para colaboradores: [docs/status.md](../../docs/status.md),
[docs/decisions.md](../../docs/decisions.md), [CLAUDE.md](../../CLAUDE.md).

## Roteiro

- [ ] Criptografia de ponta a ponta opcional (os mesmos arquivos, em um envelope criptografado)
- [ ] Espelhamento para um segundo armazenamento
- [ ] Modelos e status personalizados nas configurações
- [ ] Importação do OneNote / CSV, exportação para um visualizador HTML offline
- [ ] Mais idiomas na interface
- [ ] Versões para desktop e dispositivos móveis

## Como contribuir

Issues e pull requests são bem-vindos, em inglês ou chinês. Comece pelo [CONTRIBUTING.md](../../CONTRIBUTING.md). Para
qualquer coisa maior que uma correção de bug, abra uma issue antes para que possamos combinar a abordagem.

## Licença

O AicialNote é software livre, licenciado sob a **[GNU Affero General Public License v3.0](../../LICENSE)**.

Você pode usá-lo, estudá-lo, modificá-lo e redistribuí-lo. Se você executar uma versão modificada e permitir que outras
pessoas a usem por meio de uma rede, deverá publicar seu código-fonte sob a mesma licença.

Copyright © 2026 Eric-kbo
