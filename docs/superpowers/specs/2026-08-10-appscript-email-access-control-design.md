# Thiết kế giới hạn truy cập Apps Script theo email

## Mục tiêu

Chỉ cho phép tài khoản Google có email nằm trong danh sách `account!A2:A` của Google Sheet gắn với project Apps Script mở ứng dụng chính và sử dụng hàm proxy Shopee. Mọi trường hợp không xác định được quyền đều phải bị từ chối.

## Nguồn danh sách quyền

- Spreadsheet: bảng tính đang gắn với project Apps Script hiện tại.
- Sheet: `account`.
- Phạm vi: cột A, từ dòng 2 đến dòng cuối có dữ liệu.
- Dòng 1 được xem là tiêu đề và không tham gia kiểm tra.
- Ô trống bị bỏ qua.
- Email được chuẩn hóa bằng cách loại bỏ khoảng trắng đầu/cuối và chuyển thành chữ thường.

## Luồng mở ứng dụng

1. `doGet()` lấy email bằng `Session.getActiveUser().getEmail()`.
2. Máy chủ chuẩn hóa email hiện tại và đọc danh sách cho phép từ `account!A2:A`.
3. Nếu email hiện tại không rỗng và xuất hiện chính xác trong danh sách đã chuẩn hóa, `doGet()` trả nội dung `index` hiện có.
4. Nếu email trống, sheet `account` không tồn tại, danh sách không chứa email hoặc quá trình kiểm tra phát sinh lỗi, `doGet()` trả một trang HTML `Không có quyền truy cập`.

## Bảo vệ hàm máy chủ

- Tạo một hàm kiểm tra quyền dùng chung để `doGet()` và `fetchShopeeApi()` không triển khai hai cách so sánh khác nhau.
- `fetchShopeeApi()` kiểm tra quyền trước khi gọi `UrlFetchApp.fetch`. Nếu không có quyền, hàm trả đối tượng lỗi với HTTP-style status `403` và không gửi cookie hoặc request tới Shopee.
- `doPost()` giữ nguyên vì đang phục vụ luồng ghi log qua HTTP POST độc lập; thay đổi quyền của endpoint này nằm ngoài phạm vi yêu cầu.

## Trang từ chối truy cập

- Hiển thị tiêu đề `Không có quyền truy cập`.
- Nếu Google cung cấp được email, hiển thị email hiện tại để người dùng biết tài khoản đang đăng nhập.
- Nếu email trống, thông báo không xác định được email đăng nhập và hướng dẫn mở lại bằng tài khoản công ty.
- Hướng dẫn người dùng liên hệ quản trị viên để thêm email vào danh sách.
- Không hiển thị nội dung sheet, danh sách email cho phép, stack trace hoặc thông tin lỗi nội bộ.
- Nội dung động phải được escape trước khi đưa vào HTML.

## Nguyên tắc lỗi và bảo mật

- Fail closed: mọi lỗi đọc sheet hoặc xác định danh tính đều bị từ chối.
- So sánh email không phân biệt chữ hoa/thường nhưng không dùng tìm kiếm chuỗi một phần.
- Không cache danh sách; thay đổi ở `account!A2:A` có hiệu lực ở lần tải app hoặc lần gọi proxy tiếp theo.
- Không ghi cookie SPX hoặc toàn bộ danh sách quyền vào log.
- Cấu hình deployment phải là `Execute as: User accessing the web app` để lấy đúng danh tính người truy cập. Nếu Google không trả email, người dùng vẫn bị chặn.

## Cấu trúc mã

- `getCurrentUserAccess_()` trả kết quả có cấu trúc gồm `allowed`, `email` và `reason` dùng nội bộ phía máy chủ.
- `getAllowedEmails_()` đọc và chuẩn hóa `account!A2:A`.
- `normalizeEmail_(value)` chuẩn hóa một giá trị email.
- `createAccessDeniedOutput_(access)` tạo trang HTML từ chối truy cập an toàn.
- `escapeHtml_(value)` escape dữ liệu động trước khi ghép vào HTML.

Các hàm có hậu tố `_` là hàm nội bộ và không được gọi trực tiếp từ client bằng `google.script.run`.

## Tiêu chí nghiệm thu

1. Email có trong `account!A2:A` mở được app chính.
2. Email không có trong danh sách nhận trang từ chối truy cập.
3. Email trống bị từ chối và được hướng dẫn đăng nhập tài khoản công ty.
4. Sheet `account` bị thiếu hoặc lỗi đọc dữ liệu không làm lộ app chính.
5. Email trong sheet có khoảng trắng hoặc chữ hoa vẫn khớp sau khi chuẩn hóa.
6. Chuỗi chỉ chứa một phần email không được xem là khớp.
7. Người không có quyền gọi `fetchShopeeApi()` không tạo request ra Shopee và nhận status `403`.
8. `doPost()` vẫn hoạt động như trước.

## Kiểm thử

- Tách logic chuẩn hóa, đối chiếu và tạo kết quả quyền thành các hàm có thể kiểm thử với các phụ thuộc Apps Script được giả lập.
- Kiểm thử các nhánh được phép, không được phép, email trống, sheet thiếu và lỗi đọc sheet.
- Kiểm thử nội dung trang lỗi không chứa danh sách email hoặc stack trace và escape email trước khi render.
- Chạy toàn bộ test, lint và build hiện có để xác nhận không ảnh hưởng ứng dụng chính hoặc launcher.
- Kiểm tra thủ công deployment bằng một email có trong danh sách và một email không có trong danh sách.
