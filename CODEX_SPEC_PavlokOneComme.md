# PavlokOneComme 開発仕様

現行基準はv1.0.0です。わんコメ5.2以降の公開プラグイン機能を利用します。

## 責務分離

- `plugin.js`: コメント選別、設定検証、監視状態、FIFO予約、Pavlok認証・送信、ログ保存。
- `index.html` / `app.js` / `style.css`: 設定画面。Pavlokやコメント取得処理を直接実行しない。
- わんコメ: 配信サイトへの接続とコメント取得。限定配信のログインもわんコメ側の責務。

## 変更禁止の基準

- 対象は`service=youtube`かつ`hasGift=true`かつ`giftType=superchat`のみ。
- JPY固定、整数円の金額完全一致。
- Pavlokはzap固定、出力1～100。
- 対象イベントはすべてFIFO予約。クールダウン中の予約を破棄しない。
- Pavlok送信失敗時、同一Zapを自動再送しない。
- 401/403時はtokenのみ更新し、失敗Zapは再送しない。
- 手動Zapは監視停止中だけ実行可能とし、実機送信OFFではDRY-RUNにする。
- 手動Zapも送信は1回だけとし、401/403時に失敗したZapを再送しない。
- 停止時に未処理キューを破棄し、永続化しない。
- トークンをソース・配布ZIP・平文設定へ保存しない。

## わんコメ連携

- 旧WebSocket APIへ直接接続しない。
- プラグインの要求権限は`comments`だけとする。
- 金額はYouTubeコメントの`data.price`、通貨は`data.currency`を使う。旧版互換として`data.unit`を通貨の予備値にする。
- Super Stickerやメンバーシップを`hasGift`だけで判定しない。

## 未確認事項

- 実際のわんコメへのインストールとコメントテスター受信。
- Electron `safeStorage`をわんコメプラグイン環境から使用できること。
- Pavlok実機へのHTTP 200送信。

実機確認まではDRY-RUNを初期値とし、上記を確認してから公開版とすること。
