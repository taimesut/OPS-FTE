var ACCESS_SHEET_NAME = "account";
var ACCESS_EMAIL_COLUMN = 1;
var ACCESS_FIRST_DATA_ROW = 2;
var PDA_CATALOG_SHEET = "PDA_DanhMuc";
var PDA_SESSION_SHEET = "PDA_PhienBanGiao";
var PDA_DETAIL_SHEET = "PDA_ChiTietBanGiao";
var PDA_PHOTO_FOLDER = "PDA_HANDOVER_PHOTOS";
var PDA_TIMEZONE = "Asia/Bangkok";
var PDA_SHIFTS = ["06:00-15:00", "13:00-22:00", "22:00-06:00"];
var PDA_CATALOG_HEADERS = ["Tên PDA", "Mã key", "Hoạt động"];
var PDA_SESSION_HEADERS = ["session_id", "handover_date", "shift", "status", "created_by", "created_at", "submitted_by", "submitted_at", "required_count", "completed_count"];
var PDA_DETAIL_HEADERS = ["session_id", "pda_name", "scan_at", "photo_at", "photo_file_id", "photo_url", "completed"];
var PDA_MAX_IMAGE_BYTES = 4 * 1024 * 1024;

function normalizeEmail_(value) {
  return String(value || "").trim().toLowerCase();
}

function getAllowedEmails_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = spreadsheet.getSheetByName(ACCESS_SHEET_NAME);

  if (!sheet) {
    throw new Error("Access sheet is missing");
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < ACCESS_FIRST_DATA_ROW) {
    return [];
  }

  return sheet
    .getRange(
      ACCESS_FIRST_DATA_ROW,
      ACCESS_EMAIL_COLUMN,
      lastRow - ACCESS_FIRST_DATA_ROW + 1,
      1
    )
    .getDisplayValues()
    .map(function (row) {
      return normalizeEmail_(row[0]);
    })
    .filter(function (email) {
      return email !== "";
    });
}

function getCurrentUserAccess_() {
  var email = "";

  try {
    email = normalizeEmail_(Session.getActiveUser().getEmail());
    if (!email) {
      return { allowed: false, email: "", reason: "EMAIL_UNAVAILABLE" };
    }

    var allowed = getAllowedEmails_().indexOf(email) !== -1;
    return {
      allowed: allowed,
      email: email,
      reason: allowed ? "AUTHORIZED" : "NOT_LISTED"
    };
  } catch (error) {
    console.error("Access check failed");
    return { allowed: false, email: email, reason: "ACCESS_CHECK_FAILED" };
  }
}

function escapeHtml_(value) {
  return String(value || "").replace(/[&<>"']/g, function (character) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    }[character];
  });
}

function createAccessDeniedOutput_(access) {
  var accountMessage = access.email
    ? "Tài khoản hiện tại: <strong>" + escapeHtml_(access.email) + "</strong>"
    : "Không xác định được email đăng nhập. Hãy mở lại bằng tài khoản công ty.";

  var html = [
    "<!doctype html>",
    '<html lang="vi">',
    "<head>",
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    "<title>Không có quyền truy cập</title>",
    "<style>",
    "*{box-sizing:border-box}",
    "body{min-height:100vh;margin:0;display:grid;place-items:center;padding:24px;background:linear-gradient(135deg,rgba(21,38,54,.035) 25%,transparent 25%) 0 0/16px 16px,#f3f5f7;color:#17212b;font-family:Arial,sans-serif}",
    ".card{width:min(100%,430px);overflow:hidden;padding:0 24px 32px;background:#fff;border:1px solid #dce1e5;border-radius:9px;box-shadow:0 20px 50px rgba(30,43,56,.13);text-align:center}",
    ".rail{height:8px;margin:0 -24px 26px;background:repeating-linear-gradient(-45deg,#ee4d2d 0 11px,#ffb19f 11px 19px)}",
    ".eyebrow{margin:0 0 12px;color:#d94327;font-size:.72rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase}",
    ".icon{width:64px;height:64px;margin:0 auto 20px;display:grid;place-items:center;border-radius:50%;background:#fff0ed;color:#d94327;font-size:32px;font-weight:800}",
    "h1{margin:0 0 14px;font-size:1.75rem}",
    "p{margin:10px 0;color:#596773;line-height:1.55;overflow-wrap:anywhere}",
    "strong{color:#17212b}",
    ".help{margin-top:22px;padding-top:18px;border-top:1px solid #e4e8eb;font-size:.9rem}",
    "</style>",
    "</head>",
    "<body>",
    '<main class="card">',
    '<div class="rail" aria-hidden="true"></div>',
    '<p class="eyebrow">OPS FTE · Kiểm soát truy cập</p>',
    '<div class="icon" aria-hidden="true">!</div>',
    "<h1>Không có quyền truy cập</h1>",
    "<p>" + accountMessage + "</p>",
    '<p class="help">Liên hệ quản trị viên để thêm email vào danh sách được phép.</p>',
    "</main>",
    "</body>",
    "</html>"
  ].join("");

  return HtmlService.createHtmlOutput(html)
    .setTitle("Không có quyền truy cập")
    .addMetaTag("viewport", "width=device-width, initial-scale=1.0");
}

function doGet() {
  var access = getCurrentUserAccess_();
  if (!access.allowed) {
    return createAccessDeniedOutput_(access);
  }

  return HtmlService.createHtmlOutputFromFile("index")
    .setTitle("OPS FTE")
    .addMetaTag("viewport", "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
  Hàm Proxy Server-side gọi API Shopee qua UrlFetchApp của Google Apps Script
  Giúp trình duyệt di động (iOS/Android/PDA) vượt rào CORS 100% không bị chặn
 */
function fetchShopeeApi(endpoint, cookie, method, bodyData) {
  var access = getCurrentUserAccess_();
  if (!access.allowed) {
    return {
      status: 403,
      error: "Bạn không có quyền sử dụng chức năng này."
    };
  }

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

function requirePdaAccess_() {
  var access = getCurrentUserAccess_();
  if (!access.allowed) {
    throw new Error("Bạn không có quyền sử dụng chức năng bàn giao PDA.");
  }
  return normalizeEmail_(access.email);
}

function ensurePdaSheets_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var definitions = [
    [PDA_CATALOG_SHEET, PDA_CATALOG_HEADERS],
    [PDA_SESSION_SHEET, PDA_SESSION_HEADERS],
    [PDA_DETAIL_SHEET, PDA_DETAIL_HEADERS]
  ];

  definitions.forEach(function (definition) {
    var sheet = spreadsheet.getSheetByName(definition[0]);
    if (!sheet) {
      sheet = spreadsheet.insertSheet(definition[0]);
    }
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, definition[1].length).setValues([definition[1]]);
    }
  });

  return {
    catalog: spreadsheet.getSheetByName(PDA_CATALOG_SHEET),
    sessions: spreadsheet.getSheetByName(PDA_SESSION_SHEET),
    details: spreadsheet.getSheetByName(PDA_DETAIL_SHEET)
  };
}

function validatePdaHandoverDate_(value) {
  var date = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Ngày bàn giao không hợp lệ.");
  }
  var parsed = new Date(date + "T12:00:00Z");
  if (isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error("Ngày bàn giao không hợp lệ.");
  }
  var today = Utilities.formatDate(new Date(), PDA_TIMEZONE, "yyyy-MM-dd");
  if (date > today) {
    throw new Error("Không thể chọn ngày bàn giao trong tương lai.");
  }
  return date;
}

function validatePdaShift_(value) {
  var shift = String(value || "").trim();
  if (PDA_SHIFTS.indexOf(shift) === -1) {
    throw new Error("Ca làm việc không hợp lệ.");
  }
  return shift;
}

function pdaIso_(value) {
  if (!value) return null;
  if (typeof value.toISOString === "function") return value.toISOString();
  var parsed = new Date(value);
  return isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function serializePdaItem_(row) {
  return {
    pdaName: String(row[1] || ""),
    scanAt: pdaIso_(row[2]),
    photoAt: pdaIso_(row[3]),
    photoUrl: row[5] ? String(row[5]) : null,
    completed: row[6] === true
  };
}

function serializePdaSession_(sessionRow, detailRows) {
  var items = detailRows.map(serializePdaItem_);
  return {
    sessionId: String(sessionRow[0] || ""),
    handoverDate: String(sessionRow[1] || ""),
    shift: String(sessionRow[2] || ""),
    status: String(sessionRow[3] || ""),
    createdBy: String(sessionRow[4] || ""),
    createdAt: pdaIso_(sessionRow[5]),
    submittedBy: sessionRow[6] ? String(sessionRow[6]) : null,
    submittedAt: pdaIso_(sessionRow[7]),
    requiredCount: Number(sessionRow[8] || 0),
    completedCount: Number(sessionRow[9] || 0),
    items: items
  };
}

function pdaRows_(sheet) {
  var values = sheet.getDataRange().getValues();
  return values.length > 1 ? values.slice(1) : [];
}

function activePdaCatalog_(sheet) {
  var names = {};
  var secrets = {};
  var active = [];
  pdaRows_(sheet).forEach(function (row) {
    var enabled = row[2] === true || String(row[2] || "").trim().toUpperCase() === "TRUE";
    if (!enabled) return;
    var name = String(row[0] || "").trim();
    var secret = String(row[1] || "").trim();
    if (!name || !secret) {
      throw new Error("Danh mục PDA hoạt động có dữ liệu không hợp lệ.");
    }
    if (names[name]) throw new Error("Danh mục PDA bị trùng tên máy.");
    if (secrets[secret]) throw new Error("Danh mục PDA bị trùng mã key.");
    names[name] = true;
    secrets[secret] = true;
    active.push({ name: name, secret: secret });
  });
  if (active.length === 0) {
    throw new Error("Danh mục chưa có PDA hoạt động.");
  }
  return active;
}

function pdaDetailsForSession_(detailSheet, sessionId) {
  return pdaRows_(detailSheet).filter(function (row) {
    return String(row[0]) === sessionId;
  });
}

function pdaFindSession_(sessionSheet, sessionId) {
  var rows = pdaRows_(sessionSheet);
  for (var index = 0; index < rows.length; index += 1) {
    if (String(rows[index][0]) === sessionId) {
      return { row: rows[index], sheetRow: index + 2 };
    }
  }
  return null;
}

function pdaOwnedDraft_(sessionSheet, sessionId, email) {
  var found = pdaFindSession_(sessionSheet, sessionId);
  if (!found || String(found.row[3]) !== "DRAFT") {
    throw new Error("Không tìm thấy phiên bàn giao nháp.");
  }
  if (normalizeEmail_(found.row[4]) !== email) {
    throw new Error("Bạn không có quyền sửa phiên bàn giao này.");
  }
  return found;
}

function getPdaHandoverBootstrap(handoverDate, shift) {
  var email = requirePdaAccess_();
  var date = validatePdaHandoverDate_(handoverDate);
  var normalizedShift = validatePdaShift_(shift);
  var sheets = ensurePdaSheets_();
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sessionRows = pdaRows_(sheets.sessions);
    var existing = null;
    sessionRows.some(function (row) {
      if (String(row[1]) === date && String(row[2]) === normalizedShift && String(row[3]) === "SUBMITTED") {
        existing = row;
        return true;
      }
      return false;
    });
    if (!existing) {
      sessionRows.some(function (row) {
        if (String(row[1]) === date && String(row[2]) === normalizedShift && String(row[3]) === "DRAFT" && normalizeEmail_(row[4]) === email) {
          existing = row;
          return true;
        }
        return false;
      });
    }
    if (existing) {
      return serializePdaSession_(existing, pdaDetailsForSession_(sheets.details, String(existing[0])));
    }

    var catalog = activePdaCatalog_(sheets.catalog);
    var sessionId = Utilities.getUuid();
    var createdAt = new Date();
    var sessionRow = [sessionId, date, normalizedShift, "DRAFT", email, createdAt, "", "", catalog.length, 0];
    sheets.sessions.appendRow(sessionRow);
    if (catalog.length > 0) {
      sheets.details.getRange(sheets.details.getLastRow() + 1, 1, catalog.length, PDA_DETAIL_HEADERS.length).setValues(
        catalog.map(function (pda) { return [sessionId, pda.name, "", "", "", "", false]; })
      );
    }
    return serializePdaSession_(sessionRow, pdaDetailsForSession_(sheets.details, sessionId));
  } finally {
    lock.releaseLock();
  }
}

function validatePdaQr(sessionId, secret) {
  var email = requirePdaAccess_();
  var normalizedSessionId = String(sessionId || "").trim();
  var normalizedSecret = String(secret || "").trim();
  if (!normalizedSessionId) throw new Error("Phiên bàn giao không hợp lệ.");
  if (!normalizedSecret || normalizedSecret.length > 512) throw new Error("Mã QR PDA không hợp lệ cho phiên này.");
  var sheets = ensurePdaSheets_();
  pdaOwnedDraft_(sheets.sessions, normalizedSessionId, email);

  var detailRows = pdaRows_(sheets.details);
  var snapshotNames = Object.create(null);
  detailRows.forEach(function (row) {
    if (String(row[0]) === normalizedSessionId) {
      snapshotNames[String(row[1])] = true;
    }
  });
  var matchedName = "";
  pdaRows_(sheets.catalog).some(function (row) {
    var catalogName = String(row[0] || "").trim();
    if (snapshotNames[catalogName] && String(row[1] || "").trim() === normalizedSecret) {
      matchedName = catalogName;
      return true;
    }
    return false;
  });
  var detailIndex = -1;
  for (var index = 0; index < detailRows.length; index += 1) {
    if (String(detailRows[index][0]) === normalizedSessionId && String(detailRows[index][1]) === matchedName) {
      detailIndex = index;
      break;
    }
  }
  if (!matchedName || detailIndex === -1) throw new Error("Mã QR PDA không hợp lệ cho phiên này.");
  var row = detailRows[detailIndex];
  if (row[6] === true) return serializePdaItem_(row);
  row[2] = new Date();
  sheets.details.getRange(detailIndex + 2, 1, 1, PDA_DETAIL_HEADERS.length).setValues([row]);
  return serializePdaItem_(row);
}

function pdaPhotoFolder_() {
  var folders = DriveApp.getFoldersByName(PDA_PHOTO_FOLDER);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(PDA_PHOTO_FOLDER);
}

function pdaSafeFilePart_(value) {
  return String(value || "").replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 100);
}

function pdaUpdateCompletedCount_(sessionSheet, sessionId, detailSheet) {
  var session = pdaFindSession_(sessionSheet, sessionId);
  if (!session) throw new Error("Không tìm thấy phiên bàn giao.");
  var completed = pdaDetailsForSession_(detailSheet, sessionId).filter(function (row) { return row[6] === true; }).length;
  session.row[9] = completed;
  sessionSheet.getRange(session.sheetRow, 1, 1, PDA_SESSION_HEADERS.length).setValues([session.row]);
  return completed;
}

function uploadPdaEvidence(sessionId, pdaName, dataUrl) {
  var email = requirePdaAccess_();
  var normalizedSessionId = String(sessionId || "").trim();
  var normalizedName = String(pdaName || "").trim();
  if (!normalizedSessionId || !normalizedName || normalizedName.length > 128) throw new Error("PDA hoặc phiên bàn giao không hợp lệ.");
  var sheets = ensurePdaSheets_();
  pdaOwnedDraft_(sheets.sessions, normalizedSessionId, email);
  var details = pdaRows_(sheets.details);
  var detailIndex = -1;
  for (var index = 0; index < details.length; index += 1) {
    if (String(details[index][0]) === normalizedSessionId && String(details[index][1]) === normalizedName) {
      detailIndex = index;
      break;
    }
  }
  if (detailIndex === -1) throw new Error("PDA không thuộc phiên bàn giao này.");
  var oldRow = details[detailIndex].slice();
  if (!oldRow[2]) throw new Error("Bạn phải quét mã PDA hợp lệ trước khi chụp ảnh.");

  var match = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
  if (!match) throw new Error("Ảnh bằng chứng phải là JPEG hoặc PNG hợp lệ.");
  var bytes;
  try {
    bytes = Utilities.base64Decode(match[2]);
  } catch (error) {
    throw new Error("Dữ liệu ảnh bằng chứng không hợp lệ.");
  }
  if (!bytes.length) throw new Error("Ảnh bằng chứng không được để trống.");
  if (bytes.length > PDA_MAX_IMAGE_BYTES) throw new Error("Ảnh bằng chứng vượt quá 4 MiB.");

  var extension = match[1] === "image/png" ? "png" : "jpg";
  var now = new Date();
  var filename = pdaSafeFilePart_(normalizedSessionId) + "_" + pdaSafeFilePart_(normalizedName) + "_" + now.getTime() + "." + extension;
  var blob = Utilities.newBlob(bytes, match[1], filename);
  var file = pdaPhotoFolder_().createFile(blob);
  try {
    try {
      file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (sharingError) {
      // Workspace policy may disallow domain-link sharing; the private file remains valid.
    }
    var nextRow = oldRow.slice();
    nextRow[3] = now;
    nextRow[4] = file.getId();
    nextRow[5] = file.getUrl();
    nextRow[6] = true;
    sheets.details.getRange(detailIndex + 2, 1, 1, PDA_DETAIL_HEADERS.length).setValues([nextRow]);
    try {
      pdaUpdateCompletedCount_(sheets.sessions, normalizedSessionId, sheets.details);
    } catch (countError) {
      sheets.details.getRange(detailIndex + 2, 1, 1, PDA_DETAIL_HEADERS.length).setValues([oldRow]);
      throw countError;
    }
    if (oldRow[4]) {
      try { DriveApp.getFileById(String(oldRow[4])).setTrashed(true); } catch (trashError) {}
    }
    return serializePdaItem_(nextRow);
  } catch (error) {
    try { file.setTrashed(true); } catch (trashNewError) {}
    throw error;
  }
}

function submitPdaHandover(sessionId) {
  var email = requirePdaAccess_();
  var normalizedSessionId = String(sessionId || "").trim();
  if (!normalizedSessionId) throw new Error("Phiên bàn giao không hợp lệ.");
  var sheets = ensurePdaSheets_();
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var session = pdaOwnedDraft_(sheets.sessions, normalizedSessionId, email);
    var sessionRows = pdaRows_(sheets.sessions);
    var duplicate = sessionRows.some(function (row) {
      return String(row[0]) !== normalizedSessionId && String(row[1]) === String(session.row[1]) &&
        String(row[2]) === String(session.row[2]) && String(row[3]) === "SUBMITTED";
    });
    if (duplicate) throw new Error("Ngày và ca này đã được bàn giao.");
    var details = pdaDetailsForSession_(sheets.details, normalizedSessionId);
    if (details.length === 0 || details.length !== Number(session.row[8])) {
      throw new Error("Phiên bàn giao chưa có đủ danh sách PDA bắt buộc.");
    }
    var complete = details.every(function (row) {
      return Boolean(row[2] && row[3] && row[4] && row[5] && row[6] === true);
    });
    if (!complete) throw new Error("Phiên bàn giao chưa hoàn tất toàn bộ PDA.");
    session.row[3] = "SUBMITTED";
    session.row[6] = email;
    session.row[7] = new Date();
    session.row[9] = details.length;
    sheets.sessions.getRange(session.sheetRow, 1, 1, PDA_SESSION_HEADERS.length).setValues([session.row]);
    return serializePdaSession_(session.row, details);
  } finally {
    lock.releaseLock();
  }
}
