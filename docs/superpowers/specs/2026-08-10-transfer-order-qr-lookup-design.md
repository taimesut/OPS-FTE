# Thiết kế tab tra cứu mã TO và hiển thị QR

## Mục tiêu

Thêm một trang riêng trong ứng dụng để người dùng nhập mã vận đơn SPX, tra cứu `current_to_number` từ API Fleet Order và hiển thị mã TO dưới dạng QR trong modal hiện có.

## Điều hướng

- Thêm route `#/lay-ma-to`.
- Thêm mục `Lấy mã TO` vào menu điều hướng trong `MobileLayout`.
- Mục menu sử dụng icon QR hoặc scan phù hợp với hệ icon Lucide hiện có.
- Không sửa nội dung hoặc hành vi của `HomePage`.

## Giao diện và luồng thao tác

1. Trang hiển thị tiêu đề `Lấy mã Transfer Order` và mô tả ngắn về việc tra cứu TO từ mã đơn.
2. Người dùng nhập mã đơn vào một ô text, ví dụ `SPXVN062072327098`.
3. Người dùng nhấn Enter hoặc nút `Lấy mã TO`.
4. Trong khi gọi API, nút hiển thị loading và bị vô hiệu hóa để tránh gửi lặp.
5. Khi thành công, trang lưu kết quả gần nhất và tự mở `QRCodeModal`.
6. QR mã hóa duy nhất chuỗi `current_to_number`, ví dụ `TO2026081015POF`.
7. Modal hiển thị mã TO và mô tả chứa mã đơn nguồn.
8. Sau khi đóng modal, thẻ kết quả gần nhất vẫn hiển thị mã đơn, mã TO và nút `Hiện lại QR`.

Trang ưu tiên thao tác một tay trên điện thoại, tuân theo hệ thống `app-page`, `PageHeader`, màu và kích thước nút hiện có.

## Contract request

- Method: `POST`.
- Path: `/api/fleet_order/order/tracking_list/search`.
- Request body:

```json
{
  "count": 24,
  "page_no": 1,
  "shipment_id": "SPXVN062072327098"
}
```

Giá trị nhập được `trim()` trước khi gửi. Không ép cứng định dạng hoặc prefix để tránh chặn các mã hợp lệ khác nếu SPX thay đổi quy ước.

Request sử dụng `apiClient` hiện có để tự động đi qua `google.script.run.fetchShopeeApi` khi chạy trong Apps Script và sử dụng Cookie SPX đã lưu trong cấu hình.

## Contract response

Response thành công có dạng:

```json
{
  "retcode": 0,
  "data": {
    "list": [
      {
        "shipment_id": "SPXVN062072327098",
        "current_to_number": "TO2026081015POF"
      }
    ]
  }
}
```

Parser tìm phần tử có `shipment_id` khớp chính xác với mã đã chuẩn hóa. Nếu API không trả phần tử khớp nhưng danh sách chỉ có một phần tử, parser sử dụng phần tử duy nhất đó. Kết quả trả về cho UI gồm:

```ts
interface TransferOrderLookupResult {
  shipmentId: string;
  currentToNumber: string;
}
```

## Tách trách nhiệm

- `src/utils/transferOrderLookup.ts`: hằng số endpoint, tạo payload, parse và xác thực response. File này không chứa React hoặc trạng thái giao diện.
- `src/utils/transferOrderLookupApi.ts`: gọi `apiClient.post` và trả kết quả đã parse.
- `src/pages/LayMaTOPage.tsx`: quản lý input, loading, kết quả, toast và trạng thái modal.
- `src/App.tsx`: đăng ký route mới.
- `src/layouts/MobileLayout.tsx`: thêm mục menu mới.
- `tests/transferOrderLookup.test.ts`: bảo vệ request/response contract.

## Xử lý lỗi

- Input rỗng: không gọi API và hiển thị toast yêu cầu nhập mã đơn.
- Cookie SPX chưa được cấu hình: không gọi API và hướng dẫn người dùng vào Cài đặt.
- `retcode` khác `0`: dùng `message` của API nếu có.
- `data.list` thiếu, không phải mảng hoặc rỗng: báo `Không tìm thấy đơn hàng`.
- Không tìm thấy phần tử khớp trong danh sách nhiều phần tử: báo `Không tìm thấy đơn hàng`.
- `current_to_number` rỗng hoặc thiếu: báo `Đơn hàng chưa có mã TO`.
- Lỗi mạng hoặc proxy: giữ nguyên input, đóng trạng thái loading và để interceptor/toast hiện có thông báo lỗi.
- Một lần tra cứu lỗi không xóa kết quả thành công gần nhất.

## Trạng thái và khả năng truy cập

- Form có label rõ ràng cho ô mã đơn.
- Input dùng `autoCapitalize="characters"`, `autoComplete="off"` và `spellCheck={false}`.
- Nút chính có chiều cao tối thiểu 44px.
- Modal QR dùng component `QRCodeModal` hiện có và có thể đóng bằng hành vi hiện tại.
- QR có độ tương phản đen-trắng do `react-qr-code` hiện có cung cấp.
- Nút gửi có nội dung loading đọc được và không chỉ phụ thuộc vào animation.

## Tiêu chí nghiệm thu

1. Menu hiển thị mục `Lấy mã TO` và mở đúng route mới.
2. Nhập `SPXVN062072327098` tạo đúng payload với `count: 24` và `page_no: 1`.
3. Response mẫu tạo kết quả `TO2026081015POF`.
4. QR modal tự mở và mã hóa đúng chuỗi `current_to_number`.
5. Đóng modal không làm mất kết quả gần nhất; người dùng có thể mở lại QR.
6. Các trường hợp input rỗng, thiếu cookie, API lỗi, không tìm thấy đơn và thiếu TO đều có thông báo rõ ràng.
7. Không ảnh hưởng các route, proxy, kiểm soát email hoặc chức năng check sót hiện có.

## Kiểm thử

- Unit test payload sau khi trim input.
- Unit test parse response mẫu và lấy đúng `current_to_number`.
- Unit test ưu tiên phần tử khớp `shipment_id` trong danh sách nhiều phần tử.
- Unit test các lỗi `retcode`, danh sách rỗng, không có phần tử khớp và thiếu `current_to_number`.
- Chạy toàn bộ test, lint và build.
- QA thủ công trên viewport điện thoại: nhập mã, loading, kết quả gần nhất, mở/đóng/mở lại QR modal.
