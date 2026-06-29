# GitHub Pages へ公開する手順

この `web/` フォルダの中身がそのまま静的サイト。サーバー不要・無料・HTTPS自動。

## 最短手順（gh CLI）
```bash
cd mushi-atlas/web
git init -b main
git add .
git commit -m "ムシアトラス ランディング（蝶・トンボ分布シフト集合知）"
gh repo create mushi-atlas --public --source=. --remote=origin --push
```
→ GitHub の Settings → Pages → Source を **main / (root)** にする
（または: `gh api -X POST repos/<ユーザー>/mushi-atlas/pages -f source.branch=main -f source.path=/`）

数分後に公開：**https://<ユーザー>.github.io/mushi-atlas/**

## リポジトリ名を変えるなら（URLの直し場所）
`mushi-atlas` 以外にする場合、以下の **URL を1か所ずつ** 合わせる：
- `web/index.html` … canonical / og:url / og:image / twitter:image / JSON-LD の url
- `web/robots.txt` … Sitemap 行
- `web/sitemap.xml` … `<loc>`

## データ更新のたびに
種・記録を更新したら：
```bash
python export_web.py    # web/data.js を再生成
python make_og.py       # 共有画像 og.png を更新（任意）
cd web && git add -A && git commit -m "data update" && git push
```

## 独自ドメインを足すとき（信頼性が要る段階で）
1. Cloudflare Registrar か Porkbun でドメイン取得（年1,000〜1,500円）。
2. `web/CNAME` ファイルを作り中身を `example.com`（取得ドメイン）に。
3. DNS：`CNAME`（www）→ `<ユーザー>.github.io`／apexは GitHub の A レコード4つ。
4. Settings → Pages → Custom domain にドメイン入力 → Enforce HTTPS。
※レンタルサーバーは不要。GitHub Pages のまま独自ドメイン＋無料HTTPSで動く。

## 公開後のSEO初期作業
- Google Search Console にプロパティ追加 → `sitemap.xml` を送信。
- X / Facebook のOGデバッガで `og:image` のプレビュー確認（共有時の見栄え＝拡散の要）。
- 注意：薄い自動生成ページの量産はGoogleに評価されない（やらない）。
  伸ばすなら「ツマグロヒョウモンの北上」等、実検索意図に合う中身のある記事を少数だけ。
