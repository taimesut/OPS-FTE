# Thiết kế tối ưu quét và upload bàn giao PDA

## Mục tiêu

Rút ngắn thời gian bàn giao 11 PDA bằng cách giữ camera mở liên tục, chụp ảnh ngay trong scanner và upload ảnh nền. Người dùng phải có thể chuyển sang PDA tiếp theo ngay sau khi chụp, không chờ camera mở lại hoặc chờ Drive/Sheet phản hồi.

## Phạm vi

- Chỉ thay đổi chế độ bàn giao PDA.
- Các luồng quét mã đơn, LH Trip và tính năng scan-only hiện tại phải giữ nguyên hành vi.
- Scanner mini-app tại `scan-qr.taimesut.net` sẽ được redeploy.
- Ảnh bằng chứng ưu tiên tốc độ nhưng vẫn phải đủ rõ để nhận diện thân máy và nhãn PDA.
- Backend Apps Script hiện tại tiếp tục là nguồn sự thật cho email, quyền phiên, timestamp, trạng thái ảnh và điều kiện gửi.

## Kiến trúc

### Chế độ scanner

Scanner hỗ trợ hai workflow độc lập:

- `scan-only`: protocol và hành vi hiện tại; đọc một mã, tắt camera và trả kết quả.
- `pda-handover`: giữ camera mở qua nhiều chu kỳ quét/chụp.

Khi khởi động, scanner trả capability `pda-handover-v1`. Trang chính chỉ bật luồng nhanh khi capability này có mặt. Nếu scanner cũ, thiếu capability hoặc capture Blob không hoạt động, trang chính quay về luồng QR rồi mở camera hệ thống hiện tại.

### Chu kỳ một PDA

1. Scanner đọc QR và tạm dừng decoder nhưng không dừng `MediaStream`.
2. Scanner gửi secret cùng request ID về trang chính.
3. Trang chính gọi `validatePdaQr` trên Apps Script.
4. Nếu không hợp lệ, trang chính trả lệnh reject; scanner hiện lỗi ngắn rồi tiếp tục decoder.
5. Nếu hợp lệ, trang chính trả tên PDA; scanner hiển thị nút **Chụp ảnh PDAxx**.
6. Người dùng bấm chụp; scanner lấy frame từ video, resize/nén và gửi Blob JPEG về trang chính.
7. Trang chính đưa Blob vào hàng đợi upload và lập tức ra lệnh scanner tiếp tục đọc PDA kế tiếp.
8. Hàng đợi đổi Blob sang data URL ở thời điểm upload và gọi `uploadPdaEvidence`.

## Protocol cross-origin

Mọi message phải chứa `requestId`; trang chính và scanner tiếp tục kiểm tra đúng origin và `event.source`.

Các message mới:

- Scanner → parent: `PDA_HANDOVER_SCANNER_READY`, gồm `capabilities: ["pda-handover-v1"]`.
- Scanner → parent: `PDA_HANDOVER_SCAN`, gồm secret QR.
- Parent → scanner: `PDA_HANDOVER_SCAN_ACCEPTED`, gồm tên PDA công khai.
- Parent → scanner: `PDA_HANDOVER_SCAN_REJECTED`, gồm thông báo không chứa secret.
- Scanner → parent: `PDA_HANDOVER_EVIDENCE`, gồm Blob JPEG và tên PDA đã được parent xác nhận.
- Parent → scanner: `PDA_HANDOVER_CONTINUE`, gồm tiến độ hoàn tất/tổng và số upload đang chạy.
- Parent → scanner: `PDA_HANDOVER_STOP` để đóng workflow và giải phóng camera.

Scanner không được tự suy ra tên PDA từ secret. Tên hiển thị luôn đến từ kết quả xác thực Apps Script qua parent.

## Xử lý ảnh

- Chụp trực tiếp frame video bằng canvas; không mở file picker trong luồng nhanh.
- Lần nén đầu: JPEG, cạnh dài tối đa `1280px`, chất lượng `0.65`.
- Nếu Blob vẫn lớn hơn `1.5 MiB`, nén lại với cạnh dài tối đa `1024px`, chất lượng `0.50`.
- Blob cuối không được vượt giới hạn `4 MiB` hiện có của Apps Script.
- Scanner rung nhẹ và hiển thị flash xác nhận sau khi capture thành công.
- Blob/object URL được giải phóng ngay sau upload thành công hoặc khi người dùng chủ động bỏ ảnh.
- Luồng dự phòng dùng camera hệ thống phải áp dụng cùng profile nén nhanh.

## Hàng đợi upload

Trang chính quản lý hàng đợi theo `pdaName`. Một PDA chỉ có tối đa một job ảnh cuối đang hoạt động.

Trạng thái job:

- `QUEUED`: đã chụp, chờ slot upload.
- `UPLOADING`: đang gửi Apps Script/Drive.
- `COMPLETED`: backend đã trả item hoàn tất.
- `FAILED`: đã hết retry nhưng Blob vẫn còn trong bộ nhớ.

Quy tắc:

- Tối đa hai job `UPLOADING` song song.
- Retry tự động tối đa ba lần với khoảng nghỉ tăng dần `500ms`, `1500ms`, `3500ms`.
- Job cùng PDA mới thay thế job `QUEUED`/`FAILED` cũ. Không thay một job đang upload cho đến khi request hiện tại kết thúc; ảnh mới sau đó được xếp làm phiên bản kế tiếp.
- Khi upload thành công, cập nhật item từ response server và xóa Blob khỏi bộ nhớ.
- Khi hết retry, giữ Blob để nút **Thử tải lại** không yêu cầu quét/chụp lại.
- Nếu trang reload, Blob trong bộ nhớ mất. Dữ liệu `scan_at` vẫn ở Sheet; giao diện hiển thị **Cần chụp lại ảnh**.
- Đóng scanner không dừng hàng đợi; rời route hoặc reload sẽ mất các Blob chưa upload.

## Điều kiện gửi

Nút **Gửi bàn giao** chỉ bật khi đồng thời:

- Mọi PDA trong snapshot có trạng thái backend `completed`.
- Không còn job `QUEUED` hoặc `UPLOADING`.
- Không còn job `FAILED`.
- Không có bước validate/capture đang hoạt động.

Backend vẫn kiểm tra lại đủ `scan_at`, `photo_at`, file ID, URL và cờ hoàn tất trước khi chốt phiên trong `LockService`.

## Trải nghiệm scanner

- Header hiển thị tiến độ `đã hoàn tất / tổng PDA` và số ảnh đang tải.
- Trạng thái quét: hướng dẫn đưa QR vào khung.
- Trạng thái validate: giữ camera, khóa decoder, hiển thị `Đang kiểm tra PDA...`.
- Trạng thái capture: hiển thị tên PDA lớn và một nút chính **Chụp ảnh PDAxx**.
- Sau capture: rung/flash, thông báo `Đã xếp tải PDAxx`, tự quay lại trạng thái quét.
- QR sai: báo ngắn rồi tự quét lại.
- QR của PDA hoàn tất hoặc đã có job đang chờ/tải: báo `PDAxx đã được ghi nhận`, không tạo job trùng.
- Người dùng có thể đóng scanner bất kỳ lúc nào; tiến độ và upload tiếp tục trên trang chính.

## Trải nghiệm trang chính

- Thẻ PDA bổ sung trạng thái upload nền và nút **Thử tải lại** khi job thất bại.
- PDA chưa làm hoặc lỗi xếp trên; PDA hoàn tất xếp dưới, nhưng snapshot dữ liệu không bị thay đổi.
- Giữ nút **Chụp lại** bằng camera hệ thống để xử lý ảnh mờ và fallback.
- Thanh hành động hiển thị số đang tải và lý do nút gửi còn khóa.

## Bảo mật và tính toàn vẹn

- Không ghi secret vào console, toast, queue, local storage hoặc tên file.
- Secret chỉ tồn tại trong callback validate và được bỏ tham chiếu sau khi request kết thúc.
- Scanner chỉ gửi evidence sau khi nhận accepted cho QR trong đúng request/session.
- Parent chỉ nhận Blob từ iframe/popup đúng scanner origin và request ID.
- Blob được kiểm tra MIME `image/jpeg`, kích thước và PDA đang chờ capture trước khi enqueue.
- Timestamp quét và ảnh tiếp tục do Apps Script ghi phía máy chủ.
- Quyền email, quyền sở hữu draft, snapshot PDA và khóa chống gửi trùng giữ nguyên.

## Lỗi và fallback

- Scanner không trả capability trong thời gian chờ: dùng scan-only hiện tại.
- Validate lỗi mạng: cho thử lại QR mà không đóng camera.
- Capture/canvas/toBlob lỗi: hiện nút chuyển sang camera hệ thống.
- Upload lỗi tạm thời: retry tự động.
- Upload lỗi cuối: giữ Blob và cho thử lại thủ công.
- Scanner mất camera hoặc iframe lỗi: đóng fast mode và hiển thị lựa chọn fallback hiện có.

## Kiểm thử

- Unit test state machine protocol: ready, scan, accepted/rejected, capture, continue và stop.
- Unit test queue: giới hạn concurrency 2, chống job trùng, ba retry, thay ảnh, manual retry, cleanup Blob và điều kiện gửi.
- Regression test scanner `scan-only` cho các trang hiện có.
- Lint/build app chính và `build:scanner`.
- QA HTTPS trên thiết bị thật:
  - camera chỉ được mở một lần trong chuỗi nhiều PDA;
  - quét sai/trùng không làm đóng camera;
  - sau capture có thể quét PDA kế tiếp khi ảnh trước còn upload;
  - đóng scanner không dừng upload;
  - submit bị khóa khi queue còn job hoặc có lỗi;
  - fallback camera hệ thống hoạt động.

## Thứ tự triển khai

1. Build và deploy scanner tương thích ngược lên `scan-qr.taimesut.net`.
2. Kiểm tra các luồng scan-only hiện tại trên domain production.
3. Build và deploy app chính/Apps Script.
4. Chạy một phiên bàn giao mẫu trước khi áp dụng ca thật.

## Ngoài phạm vi

- Lưu Blob pending vào IndexedDB qua reload.
- Upload trực tiếp từ scanner sang Drive.
- Nhận dạng hình ảnh để xác minh ảnh đúng PDA.
- Thay đổi cấu trúc Sheet hoặc điều kiện phân quyền hiện tại.
