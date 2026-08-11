# Thiết kế hiển thị Sender trong kết quả TO

## Mục tiêu

Hiển thị trường `sender` có sẵn trong response Transfer Order ở cả card mobile và bảng desktop, giúp người dùng nhận biết đầy đủ điểm gửi và điểm đến của từng TO.

## Phạm vi

- Thay đổi component dùng chung `src/components/TOTable.tsx`.
- Áp dụng đồng nhất cho kết quả kiểm tra sót nội tỉnh và ngoại tỉnh.
- Không thay đổi API, request, response mapping, phân trang hoặc hành động QR.

## Tên và vị trí hiển thị

- Tùy chọn cột và header table dùng nhãn `Điểm gửi (Sender)`.
- Table đặt cột Sender ngay trước cột `Điểm đến (Des)`.
- Card mobile đặt `Điểm gửi` và `Điểm đến` trong cùng khối tuyến chính; mỗi trường có label và một dòng giá trị riêng.
- Giá trị rỗng dùng fallback `---`.
- Tên trạm dài được xuống dòng an toàn trên card. Table tiếp tục dùng vùng cuộn ngang hiện có.

## Tùy chọn cột và migration

`sender` được thêm vào `TABLE_COLUMNS` và mặc định hiển thị. Hai trang hiện tại đã lưu danh sách key cột trong localStorage, vì vậy cần migration một lần cho từng `storageKey`:

1. Nếu chưa có cấu hình cột, dùng toàn bộ `TABLE_COLUMNS`, bao gồm `sender`.
2. Nếu có cấu hình cũ nhưng chưa có migration marker Sender, thêm `sender` vào danh sách ngay trước `route` và ghi marker.
3. Sau migration, nếu người dùng chủ động ẩn Sender thì lựa chọn đó được giữ ở các lần mở sau; không tự thêm lại.
4. Cấu hình cột lỗi hoặc không phải mảng hợp lệ quay về danh sách mặc định có Sender.

Marker dùng key tách biệt theo bảng, dạng `${storageKey}:sender-column-v1`, để nội tỉnh và ngoại tỉnh migration độc lập mà không xóa các lựa chọn cột khác.

## Tìm kiếm

Tìm kiếm nhanh tiếp tục kiểm tra mã TO, người đóng, điểm đến và tên bao, đồng thời bổ sung `sender`. So khớp không phân biệt hoa thường như các trường hiện có.

## Luồng dữ liệu

`TransferOrder.sender` đã tồn tại và được response trả về dưới dạng chuỗi, ví dụ `BD A Mega SOC`. `TOTable` đọc trực tiếp `item.sender`; không bổ sung state hoặc phép biến đổi dữ liệu ở hai trang cha.

## Trường hợp biên

- `sender` rỗng: card và table hiển thị `---`.
- Tên Sender dài: card xuống dòng trong phạm vi khối tuyến.
- Chỉ bật Sender và tắt Receiver: card vẫn hiển thị khối tuyến với Sender, không có khoảng trống Receiver.
- Chỉ bật Receiver và tắt Sender: card giữ bố cục hiện tại cho Receiver.
- Tắt cả Sender và Receiver: card bỏ toàn bộ khối tuyến.
- Từ khóa chỉ khớp Sender: TO vẫn xuất hiện trong kết quả lọc và các chỉ số được tính lại theo kết quả đó.

## Kiểm thử và xác nhận

- Kiểm tra `TABLE_COLUMNS` có Sender trước Route.
- Kiểm tra migration thêm Sender đúng một lần, giữ nguyên các lựa chọn cột khác và cho phép ẩn Sender sau đó.
- Kiểm tra cấu hình localStorage lỗi quay về mặc định.
- Kiểm tra tìm kiếm khớp Sender không phân biệt hoa thường.
- Kiểm tra card với các tổ hợp Sender/Receiver cùng bật, chỉ một trường bật và cả hai tắt.
- Kiểm tra table hiển thị Sender đúng vị trí và fallback `---`.
- Chạy test, lint, production build và responsive browser QA.

## Tiêu chí hoàn thành

- Sender xuất hiện mặc định ở cả card mobile và table desktop cho người dùng mới và người dùng có cấu hình cột cũ.
- Người dùng có thể ẩn/hiện Sender qua tùy chọn cột và lựa chọn được lưu bền vững.
- Tìm kiếm theo Sender trả về đúng TO.
- Không làm thay đổi hành vi của các trường, chỉ số và hành động hiện có.
