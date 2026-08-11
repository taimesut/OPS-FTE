# Thiết kế chức năng bàn giao PDA

## Mục tiêu

Thêm một chức năng mobile-first để nhân viên bàn giao toàn bộ PDA đang hoạt động theo ngày và ca làm việc. Mỗi PDA phải được xác thực bằng QR secret và có ảnh bằng chứng trước khi phiên được gửi. Hệ thống lưu ảnh vào Google Drive, lưu dữ liệu và mốc thời gian vào Google Sheet, ghi nhận email Google thực hiện bàn giao, và chặn bàn giao trùng cho cùng ngày và ca.

## Phạm vi

- Ba ca cố định: `06:00-15:00`, `13:00-22:00`, `22:00-06:00`.
- Ngày của ca `22:00-06:00` là ngày bắt đầu ca.
- Không cho chọn ngày tương lai.
- Người dùng phải bàn giao toàn bộ PDA đang hoạt động trong danh mục tại thời điểm tạo phiên.
- Mỗi PDA chỉ được xem là hoàn tất sau khi có một lần quét QR hợp lệ và một ảnh cuối đã tải lên thành công.
- Chỉ lưu thời gian quét hợp lệ và thời gian của ảnh cuối; không lưu lần quét sai, quét trùng, ảnh đã thay hoặc thao tác xóa.
- Mỗi cặp `ngày + ca` chỉ có một phiên đã gửi.

## Cấu trúc dữ liệu Google Sheet

### Sheet `PDA_DanhMuc`

Dữ liệu bắt đầu từ dòng 2:

| Cột | Tiêu đề | Nội dung |
| --- | --- | --- |
| A | Tên PDA | Tên duy nhất, ví dụ `PDA01` |
| B | Mã key | Secret chính xác được mã hóa thành QR, ví dụ `PDA01SECRET` |
| C | Hoạt động | `TRUE` nếu phải có trong phiên mới, ngược lại `FALSE` |

Apps Script đọc secret để xác thực nhưng không trả secret hoặc ánh xạ secret xuống trình duyệt. Tên PDA và mã key phải duy nhất trong các dòng hoạt động.

### Sheet `PDA_PhienBanGiao`

Một dòng cho mỗi phiên:

| Cột | Trường |
| --- | --- |
| A | `session_id` |
| B | `handover_date` |
| C | `shift` |
| D | `status` (`DRAFT` hoặc `SUBMITTED`) |
| E | `created_by` |
| F | `created_at` |
| G | `submitted_by` |
| H | `submitted_at` |
| I | `required_count` |
| J | `completed_count` |

Phiên nháp thuộc email đã tạo. Cùng một email, ngày và ca sẽ khôi phục phiên nháp hiện có. Nhiều tài khoản có thể có nháp riêng, nhưng chỉ một phiên được chốt cho cùng ngày và ca.

### Sheet `PDA_ChiTietBanGiao`

Một dòng cho mỗi PDA trong snapshot của phiên:

| Cột | Trường |
| --- | --- |
| A | `session_id` |
| B | `pda_name` |
| C | `scan_at` |
| D | `photo_at` |
| E | `photo_file_id` |
| F | `photo_url` |
| G | `completed` |

Danh sách chi tiết được tạo từ toàn bộ PDA hoạt động khi phiên nháp được tạo. Đây là snapshot cố định để thay đổi danh mục sau đó không làm phiên đang thực hiện trở nên thiếu hoặc thừa máy.

## Lưu trữ ảnh

- Apps Script tự tạo hoặc tái sử dụng thư mục Drive `PDA_HANDOVER_PHOTOS`.
- Trình duyệt nén ảnh thành JPEG trước khi upload, giới hạn cạnh dài để tránh payload quá lớn nhưng vẫn đủ nhận diện thiết bị.
- Ảnh được upload ngay sau khi chụp, không chờ đến lúc gửi toàn bộ phiên.
- Tên file chứa session ID, tên PDA và timestamp đã được làm sạch.
- Khi chụp lại, file mới được lưu thành công trước; sau đó file cũ được đưa vào thùng rác. Sheet chỉ giữ file ID, URL và timestamp của ảnh cuối.
- Apps Script thử đặt quyền xem theo domain có link nếu chính sách Workspace cho phép. Nếu thao tác chia sẻ bị từ chối, file giữ quyền riêng tư mặc định và việc upload vẫn thành công.

## API nội bộ Apps Script

Frontend gọi các hàm bằng `google.script.run`. Mọi hàm phải gọi kiểm tra quyền email hiện có trước khi đọc hoặc thay đổi dữ liệu.

- `getPdaHandoverBootstrap(date, shift)`: kiểm tra đầu vào, trả phiên đã gửi nếu tồn tại; nếu không thì khôi phục nháp của email hiện tại hoặc tạo phiên nháp cùng snapshot PDA hoạt động.
- `validatePdaQr(sessionId, secret)`: so khớp secret chính xác sau khi trim ở phía máy chủ, xác nhận PDA thuộc snapshot, ghi `scan_at` bằng thời gian máy chủ và trả tên/trạng thái PDA; không trả secret.
- `uploadPdaEvidence(sessionId, pdaName, dataUrl)`: kiểm tra PDA đã quét, xác thực kiểu/kích thước ảnh, lưu Drive, cập nhật file ID, URL, `photo_at` và `completed`; nếu là ảnh thay thế thì đưa file cũ vào thùng rác sau khi cập nhật thành công.
- `submitPdaHandover(sessionId)`: chạy trong `LockService`, kiểm tra lại quyền sở hữu nháp, đủ toàn bộ snapshot, chưa có phiên `SUBMITTED` cho cùng ngày/ca, rồi cập nhật trạng thái, email gửi và thời gian gửi.

Mốc thời gian được tạo ở Apps Script dưới dạng `Date` và hiển thị theo múi giờ `Asia/Bangkok`. Frontend không được tự quyết định timestamp dùng để lưu.

## Luồng giao diện

1. Người dùng mở trang **Bàn giao PDA** từ menu.
2. Chọn ngày bàn giao và một trong ba ca cố định.
3. App tạo hoặc khôi phục nháp và hiển thị tiến độ cùng toàn bộ PDA trong snapshot.
4. Người dùng bấm **Quét PDA** để mở `EmbeddedQRScanner` toàn màn hình.
5. App gửi chuỗi QR cho Apps Script. Nếu hợp lệ, máy quét đóng và giao diện chuyển sang yêu cầu chụp ảnh đúng PDA vừa nhận diện.
6. Người dùng chụp ảnh. App nén, upload, rồi hiển thị thumbnail, giờ quét và giờ chụp trên thẻ PDA.
7. Người dùng tiếp tục cho đến khi toàn bộ thẻ ở trạng thái hoàn tất. Có thể chụp lại ảnh của PDA đã hoàn tất; timestamp ảnh được cập nhật, timestamp quét hợp lệ được giữ nguyên trừ khi PDA được quét hợp lệ lại theo chủ ý.
8. Thanh hành động cuối màn hình hiển thị `đã hoàn tất / tổng bắt buộc`. Nút **Gửi bàn giao** bị khóa cho đến khi đủ toàn bộ.
9. Sau khi gửi, phiên chuyển sang chỉ đọc và hiển thị email cùng thời gian bàn giao.

## Trạng thái giao diện

- **Chưa quét:** PDA nằm trong snapshot nhưng chưa có `scan_at`.
- **Chờ ảnh:** QR đã hợp lệ nhưng chưa có ảnh upload thành công.
- **Hoàn tất:** có `scan_at`, `photo_at`, file ID và URL ảnh cuối.
- **Đã gửi:** toàn bộ phiên chỉ đọc.

Mỗi thẻ PDA hiển thị tên máy, badge trạng thái, thời gian liên quan và thumbnail khi có ảnh. Giao diện giữ hệ thống màu, typography, bề mặt và kích thước chạm tối thiểu của app hiện tại; tiến độ và hành động chính phải dễ thao tác trên màn hình PDA/điện thoại.

## Kiểm tra hợp lệ và lỗi

- Chặn ngày tương lai và ca ngoài danh sách cố định ở cả frontend và Apps Script.
- Không tạo phiên nếu danh mục không có PDA hoạt động, trùng tên hoặc trùng secret.
- QR rỗng/sai/ngừng hoạt động không tiết lộ danh sách secret và không ghi log.
- QR hợp lệ nhưng không thuộc snapshot hiện tại bị từ chối.
- Upload chỉ chấp nhận JPEG/PNG hợp lệ trong giới hạn dung lượng quy định ở triển khai.
- Mất mạng hoặc upload thất bại không xóa tiến độ đã lưu; app cho phép thử lại.
- Chụp lại chỉ thay ảnh cũ sau khi ảnh mới và cập nhật Sheet thành công.
- `submitPdaHandover` là nguồn sự thật cuối cùng; frontend không thể bỏ qua điều kiện đủ máy.
- Khóa máy chủ bảo đảm hai tài khoản gửi đồng thời không tạo hai phiên đã gửi cho cùng ngày và ca.

## Bảo mật

- Tái sử dụng danh sách email được phép trong sheet `account`, cột A từ dòng 2.
- Kiểm tra quyền trong mọi hàm Apps Script, không chỉ `doGet`.
- Không ghi secret vào log trình duyệt, response, sheet chi tiết bàn giao hoặc tên file ảnh.
- Chuẩn hóa và giới hạn dữ liệu đầu vào; không tin email, timestamp, tên PDA hoặc trạng thái do frontend gửi.
- Chỉ email tạo nháp được phép sửa và chốt nháp đó.

## Kiểm thử và nghiệm thu

- Unit test logic ca/ngày, trạng thái PDA, tiến độ và điều kiện mở nút gửi.
- Test Apps Script cho quyền email, danh mục lỗi, snapshot, QR đúng/sai, upload/thay ảnh, timestamp máy chủ và quyền sở hữu phiên.
- Test cạnh tranh gửi bằng khóa: cùng ngày/ca chỉ có một phiên `SUBMITTED`.
- Test khôi phục nháp sau khi tải lại trang.
- Chạy toàn bộ test, lint, build và `git diff --check`.
- QA mobile xác nhận không tràn ngang, vùng chạm tối thiểu 44px, scanner toàn màn hình, camera chụp ảnh, trạng thái upload và thanh tiến độ.

## Ngoài phạm vi hiện tại

- Quản trị ca làm việc bằng Sheet.
- Cho phép chọn một phần PDA thay vì toàn bộ danh mục hoạt động.
- Lưu lịch sử QR sai, quét trùng, ảnh cũ hoặc thao tác xóa.
- Trang quản trị danh mục PDA trong frontend.
- Sửa hoặc xóa một phiên đã gửi.
