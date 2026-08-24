# Thiết kế cấu hình SOC và Hub từ sheet `LIST SOC`

## Mục tiêu

Thay thế việc nhập tay SOC hiện tại, Hub nội tỉnh, SOC ngoại tỉnh và Group SOC bằng danh mục được quản lý tập trung trong Google Sheet `LIST SOC`.

Người dùng chỉ chọn SOC hiện tại và cấu hình Group SOC từ danh mục có sẵn. Frontend vẫn lưu cấu hình đã chuẩn hóa vào localStorage như hiện tại, vì vậy các màn tra cứu tiếp tục hoạt động bằng dữ liệu local và không phụ thuộc Google Sheet trong lúc check TO.

Các mục không liên quan trong trang Cấu hình được giữ nguyên: Cookie SPX, xóa riêng Cookie, URL Google Sheet Log Sự Vụ, xuất/nhập cấu hình và đặt lại cấu hình.

## Nguồn dữ liệu `LIST SOC`

Google Apps Script thêm hai hàm công khai để frontend gọi bằng `google.script.run`. Cả hai đọc sheet có tên chính xác `LIST SOC`, bỏ hàng tiêu đề và dùng các cột A–E:

| Cột | Nội dung |
| --- | --- |
| A | `station_name` |
| B | `station_code` |
| C | `id` |
| D | `number_prefix` |
| E | `list hub` |

Mỗi hàng SOC được trả về theo hợp đồng dữ liệu:

```ts
interface StationCatalogHub {
  stationName: string;
  stationCode: string;
  id: string;
}

interface StationCatalogSoc {
  stationName: string;
  stationCode: string;
  id: string;
  numberPrefix: string;
}
```

`getStationCatalog()` chỉ đọc và trả A–D của toàn bộ SOC. Hàm này không đọc hoặc trả cột E, nhờ đó tải nhanh danh sách chọn SOC và danh sách SOC ngoại tỉnh.

`getStationHubs(socId)` tìm đúng một hàng theo ID SOC rồi chỉ đọc ô E của hàng đó. Kết quả trả `StationCatalogHub[]`. ID đầu vào phải tồn tại duy nhất trong danh mục; GAS không nhận số hàng trực tiếp từ frontend.

Tất cả giá trị được đọc bằng `getDisplayValues()` và trim để không làm mất số 0 đầu chuỗi. Hàng trống hoàn toàn được bỏ qua.

### Phân tích cột E

Cột E chứa nhiều Hub, mỗi Hub một dòng với định dạng:

```text
Tên Hub | Mã Hub | ID
```

Parser chấp nhận ký tự xuống dòng Windows/Linux và chuỗi `<br>`, `<br/>`, `<br />` để chịu được dữ liệu được dán từ HTML. Sau khi tách dòng, mỗi mục phải có đúng ba phần không rỗng. Dòng trống được bỏ qua.

Hub chỉ được đọc sau khi người dùng chọn SOC hiện tại và chỉ từ ô E của đúng hàng đó. Danh sách SOC ngoại tỉnh chỉ dùng thông tin A–D; frontend không tải Hub của các SOC khác.

## Kiểm tra và lỗi dữ liệu nguồn

Vì sheet là nguồn dữ liệu chuẩn, backend không trả danh mục một phần khi phát hiện lỗi. Toàn bộ lời gọi thất bại với thông báo có vị trí hàng hoặc dòng Hub khi xảy ra một trong các trường hợp:

- không tồn tại sheet `LIST SOC`;
- không có hàng SOC hợp lệ;
- SOC thiếu `station_name`, `station_code` hoặc `id`;
- tên, mã hoặc ID SOC bị trùng;
- một dòng Hub của SOC được chọn không đủ tên, mã hoặc ID;
- tên, mã hoặc ID Hub của SOC được chọn bị trùng.

`number_prefix` được lưu dưới dạng chuỗi và có thể để trống nếu sheet chưa cấu hình, vì trường này chưa tham gia vào request tra cứu hiện tại.

Backend không ghi, sửa hoặc tự tạo sheet. Hàm đọc danh mục không cần Cookie SPX và không đi qua `fetchShopeeApi`.

## Cầu nối frontend

Một utility frontend riêng gọi hai hàm Apps Script, kiểm tra kiểu response và trả danh mục/Hub đã chuẩn hóa. Component Cấu hình không thao tác trực tiếp với `google.script.run`.

Các trạng thái của utility/UI gồm:

- `catalogLoading`: đang đọc A–D, khóa các điều khiển SOC/Group và nút lưu;
- `catalogReady`: cho phép chọn SOC và cấu hình Group SOC;
- `hubsLoading`: đã chọn SOC và đang đọc E của SOC đó, vẫn khóa nút lưu;
- `ready`: cả danh mục lẫn Hub của SOC đang chọn đã hợp lệ, cho phép lưu;
- `error`: hiển thị nguyên nhân cùng nút `Thử lại`; lỗi catalog khóa toàn bộ phần SOC, còn lỗi Hub chỉ khóa lưu cho tới khi tải lại Hub thành công.

Khi người dùng đổi SOC liên tiếp, frontend gắn mỗi request Hub với SOC ID tương ứng và bỏ qua response cũ đến muộn, tránh lưu Hub của SOC trước vào SOC mới.

Nếu frontend chạy ngoài Apps Script hoặc không có `google.script.run`, trạng thái được coi là lỗi tải danh mục. Không dùng danh mục viết cứng hoặc danh mục local cũ để mở khóa việc sửa/lưu cấu hình.

Lỗi tải sheet không xóa cấu hình local hiện có. Các màn tra cứu vẫn có thể dùng cấu hình đã lưu gần nhất; chỉ tab Cấu hình bị khóa cho tới khi tải được nguồn chuẩn.

## Giao diện Cấu hình

### Chọn SOC hiện tại

Ô nhập tay SOC hiện tại được thay bằng combobox có thể tìm theo `station_name` hoặc `station_code`. Khi chọn SOC, frontend gọi tải Hub của SOC đó. Sau khi tải thành công, giao diện hiển thị tóm tắt chỉ đọc:

- tên SOC;
- mã SOC;
- ID;
- `number_prefix`;
- số Hub nội tỉnh đã đọc từ cột E.

Phần `Dữ liệu đã nạp` cho phép mở để kiểm tra danh sách Hub nội tỉnh và SOC ngoại tỉnh nhưng không cho chỉnh trực tiếp.

SOC ngoại tỉnh được suy ra bằng toàn bộ danh mục SOC trừ SOC hiện tại. SOC hiện tại cũng bị loại khỏi mọi combobox dùng để cấu hình Group SOC.

### Cấu hình Group SOC

Không hiển thị textarea dùng ký tự `@`. Người dùng chỉ cần tạo những nhóm có thêm thành viên:

1. chọn một SOC ngoại tỉnh làm SOC đại diện;
2. chọn nhiều SOC thành viên từ danh sách SOC ngoại tỉnh;
3. SOC đại diện được thêm tự động, hiển thị cố định và không thể bỏ;
4. lưu hoặc cập nhật nhóm trong draft của form;
5. danh sách nhóm đã tạo có thao tác sửa và xóa.

SOC chưa được cấu hình nhóm được hiểu là nhóm chỉ có chính SOC đó. Một SOC có thể là thành viên của nhiều nhóm khác nhau, phù hợp với cấu trúc `Record<string, string[]>` hiện tại.

Khi đổi SOC hiện tại, form tự loại SOC đó khỏi danh sách ngoại tỉnh. Nếu SOC mới đang là đại diện của một nhóm, nhóm đó bị loại khỏi draft; nếu đang là thành viên, thành viên đó bị gỡ khỏi nhóm. Giao diện hiển thị cảnh báo về các thay đổi này trước khi người dùng bấm lưu.

### Các phần được giữ lại

Giữ nguyên Cookie SPX, nút xóa riêng Cookie, URL Log Sự Vụ, thông tin scanner nếu đang có, xuất cấu hình, nhập cấu hình và đặt lại cấu hình.

Nút tải mẫu dành cho cấu hình SOC/Hub nhập tay được bỏ vì không còn phù hợp với nguồn dữ liệu mới.

Giao diện phải dùng được trên desktop và mobile: combobox có nhãn truy cập, vùng chạm tối thiểu phù hợp, danh sách chọn không gây cuộn ngang và các chip thành viên có thể xuống dòng.

## Chuyển đổi thành cấu hình local

Khi bấm `Lưu cấu hình`, frontend dựng một `AppConfig` hoàn chỉnh từ danh mục đang tải:

- SOC hiện tại lấy tên, mã, ID và `number_prefix` từ hàng được chọn;
- `hubs` và các map ID/mã Hub lấy duy nhất từ cột E của SOC hiện tại;
- `socs` và các map ID/mã SOC lấy từ toàn bộ SOC còn lại;
- `group_socs` lấy từ lựa chọn Group SOC, với SOC đại diện xuất hiện đúng một lần;
- Cookie, URL và các cấu hình không liên quan lấy từ form hiện tại.

Cấu trúc cũ tiếp tục được duy trì để không phải đổi các consumer hiện có:

```ts
soc: string;
soc_id?: string;
hubs: string[];
hub_ids?: Record<string, string>;
socs: string[];
soc_ids?: Record<string, string>;
group_socs: Record<string, string[]>;
```

Bổ sung metadata dạng additive, không thay đổi ý nghĩa các trường cũ:

```ts
soc_code?: string;
number_prefix?: string;
hub_codes?: Record<string, string>;
soc_codes?: Record<string, string>;
```

Việc lưu là nguyên khối. Nếu danh mục đang lỗi, Hub chưa tải xong/đang lỗi, SOC hiện tại không hợp lệ hoặc Group SOC chứa phần tử ngoài danh sách ngoại tỉnh, không gọi `saveConfigs()` và không ghi một phần vào localStorage.

## Tương thích cấu hình cũ và import/export

Khi tải danh mục thành công, form đối chiếu SOC đã lưu theo thứ tự:

1. `soc_id`;
2. `soc_code` nếu cấu hình đã có;
3. tên `soc`.

Nếu tìm thấy, form chọn lại SOC đó và dựng mới Hub/SOC ngoại tỉnh từ sheet. Group SOC cũ được giữ khi đại diện và thành viên còn tồn tại trong danh sách ngoại tỉnh; phần tử không hợp lệ được loại và được báo cho người dùng. Việc đối chiếu chỉ thay đổi draft, không tự ghi localStorage.

Import JSON tiếp tục được hỗ trợ nhưng file nhập chỉ cung cấp lựa chọn SOC, Cookie, URL và Group SOC. Các mảng/map Hub hoặc SOC trong file không được dùng để ghi đè danh mục từ sheet. Import cũng bị khóa khi chưa tải được `LIST SOC`, vì không thể đối chiếu an toàn với nguồn chuẩn.

Export JSON xuất cấu hình local hoàn chỉnh như hiện tại, bao gồm metadata mới nếu có.

Người dùng mới không tiếp tục nhận bộ Pleiku SOC/Hub viết cứng. Khi chưa có cấu hình hợp lệ, các màn cần trạm phải yêu cầu người dùng vào Cấu hình và chọn SOC trước khi tra cứu.

## Ảnh hưởng đến các màn tra cứu

Các màn check TO nội tỉnh, check TO ngoại tỉnh, tổng quan và sản lượng tiếp tục dùng các helper cấu hình hiện tại:

- nội tỉnh dùng `soc`, `soc_id`, `hubs` và `hub_ids`;
- ngoại tỉnh dùng `socs`, `soc_ids` và `group_socs`;
- request packed TO vẫn dùng tên trạm;
- request loose order vẫn dùng ID trạm.

Không màn tra cứu nào gọi `LIST SOC` ở thời điểm người dùng check TO. Việc thêm `station_code` và `number_prefix` không thay đổi payload API hiện tại.

## Kiểm thử

### Google Apps Script

- `getStationCatalog()` chỉ đọc/trả A–D của toàn bộ SOC;
- `getStationHubs(socId)` chỉ đọc E của đúng SOC được chọn;
- từ chối SOC ID không tồn tại hoặc không duy nhất;
- bỏ hàng/dòng trống;
- phân tích cột E với xuống dòng và `<br>`;
- giữ ID, mã và prefix dưới dạng chuỗi;
- báo lỗi sheet thiếu, danh mục rỗng, trường bắt buộc thiếu và dữ liệu trùng;
- không trả danh mục một phần khi có Hub sai định dạng.

### Utility và cấu hình frontend

- chuẩn hóa response hợp lệ và xử lý môi trường không có Apps Script;
- loại SOC hiện tại khỏi SOC ngoại tỉnh;
- lấy đúng Hub từ hàng SOC hiện tại;
- bỏ qua response Hub cũ đến muộn sau khi người dùng đổi SOC;
- đối chiếu cấu hình cũ theo ID, mã rồi tên;
- lọc Group SOC cũ không còn hợp lệ;
- tự thêm SOC đại diện đúng một lần;
- không lưu khi catalog lỗi hoặc form không hợp lệ;
- import không ghi đè Hub/SOC từ file;
- export giữ metadata mới.

### Giao diện và regression

- trạng thái tải catalog, tải Hub, sẵn sàng, lỗi và `Thử lại`;
- tìm SOC theo tên/mã;
- tạo, sửa, xóa Group SOC trên desktop/mobile;
- cảnh báo khi đổi SOC làm thay đổi nhóm;
- Cookie, xóa Cookie, URL, import/export và đặt lại vẫn hoạt động;
- các màn nội tỉnh/ngoại tỉnh dùng cấu hình local mới mà không đổi request API;
- chạy test liên quan, toàn bộ test suite, lint và build;
- không tự đồng bộ `gas/index.html` nếu chưa có yêu cầu đóng gói/deploy riêng.

## Tiêu chí hoàn tất

1. Tab Cấu hình tải danh mục từ `LIST SOC` và không còn nhập tay SOC/Hub/Group.
2. Chọn SOC hiện tại tự dựng đúng Hub nội tỉnh và toàn bộ SOC ngoại tỉnh trừ chính nó.
3. Group SOC được chọn bằng UI, luôn chứa SOC đại diện và lưu đúng cấu trúc cũ.
4. Không tải được sheet thì phần cấu hình và nút lưu bị khóa, nhưng cấu hình local hiện có không bị xóa.
5. Cấu hình cũ/import được đối chiếu với nguồn sheet trước khi lưu.
6. Các màn tra cứu tiếp tục chạy từ localStorage và không phát sinh lời gọi sheet khi check TO.
7. Giao diện hoạt động rõ ràng trên desktop/mobile, test mới đạt, lint và build đạt.
