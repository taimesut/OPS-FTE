function doGet() {
  return HtmlService.createHtmlOutputFromFile("index")
    .setTitle("PLEIKU SOC Logistics System")
    .addMetaTag("viewport", "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
  Hàm Proxy Server-side gọi API Shopee qua UrlFetchApp của Google Apps Script
  Giúp trình duyệt di động (iOS/Android/PDA) vượt rào CORS 100% không bị chặn
 */
function fetchShopeeApi(endpoint, cookie, method, bodyData) {
  var url = "https://spx.shopee.vn" + endpoint;
  var httpMethod = (method || "get").toLowerCase();

  var options = {
    method: httpMethod,
    headers: {
      "Cookie": cookie || "",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Content-Type": "application/json",
      "Accept": "application/json, text/plain, */*"
    },
    muteHttpExceptions: true
  };

  if (bodyData && httpMethod !== "get") {
    options.payload = typeof bodyData === "string" ? bodyData : JSON.stringify(bodyData);
  }

  try {
    var response = UrlFetchApp.fetch(url, options);
    var responseCode = response.getResponseCode();
    var contentText = response.getContentText();
    var parsedData = {};

    try {
      parsedData = JSON.parse(contentText);
    } catch (e) {
      parsedData = { raw: contentText };
    }

    return {
      status: responseCode,
      data: parsedData
    };
  } catch (err) {
    return {
      status: 500,
      error: err.toString()
    };
  }
}

/**
  Hàm xử lý nhận dữ liệu Log Biên Bản Sự Vụ gửi về từ Web App
  Dữ liệu JSON POST tới gồm:
  - lhTrip: Mã chuyến xe (Cột 1)
  - incidentLogs: Chuỗi đơn sự vụ định dạng "Mã đơn 1@lí do#Mã đơn 2@lí do" (Cột 2)
 */
function doPost(e) {
  try {
    var contents = JSON.parse(e.postData.contents);
    var lhTrip = contents.lhTrip || "";
    var incidentLogs = contents.incidentLogs || "";

    // Mở Google Sheet hiện tại (hoặc Sheet "LogSutVu")
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("LogSutVu") || ss.getActiveSheet();

    // Nếu trang tính chưa có tiêu đề cột, tạo tiêu đề ở dòng 1
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["LH TRIP", "Đơn sự vụ"]);
    }

    // Ghi thêm dòng mới gồm 2 cột chuẩn
    sheet.appendRow([lhTrip, incidentLogs]);

    return ContentService.createTextOutput(
      JSON.stringify({ status: "success", message: "Đã lưu log thành công!" })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({ status: "error", message: error.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}