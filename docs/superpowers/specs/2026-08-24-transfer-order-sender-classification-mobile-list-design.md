# Thiết kế Sender, phân loại DG/GTC và danh sách TO compact trên mobile

## Mục tiêu

Cải thiện bảng kết quả Transfer Order (TO) theo ba hướng liên quan:

- hiển thị trường `sender` mặc định ở desktop và mobile;
- phân loại mỗi TO vào đúng một nhóm `NORMAL`, `DG`, `GTC` hoặc `DG & GTC` để các chỉ số không đếm chồng;
- thay card TO lớn trên mobile bằng danh sách compact để người dùng xem được nhiều kết quả hơn trên một màn hình.

Thay đổi áp dụng cho dữ liệu TO đã đóng ở trang check sót nội tỉnh, check sót ngoại tỉnh, chi tiết Overview nội tỉnh và các tổng hợp packed của Overview. Thống kê hàng xá lẻ không nằm trong phạm vi vì đó là đơn chưa thuộc TO.

## Quy tắc phân loại

Một utility thuần sẽ xác định loại của TO từ hai trường hiện có:

- TO có DG khi `dg_type` chứa ít nhất một giá trị khác `1`, giữ nguyên quy tắc `isDgType` hiện tại.
- TO có GTC khi `high_value === 1`.

Kết quả phân loại loại trừ nhau:

| Có DG | Có GTC | Phân loại |
|---|---|---|
| Không | Không | `NORMAL` |
| Có | Không | `DG` |
| Không | Có | `GTC` |
| Có | Có | `DG & GTC` |

`PackedOrderMetrics` tiếp tục có tổng số kiện và được mở rộng thành ba bộ đếm loại trừ nhau:

- `dgBagCount`: số TO chỉ có DG;
- `gtcBagCount`: số TO chỉ có GTC;
- `dgAndGtcBagCount`: số TO đồng thời DG và GTC.

Một TO không được tăng nhiều hơn một trong ba bộ đếm. TO `NORMAL` không tăng bộ đếm đặc biệt nào.

## Bảng TO desktop

`TOTable` thêm hai định nghĩa cột ở cấp cấu hình:

- `sender`, nhãn `Điểm gửi (Sender)`;
- `classification`, nhãn `Phân loại`.

Cột `sender` nằm ngay trước `Điểm đến (Des)`. Hai cột cũ `high_value` và `dg_type` được thay bằng một cột `classification` để mỗi dòng chỉ hiển thị một badge:

- `NORMAL`: badge trung tính;
- `DG`: badge cảnh báo;
- `GTC`: badge lỗi hoặc màu nhấn giá trị cao;
- `DG & GTC`: badge riêng có độ tương phản rõ và không trùng với ba trạng thái còn lại.

`sender` và `classification` hiển thị mặc định nhưng vẫn có thể tắt trong menu `Tùy chọn cột`. Tìm kiếm nhanh bổ sung `sender` vào các trường được dò, bên cạnh mã TO, người đóng, điểm đến và tên bao.

## Tương thích tùy chọn cột đã lưu

Tùy chọn cột hiện tại được lưu dưới dạng mảng chưa có phiên bản. Nếu chỉ thêm cột mới vào hằng số mặc định, người dùng đã từng mở bảng sẽ không thấy `sender`. Vì vậy cấu trúc lưu được nâng lên schema phiên bản 2:

```json
{
  "version": 2,
  "columns": ["to_number", "operator", "classification", "sender", "route"]
}
```

Khi đọc dữ liệu cũ dạng mảng:

1. loại bỏ `high_value` và `dg_type`;
2. thêm `classification` nếu ít nhất một trong hai cột cũ từng hiển thị;
3. thêm `sender` mặc định;
4. giữ nguyên thứ tự hợp lệ còn lại theo thứ tự chuẩn của `TABLE_COLUMNS`;
5. ghi lại schema phiên bản 2 ở lần lưu tiếp theo.

Khi đã ở phiên bản 2, hệ thống tôn trọng hoàn toàn việc người dùng ẩn `sender` hoặc `classification`; chúng không bị tự động thêm lại.

Dữ liệu localStorage lỗi, sai kiểu hoặc có phiên bản không hỗ trợ sẽ quay về danh sách cột mặc định thay vì làm hỏng component.

## Danh sách TO compact trên mobile

Ở breakpoint dưới `md`, `TransferOrderCard` được thay bằng một hàng compact có đường phân cách. Không dùng surface/card riêng cho từng TO và không tạo accordion.

Mỗi hàng có hai vùng chính:

1. Dòng đầu hiển thị mã TO, một badge phân loại duy nhất và nút QR cỡ chạm tối thiểu 44px.
2. Dòng sau ưu tiên tuyến `Sender → Điểm đến`, số kiện, khối lượng và thời gian hoàn tất ở dạng rút gọn.

Các metadata phụ như người đóng, tên bao và trạng thái chỉ xuất hiện khi cột tương ứng đang bật. Chúng được trình bày dưới dạng văn bản ngắn phân cách bằng dấu chấm giữa, không dựng các ô metric hoặc khối card con. Nội dung dài được phép xuống dòng có kiểm soát và không tạo cuộn ngang cho toàn trang.

Quy tắc ẩn/hiện cột vẫn được tôn trọng:

- ẩn `sender` thì tuyến chỉ còn điểm đến;
- ẩn `route` thì chỉ còn sender nếu sender đang bật;
- ẩn `classification` thì không render badge;
- ẩn `action` thì không render nút QR;
- nếu toàn bộ nội dung liên quan bị ẩn, không render một hàng rỗng.

Mục tiêu mật độ là khoảng 72–96px cho mỗi TO ở cấu hình mặc định, thấp hơn đáng kể so với card hiện tại nhưng vẫn giữ vùng chạm an toàn và copy dễ đọc.

## Thống kê TO và Overview nội tỉnh

Banner thống kê của `TOTable` thêm chỉ số `DG & GTC`. Hai chỉ số `DG` và `GTC` đổi sang ý nghĩa loại trừ nhau theo utility phân loại chung.

Overview nội tỉnh mở rộng dữ liệu tổng:

- thêm `packedDgAndGtc` vào `OverviewTotals`;
- thêm chỉ số `Bao DG & GTC` ở khu vực summary;
- bảng desktop thêm cột `DG & GTC` trong nhóm `Hàng đã đóng bao`;
- bảng mobile hiển thị chuỗi compact `DG x · GTC y · Cả hai z`;
- footer tổng hợp dùng đúng ba bộ đếm loại trừ nhau.

Dữ liệu stale, refresh theo Hub, concurrency và cooldown không thay đổi.

## Luồng dữ liệu

API và parser Transfer Order không thay đổi vì response hiện đã chứa `sender`, `high_value` và `dg_type`.

Luồng xử lý sau thay đổi:

1. API trả danh sách `TransferOrder`.
2. Utility phân loại xác định đúng một loại cho từng TO.
3. `summarizePackedOrders` cộng số kiện và ba nhóm đặc biệt loại trừ nhau.
4. `TOTable` dùng cùng utility để render badge từng dòng.
5. Overview dùng metrics đã tổng hợp cho từng Hub và toàn bộ Hub.

Việc dùng chung một utility tránh trường hợp giao diện hiển thị `DG & GTC` nhưng phần tổng lại đếm theo quy tắc khác.

## Xử lý lỗi và dữ liệu thiếu

- `sender` rỗng hiển thị `---` ở desktop và `Chưa rõ điểm gửi` ở tuyến compact mobile.
- `receiver` rỗng giữ fallback hiện có.
- `dg_type` thiếu hoặc rỗng được xem là không DG.
- `high_value` khác `1` được xem là không GTC.
- Số lượng thiếu tiếp tục được tổng hợp là `0` theo hành vi hiện tại.
- Tùy chọn cột localStorage không hợp lệ quay về mặc định an toàn.

## Kiểm thử

Test utility cần bao phủ:

- `NORMAL`: không DG, không GTC;
- `DG`: DG nhưng không GTC;
- `GTC`: GTC nhưng không DG;
- `DG & GTC`: đồng thời có DG và GTC;
- mỗi TO chỉ tăng đúng một bộ đếm đặc biệt;
- tổng số kiện không đổi;
- dữ liệu thiếu dùng fallback an toàn.

Test component hoặc contract tĩnh cần xác nhận:

- `TABLE_COLUMNS` chứa `sender` và `classification` theo đúng thứ tự;
- không còn hai cột hiển thị độc lập `high_value` và `dg_type`;
- tìm kiếm bao gồm `sender`;
- migration từ mảng cũ thêm `sender`, chuyển DG/GTC sang `classification` và không thêm lại cột đã bị ẩn trong schema v2;
- Overview có bộ đếm và nhãn `DG & GTC`;
- danh sách mobile dùng layout compact và vẫn có hành động QR.

Cuối cùng chạy toàn bộ `npm test`, `npm run lint` và `npm run build`. Build Apps Script chỉ được đồng bộ sang `gas/index.html` khi người dùng yêu cầu đóng gói/deploy; thay đổi source không tự ý ghi đè artifact deploy đang được theo dõi.

## Tiêu chí hoàn tất

1. Sender hiển thị mặc định ở bảng desktop và tuyến mobile, có thể ẩn bằng tùy chọn cột.
2. Một TO chỉ thuộc `NORMAL`, `DG`, `GTC` hoặc `DG & GTC`.
3. Các chỉ số DG, GTC và DG & GTC không đếm chồng.
4. Overview và bảng TO dùng cùng quy tắc tổng hợp.
5. Mobile không còn card lớn cho từng TO và xem được nhiều TO hơn mà không mất hành động QR.
6. Tùy chọn cột cũ được migration an toàn.
7. Test, lint và build đạt.
