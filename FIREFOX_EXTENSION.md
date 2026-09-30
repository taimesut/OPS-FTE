# OPS FTE Firefox Extension

OPS FTE có thể build thành Firefox WebExtension từ cùng code React với bản userscript.

## Build local

```bash
npm ci
npm run test:firefox
npm run build:firefox
```

Output:

```text
firefox-dist/
  manifest.json
  content.js
  background.js
```

Có thể đóng gói:

```bash
cd firefox-dist
zip -r ../ops-fte-firefox.zip .
```

## Test trên Firefox desktop

1. Mở `about:debugging#/runtime/this-firefox`.
2. Chọn **Load Temporary Add-on...**.
3. Chọn file `firefox-dist/manifest.json`.
4. Mở `https://spx.shopee.vn/`.
5. Nút **OPS FTE** sẽ xuất hiện ở góc màn hình.

Temporary add-on sẽ bị gỡ khi Firefox khởi động lại.

## Bản build từ GitHub Actions

Workflow **Build OPS FTE Firefox extension** tạo artifact gồm:

- `ops-fte-firefox.zip`
- `ops-fte-firefox.xpi`
- thư mục `firefox-dist/`

File XPI trong artifact là gói build chưa ký. Firefox release thông thường yêu cầu add-on được Mozilla ký để cài lâu dài.

## Firefox Android

Để cài ổn định cho team trên Firefox Android, nên đưa extension lên Mozilla Add-ons (AMO), có thể để **Unlisted** nếu chỉ muốn phát nội bộ. Sau khi Mozilla ký, dùng file XPI đã ký để cài/phân phối.

## Firefox iPhone/iPad

Firefox trên iOS/iPadOS không hỗ trợ WebExtension Firefox như desktop/Android. Bản extension này dành cho Firefox desktop và Firefox Android.
