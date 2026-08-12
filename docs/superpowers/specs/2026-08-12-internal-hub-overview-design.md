# Thiết kế trang Overview Hub nội tỉnh

## Mục tiêu

Thêm một tab Overview nội tỉnh chạy cùng logic kiểm tra sót như trang `Check sót nội tỉnh`, nhưng kiểm tra toàn bộ Hub nội tỉnh đã cấu hình trong một lần thao tác. Trang hiển thị bảng tổng quan theo từng Hub cho cả hàng xá lẻ và hàng đã đóng bao, đồng thời cho phép mở danh sách TO chi tiết của từng Hub.

## Phạm vi

- Thêm route và mục điều hướng riêng cho `Overview nội tỉnh`.
- Đọc danh sách Hub và station ID từ cấu hình hiện có.
- Kiểm tra hàng xá lẻ và TO đã đóng bao cho mọi Hub.
- Tổng hợp kết quả theo Hub và toàn tuyến.
- Cho phép xem chi tiết TO theo Hub bằng component `TOTable` hiện có.
- Không thay đổi hành vi của trang `Check sót nội tỉnh` hiện tại.
- Không tự động refresh.

## Luồng người dùng

1. Người dùng mở trang Overview.
2. Trang hiển thị danh sách Hub cấu hình và trạng thái chưa kiểm tra hoặc kết quả gần nhất trong phiên.
3. Người dùng nhấn `Kiểm tra toàn bộ`.
4. Trang xác thực SOC nguồn, SOC ID, Cookie và ID của toàn bộ Hub trước khi gửi request.
5. Nếu cấu hình hợp lệ, cooldown bắt đầu ngay và nút làm mới bị khóa 120 giây.
6. Các Hub được xử lý với tối đa 3 Hub đồng thời.
7. Mỗi dòng cập nhật trạng thái riêng khi đang tải, thành công hoặc lỗi.
8. Người dùng có thể mở chi tiết một Hub thành công để xem danh sách TO.
9. Sau 120 giây, nút đổi thành `Làm mới` và có thể chạy lại toàn bộ.

## Request và giới hạn tải

Mỗi Hub dùng cùng hai luồng đang có ở trang nội tỉnh:

- TO đã đóng bao: GET `/api/in-station/general_to/outbound/search` với `receiver` là tên Hub, `status=2`, khoảng thời gian 7 ngày và `count=500`; chỉ giữ TO có `current_station_name` bằng SOC nguồn.
- Hàng xá lẻ: POST qua logic `fetchLooseOrderSummary(currentSocId, [hubId])` hiện có.

Hai request của cùng một Hub có thể chạy song song. Bộ điều phối chỉ cho tối đa 3 Hub hoạt động đồng thời, tương đương tối đa 6 request đang bay. Một Hub hoàn tất cả hai nhánh thì Hub kế tiếp mới được bắt đầu.

Nếu một nhánh lỗi, nhánh còn lại vẫn được giữ và hiển thị. Trạng thái dòng là `Có lỗi` kèm mô tả nhánh thất bại; dữ liệu thành công không bị xóa. Lỗi một Hub không dừng các Hub khác.

## Cooldown 2 phút

- Cooldown là 120.000 ms và bắt đầu khi toàn bộ cấu hình đã hợp lệ, ngay trước request đầu tiên.
- Lưu timestamp lần khởi chạy vào localStorage bằng một key riêng cho Overview.
- Reload hoặc đóng/mở lại trang trong thời gian chờ vẫn giữ nút bị khóa.
- Nút hiển thị đếm ngược theo giây, ví dụ `Làm mới sau 01:34`.
- Cooldown áp dụng dù request thành công một phần, thất bại toàn bộ hoặc người dùng rời trang.
- Nếu validation thất bại trước khi gửi request thì không bắt đầu cooldown.
- Không có retry riêng từng Hub trong thời gian cooldown.

## Mô hình kết quả theo Hub

Mỗi Hub có:

- tên Hub và station ID;
- trạng thái tổng: `Chưa kiểm tra`, `Đang tải`, `Hoàn tất`, hoặc `Có lỗi`;
- hàng xá lẻ: tổng đơn, số DG, số GTC, trạng thái lỗi riêng nếu có;
- hàng đóng bao: danh sách TO và tổng số TO, tổng kiện, số bao DG, số bao GTC, trạng thái lỗi riêng nếu có;
- thời điểm hoàn tất gần nhất.

Các phép tính TO dùng cùng quy tắc hiện có: DG khi có ít nhất một `dg_type` khác `1`; GTC khi `high_value === 1`.

## Bảng Overview

### Desktop

Mỗi Hub là một dòng với các cột:

- Hub;
- Xá lẻ: Tổng, DG, GTC;
- Đóng bao: TO, Kiện, DG, GTC;
- Trạng thái;
- Cập nhật;
- Hành động `Xem chi tiết`.

Bảng có hàng `Tổng cộng` tổng hợp tất cả dữ liệu thành công. Hub/nhánh lỗi không đóng góp số liệu giả; phần tổng cần ghi rõ số Hub đã hoàn tất trên tổng số Hub.

### Mobile

Mỗi Hub hiển thị thành card compact:

- header: tên Hub, trạng thái, thời gian cập nhật;
- hai nhóm chỉ số `Hàng xá lẻ` và `Hàng đã đóng bao`;
- nút `Xem chi tiết TO` khi nhánh đóng bao đã thành công.

Card không gây cuộn ngang và dùng màu semantic kèm nhãn chữ, không truyền đạt trạng thái chỉ bằng màu.

## Tổng quan đầu trang

Đầu trang hiển thị:

- số Hub hoàn tất trên tổng số Hub;
- tổng hàng xá lẻ;
- tổng TO;
- tổng số kiện;
- tổng bao DG và GTC của hàng đóng bao;
- thời gian cập nhật gần nhất.

Trong lúc chạy, số liệu cập nhật dần theo Hub hoàn tất. Kết quả cũ được giữ cho đến khi kết quả mới của từng Hub hoàn tất; dòng đó hiển thị trạng thái đang tải để người dùng biết số liệu đang được làm mới.

## Chi tiết Hub

- Chỉ một Hub mở chi tiết tại một thời điểm.
- Chi tiết nằm ngay dưới bảng/card Overview, không điều hướng sang trang khác.
- Tiêu đề hiển thị tên Hub và số TO.
- Dùng lại `TOTable` với `orders` của Hub và một `storageKey` riêng cho Overview.
- Khi chạy làm mới, chi tiết đang mở vẫn giữ; danh sách được thay khi Hub đó có kết quả mới thành công.
- Nếu nhánh TO mới lỗi, chi tiết tiếp tục hiển thị kết quả TO thành công gần nhất và có cảnh báo dữ liệu cũ.

## Validation và trạng thái rỗng

- Không có SOC nguồn hoặc SOC ID: chặn chạy và hướng dẫn vào Cài đặt.
- Không có Cookie: chặn chạy và hướng dẫn bổ sung Cookie.
- Không có Hub: hiển thị empty state và chặn chạy.
- Một hoặc nhiều Hub thiếu ID: chặn toàn bộ lần chạy và liệt kê rõ tên Hub thiếu ID; không gửi request một phần.
- Chưa từng chạy: bảng vẫn liệt kê toàn bộ Hub với số liệu `—` và trạng thái `Chưa kiểm tra`.

## Cấu trúc component và logic

- `InternalHubOverviewPage`: quản lý cấu hình, cooldown, batch run, trạng thái từng Hub và Hub đang mở chi tiết.
- Utility thuần cho phép tổng hợp TO, tổng hợp toàn Overview, cập nhật kết quả từng nhánh và tính thời gian cooldown còn lại.
- Bộ chạy concurrency giới hạn 3 Hub được tách khỏi JSX để có thể unit test.
- Component bảng/card Overview chỉ nhận dữ liệu và callback mở chi tiết; không tự gửi request.
- `TOTable` tiếp tục là nguồn duy nhất để render danh sách TO chi tiết.

## Kiểm thử

- Tổng hợp đúng xá lẻ, TO, kiện, DG và GTC theo Hub và toàn bộ Hub.
- Hub lỗi một nhánh vẫn giữ nhánh thành công; tổng chỉ cộng dữ liệu thực có.
- Concurrency không vượt quá 3 Hub.
- Validation thiếu Hub ID không phát request.
- Cooldown bắt đầu đúng lúc, tồn tại qua reload, đếm ngược đúng và mở khóa sau 120 giây.
- Validation lỗi không tạo cooldown.
- Kết quả cũ được giữ trong lúc refresh và khi request mới thất bại.
- Desktop table, mobile card và mở/đóng chi tiết hoạt động đúng.
- Chạy unit test, lint, production build và responsive browser QA.

## Tiêu chí hoàn thành

- Một lần bấm kiểm tra được toàn bộ Hub nội tỉnh đã cấu hình.
- Người dùng so sánh được các chỉ số xá lẻ và đóng bao giữa các Hub trong một màn hình.
- Có thể mở danh sách TO chi tiết của từng Hub mà không gửi thêm request.
- Không có quá 3 Hub được request đồng thời.
- Không thể khởi chạy lần mới trước khi đủ 2 phút, kể cả reload trang.
- Lỗi cục bộ không làm mất dữ liệu thành công hoặc chặn kết quả của Hub khác.
