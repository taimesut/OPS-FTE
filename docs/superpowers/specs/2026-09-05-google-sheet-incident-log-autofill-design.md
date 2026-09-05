# Thiết kế Google Sheet nhận log và tự điền biên bản sự vụ

## Mục tiêu

Mở rộng luồng “Tạo Biên Bản Sự Vụ LH TRIP” để userscript gửi đầy đủ dữ liệu chuyến và danh sách sự vụ tới Google Apps Script. Apps Script lưu một bản ghi kiểm tra được bằng mắt tại sheet `LogSutVu`; khi người dùng nhập mã LH Trip vào `Biên bản sự vụ!L3`, mẫu biên bản tự lấy bản ghi mới nhất và điền thông tin chuyến cùng toàn bộ bảng sự vụ.

## Phạm vi

- Nâng payload gửi log của userscript từ hai chuỗi lên schema có cấu trúc, đồng thời giữ hai field cũ.
- Làm cứng endpoint `doPost(e)` để validate và chỉ ghi vào `LogSutVu`.
- Tự tạo hoặc nâng cấp hàng tiêu đề `LogSutVu` mà không làm mất dữ liệu hai cột cũ.
- Thêm `onEdit(e)` cho đúng ô `Biên bản sự vụ!L3`.
- Tìm bản ghi mới nhất của LH Trip và điền thông tin chuyến.
- Parse danh sách sự vụ có cấu trúc; hỗ trợ fallback log chuỗi cũ.
- Điền toàn bộ số mã sự vụ, kể cả khi nhiều hơn 30 dòng mặc định.
- Thêm kiểm thử Node cho payload frontend và logic Apps Script.
- Bundle lại Apps Script và userscript.

Không dùng `trip_station` và không gọi SPX API từ Apps Script.

## Payload userscript

Userscript tiếp tục gửi request `POST` với `Content-Type: text/plain` và `mode: no-cors` tới URL Web App đã cấu hình. Body là JSON theo schema:

```json
{
  "schemaVersion": 1,
  "lhTrip": "LT0Q944WOQG72",
  "incidentLogs": "SPXVN001@Rách + Thiếu#TO2026ABC@Dư",
  "soc": "Pleiku SOC",
  "createdAt": "2026-09-05T11:00:00.000Z",
  "trip": {
    "id": 296766439,
    "tripNumber": "LT0Q944WOQG72",
    "tripName": "20260904TC17:30_QL14_._HYenSOC02",
    "tripDate": 1788454800,
    "tripTypeName": "By Land",
    "tripSource": 0,
    "costType": 1,
    "driverName": "Quốc Tuấn - Phan Thanh Tùng",
    "secondDriverName": "",
    "vehicleNumber": "29E-259.57",
    "vehicleTypeName": "Truck_8T60m3",
    "agencyName": "Quốc Tuấn",
    "sealCodes": [],
    "remark": "",
    "operator": "operator@spxexpress.com",
    "expectedQuantity": 68
  },
  "incidents": [
    {
      "code": "SPXVN001",
      "reasons": ["Rách", "Thiếu"]
    },
    {
      "code": "TO2026ABC",
      "reasons": ["Dư"]
    }
  ]
}
```

### Quy tắc payload

- `schemaVersion` phải bằng số `1`.
- `lhTrip` được trim, viết hoa và không được trống.
- `incidentLogs` vẫn dùng định dạng `Mã@Lý do + Lý do#Mã@Lý do` để tương thích dữ liệu cũ.
- `createdAt` do trình duyệt tạo để lưu thời điểm lập; Apps Script vẫn ghi thêm timestamp máy chủ lúc nhận.
- `trip.id` phải là số nguyên dương.
- `trip.tripNumber` phải khớp `lhTrip` sau chuẩn hóa.
- `incidents` phải là mảng; mỗi `code` không trống và mỗi `reasons` chỉ chứa các giá trị `Rách`, `Bung seal`, `Không TO`, `Thiếu`, `Bể vỡ`, `Dư`, `Khác`.
- Userscript gửi dữ liệu đang có từ `detail_v2` và kết quả `list_v2`; không gửi Cookie hoặc dữ liệu `trip_station`.
- Parser `detail_v2` được mở rộng để giữ `tripSource` và `costType` dưới dạng số hoặc `null`.

## Cấu trúc sheet `LogSutVu`

Sheet `LogSutVu` dùng 16 cột:

| Cột | Tiêu đề | Nội dung |
|---|---|---|
| A | `LH TRIP` | Mã LH Trip chuẩn hóa |
| B | `Đơn sự vụ` | Chuỗi log tương thích cũ |
| C | `Thời gian nhận` | Timestamp do Apps Script tạo |
| D | `SOC` | SOC hiện tại từ cấu hình userscript |
| E | `Trip ID` | ID chuyến |
| F | `Trip Name` | Tên chuyến |
| G | `Trip Date` | Ngày chạy chuyến |
| H | `Trip Type` | Loại chuyến |
| I | `Vehicle Plate` | Biển số xe |
| J | `Vehicle Type` | Loại xe |
| K | `Driver` | Tài xế chính |
| L | `Helper` | Tài xế phụ/helper |
| M | `Agency` | Nhà xe |
| N | `Seal` | Danh sách seal nối bằng `, ` |
| O | `Expected Quantity` | Tổng kiện dự kiến khi API cung cấp |
| P | `Payload JSON` | Toàn bộ payload schema 1 |

### Tương thích dữ liệu cũ

- Hai cột A/B giữ nguyên tên và vị trí hiện tại.
- Nếu `LogSutVu` đã có hàng tiêu đề hai cột, Apps Script chỉ bổ sung C:P.
- Không di chuyển hoặc xóa các dòng log cũ.
- Khi lookup gặp dòng cũ không có `Payload JSON`, Apps Script parse cột B để điền bảng sự vụ; phần thông tin chuyến không có trong log cũ được để trống.

## Xử lý `doPost(e)`

### Luồng thành công

1. Đọc `e.postData.contents` và parse JSON.
2. Validate payload schema 1; cho phép payload legacy chỉ có `lhTrip` và `incidentLogs` trong giai đoạn tương thích.
3. Lấy document lock bằng `LockService.getDocumentLock()` trước khi thay đổi sheet.
4. Lấy sheet `LogSutVu`; nếu chưa có thì tạo mới.
5. Tạo hoặc mở rộng hàng tiêu đề A:P.
6. Append một dòng. Payload schema 1 điền đủ A:P; payload legacy điền A:C và để trống D:P.
7. Release lock trong `finally`.
8. Trả JSON `{ "status": "success", "message": "Đã lưu log thành công!" }`.

### Luồng lỗi

- JSON sai, thiếu LH Trip, field sai kiểu hoặc lý do ngoài danh sách bị từ chối trước khi ghi sheet.
- Không fallback sang `getActiveSheet()` vì có thể làm hỏng sheet đang mở.
- Response lỗi dùng JSON `{ "status": "error", "message": "..." }` và không trả stack trace nhạy cảm.
- Giới hạn độ dài mã, số lượng incidents và kích thước chuỗi JSON để tránh payload bất thường làm treo sheet.

## Xử lý `onEdit(e)`

Trigger chỉ chạy khi tất cả điều kiện sau đúng:

- Edit một ô duy nhất.
- Sheet có tên chính xác `Biên bản sự vụ`.
- Range có A1 notation chính xác `L3`.

Giá trị L3 được trim và viết hoa. Nếu trống, script dọn dữ liệu tự động cũ và không lookup.

### Tìm log

- Đọc cột A từ hàng cuối lên hàng 2.
- So sánh mã LH Trip theo kiểu trim + viết hoa.
- Dòng khớp đầu tiên từ dưới lên là bản ghi mới nhất.
- Nếu không có bản ghi, dọn dữ liệu tự động cũ và hiển thị toast `Không tìm thấy log cho <LH Trip>`.
- Nếu payload JSON có schema không hợp lệ, hiển thị toast lỗi và không dùng dữ liệu một chuyến khác.

### Mapping thông tin chuyến

Trước khi điền, script dọn các ô do automation quản lý. Mapping schema 1:

| Ô đích | Giá trị |
|---|---|
| `A10` | `Tại : <SOC>`; để `Tại :` nếu SOC trống |
| `L5` | Trip Name |
| `L9` | Trip Date theo timezone của spreadsheet |
| `L11` | `Schedule` khi `tripSource = 0`, nếu không thì giá trị source dạng chữ/số |
| `L13` | Trip Type |
| `L15` | `By Trip` khi `costType = 1`, nếu không thì giá trị cost dạng chữ/số |
| `L17` | Agency |
| `L19` | Vehicle Type |
| `L21` | Vehicle Plate |
| `L23` | Driver |
| `L25` | Helper hoặc `-` |
| `D14` | `Seal số: <seal>`; nếu không có seal thì `Seal số: ...............` |

Các ô họ tên/chức vụ người lập, nơi gửi và số kiện thực nhận không có nguồn tin cậy trong payload nên được giữ nguyên. Công thức `B14=L21` và QR dựa trên `L3` tiếp tục hoạt động.

## Mapping bảng sự vụ

Vùng mặc định của bảng là hàng 21–50:

- A: STT.
- B: SPX/TO.
- C: Rách.
- D: Bung seal.
- E: Không TO.
- F: Thiếu.
- G: Bể vỡ.
- H: Dư.
- I: Khác.

Mỗi incident tạo một hàng. Cột lý do tương ứng được đánh dấu `X`; một mã có thể có nhiều dấu `X`. Thứ tự incidents giữ nguyên như payload.

### Hơn 30 incidents

- Hàng 51 là vị trí cơ sở bắt đầu khu vực nội dung cuối/chữ ký.
- Nếu có `N > 30` incidents, script chèn `N - 30` hàng trước hàng 51.
- Các hàng mới copy định dạng từ hàng 50 nhưng không copy nội dung.
- Số hàng đã chèn được lưu trong `PropertiesService.getDocumentProperties()` bằng key chứa sheet ID.
- Trước lần lookup tiếp theo, script xóa chính xác các hàng thừa đã ghi nhận, đưa chữ ký về vị trí cơ sở, rồi dọn A21:I50.
- Toàn bộ thao tác resize và điền bảng chạy trong document lock để tránh hai edit đồng thời phá cấu trúc.

## Parser log legacy

Nếu cột P trống, cột B được parse theo quy tắc:

- Tách dòng bằng `#`.
- Với mỗi dòng, phần trước dấu `@` là mã.
- Phần sau dấu `@` tách bằng ` + ` thành các lý do.
- Chỉ giữ bảy lý do hợp lệ.
- Bỏ segment không có mã hoặc không có lý do hợp lệ.
- Cùng mã được hợp nhất thành một hàng và giữ thứ tự xuất hiện đầu tiên.

## Trạng thái và thông báo

- Lookup thành công: toast `Đã tải biên bản cho <LH Trip>`.
- Log legacy: toast cho biết đã tải danh sách sự vụ nhưng log cũ không có chi tiết chuyến.
- Không tìm thấy: dọn dữ liệu cũ và toast cảnh báo.
- Payload hỏng: dọn dữ liệu cũ và toast lỗi, tránh để dữ liệu chuyến trước khiến người dùng hiểu nhầm.

## Kiểm thử

### Frontend

- Builder tạo đúng `schemaVersion: 1`.
- LH Trip và trip number được chuẩn hóa, phải khớp nhau.
- `tripSource` và `costType` được parse từ `detail_v2`.
- Incident nhiều lý do được giữ dạng mảng và chuỗi legacy vẫn đúng.
- Builder từ chối trip hoặc incident không hợp lệ.

### Apps Script

- `doPost` tạo `LogSutVu` và hàng tiêu đề A:P khi sheet chưa tồn tại.
- `doPost` mở rộng header hai cột cũ mà không sửa dữ liệu cũ.
- Append đúng thứ tự 16 cột.
- Payload sai không append.
- Không fallback sang active sheet.
- `onEdit` bỏ qua mọi sheet/ô ngoài `Biên bản sự vụ!L3`.
- Lookup chọn bản ghi mới nhất khi một LH Trip xuất hiện nhiều lần.
- Mapping chính xác các ô thông tin chuyến.
- Parse và điền đúng một hoặc nhiều lý do trên cùng mã.
- Fallback log legacy hoạt động.
- Hơn 30 incidents chèn đủ hàng; lần lookup sau xóa đúng hàng thừa trước đó.
- Không tìm thấy hoặc payload hỏng dọn dữ liệu automation cũ.

## Phát hành

- Source Apps Script nằm trong `gas/code.gs` theo cấu trúc hiện có.
- Thêm test Apps Script riêng và đăng ký trong `npm test`.
- Chạy `npm run bundle:gas` để tạo `gas-dist/code.gs` dùng triển khai Web App.
- Build lại userscript vì payload gửi log thay đổi.
- Nâng version userscript ở bước implementation theo semantic minor version kế tiếp.
- Việc deploy Web App Apps Script và cấp quyền thực thi vẫn cần thao tác trên tài khoản Google sở hữu spreadsheet.

## Ngoài phạm vi

- Không gọi SPX API từ Google Apps Script.
- Không lưu Cookie SPX, token hoặc shared secret trong Google Sheet.
- Không tự suy luận nơi gửi, người lập biên bản, chức vụ hoặc số kiện thực nhận.
- Không đồng bộ ngược chỉnh sửa từ Google Sheet về userscript.
- Không thay đổi cấu trúc các sheet không phải `LogSutVu` và vùng automation đã nêu của `Biên bản sự vụ`.
