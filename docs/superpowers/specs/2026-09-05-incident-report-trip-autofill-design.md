# Thiết kế tự động điền biên bản sự vụ theo LH Trip

## Mục tiêu

Cải thiện chức năng “Tạo Biên Bản Sự Vụ LH TRIP” để người dùng có thể quét hoặc nhập mã LH Trip hay biển số xe, chọn đúng chuyến, tự tải thông tin chuyến cùng danh sách kiện thiếu/dư, rồi tiếp tục quét bổ sung các sự vụ thủ công. Bản xem trước phải phản ánh cấu trúc nghiệp vụ của sheet `Biên bản sự vụ` trong file `Record biên bản.xlsx` và vẫn sử dụng tốt trên điện thoại.

## Phạm vi

- Tìm LH Trip bằng mã chuyến hoặc biển số xe.
- Cho người dùng chọn chuyến khi kết quả không duy nhất.
- Tải chi tiết chuyến từ `detail_v2`.
- Tự tải đầy đủ danh sách kiện Thiếu và Dư thực tế từ hai biến thể của API loading.
- Hợp nhất dữ liệu tự động với dữ liệu quét thủ công.
- Cập nhật form và bản xem trước biên bản theo các trường có trong dữ liệu API.
- Giữ chức năng gửi log Google Sheet, sao chép log, in biên bản và tạo biên bản mới.

Không dùng `trip_station` trong thiết kế này.

## Luồng tìm chuyến

### Đầu vào

Màn hình đầu nhận một chuỗi tìm kiếm. Người dùng có thể:

- Nhập hoặc quét mã LH Trip.
- Nhập biển số xe.

Giá trị được trim và chuyển thành chữ hoa. Giá trị bắt đầu bằng `LT` được xem là mã LH Trip; các giá trị còn lại được xem là biển số xe.

### Request

Gọi `GET /api/admin/transportation/trip/list_v2` với các query cố định:

- `station_type=2`
- `pageno=1`
- `count=24`
- `query_type=1`
- `tab_type=1`

Khi tìm bằng LH Trip:

- `trip_number=<giá trị>`
- Không gửi `plate_number` có dữ liệu.

Khi tìm bằng biển số:

- `plate_number=<giá trị>`
- Không gửi `trip_number` có dữ liệu.

Mọi query phải được tạo bằng `URLSearchParams` để encode an toàn.

### Chọn chuyến

- Không có kết quả: báo không tìm thấy chuyến và giữ nguyên đầu vào.
- Có một kết quả: chọn trực tiếp.
- Có nhiều kết quả: hiển thị danh sách gồm mã chuyến, tên chuyến, ngày chạy, biển số, tài xế và trạng thái; người dùng chọn đúng chuyến.
- Không tự động lấy chuyến mới nhất khi có nhiều kết quả.

## Nguồn dữ liệu sau khi chọn chuyến

Kết quả `list_v2` được chọn phải có:

- `id`: dùng làm `trip_id`.
- `display_station_sequence`: dùng làm sequence cho hai API loading.

Không thay bằng `current_sequence_number` của `detail_v2` và không cố định sequence bằng một số cụ thể.

### Chi tiết chuyến

Gọi:

`GET /api/admin/transportation/trip/detail_v2?trip_id=<id>&new_process_switch=false`

Các trường được chuẩn hóa khi có:

- `trip_number`
- `trip_name`
- `trip_date`
- `trip_type_name`
- `driver_name`
- `second_driver_name`
- `vehicle_number`
- `vehicle_type_name`
- `agency_name`
- `seal_code` và `seal_code_list`
- `remark`
- `operator`
- `remark_loading_quantity`

Thông tin SOC hiện tại lấy từ cấu hình ứng dụng đã có. Các trường không xuất hiện trong API không được bịa hoặc cố định theo dữ liệu mẫu của workbook; giao diện để trống hoặc cho người dùng bổ sung nếu cần.

### Danh sách Thiếu

Gọi từng trang của:

`GET /api/admin/transportation/trip/loading/list`

Query:

- `trip_id=<id>`
- `pageno=<trang>`
- `count=24`
- `unloaded_sequence_number=<display_station_sequence>`
- `actual_unloaded_sequence_number=0`
- `type=pending`

Mọi item hợp lệ trong `data.list` được gán sự vụ `Thiếu`.

### Danh sách Dư thực tế

Gọi từng trang của cùng endpoint với query:

- `trip_id=<id>`
- `pageno=<trang>`
- `count=24`
- `actual_unloaded_sequence_number=<display_station_sequence>`
- `type=inbound`
- `unload_list_type=2`

Mọi item hợp lệ trong `data.list` được gán sự vụ `Dư`.

### Phân trang

Mỗi nhánh bắt đầu từ trang 1. Sau mỗi response, dùng `data.total`, `data.count`, `data.pageno` và số item đã thu thập để quyết định tải trang kế tiếp. Dừng khi đã thu đủ `total`, trang trả về rỗng, hoặc đạt trang cuối suy ra từ `total/count`. Việc dừng phải chống vòng lặp nếu API trả metadata không nhất quán.

## Chuẩn hóa mã kiện

Với mỗi item loading:

1. Dùng `scan_number` sau khi trim nếu có.
2. Nếu `scan_number` trống, dùng `to_number` sau khi trim.
3. Bỏ item nếu cả hai đều trống.
4. Chuẩn hóa mã thành chữ hoa để so sánh và khử trùng lặp.

Thiết kế không phụ thuộc vào một field `parcel_number` chưa được xác nhận trong response.

## Mô hình sự vụ và hợp nhất

Mỗi dòng biên bản gồm:

- Mã định danh nội bộ ổn định.
- Mã SPX/TO đã chuẩn hóa.
- Tập loại sự vụ, cho phép một mã mang nhiều loại.
- Nguồn dữ liệu: tự động từ API hoặc quét/nhập thủ công.

Các loại sự vụ hỗ trợ:

- `Rách`
- `Bung seal`
- `Không TO`
- `Thiếu`
- `Bể vỡ`
- `Dư`
- `Khác`

Quy tắc hợp nhất:

- Cùng một mã chỉ xuất hiện một dòng.
- Item từ API pending thêm cờ `Thiếu`.
- Item từ API inbound thêm cờ `Dư`.
- Nếu cùng mã xuất hiện ở cả hai nhánh, dòng đó có cả `Thiếu` và `Dư`.
- Khi quét hoặc nhập mã đã có, thêm loại sự vụ đang chọn vào dòng hiện có thay vì tạo dòng trùng.
- Người dùng được phép thêm hoặc bỏ từng loại sự vụ và xóa dòng.

## Giao diện

### Bước 1: Tìm và chọn LH Trip

- Một ô nhập/quét dùng chung cho mã LH Trip hoặc biển số.
- Nút tìm kiếm có trạng thái loading và bị vô hiệu hóa trong khi request đang chạy.
- Danh sách kết quả chỉ xuất hiện khi có nhiều chuyến.
- Sau khi chọn, hiển thị thẻ tóm tắt chuyến và bắt đầu tải dữ liệu chi tiết.

### Bước 2: Kiểm tra dữ liệu và quét bổ sung

- Hiển thị thông tin chuyến đã tự điền.
- Hiển thị trạng thái tải riêng cho Chi tiết chuyến, danh sách Thiếu và danh sách Dư.
- Bảng/card sự vụ dùng các cột nghiệp vụ theo workbook: SPX/TO, Rách, Bung seal, Không TO, Thiếu, Bể vỡ, Dư và Khác.
- Trên điện thoại, mỗi mã hiển thị bằng card với các chip loại sự vụ; không bắt buộc cuộn ngang.
- Cho phép quét/nhập mã bổ sung và chọn một hoặc nhiều loại sự vụ.

### Bước 3: Xem trước biên bản

Bản xem trước mô phỏng các phần chính của sheet `Biên bản sự vụ`:

- Tiêu đề biên bản và thời gian lập.
- Thông tin SOC hiện tại.
- Thông tin LH Trip, xe, tài xế, nhà xe và seal.
- Nội dung/tổng số kiện dự kiến khi API cung cấp.
- Bảng sự vụ với một cột cho mỗi loại.
- Khu vực ký xác nhận.

Không sao chép dữ liệu mẫu cá nhân, địa chỉ hoặc biển số từ workbook vào bản phát hành.

## Gửi log Google Sheet

Chuỗi log hiện có tiếp tục được hỗ trợ. Với một mã có nhiều loại sự vụ, các loại được nối bằng ` + ` trong phần sau dấu `@`, ví dụ:

`SPXVN001@Thiếu + Dư`

Các dòng vẫn nối với nhau bằng `#` để giữ tương thích với webhook hiện tại.

## Trạng thái lỗi và thử lại

- Response có `retcode` khác 0, thiếu `data`, hoặc sai kiểu dữ liệu bắt buộc phải tạo lỗi có thông báo rõ ràng.
- Lỗi tìm chuyến chặn bước chọn chuyến.
- Sau khi đã chọn chuyến, ba nhánh `detail`, `pending`, `inbound` chạy độc lập. Một nhánh lỗi không xóa dữ liệu thành công của các nhánh khác.
- Giao diện ghi rõ nhánh bị lỗi và có nút thử lại nhánh đó.
- Khi đổi sang chuyến khác, hủy/loại bỏ kết quả request cũ bằng generation token hoặc `AbortController` để dữ liệu chuyến trước không ghi đè chuyến mới.
- Nếu toàn bộ item loading bị loại vì thiếu mã, hiển thị số item không hợp lệ thay vì báo thành công rỗng không giải thích.

## Kiểm thử

- URL tìm bằng mã LH Trip và URL tìm bằng biển số.
- Parser `list_v2`: không có, một và nhiều kết quả; validate `id` và `display_station_sequence`.
- URL và parser `detail_v2`.
- URL Thiếu và Dư dùng đúng sequence từ `display_station_sequence`.
- Phân trang khi `total` lớn hơn 24 và dừng an toàn khi metadata không nhất quán.
- Ưu tiên `scan_number`, fallback `to_number`, bỏ item không có mã.
- Khử trùng lặp và hợp nhất cờ Thiếu/Dư.
- Quét mã trùng cập nhật dòng hiện có.
- Lỗi một nhánh không làm mất dữ liệu hai nhánh còn lại.
- Kiểm tra TypeScript, test hồi quy, lint các file thay đổi, production build và userscript build.

## Ngoài phạm vi

- Không chỉnh sửa file `Record biên bản.xlsx`.
- Không dùng `trip_station`.
- Không tải hoặc đính kèm ảnh biên bản lên Google Drive trong thay đổi này.
- Không thay đổi quyền truy cập SPX hoặc tự lưu cookie; mọi request dùng phiên đăng nhập hiện tại của userscript.
