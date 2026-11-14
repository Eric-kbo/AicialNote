<div align="center">

<img src="../../web/public/favicon.svg" width="72" height="72" alt="AicialNote のロゴ">

# AicialNote

**アカウント情報とノートを、あなた自身のクラウドドライブに。**

ログイン情報、パスワード、2FA、予備のメールアドレス、プロキシを管理するオープンソースのツールです。<br>
サーバー側にデータベースはありません。データはあなたの Google Drive または OneDrive にプレーンなファイルとして保存されます。

[![ウェブサイト](https://img.shields.io/badge/ウェブサイト-aicialnotes.com-3e63dd)](https://aicialnotes.com)
[![ライセンス: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-3e63dd)](../../LICENSE)
[![CI](https://github.com/Eric-kbo/AnNote/actions/workflows/ci.yml/badge.svg)](https://github.com/Eric-kbo/AnNote/actions/workflows/ci.yml)
![ステータス: アルファ](https://img.shields.io/badge/status-alpha-orange)

**[aicialnotes.com で AicialNote を開く](https://aicialnotes.com)** ·
[セルフホスティング](../../docs/self-hosting.md) ·
[データ形式](../../docs/data-format.md) ·
[バグを報告](https://github.com/Eric-kbo/AnNote/issues)

[English](../../README.md) · [简体中文](../../README.zh-CN.md) · [繁體中文](README.zh-TW.md) · **日本語** ·
[한국어](README.ko.md) · [Español](README.es.md) · [Deutsch](README.de.md) ·
[Français](README.fr.md) · [Português](README.pt-BR.md) · [Русский](README.ru.md)

![AicialNote のアカウント一覧](../../docs/images/list.png)

</div>

## 目次

- [AicialNote を選ぶ理由](#aicialnote-を選ぶ理由)
- [機能](#機能)
- [はじめに](#はじめに)
- [仕組み](#仕組み)
- [セキュリティモデル](#セキュリティモデル)
- [開発](#開発)
- [ロードマップ](#ロードマップ)
- [コントリビュート](#コントリビュート)
- [ライセンス](#ライセンス)

## AicialNote を選ぶ理由

多くのパスワードマネージャーは、保管庫を自社のサーバーに、自社のアプリでしか読めない形式で保存します。AicialNote はその逆です。

- **ファイルはあなたのものです。** すべてのデータは**あなたの** Google Drive または OneDrive（またはローカルフォルダー）に
  JSON として保存され、その隣に Markdown と CSV のコピーが生成されます。AicialNote が明日なくなっても、
  任意のテキストエディターや Excel でデータを開けます。
- **サーバーはあなたのデータを見ません。** ブラウザーは Google や Microsoft と直接通信します。小さな Go サーバーは
  OAuth サインインを完了させるだけで、何も保存しません。
- **データが失われにくい設計です。** 上書きのたびに以前のバージョンが残り、削除したものはゴミ箱フォルダーに移動し、
  同期の競合時には両方のバージョンが保持されます。

> [!WARNING]
> **AicialNote はアルファ版のソフトウェアです。** デモモードとローカルフォルダーは十分にテストされていますが、Google Drive と
> OneDrive の同期はまだ新しい機能です。ご自身の環境で信頼できると確認できるまではバックアップ（**Export data… → Full backup (JSON)**）を
> 取っておき、実際のパスワードを保存する前に[セキュリティモデル](#セキュリティモデル)をお読みください。

## 機能

- **すべての ID を 1 つのリストで。** 各 ID にはカードを登録できます：Google、Apple ID、Microsoft、OpenAI、Claude、
  メール、ウェブサイト、API キー、プロキシ、サーバー、Wi-Fi、銀行カード、配送先住所、プロフィール、身分証明書、またはカスタム。ステータス、タグ、カードの種類、期限切れ間近で絞り込めます。
- **ワンクリックでコピー。** 値をクリックするだけでコピーできます。2FA フィールドには現在の TOTP コードが表示されます。
- **スマート貼り付け。** `Email: a@gmail.com Password: …`、`email----password----recovery----2FA`、
  `ip:port:user:pass`、あるいはこうした行を 100 行まとめて貼り付けると、AicialNote が各フィールドに入力します。
- **ノートブック。** OneNote のようなノートブック、セクション、ページと、リッチテキストエディターを備えています。
  アカウントもセクションに整理して、ノートと並べて置けます。
- **ローカルファースト。** 読み書きは即座に反映され、オフラインでも動作します。同期はバックグラウンドで行われます。
- **インポートとエクスポート。** JSON での完全バックアップ、CSV と Markdown へのエクスポート、`trash/` 内の任意のコピーからの復元に対応しています。
- **キーボード中心。** `Ctrl/⌘ K`、`/`、`J`/`K`、`N`、`Ctrl/⌘ V`。ライトテーマとダークテーマ、UI は中国語と英語に対応しています。

<p align="center">
  <img src="../../docs/images/detail.png" width="49%" alt="アカウントの詳細">
  <img src="../../docs/images/paste.png" width="49%" alt="スマート貼り付け">
</p>

## はじめに

### ホスト版を使う

**[aicialnotes.com](https://aicialnotes.com)** にアクセスし、Google または Microsoft でサインインすれば完了です。
インストールは不要です。サイトが取得するのは、自身が作成したファイルへのアクセス権だけです。

| プロバイダー       | 権限                         | AicialNote がアクセスできる範囲                 |
| ------------------ | ---------------------------- | ----------------------------------------------- |
| Google Drive       | `drive.file`                 | AicialNote が作成したファイルのみ               |
| OneDrive           | `Files.ReadWrite.AppFolder`  | `Apps/AicialNote` フォルダーのみ                |
| ローカルフォルダー | ブラウザーのファイルアクセス | 選択したフォルダーのみ（Chromium 系ブラウザー） |

### セルフホストする

AicialNote は、ウェブアプリを組み込んだ単一のバイナリ（または 1 つのコンテナー）として提供されます。Google と
Microsoft の一方または両方に OAuth アプリを登録し、4 つの環境変数を設定して実行してください。詳しくは
[docs/self-hosting.md](../../docs/self-hosting.md) を参照してください。

## 仕組み

```text
┌────────────────────┐   OAuth only    ┌─────────────────────────┐
│  Browser (React)   │ ───────────────▶│ AicialNote server (Go)  │  no database,
│  IndexedDB cache   │                 │ token broker + SPA      │  never sees data
└─────────┬──────────┘                 └─────────────────────────┘
          │ files (JSON / MD / CSV), directly
          ▼
   Google Drive  ·  OneDrive  ·  local folder
```

ドライブには次のファイルが作成されます。

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

ドライブ上のファイル形式は、バージョン管理された公開の仕様です：[docs/data-format.md](../../docs/data-format.md)。

## セキュリティモデル

- **現時点では、AicialNote はデータを暗号化しません。** ドライブ内のファイルとブラウザーのローカルキャッシュ（IndexedDB）は
  プレーンテキストです。その安全性はクラウドアカウントとデバイスの安全性に依存するため、クラウドアカウントでは 2 段階認証を
  有効にしてください。オプションのエンドツーエンド暗号化はロードマップに含まれています。
- **サーバーはあなたのデータを見ません。** サーバーは OAuth サインインを完了させるだけです。リフレッシュトークンは
  AES-GCM で暗号化された HttpOnly Cookie に保存されます。サーバーにはデータベースがなく、何も保存しません。
- **最小限の権限。** [はじめに](#ホスト版を使う)の表を参照してください。
- **厳格な CSP。** `script-src 'self'` を指定し、`connect-src` には Google Drive と OneDrive のホストのみを列挙しています。

脆弱性を見つけた場合は、[SECURITY.md](../../SECURITY.md) に記載された方法で非公開で報告してください。

## 開発

必要環境：Node 22+、pnpm 10+、Go 1.26+。

```sh
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 pnpm install
pnpm dev            # ウェブアプリ（http://localhost:5173）
pnpm dev:server     # :8080 の OAuth ブローカー（server/.env が必要。server/.env.example を参照）
```

開発環境では、スタートページに **Open demo data** ボタンがあり、すべてメモリ上で動作します。そのため、UI の開発に
OAuth の認証情報は必要ありません。

```sh
pnpm test           # 単体テスト（TypeScript + Go）
pnpm typecheck
pnpm lint
pnpm smoke          # `pnpm dev` に対して Chrome で E2E チェックを実行
pnpm screenshots    # UI のスクリーンショット（ライト/ダーク、zh/en）
pnpm build          # ウェブアプリを組み込んだ単一バイナリ：server/bin/aicialnote
```

| パス               | 内容                                                                       |
| ------------------ | -------------------------------------------------------------------------- |
| `packages/core`    | データモデル、スマート貼り付け、TOTP、可読形式のエクスポート、保管庫の操作 |
| `packages/storage` | ストレージアダプター：Google Drive、OneDrive、ローカルフォルダー、メモリ   |
| `web`              | React アプリ：ローカルキャッシュ、同期エンジン、UI                         |
| `server`           | Go：OAuth ブローカーと静的ファイルサーバー                                 |
| `docs`             | データ形式、デザイン原則、セルフホスティング                               |

プロジェクトの状況、設計上の判断、コントリビューター向けのメモ：[docs/status.md](../../docs/status.md)、
[docs/decisions.md](../../docs/decisions.md)、[CLAUDE.md](../../CLAUDE.md)。

## ロードマップ

- [ ] オプションのエンドツーエンド暗号化（同じファイルを暗号化したエンベロープで包む）
- [ ] 2 つ目のドライブへのミラーリング
- [ ] 設定画面でのテンプレートとステータスのカスタマイズ
- [ ] OneNote / CSV からのインポート、オフライン HTML ビューアーへのエクスポート
- [ ] UI の対応言語の追加
- [ ] デスクトップ版とモバイル版

## コントリビュート

Issue と Pull Request を歓迎します（英語または中国語で）。まずは [CONTRIBUTING.md](../../CONTRIBUTING.md) をお読みください。
バグ修正より大きな変更については、進め方をすり合わせるため、先に Issue を作成してください。

## ライセンス

AicialNote はフリーソフトウェアであり、**[GNU Affero General Public License v3.0](../../LICENSE)** の下でライセンスされています。

このソフトウェアは自由に使用、調査、改変、再配布できます。改変したバージョンを実行し、ネットワーク経由で他者に利用させる場合は、
同じライセンスの下でソースコードを公開する必要があります。

Copyright © 2026 Eric-kbo
