# Thiết kế trang trung gian mở Apps Script

## Mục tiêu

Tạo một trang web trung gian dành cho điện thoại. Trang phải đứng yên khi được truy cập để người dùng có đủ thời gian thêm trang vào màn hình chính. Ứng dụng Apps Script chỉ được mở sau khi người dùng chủ động bấm nút.

## URL đích

Trang chuyển tới URL Apps Script sau:

`https://script.google.com/a/macros/spxexpress.com/s/AKfycbxpxCw-YlSW0G60Yzr7QgWv2HxVNzkTxXyn9WWObnBRg0312loguB2d1Spqgvnx_wt3/exec`

## Trải nghiệm người dùng

- Trang hiển thị tiêu đề `OPS FTE`.
- Một hướng dẫn ngắn nhắc người dùng thêm trang vào màn hình chính trước khi mở ứng dụng.
- Nút chính `Mở ứng dụng` đủ lớn để thao tác bằng một tay trên điện thoại.
- Trang không tự động chuyển hướng, không có bộ đếm thời gian và không thay đổi trang khi người dùng chưa bấm nút.
- Khi bấm nút, trình duyệt chuyển trong cùng cửa sổ tới URL Apps Script chính.

## Cấu trúc kỹ thuật

- Trang launcher là một tài liệu HTML tĩnh, có CSS và JavaScript tối thiểu.
- URL đích được gắn trực tiếp vào liên kết của nút; chức năng mở app vẫn hoạt động khi JavaScript bị tắt.
- Web app manifest cung cấp tên, màu giao diện, chế độ standalone và các icon hiện có để hỗ trợ `Thêm vào màn hình chính` trên Android.
- Các thẻ Apple mobile web app và apple-touch-icon hỗ trợ lối tắt trên iPhone/iPad.
- Giao diện dùng tiếng Việt và ưu tiên màn hình dọc trên điện thoại.

## Xử lý lỗi và an toàn

- Không mở cửa sổ mới để tránh bị trình duyệt chặn popup.
- Không lưu dữ liệu người dùng và không yêu cầu quyền thiết bị.
- Nếu URL Apps Script không truy cập được hoặc tài khoản chưa đăng nhập, trang đích của Google chịu trách nhiệm hiển thị lỗi hoặc yêu cầu đăng nhập.

## Tiêu chí nghiệm thu

1. Mở launcher không tự chuyển sang Apps Script dù chờ bao lâu.
2. Người dùng có thể mở menu trình duyệt và thêm launcher vào màn hình chính.
3. Lối tắt có tên `OPS FTE` và sử dụng icon của dự án.
4. Bấm `Mở ứng dụng` chuyển đúng tới URL Apps Script đã cung cấp.
5. Giao diện hiển thị rõ ràng trên màn hình điện thoại phổ biến.

## Kiểm thử

- Kiểm tra source không chứa `location.replace`, `location.href`, meta refresh hoặc bộ hẹn giờ chuyển trang tự động.
- Chạy build và lint hiện có của dự án.
- Kiểm tra thủ công kích thước nút, nội dung hướng dẫn và URL đích ở viewport điện thoại.
