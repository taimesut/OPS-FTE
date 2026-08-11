# Thiết kế cải thiện card TO và chỉ số hàng đã đóng bao

## Mục tiêu

Cải thiện khả năng đọc nhanh card Transfer Order trên màn hình nhỏ và bổ sung hai chỉ số số bao DG, số bao GTC cho khu vực `Hàng đã đóng bao`. Thay đổi áp dụng đồng nhất cho trang kiểm tra sót nội tỉnh và ngoại tỉnh thông qua component dùng chung `TOTable`.

## Phạm vi

- Chỉnh bố cục card TO trên mobile trong `src/components/TOTable.tsx`.
- Bổ sung hai chỉ số `Số bao DG` và `Số bao GTC` cạnh các chỉ số hiện có.
- Giữ nguyên bảng desktop, API, dữ liệu đầu vào, phân trang, tìm kiếm, QR và tùy chọn ẩn/hiện cột.
- Không thay đổi cách hai trang nội tỉnh và ngoại tỉnh gọi hoặc truyền dữ liệu vào `TOTable`.

## Bố cục card mobile

Card tiếp tục hiển thị theo tùy chọn cột đã lưu nhưng được chia thành các vùng có phân cấp rõ ràng:

1. Header gồm nhãn và mã TO ở bên trái, nút QR ở bên phải.
2. Điểm đến được đặt thành một vùng chính ngay dưới header để người dùng nhận biết tuyến nhanh.
3. Số kiện và khối lượng được trình bày thành hai ô số liệu nổi bật, dễ đối chiếu.
4. DG và GTC nằm cạnh nhau dưới dạng nhãn trạng thái. Trường hợp có DG/GTC dùng màu cảnh báo; NON DG/N dùng màu trung tính và độ tương phản đủ đọc.
5. Người đóng, tên bao, trạng thái và thời gian hoàn thành nằm trong vùng thông tin phụ, dùng label nhỏ và value rõ ràng.

Card dùng viền, khoảng cách và nền phân vùng nhẹ; không thêm thao tác thu gọn/mở rộng. Giá trị dài tiếp tục được phép xuống dòng an toàn và card không gây cuộn ngang trang.

## Chỉ số hàng đã đóng bao

Khu chỉ số của `TOTable` hiển thị bốn ô:

- `Tổng số TO`: số TO trong danh sách sau khi tìm kiếm nhanh.
- `Tổng số kiện`: tổng `quantity` của danh sách sau khi tìm kiếm nhanh.
- `Số bao DG`: số TO có ít nhất một giá trị `dg_type` khác `1`. Mảng rỗng hoặc chỉ chứa `1` được xem là NON DG.
- `Số bao GTC`: số TO có `high_value === 1`.

Mỗi TO được tính là một bao. Cả bốn chỉ số cập nhật cùng lúc khi người dùng nhập từ khóa tìm kiếm. Việc chuyển trang hoặc đổi số dòng mỗi trang không làm thay đổi chỉ số vì chỉ số phản ánh toàn bộ kết quả đã lọc.

Trên mobile, bốn ô hiển thị dạng lưới hai cột. Trên màn hình rộng, lưới có thể hiển thị bốn cột để tận dụng chiều ngang. DG dùng sắc cảnh báo và GTC dùng sắc lỗi theo semantic color hiện có; không dựa riêng vào màu vì mỗi ô luôn có nhãn chữ.

## Luồng dữ liệu

`TOTable` tiếp tục nhận `orders` từ trang cha. Component tạo `filteredOrders` từ từ khóa tìm kiếm, sau đó dùng các phép tổng hợp memoized để tính tổng số kiện, số bao DG và số bao GTC. Card và bảng vẫn lấy dữ liệu trang hiện tại từ `currentOrders`.

Không bổ sung request, state từ trang cha hoặc cấu trúc response mới.

## Trường hợp biên

- Danh sách rỗng: bốn chỉ số đều là `0`; empty state hiện tại vẫn hiển thị.
- `quantity` thiếu hoặc bằng `0`: đóng góp `0` vào tổng số kiện.
- `dg_type` rỗng: không tính là bao DG.
- `dg_type` chứa cả `1` và một loại khác: tính là một bao DG.
- Một TO đồng thời DG và GTC: được tính một lần trong từng chỉ số tương ứng.
- Tìm kiếm không có kết quả: các chỉ số phản ánh kết quả lọc bằng `0`.

## Kiểm thử và xác nhận

- Kiểm tra phép đếm DG với mảng rỗng, `[1]`, `[2]` và `[1, 2]`.
- Kiểm tra phép đếm GTC với `high_value` bằng `1` và giá trị khác `1`.
- Kiểm tra các chỉ số cập nhật theo tìm kiếm nhưng không đổi theo phân trang.
- Kiểm tra tùy chọn ẩn/hiện cột vẫn áp dụng cho card mobile và bảng desktop.
- Kiểm tra card ở chiều rộng điện thoại với mã TO, điểm đến, người đóng và tên bao dài.
- Chạy lint, test hiện có và production build.

## Tiêu chí hoàn thành

- Card mobile có phân cấp thị giác rõ hơn và không mất dữ liệu hoặc hành động hiện có.
- Người dùng có thể nhìn nhanh mã TO, điểm đến, số kiện, khối lượng và trạng thái DG/GTC.
- Khu chỉ số hiển thị đúng số bao DG và số bao GTC theo toàn bộ kết quả đã lọc.
- Bảng desktop và các luồng hiện có không bị thay đổi hành vi.
