# Pavlok Super Chat Controller for わんコメ

バージョン1.0.0 / わんコメ5.2以降 / Windows

わんコメが取得したYouTubeのSuper Chatを検出し、設定金額と完全一致したときにPavlokへZapを送るプラグインです。YouTube APIキーやGoogle OAuth設定は不要で、限定配信の取得可否はわんコメ側のログイン状態に従います。

## 対象と安全上のルール

- YouTubeの`giftType=superchat`だけが対象です。通常コメント、Super Sticker、メンバーシップ、ギフトは対象外です。
- 通貨はJPY固定、金額は整数円の完全一致です。
- Pavlok刺激はZap固定、出力は1～100です。
- 対象イベントは到着順にFIFO予約します。クールダウン中も破棄せず後で実行します。
- Pavlok送信は1回だけです。失敗した同じZapを自動再送しません。
- 401/403ではPavlok tokenだけを更新し、失敗したZapは再送しません。新しいtokenは次の予約から使用します。
- 監視停止時は未処理予約を破棄し、永続化しません。
- Pavlok初期トークンはElectronのOS暗号化機能で暗号化保存します。暗号化が使えない環境では保存を拒否します。
- 監視停止中は、1～100の出力値を指定して手動Zapテストを1回実行できます。実機送信OFFではDRY-RUNになります。

## インストール

1. わんコメを終了します。
2. わんコメ右上メニューの「プラグイン」から「プラグインフォルダ」を開きます。
3. 配布ZIPを展開し、`pavlok-onecomme-plugin`フォルダごと配置します。
4. わんコメを起動し、プラグイン画面で「再読み込み」を押します。
5. `Pavlok Super Chat Controller`を有効にします。
6. 一覧に表示されたURLボタンから設定画面を開きます。

フォルダ構造は次の状態にします。

```text
onecomme\plugins\pavlok-onecomme-plugin\plugin.js
onecomme\plugins\pavlok-onecomme-plugin\index.html
onecomme\plugins\pavlok-onecomme-plugin\app.js
onecomme\plugins\pavlok-onecomme-plugin\style.css
```

公式手順: [わんコメ「プラグインの導入」](https://onecomme.com/docs/feature/plugins/)

## 初回設定

1. 設定画面を開きます。
2. 最初は「実機へZapを送信」をOFFにします。
3. 金額グループ、待機秒数、クールダウンを設定して保存します。
4. 「監視開始」を押します。
5. わんコメのコメントテスターで、サービスをYouTube、ギフト種類をSuper Chat、通貨をJPYにして確認します。
6. ログに`[SUPERCHAT]`、`[MATCH]`、`[DRY-RUN]`が順に出ることを確認します。
7. Pavlok初期トークンを入力し、「実機へZapを送信」をONにして保存します。

Super Stickerでは作動しないこと、対象外金額では`[SKIP]`になることも確認してください。

## 手動Zapテスト

設定画面の「手動Zapテスト」で出力値を1～100から指定し、「手動実行」を押します。未保存の設定は先に保存されます。「実機へZapを送信」がOFFならPavlokへは送信せず、ログへDRY-RUN結果だけを表示します。ONならPavlokへZapを1回送信します。

監視中は手動実行できません。Pavlokが401/403を返した場合はtokenだけを更新し、失敗した手動Zapは再送しません。

## 開始前のSuper Chat

「開始前のSuper Chatを既読扱いにする」はONを推奨します。ONの場合、監視開始前にわんコメが保持していたSuper ChatはZap判定せず、既読にしたSuper Chat件数だけをログへ表示します。OFFの場合は、プラグインが保持中の未処理Super Chatを古い順に予約します。

## 金額グループ

4グループすべてで固定出力・ランダム出力を選べます。使わないグループはOFFにします。最低1つはONが必要です。同じ対象金額を複数の有効グループへ設定できません。

## ログ

設定画面には直近500行を表示します。さらにプラグインフォルダの`logs`へ最大7日・直近10回、1回約1MBまで保存します。トークンやコメント本文は記録しません。

## 配信・利用時の表記

わんコメ公式ドキュメントでは、HTTP APIや連携アプリを無料利用する場合にもクレジット表記が必要と案内されています。配信概要欄などに次の表記を入れてください。

```text
配信コメント取得に「わんコメ」を使用しています。
https://onecomme.com
```

公式資料: [HTTP APIの利用上の注意](https://onecomme.com/docs/developer/http-api/)

## 補足

このプラグインは非公開の旧WebSocket APIへ直接接続しません。わんコメ5.2以降の公開プラグイン機能で`comments`だけを購読します。Pavlokとの通信はプラグインからPavlok公式APIへ直接行います。

開発時の回帰試験はNode.js 20以降で`npm test`を実行します。プラグインを利用するだけならNode.jsの別途インストールは不要です。
