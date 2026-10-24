# AGENTS.md

このファイルはリポジトリ全体に適用する開発ルールです。

## プロジェクト概要

このリポジトリは、わんコメが取得したYouTube Super Chatを条件判定し、Pavlokの電撃とWordParty演出を実行するWindows向けプラグインです。

- 対応環境: わんコメ5.2以降 / Windows
- 実行形式: CommonJS
- 開発・回帰試験: Node.js 20以降
- 製作者名: `kaz`
- プラグインUID: `com.kaz.pavlok-superchat`

仕様判断では、まず `CODEX_SPEC_PavlokOneComme.md` を参照してください。READMEと実装が競合する場合は、開発仕様と安全側の挙動を優先し、不明点を報告してください。

## ファイルの責務

- `plugin.js`: コメント選別、設定検証、監視状態、FIFO予約、Pavlok認証・送信、WordParty実行、ログ保存。
- `index.html`: 設定画面の構造と表示文言。
- `app.js`: 設定画面の状態管理とプラグインAPI呼び出し。
- `style.css`: 設定画面のスタイル。
- `test/plugin.test.js`: プラグインの回帰試験。
- `README.md`: 利用者向け手順。
- `CODEX_SPEC_PavlokOneComme.md`: 開発仕様と変更禁止の基準。
- `更新履歴.md`: リリースごとの変更内容。
- `VERSION.txt` / `package.json`: 配布バージョン情報。
- `dist/`: 生成済み配布物。ルートのソースを正として同期する。

## 変更時に守ること

- UI、ログ、エラー、文書ではPavlokの刺激を「電撃」と表記する。
- Pavlok APIへ送る `stimulusType: 'zap'` は外部APIの必須値なので翻訳・変更しない。
- 対象イベントは `service=youtube`、`hasGift=true`、`giftType=superchat` をすべて満たすものだけとする。
- 通貨はJPY固定、金額は整数円の完全一致とし、設定できる対象金額は1つだけにする。
- 対象金額ごとに6枠を均等抽選し、あたり1枠は電撃1回、確変1枠は電撃2回、はずれ4枠は電撃なしとする。
- WordParty連携時はあたり・確変・はずれ1～4の6枠へ重複しない演出IDを割り当て、選ばれた枠の演出を1回実行する。
- WordParty演出はローカルAPIの `POST http://localhost:11180/api/wordparty/{演出ID}` で実行し、自動再実行しない。
- WordPartyの失敗でPavlok処理を止めない。PavlokがDRY-RUNでもWordParty連携ONなら演出を実行する。
- 出力値は1～100の整数に制限する。
- 対象イベントはFIFOで処理し、クールダウン中の予約を破棄しない。
- 予定した各電撃は1回だけ送信し、失敗した電撃を自動再送しない。確変の途中で失敗した場合は残りを送信しない。
- 401/403ではトークンのみ更新し、失敗した電撃と同じ抽選結果の残りは送信しない。
- 手動電撃は監視停止中のみ許可する。実機送信OFFではDRY-RUNとする。
- 監視停止時は未処理キューを破棄し、永続化しない。
- わんコメの旧WebSocket APIへ直接接続しない。
- プラグイン権限は `comments` だけにする。
- `com.kaz.pavlok-superchat` は永続設定とURLに関わるため、明示的な依頼なしに変更しない。

## セキュリティと実機操作

- トークン、認証情報、コメント本文をソース、ログ、テスト、配布物へ含めない。
- Pavlok初期トークンはElectronの `safeStorage` で暗号化し、暗号化できない環境では保存を拒否する。
- デフォルト設定は実機送信OFFを維持する。
- ユーザーの明示的な許可なしにPavlok実機へ送信しない。
- 通常の検証ではモックまたはDRY-RUNを使う。

## 実装方針

- 既存のCommonJS構成と、セミコロンを使わない現在のコードスタイルに合わせる。
- UIからPavlok APIやコメント取得処理を直接実行しない。
- 仕様変更には対応するテストを追加または更新する。
- 無関係な整形、命名変更、リファクタリングを同じ変更へ混ぜない。
- 作業開始時に `git status --short` を確認し、既存の未コミット変更を保持する。

## 作業完了時

- 変更内容に応じた検証を行い、`git diff` と `git status --short` で最終差分を確認する。
- 今回の作業で変更したファイルだけをステージし、内容が分かるコミットメッセージでコミットする。
- コミット後、現在のブランチを通常のpushでリモートへ送信する。force pushは、ユーザーから明示的に依頼された場合を除いて行わない。
- 認証、ネットワーク、競合などでコミットまたはpushできない場合は、理由と未完了の操作を報告する。
- 最終コメントでは、変更内容、検証結果、コミット、push結果を日本語で簡潔に要約する。
- ユーザーからコミットまたはpushを行わないよう指示された場合は、その指示を優先する。

## 検証

変更後は可能な範囲で次を実行します。

```powershell
npm test
git diff --check
```

さらに、変更内容に応じて次を確認します。

- Super Chat以外が対象外になること。
- JPY以外と未登録金額が対象外になること。
- 抽選があたり1枠、確変1枠、はずれ4枠の6等分であること。
- FIFO、待機時間、確変2回を含む電撃間のクールダウンが維持されること。
- PavlokのDRY-RUNではPavlok APIへ送信しないこと。
- WordParty連携OFFではWordParty APIへ送信せず、ONではあたり・確変・はずれ1～4の各枠に対応する演出を1回実行すること。
- WordParty APIが失敗しても再実行せず、Pavlokの電撃処理が継続すること。
- 401/403や通信失敗で同じ電撃を再送しないこと。
- 手動実行が監視中に拒否されること。

Node.jsやnpmが利用できずテストを実行できない場合は、未実行理由を最終報告へ明記してください。

## バージョン更新

リリース番号を変更するときは、少なくとも次の値を一致させます。

- `VERSION.txt`
- `package.json` の `version`
- `plugin.js` の `VERSION`
- `index.html` の画面表示
- `README.md` のバージョン表示
- `CODEX_SPEC_PavlokOneComme.md` の現行基準
- `更新履歴.md` の最新項目

## 配布物の作成

配布版はルートのソースから `scripts/build-release.ps1` で生成し、`dist` 内だけを直接修正しないでください。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-release.ps1
```

配布対象は許可リスト方式とし、次のファイルだけを `dist/pavlok-onecomme-plugin/` へ含めます。

```text
app.js
index.html
LICENSE
package.json
plugin.js
README.md
style.css
VERSION.txt
更新履歴.md
```

ZIPは `PavlokOneComme-Plugin-v<version>.zip` とし、展開時の最上位が `pavlok-onecomme-plugin` フォルダーになるようにします。

- `AGENTS.md`、`CODEX_SPEC_*.md`、`scripts/`、`test/`、`debug/`、Git管理ファイル、ログ、トークンは配布物へ含めない。
- 配布前にソースと展開版のハッシュが一致することを確認する。
- ZIPを展開または読み取り、ファイル構成、バージョン、製作者名、UIDを確認する。
- 配布物内に旧製作者名や秘密情報が残っていないことを検索する。
