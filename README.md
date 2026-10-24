# Pavlok Super Chat Controller for わんコメ

バージョン1.2.0 / わんコメ5.2以降 / Windows

わんコメが取得したYouTubeのSuper Chatを検出し、設定した1つの金額と完全一致したときに6枠のびりびり抽選を行うプラグインです。抽選結果に応じてPavlokの電撃とWordParty演出を実行できます。YouTube APIキーやGoogle OAuth設定は不要で、限定配信の取得可否はわんコメ側のログイン状態に従います。

## 対象と安全上のルール

- YouTubeの`giftType=superchat`だけが対象です。通常コメント、Super Sticker、メンバーシップ、ギフトは対象外です。
- 通貨はJPY固定、対象金額は1つだけ設定でき、整数円の完全一致で判定します。
- 抽選は6枠均等です。あたり1枠は電撃1回、確変1枠は電撃2回、はずれ4枠は電撃なしです。
- WordParty連携では、あたり・確変・はずれ1～4の6枠に設定した別々の演出をそれぞれ1回実行します。
- Pavlok刺激は電撃固定、出力は1～100です。
- 対象イベントは到着順にFIFO予約します。クールダウン中も破棄せず後で実行します。
- 予定した電撃はそれぞれ1回だけ送信し、失敗した電撃を自動再送しません。確変の途中で失敗した場合は残りを送信しません。
- 401/403ではPavlok tokenだけを更新し、失敗した電撃と同じ抽選結果の残りは送信しません。新しいtokenは次の予約から使用します。
- 監視停止時は未処理予約を破棄し、永続化しません。
- WordParty演出の失敗は自動再実行せず、Pavlokの電撃処理は継続します。
- Pavlok初期トークンはElectronのOS暗号化機能で暗号化保存します。暗号化が使えない環境では保存を拒否します。
- 監視停止中は、1～100の出力値を指定して手動電撃テストを1回実行できます。実機送信OFFではDRY-RUNになります。

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
2. 最初は「実機へ電撃を送信」をOFFにします。
3. びりびり対象金額、出力、待機秒数、クールダウンを設定して保存します。
4. WordPartyも使う場合は、下記の手順で6枠分の演出IDを設定します。
5. 「監視開始」を押します。
6. わんコメのコメントテスターで、サービスをYouTube、ギフト種類をSuper Chat、通貨をJPYにして確認します。
7. ログに`[SUPERCHAT]`、`[MATCH]`、`[LOTTERY]`が順に出ることを確認します。当選時はさらに`[DRY-RUN]`が表示されます。WordParty連携ONでは`[WORDPARTY]`も表示されます。
8. Pavlok初期トークンを入力し、「実機へ電撃を送信」をONにして保存します。

Super Stickerでは作動しないこと、対象外金額では`[SKIP]`になることも確認してください。

## 手動電撃テスト

設定画面の「手動電撃テスト」で出力値を1～100から指定し、「手動実行」を押します。未保存の設定は先に保存されます。「実機へ電撃を送信」がOFFならPavlokへは送信せず、ログへDRY-RUN結果だけを表示します。ONならPavlokへ電撃を1回送信します。

監視中は手動実行できません。Pavlokが401/403を返した場合はtokenだけを更新し、失敗した手動電撃は再送しません。

## 開始前のSuper Chat

「開始前のSuper Chatを既読扱いにする」はONを推奨します。ONの場合、監視開始前にわんコメが保持していたSuper Chatは電撃判定せず、既読にしたSuper Chat件数だけをログへ表示します。OFFの場合は、プラグインが保持中の未処理Super Chatを古い順に予約します。

## びりびり抽選

びりびり対象金額は1つだけ設定できます。対象金額と完全一致するSuper Chatごとに、次の6枠から均等に1枠を抽選します。

- あたり1枠: 電撃1回
- 確変1枠: 電撃2回
- はずれ4枠: 電撃なし

電撃出力は固定または指定範囲内のランダムを選べます。確変の2回は共通クールダウン秒数を挟みます。DRY-RUNでも同じ抽選と待機を再現します。

## WordParty連携

1. わんコメのWordPartyで「あたり」「確変」「はずれ1」「はずれ2」「はずれ3」「はずれ4」の6つの演出を用意します。
2. 各演出の編集画面上部に表示される8文字のIDをコピーします。6枠には別々のIDが必要です。
3. プラグイン設定画面の各演出IDへ貼り付けます。
4. 「抽選結果に応じてWordParty演出を実行」をONにして保存します。
5. OBSへWordPartyテンプレートを追加し、演出を表示できる状態にします。

プラグインは抽選後にローカルAPIの`POST http://localhost:11180/api/wordparty/{演出ID}`を呼び出します。あたり、確変、4つのはずれはそれぞれ別の演出IDに対応し、選ばれた1枠の演出を1回だけ実行します。WordParty連携はPavlokの実機送信設定とは独立しているため、PavlokがDRY-RUNでもWordParty連携がONなら演出は実行されます。WordPartyがHTTPエラーまたは通信エラーになった場合は再実行せず、同じ抽選のPavlok処理は止めません。

API実行ではWordParty側で無効にしている演出も実行されるため、使用しないときはプラグイン側のWordParty連携をOFFにしてください。WordParty API対応版のわんコメ（最新版推奨）を使用してください。

公式資料: [WordParty演出編集](https://onecomme.com/docs/feature/wordparty-editor/) / [WordParty PonKit](https://onecomme.com/docs/feature/wordparty-ponkit/) / [HTTP API](https://onecomme.com/docs/developer/http-api/)

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

このプラグインは非公開の旧WebSocket APIへ直接接続しません。わんコメ5.2以降の公開プラグイン機能で`comments`だけを購読します。Pavlokとの通信はプラグインからPavlok公式APIへ、WordParty演出はわんコメのローカルHTTP APIへ送ります。

開発時の回帰試験はNode.js 20以降で`npm test`を実行します。プラグインを利用するだけならNode.jsの別途インストールは不要です。
