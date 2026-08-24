# Thiết kế thông tin VERSION, liên hệ SeaTalk và xóa Cookie

## Mục tiêu

Mở rộng trang chủ và trang Cài đặt theo ba yêu cầu liên quan đến thông tin ứng dụng và vận hành:

- thêm liên hệ SeaTalk trên trang chủ;
- đọc số phiên bản và nội dung cập nhật mới nhất từ sheet `VERSION` của Google Sheet gắn với Apps Script;
- thêm thao tác xóa riêng Cookie SPX mà không làm mất các cấu hình trạm và URL khác.

Thay đổi không tạo endpoint HTTP mới, không thay đổi API Shopee và không tự động ghi đè artifact deploy `gas/index.html` nếu chưa có yêu cầu đóng gói/deploy riêng.

## Nguồn dữ liệu VERSION

Google Apps Script thêm hàm công khai `getAppVersionInfo()` để frontend gọi bằng `google.script.run`.

Hàm đọc spreadsheet hiện hành bằng `SpreadsheetApp.getActiveSpreadsheet()`, lấy sheet tên chính xác `VERSION`, sau đó đọc vùng `A2:B2` bằng `getDisplayValues()`:

- `A2`: số hoặc nhãn phiên bản hiển thị nguyên văn sau khi trim;
- `B2`: nội dung cập nhật mới nhất hiển thị nguyên văn sau khi trim, bao gồm ký tự xuống dòng nếu có.

Kết quả thành công có cấu trúc ổn định:

```ts
interface AppVersionInfo {
  version: string;
  updateContent: string;
}
```

Nếu sheet `VERSION` không tồn tại, không đọc được, hoặc cả A2 và B2 đều trống, backend trả dữ liệu rỗng an toàn thay vì làm trang chủ lỗi. Backend không ghi hoặc tự tạo sheet.

Hàm VERSION không gọi `UrlFetchApp`, không cần Cookie SPX và không đi qua `fetchShopeeApi`. Nó chỉ đọc dữ liệu nội bộ từ spreadsheet hiện hành.

## Cầu nối frontend với Apps Script

Một utility frontend riêng chịu trách nhiệm gọi `google.script.run.getAppVersionInfo()` và chuẩn hóa kết quả. Utility này không dùng `apiClient`, vì adapter hiện tại luôn định tuyến sang `fetchShopeeApi` dành cho API Shopee.

Utility trả `Promise<AppVersionInfo | null>`:

- trả dữ liệu đã trim khi response đúng kiểu;
- trả `null` khi không chạy trong môi trường Google Apps Script, response sai kiểu hoặc lời gọi thất bại;
- không phát toast toàn cục vì thông tin phiên bản là nội dung bổ trợ, không được làm gián đoạn trải nghiệm trang chủ.

Ranh giới này giữ logic tích hợp Apps Script khỏi component và cho phép test độc lập việc chuẩn hóa response/fallback.

## Trang chủ

Trang chủ giữ surface giới thiệu hiện tại và bổ sung hai vùng:

### Liên hệ SeaTalk

Thêm một nút liên hệ SeaTalk trong nhóm hành động liên hệ, dùng URL cố định:

`https://link.seatalk.io/profile/open?seatalk_id=1386905313`

Nút mở tab mới, dùng `target="_blank"` và `rel="noreferrer"`, có nhãn rõ ràng `Liên hệ SeaTalk`. Biểu tượng dùng Lucide hoặc biểu tượng SVG phù hợp với hệ icon hiện có, không dùng emoji.

### Phiên bản và nội dung cập nhật

Khi `HomePage` mount, component gọi utility VERSION đúng một lần. Trạng thái hiển thị:

- đang tải: một dòng trạng thái nhẹ `Đang tải thông tin phiên bản...`;
- có ít nhất một giá trị hợp lệ: hiển thị `Phiên bản {version}` nếu A2 có dữ liệu và phần `Nội dung cập nhật` nếu B2 có dữ liệu;
- thiếu sheet, lỗi gọi hoặc cả A2/B2 trống: hiển thị `Chưa có thông tin phiên bản`.

Nếu chỉ một ô có dữ liệu, trang chủ vẫn hiển thị phần có dữ liệu và không tạo nhãn rỗng cho phần còn lại. Nội dung B2 dùng `whitespace-pre-wrap` và `overflow-wrap` để giữ xuống dòng nhưng không gây cuộn ngang trên mobile.

Thông tin VERSION là nội dung đọc-only; trang chủ không có nút sửa hoặc tải lại thủ công.

## Xóa riêng Cookie trong Cài đặt

Khu vực `2. Cookie Shopee Express` thêm nút `Xóa Cookie`. Nút chỉ khả dụng khi cookie đang có trong ô nhập hoặc trong cấu hình đã lưu.

Khi bấm:

1. hiển thị xác nhận `Bạn có chắc chắn muốn xóa Cookie SPX đã lưu?`;
2. nếu hủy, không thay đổi state hoặc localStorage;
3. nếu xác nhận, đọc cấu hình mới nhất bằng `getConfigs()`;
4. lưu lại toàn bộ object cấu hình với duy nhất `cookies: ""`;
5. đặt state `cookies` của form thành chuỗi rỗng;
6. hiển thị toast `Đã xóa Cookie SPX. Các cấu hình khác được giữ nguyên.`.

Thao tác có hiệu lực ngay, không yêu cầu bấm `Lưu Cài Đặt`. Các trường sau phải được giữ nguyên tuyệt đối: SOC/ID, Hub/ID, SOC ngoại tỉnh/ID, nhóm SOC, URL log, proxy URL, scanner URL và mọi thuộc tính cấu hình hợp lệ khác hiện có.

Logic cập nhật riêng Cookie được đặt trong utility cấu hình thay vì tự thao tác `localStorage` rải rác trong component. Hàm sử dụng giao diện sau:

```ts
export const clearCookies = (): AppConfig => {
  const nextConfig = { ...getConfigs(), cookies: "" };
  saveConfigs(nextConfig);
  return nextConfig;
};
```

Nút `Xóa` hiện có ở action bar tiếp tục giữ hành vi xóa toàn bộ cài đặt và được đổi nhãn thành `Xóa toàn bộ` để tránh nhầm với nút xóa riêng Cookie.

## Xử lý lỗi

- Sheet `VERSION` thiếu: trả fallback rỗng, trang chủ hiển thị `Chưa có thông tin phiên bản`.
- A2/B2 có kiểu số, ngày hoặc công thức: `getDisplayValues()` bảo toàn chuỗi đang hiển thị trong Sheet.
- Response Apps Script sai kiểu hoặc lời gọi thất bại: frontend trả `null`, không toast lỗi.
- Frontend chạy local/Vite, không có `google.script.run`: hiển thị fallback, không ném lỗi.
- localStorage đọc lỗi khi xóa Cookie: dùng fallback hiện có của `getConfigs`; lỗi ghi sẽ được bắt ở handler và hiển thị toast lỗi, không báo xóa thành công.
- Người dùng hủy confirm: không ghi localStorage.

## Kiểm thử

### Apps Script và utility VERSION

- đọc đúng sheet `VERSION` và vùng `A2:B2`;
- trả đúng `version` và `updateContent` từ display values;
- giữ nội dung cập nhật nhiều dòng;
- sheet thiếu hoặc lỗi đọc trả dữ liệu rỗng an toàn;
- frontend wrapper chuẩn hóa response hợp lệ và fallback khi không có Apps Script.

### Cài đặt

- `clearCookies()` đưa `cookies` về chuỗi rỗng;
- các trường cấu hình khác không đổi;
- hủy confirm không gọi `clearCookies`;
- xác nhận xóa đồng bộ cả localStorage và state form;
- nút bị vô hiệu hóa khi không có Cookie để xóa.

### Trang chủ và regression

- SeaTalk dùng đúng URL và thuộc tính mở tab an toàn;
- trang chủ có ba trạng thái loading, dữ liệu và fallback;
- nội dung cập nhật hỗ trợ xuống dòng và không tạo horizontal overflow;
- chạy test liên quan, `npm test`, `npm run lint` và `npm run build`;
- hai lỗi baseline access-control do override `allowed: true` trong `gas/code.gs`, nếu vẫn còn, được báo riêng và không được sửa ngoài phạm vi.

## Tiêu chí hoàn tất

1. Trang chủ có nút SeaTalk mở đúng profile đã cung cấp.
2. Trang chủ đọc A2/B2 từ sheet `VERSION` qua Apps Script và hiển thị phiên bản/nội dung cập nhật.
3. Dữ liệu VERSION thiếu hoặc lỗi hiển thị `Chưa có thông tin phiên bản`.
4. Nút `Xóa Cookie` yêu cầu xác nhận, có hiệu lực ngay và không làm mất cấu hình khác.
5. Giao diện hoạt động trên mobile/desktop, có nhãn truy cập và vùng chạm phù hợp.
6. Test mới, lint và build đạt; không tự ý đồng bộ artifact deploy.
