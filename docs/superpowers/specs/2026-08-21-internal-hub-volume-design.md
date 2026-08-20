# Thiết kế tab kiểm tra volume nội tỉnh

## Mục tiêu

Thêm một tab độc lập để nhân viên vận hành kiểm tra nhanh tổng lượng hàng đang đi từ SOC nguồn tới từng Hub nội tỉnh. Tính năng chỉ sử dụng trường `data.total` từ API tracking và không tải dữ liệu chi tiết vào giao diện.

## Phạm vi

- Giữ nguyên trang Overview nội tỉnh hiện có và các chỉ số xá lẻ/đóng bao của trang đó.
- Thêm route và mục điều hướng `Volume nội tỉnh`.
- Dùng SOC nguồn, SOC ID, Cookie và danh sách Hub/Hub ID từ cấu hình hiện có.
- Một thao tác refresh sẽ kiểm tra toàn bộ Hub đã cấu hình.
- Không thêm bộ lọc, phân trang hoặc bảng chi tiết đơn hàng.

## API và luồng dữ liệu

Với mỗi Hub, ứng dụng gửi một request `POST` tới:

`/api/fleet_order/order/tracking_list/search`

Payload:

```json
{
  "order_status": "8,33",
  "count": 24,
  "next_station_ids": "1812",
  "current_station_ids": "1030",
  "page_no": 1
}
```

Trong ví dụ trên, `1030` được thay bằng SOC ID đang cấu hình và `1812` được thay bằng ID của Hub tương ứng.

Các request của toàn bộ Hub được khởi chạy song song vì endpoint nhẹ và mỗi response chỉ cần đọc một chỉ số. Response hợp lệ phải có `retcode: 0` và `data.total` là số hữu hạn, không âm. `data.list` bị bỏ qua hoàn toàn.

Mỗi Hub có kết quả độc lập. Lỗi của một request không làm hủy hoặc che kết quả của các Hub còn lại. Sau khi tất cả request hoàn tất, giao diện cập nhật số Hub thành công, tổng volume và thời gian cập nhật gần nhất.

## Giao diện

Trang dùng ngôn ngữ thiết kế, spacing, màu trạng thái và khả năng responsive sẵn có của ứng dụng.

Phần đầu trang gồm:

- tiêu đề `Volume nội tỉnh`;
- mô tả SOC nguồn đang được kiểm tra;
- nút `Refresh toàn bộ`;
- chỉ số tổng volume của các Hub trả về thành công;
- số Hub thành công trên tổng số Hub;
- thời gian hoàn tất lần refresh gần nhất.

Bảng overview gồm bốn cột:

1. Hub
2. Station ID
3. Tổng lượng hàng
4. Trạng thái

Trong lúc tải, từng dòng hiển thị trạng thái đang kiểm tra. Sau khi hoàn tất, dòng thành công hiển thị `data.total`; dòng lỗi hiển thị trạng thái lỗi ngắn gọn và có thể cung cấp thông báo chi tiết theo pattern hiện có. Trạng thái rỗng hướng người dùng tới Cài đặt nếu chưa có Hub.

## Refresh và cooldown

- Chỉ có một nút refresh chung; không có refresh theo dòng.
- Cooldown bắt đầu ngay khi người dùng khởi chạy refresh và kéo dài 10 giây.
- Trong thời gian request đang chạy hoặc cooldown chưa hết, nút bị vô hiệu hóa.
- Nút hiển thị tiến trình khi đang chạy và số giây còn lại trong cooldown.
- Thời điểm bắt đầu cooldown được lưu trong `localStorage` để tải lại trang không bỏ qua giới hạn 10 giây.
- Không tự động gọi API khi mở trang; người dùng chủ động bấm refresh.

## Xử lý lỗi

Không gửi request khi thiếu Cookie, SOC nguồn, SOC ID, danh sách Hub hoặc Hub ID. Giao diện dùng toast hiện có để báo lỗi cấu hình.

Các trường hợp `retcode` khác 0, thiếu `data.total`, total không hợp lệ hoặc request thất bại được ghi nhận trên đúng dòng Hub. Kết quả thành công của cùng lượt refresh vẫn được hiển thị và tính vào tổng.

## Cấu trúc triển khai

- Tách hàm tạo payload và parser response thành utility thuần để kiểm thử độc lập.
- Tách lớp gọi API khỏi component trang.
- Component trang quản lý vòng đời refresh, cooldown và trạng thái từng Hub.
- Component bảng chỉ chịu trách nhiệm render dữ liệu và trạng thái.
- Tái sử dụng các helper cấu hình, API client, toast và component tiêu đề hiện có.

## Kiểm thử và tiêu chí hoàn tất

Các test tự động phải bao phủ:

- payload đúng chính xác `count: 24`, `order_status: "8,33"`, SOC ID và từng Hub ID;
- parser chỉ trả về `data.total` và từ chối response không hợp lệ;
- cooldown 10 giây, bao gồm dữ liệu `localStorage` lỗi hoặc thời điểm nằm trong tương lai;
- tổng hợp kết quả nhiều Hub và giữ lỗi độc lập;
- route/menu mới render đúng trang.

Tính năng hoàn tất khi một lần refresh tạo request cho mọi Hub hợp lệ, bảng hiển thị đúng `data.total` theo Hub, tổng volume chỉ cộng các kết quả thành công, và người dùng không thể bắt đầu lượt refresh mới trong vòng 10 giây.
