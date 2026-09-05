# Thiết kế phân loại hàng xá nội tỉnh và ngoại tỉnh

## Mục tiêu

Cập nhật luồng kiểm tra hàng xá dùng chung cho trang nội tỉnh và ngoại tỉnh để hiển thị năm số liệu: Tổng xá, xá thường, xá DG, xá GTC và xá DG + GTC. Các số liệu phải lấy từ trường `data.total` của API tìm kiếm đơn, không đếm từ danh sách của một trang kết quả.

## Phạm vi

- Thay đổi hợp đồng tạo payload và luồng gọi API hàng xá dùng chung.
- Áp dụng trực tiếp cho hai trang `CheckSotNoiTinhPage` và `CheckSotNgoaiTinhPage` thông qua hook hiện có.
- Cập nhật thẻ kết quả hàng xá từ ba chỉ số thành năm chỉ số.
- Giữ nguyên lựa chọn tuyến, khoảng thời gian nhận hàng và cơ chế báo lỗi hiện tại.
- Luồng tổng quan Hub đang dùng cùng hàm tải hàng xá sẽ nhận kết quả phân loại mới, nhưng không mở rộng bố cục bảng tổng quan trong thay đổi này.

## Hợp đồng request

Mỗi lần kiểm tra sẽ gửi đồng thời bốn request `POST` tới:

`/api/fleet_order/order/tracking_list/search`

Các trường chung của mọi request:

- `count: 24`
- `current_station_ids`: ID trạm nguồn đã chuẩn hóa
- `next_station_ids`: danh sách ID trạm đích duy nhất, nối bằng dấu phẩy
- `order_status: "8"`
- `page_no: 1`
- `current_station_received_time`: chỉ có khi luồng gọi truyền khoảng thời gian hợp lệ

Các bộ lọc phân loại:

| Nhóm | `high_value` | `order_dg_type` |
| --- | ---: | ---: |
| Xá thường | 0 | 1 |
| Xá DG | 0 | 4 |
| Xá GTC | 1 | 1 |
| Xá DG + GTC | 1 | 4 |

## Xử lý response và mô hình dữ liệu

Mỗi response phải là object có `retcode: 0`, `data` hợp lệ và `data.total` là số hữu hạn, không âm. Giá trị của từng nhóm lấy trực tiếp từ `data.total` tương ứng.

Kết quả tổng hợp gồm:

- `normalCount`: tổng xá thường
- `dgCount`: tổng xá DG
- `highValueCount`: tổng xá GTC
- `dgAndHighValueCount`: tổng xá DG + GTC
- `total`: `normalCount + dgCount + highValueCount + dgAndHighValueCount`

Tên `dgCount` và `highValueCount` được giữ để các phần đang sử dụng dữ liệu hàng xá tiếp tục tương thích. Hai trường này chỉ đại diện cho nhóm thuần DG và thuần GTC; nhóm giao nhau nằm riêng trong `dgAndHighValueCount`.

## Luồng dữ liệu

1. Trang nội tỉnh hoặc ngoại tỉnh gọi hook kiểm tra hàng xá với trạm nguồn, các trạm đích và khoảng thời gian tùy chọn.
2. Hàm API dựng bốn payload từ cùng thông tin tuyến và bốn bộ lọc cố định.
3. Bốn request chạy song song bằng một thao tác chờ chung.
4. Từng response được kiểm tra và trích `data.total`.
5. Hàm API trả về bản tóm tắt năm số liệu.
6. Component hiển thị năm thẻ chỉ số.

## Xử lý lỗi

- ID nguồn trống, danh sách ID đích trống hoặc khoảng thời gian sai định dạng tiếp tục bị từ chối trước khi gọi API.
- Nếu bất kỳ request nào thất bại, trả `retcode` khác 0, thiếu `data`, hoặc có `data.total` không hợp lệ, toàn bộ lần kiểm tra được coi là thất bại.
- Giao diện dùng trạng thái lỗi hiện có và không hiển thị tổng được cộng từ dữ liệu thiếu.
- Khi đang tải, giao diện hiển thị năm placeholder tương ứng với năm thẻ kết quả.

## Giao diện

Khu vực “Hàng xá lẻ” hiển thị:

1. Tổng xá
2. Xá thường
3. Xá DG
4. Xá GTC
5. Xá DG + GTC

Lưới phải tự xuống dòng trên màn hình hẹp, giữ số liệu dễ đọc và không tạo cuộn ngang bắt buộc.

## Kiểm thử

- Kiểm tra chính xác bốn payload, bao gồm `count: 24`, các trường tuyến, thời gian tùy chọn và từng cặp bộ lọc.
- Kiểm tra khử trùng lặp ID đích và các lỗi đầu vào hiện có.
- Kiểm tra parser chỉ chấp nhận `data.total` hợp lệ và truyền thông báo lỗi API khi có.
- Kiểm tra bốn request được ánh xạ đúng nhóm và Tổng xá bằng tổng bốn nhóm.
- Chạy toàn bộ test, TypeScript build và userscript build để phát hiện ảnh hưởng ngoài ý muốn.

## Ngoài phạm vi

- Không thay đổi API endpoint hoặc cơ chế xác thực.
- Không phân trang hay tải `data.list`, vì số cần dùng là `data.total`.
- Không thay đổi cách kiểm tra hàng đã đóng bao/TO.
- Không mở rộng các cột trong bảng tổng quan Hub ở lần thay đổi này.
