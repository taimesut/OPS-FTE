var INCIDENT_LOG_SHEET_NAME_ = "LogSutVu";
var INCIDENT_REPORT_SHEET_NAME_ = "Biên bản sự vụ";
var INCIDENT_SCHEMA_VERSION_ = 1;
var INCIDENT_MAX_BODY_LENGTH_ = 500000;
var INCIDENT_MAX_ITEMS_ = 2000;
var INCIDENT_REASONS_ = ["Rách", "Bung seal", "Không TO", "Thiếu", "Bể vỡ", "Dư", "Khác"];
var INCIDENT_LOG_HEADERS_ = [
  "LH TRIP", "Đơn sự vụ", "Thời gian nhận", "SOC", "Trip ID",
  "Trip Name", "Trip Date", "Trip Type", "Vehicle Plate", "Vehicle Type",
  "Driver", "Helper", "Agency", "Seal", "Expected Quantity", "Payload JSON"
];
var INCIDENT_BASE_FIRST_ROW_ = 21;
var INCIDENT_BASE_ROW_COUNT_ = 30;
var INCIDENT_SIGNATURE_BASE_ROW_ = 51;

function incidentText_(value, maxLength) {
  var text = typeof value === "string" ? value.trim() : "";
  if (text.length > maxLength) {
    throw new Error("Dữ liệu log vượt quá độ dài cho phép.");
  }
  return text;
}

function incidentOptionalText_(value, maxLength, label) {
  if (value === null || value === undefined) return "";
  if (typeof value !== "string") throw new Error(label + " không hợp lệ.");
  return incidentText_(value, maxLength);
}

function incidentOptionalNumber_(value, label) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "number" || !isFinite(value)) {
    throw new Error(label + " không hợp lệ.");
  }
  return value;
}

function normalizeIncidentReason_(value) {
  var reason = incidentText_(value, 40);
  return INCIDENT_REASONS_.indexOf(reason) >= 0 ? reason : "";
}

function parseLegacyIncidentLogs_(value) {
  var byCode = Object.create(null);
  var result = [];
  incidentText_(value, INCIDENT_MAX_BODY_LENGTH_).split("#").forEach(function (segment) {
    var separator = segment.indexOf("@");
    if (separator <= 0) return;
    var code = incidentText_(segment.slice(0, separator), 120).toUpperCase();
    var reasons = segment.slice(separator + 1)
      .split(" + ")
      .map(normalizeIncidentReason_)
      .filter(Boolean);
    if (!code || !reasons.length) return;
    if (!byCode[code]) {
      byCode[code] = { code: code, reasons: [] };
      result.push(byCode[code]);
    }
    reasons.forEach(function (reason) {
      if (byCode[code].reasons.indexOf(reason) < 0) {
        byCode[code].reasons.push(reason);
      }
    });
  });
  if (result.length === 0 || result.length > INCIDENT_MAX_ITEMS_) {
    throw new Error("Danh sách sự vụ không hợp lệ.");
  }
  return result;
}

function normalizeStructuredIncidents_(items) {
  if (!Array.isArray(items) || items.length === 0 || items.length > INCIDENT_MAX_ITEMS_) {
    throw new Error("Danh sách sự vụ không hợp lệ.");
  }
  var byCode = Object.create(null);
  var result = [];
  items.forEach(function (item) {
    var code = incidentText_(item && item.code, 120).toUpperCase();
    var sourceReasons = item && Array.isArray(item.reasons) ? item.reasons : null;
    var reasons = sourceReasons
      ? sourceReasons.map(normalizeIncidentReason_).filter(Boolean)
      : [];
    if (!code || !sourceReasons || reasons.length === 0 || reasons.length !== sourceReasons.length) {
      throw new Error("Mã hoặc lý do sự vụ không hợp lệ.");
    }
    if (!byCode[code]) {
      byCode[code] = { code: code, reasons: [] };
      result.push(byCode[code]);
    }
    reasons.forEach(function (reason) {
      if (byCode[code].reasons.indexOf(reason) < 0) {
        byCode[code].reasons.push(reason);
      }
    });
  });
  return result;
}

function normalizeIncidentTrip_(value, lhTrip) {
  if (!value || typeof value !== "object" || !Number.isInteger(value.id) || value.id <= 0) {
    throw new Error("Thông tin LH Trip không hợp lệ.");
  }
  var tripNumber = incidentOptionalText_(value.tripNumber, 80, "LH Trip").toUpperCase();
  if (tripNumber !== lhTrip) throw new Error("Thông tin LH Trip không khớp.");
  if (!Array.isArray(value.sealCodes)) throw new Error("Danh sách seal không hợp lệ.");
  var sealCodes = value.sealCodes.map(function (seal) {
    if (typeof seal !== "string") throw new Error("Mã seal không hợp lệ.");
    return incidentText_(seal, 80);
  }).filter(Boolean);

  return {
    id: value.id,
    tripNumber: tripNumber,
    tripName: incidentOptionalText_(value.tripName, 240, "Trip Name"),
    tripDate: incidentOptionalNumber_(value.tripDate, "Ngày chuyến"),
    tripTypeName: incidentOptionalText_(value.tripTypeName, 80, "Trip Type"),
    tripSource: incidentOptionalNumber_(value.tripSource, "Nguồn chuyến"),
    costType: incidentOptionalNumber_(value.costType, "Loại chi phí"),
    driverName: incidentOptionalText_(value.driverName, 240, "Tài xế"),
    secondDriverName: incidentOptionalText_(value.secondDriverName, 240, "Phụ xe"),
    vehicleNumber: incidentOptionalText_(value.vehicleNumber, 80, "Biển số xe"),
    vehicleTypeName: incidentOptionalText_(value.vehicleTypeName, 120, "Loại xe"),
    agencyName: incidentOptionalText_(value.agencyName, 160, "Nhà xe"),
    sealCodes: sealCodes,
    remark: incidentOptionalText_(value.remark, 500, "Ghi chú"),
    operator: incidentOptionalText_(value.operator, 240, "Người thao tác"),
    expectedQuantity: incidentOptionalNumber_(value.expectedQuantity, "Số kiện dự kiến")
  };
}

function parseIncidentRequest_(e) {
  var body = e && e.postData ? String(e.postData.contents || "") : "";
  if (!body || body.length > INCIDENT_MAX_BODY_LENGTH_) {
    throw new Error("Request log không hợp lệ.");
  }
  var raw = JSON.parse(body);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Request log không hợp lệ.");
  }
  if (typeof raw.lhTrip !== "string" || typeof raw.incidentLogs !== "string") {
    throw new Error("Thiếu LH Trip hoặc danh sách sự vụ.");
  }
  var lhTrip = incidentText_(raw.lhTrip, 80).toUpperCase();
  var incidentLogs = incidentText_(raw.incidentLogs, INCIDENT_MAX_BODY_LENGTH_);
  if (!lhTrip || !incidentLogs) {
    throw new Error("Thiếu LH Trip hoặc danh sách sự vụ.");
  }

  if (raw.schemaVersion === undefined) {
    return {
      schemaVersion: 0,
      lhTrip: lhTrip,
      incidentLogs: incidentLogs,
      incidents: parseLegacyIncidentLogs_(incidentLogs)
    };
  }
  if (raw.schemaVersion !== INCIDENT_SCHEMA_VERSION_) {
    throw new Error("Schema log không được hỗ trợ.");
  }

  var trip = normalizeIncidentTrip_(raw.trip, lhTrip);
  var createdAt = incidentOptionalText_(raw.createdAt, 40, "Thời gian tạo log");
  if (!createdAt || isNaN(new Date(createdAt).getTime())) {
    throw new Error("Thời gian tạo log không hợp lệ.");
  }
  var incidents = normalizeStructuredIncidents_(raw.incidents);
  return {
    schemaVersion: INCIDENT_SCHEMA_VERSION_,
    lhTrip: lhTrip,
    incidentLogs: incidentLogs,
    soc: incidentOptionalText_(raw.soc, 160, "SOC"),
    createdAt: createdAt,
    trip: trip,
    incidents: incidents,
    raw: raw
  };
}

function ensureIncidentLogSheet_(spreadsheet) {
  var sheet = spreadsheet.getSheetByName(INCIDENT_LOG_SHEET_NAME_);
  if (!sheet) sheet = spreadsheet.insertSheet(INCIDENT_LOG_SHEET_NAME_);
  sheet.getRange(1, 1, 1, INCIDENT_LOG_HEADERS_.length)
    .setValues([INCIDENT_LOG_HEADERS_]);
  return sheet;
}

function incidentPostOutput_(status, message) {
  return ContentService.createTextOutput(JSON.stringify({ status: status, message: message }))
    .setMimeType(ContentService.MimeType.JSON);
}

function incidentLogRow_(payload, receivedAt) {
  if (payload.schemaVersion === 0) {
    return [payload.lhTrip, payload.incidentLogs, receivedAt, "", "", "", "", "", "", "", "", "", "", "", "", ""];
  }
  var trip = payload.trip;
  return [
    payload.lhTrip,
    payload.incidentLogs,
    receivedAt,
    payload.soc,
    trip.id,
    trip.tripName,
    trip.tripDate === null ? "" : trip.tripDate,
    trip.tripTypeName,
    trip.vehicleNumber,
    trip.vehicleTypeName,
    trip.driverName,
    trip.secondDriverName,
    trip.agencyName,
    trip.sealCodes.join(", "),
    trip.expectedQuantity === null ? "" : trip.expectedQuantity,
    JSON.stringify(payload.raw)
  ];
}

function handleIncidentReportPost_(e) {
  var lock = null;
  var lockAcquired = false;
  try {
    var payload = parseIncidentRequest_(e);
    lock = LockService.getDocumentLock();
    lock.waitLock(10000);
    lockAcquired = true;
    var sheet = ensureIncidentLogSheet_(SpreadsheetApp.getActiveSpreadsheet());
    sheet.appendRow(incidentLogRow_(payload, new Date()));
    return incidentPostOutput_("success", "Đã lưu log thành công!");
  } catch (error) {
    console.error("Incident log write failed");
    return incidentPostOutput_(
      "error",
      error && error.message ? String(error.message) : "Không thể lưu log."
    );
  } finally {
    if (lockAcquired) lock.releaseLock();
  }
}

function incidentExtraRowsKey_(sheet) {
  return "INCIDENT_EXTRA_ROWS_" + sheet.getSheetId();
}

function resetIncidentReportRows_(sheet, properties) {
  var key = incidentExtraRowsKey_(sheet);
  var previousExtra = Number(properties.getProperty(key) || 0);
  if (Number.isInteger(previousExtra) && previousExtra > 0) {
    sheet.deleteRows(INCIDENT_SIGNATURE_BASE_ROW_, previousExtra);
  }
  properties.deleteProperty(key);
  sheet.getRange(INCIDENT_BASE_FIRST_ROW_, 1, INCIDENT_BASE_ROW_COUNT_, 9)
    .clearContent();
}

function clearIncidentReportFields_(sheet) {
  sheet.getRange("A10").setValue("Tại :");
  sheet.getRangeList(["L5", "L9", "L11", "L13", "L15", "L17", "L19", "L21", "L23", "L25"])
    .clearContent();
  sheet.getRange("D14").setValue("Seal số: ...............");
}

function findLatestIncidentLog_(sheet, lhTrip) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var values = sheet.getRange(2, 1, lastRow - 1, INCIDENT_LOG_HEADERS_.length)
    .getValues();
  for (var index = values.length - 1; index >= 0; index -= 1) {
    if (incidentText_(values[index][0], 80).toUpperCase() === lhTrip) {
      return values[index];
    }
  }
  return null;
}

function storedIncidentPayload_(row) {
  var payloadJson = incidentText_(row[15], INCIDENT_MAX_BODY_LENGTH_);
  if (!payloadJson) {
    var incidentLogs = incidentText_(row[1], INCIDENT_MAX_BODY_LENGTH_);
    return {
      schemaVersion: 0,
      lhTrip: incidentText_(row[0], 80).toUpperCase(),
      incidentLogs: incidentLogs,
      incidents: parseLegacyIncidentLogs_(incidentLogs)
    };
  }
  return parseIncidentRequest_({ postData: { contents: payloadJson } });
}

function ensureIncidentReportCapacity_(sheet, itemCount, properties) {
  var extra = Math.max(0, itemCount - INCIDENT_BASE_ROW_COUNT_);
  if (extra > 0) {
    sheet.insertRowsBefore(INCIDENT_SIGNATURE_BASE_ROW_, extra);
    sheet.getRange(INCIDENT_BASE_FIRST_ROW_ + INCIDENT_BASE_ROW_COUNT_ - 1, 1, 1, 9)
      .copyTo(
        sheet.getRange(INCIDENT_SIGNATURE_BASE_ROW_, 1, extra, 9),
        SpreadsheetApp.CopyPasteType.PASTE_FORMAT,
        false
      );
    properties.setProperty(incidentExtraRowsKey_(sheet), String(extra));
  }
}

function incidentTableValues_(incidents) {
  return incidents.map(function (item, index) {
    var flags = Object.create(null);
    item.reasons.forEach(function (reason) { flags[reason] = true; });
    return [
      index + 1,
      item.code,
      flags["Rách"] ? "X" : "",
      flags["Bung seal"] ? "X" : "",
      flags["Không TO"] ? "X" : "",
      flags["Thiếu"] ? "X" : "",
      flags["Bể vỡ"] ? "X" : "",
      flags["Dư"] ? "X" : "",
      flags["Khác"] ? "X" : ""
    ];
  });
}

function displayTripSource_(value) {
  return value === 0
    ? "Schedule"
    : value === null || value === undefined || value === ""
      ? ""
      : String(value);
}

function displayCostType_(value) {
  return value === 1
    ? "By Trip"
    : value === null || value === undefined || value === ""
      ? ""
      : String(value);
}

function fillIncidentReport_(sheet, payload, properties) {
  ensureIncidentReportCapacity_(sheet, payload.incidents.length, properties);
  if (payload.incidents.length > 0) {
    sheet.getRange(INCIDENT_BASE_FIRST_ROW_, 1, payload.incidents.length, 9)
      .setValues(incidentTableValues_(payload.incidents));
  }
  if (payload.schemaVersion === 0) return;

  var trip = payload.trip;
  sheet.getRange("A10").setValue("Tại :" + (payload.soc ? " " + payload.soc : ""));
  sheet.getRange("L5").setValue(trip.tripName);
  sheet.getRange("L9").setValue(
    typeof trip.tripDate === "number" && isFinite(trip.tripDate) && trip.tripDate > 0
      ? new Date(trip.tripDate * 1000)
      : ""
  );
  sheet.getRange("L11").setValue(displayTripSource_(trip.tripSource));
  sheet.getRange("L13").setValue(trip.tripTypeName);
  sheet.getRange("L15").setValue(displayCostType_(trip.costType));
  sheet.getRange("L17").setValue(trip.agencyName);
  sheet.getRange("L19").setValue(trip.vehicleTypeName);
  sheet.getRange("L21").setValue(trip.vehicleNumber);
  sheet.getRange("L23").setValue(trip.driverName);
  sheet.getRange("L25").setValue(trip.secondDriverName || "-");
  sheet.getRange("D14").setValue(
    trip.sealCodes.length
      ? "Seal số: " + trip.sealCodes.join(", ")
      : "Seal số: ..............."
  );
}

function handleIncidentReportEdit_(e) {
  var range = e && e.range;
  if (
    !range ||
    range.getNumRows() !== 1 ||
    range.getNumColumns() !== 1 ||
    range.getA1Notation() !== "L3"
  ) return;
  var reportSheet = range.getSheet();
  if (reportSheet.getName() !== INCIDENT_REPORT_SHEET_NAME_) return;

  var spreadsheet = reportSheet.getParent();
  var lock = LockService.getDocumentLock();
  var lockAcquired = false;
  try {
    lock.waitLock(10000);
    lockAcquired = true;
    var properties = PropertiesService.getDocumentProperties();
    resetIncidentReportRows_(reportSheet, properties);
    clearIncidentReportFields_(reportSheet);
    var lhTrip = incidentText_(range.getDisplayValue(), 80).toUpperCase();
    if (!lhTrip) return;

    var logSheet = spreadsheet.getSheetByName(INCIDENT_LOG_SHEET_NAME_);
    var row = logSheet ? findLatestIncidentLog_(logSheet, lhTrip) : null;
    if (!row) {
      spreadsheet.toast("Không tìm thấy log cho " + lhTrip, "Biên bản sự vụ", 5);
      return;
    }
    var payload = storedIncidentPayload_(row);
    fillIncidentReport_(reportSheet, payload, properties);
    spreadsheet.toast(
      payload.schemaVersion === 0
        ? "Đã tải danh sách sự vụ từ log cũ; log này không có chi tiết chuyến."
        : "Đã tải biên bản cho " + lhTrip,
      "Biên bản sự vụ",
      5
    );
  } catch (error) {
    spreadsheet.toast(
      "Không thể tải biên bản: dữ liệu log không hợp lệ.",
      "Biên bản sự vụ",
      5
    );
    console.error("Incident report lookup failed");
  } finally {
    if (lockAcquired) lock.releaseLock();
  }
}

function onEdit(e) {
  handleIncidentReportEdit_(e);
}
