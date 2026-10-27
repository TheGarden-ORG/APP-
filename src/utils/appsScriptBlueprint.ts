/**
 * Complete Google Apps Script + Single-File Index.html Reference Blueprint per Section 16
 */

export interface AppsScriptModuleFile {
  fileName: string;
  roleLao: string;
  code: string;
}

export const APPS_SCRIPT_MODULES: AppsScriptModuleFile[] = [
  {
    fileName: 'Code.gs',
    roleLao: 'ເປີດ Web App, doGet(), ກວດ session ແລະ getBootstrap()',
    code: `/**
 * The Garden Payroll System — Code.gs
 * Timezone: Asia/Vientiane | Period Rule: 26–25
 */
function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('ລະບົບນຳເຂົ້າຂໍ້ມູນເງິນເດືອນ The Garden')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getBootstrap() {
  const userEmail = Session.getActiveUser().getEmail() || 'anonymous@thegarden.la';
  const role = AuthService.resolveUserRole(userEmail);
  const settings = SettingsService.getSettings();
  const periods = PeriodService.listPeriods();
  const employees = EmployeeService.listEmployees(userEmail, role);
  const references = SettingsService.getReferenceLists();
  return {
    userEmail,
    role,
    settings,
    periods,
    employees,
    references,
    serverTimeVientiane: Utilities.formatDate(new Date(), 'Asia/Vientiane', "yyyy-MM-dd'T'HH:mm:ssXXX")
  };
}`,
  },
  {
    fileName: 'EventService.gs',
    roleLao: 'ສ້າງ/ແກ້/ກວດ 7 ປະເພດ events ພາຍໃຕ້ LockService ແລະ Idempotency Key',
    code: `/**
 * EventService.gs — Server-authoritative sequence lock & idempotency guard
 */
const EventService = {
  saveEvent: function(payload, expectedVersion, idempotencyKey) {
    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      const userEmail = Session.getActiveUser().getEmail();
      const role = AuthService.resolveUserRole(userEmail);
      AuthService.assertCanWriteEvent(role, payload.periodId);

      const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SYSTEM_SPREADSHEET_ID'));
      const sheetName = this.mapCategoryToSheet(payload.category);
      const sheet = ss.getSheetByName(sheetName);

      // Check idempotency key to prevent duplicate saves
      const existingRows = sheet.getDataRange().getValues();
      for (let i = 1; i < existingRows.length; i++) {
        if (existingRows[i][7] === idempotencyKey && !payload.eventId) {
          return { status: 'DUPLICATE_SKIPPED', eventId: existingRows[i][0] };
        }
      }

      // Generate atomic sequence ID via PropertiesService under LockService
      const props = PropertiesService.getScriptProperties();
      const seqKey = 'SEQ_EVT_' + payload.periodId + '_' + payload.category;
      const nextSeq = Number(props.getProperty(seqKey) || '0') + 1;
      props.setProperty(seqKey, String(nextSeq));

      const eventId = 'EVT-' + payload.periodId + '-' + payload.category + '-' + String(nextSeq).padStart(6, '0');
      const nowStr = Utilities.formatDate(new Date(), 'Asia/Vientiane', "yyyy-MM-dd'T'HH:mm:ssXXX");

      sheet.appendRow([
        eventId,
        payload.periodId,
        payload.employeeId,
        payload.autoNameLao,
        payload.storeId,
        JSON.stringify(payload.data),
        1,
        idempotencyKey,
        'VALID',
        userEmail,
        nowStr,
        nowStr
      ]);

      if (['NEW_STAFF', 'LEFT'].indexOf(payload.category) !== -1) {
        EmployeeService.applyStaffEvent(ss, eventId, payload, userEmail, nowStr);
      }

      AuditService.append(ss, {
        userEmail: userEmail,
        role: role,
        action: 'CREATE_EVENT',
        objectId: eventId,
        beforeData: '',
        afterData: JSON.stringify(payload.data)
      });

      return { status: 'SAVED', eventId: eventId, version: 1 };
    } finally {
      lock.releaseLock();
    }
  },
  mapCategoryToSheet: function(cat) {
    const map = {
      NEW_STAFF: 'Events_NewStaff',
      LEFT: 'Events_Left',
      LEAVE: 'Events_Leave',
      EXTRA_SHIFT: 'Events_ExtraShift',
      DAY_OFF_WORK: 'Events_DayOffWork',
      ADVANCES: 'Events_Advances',
      MONTH_INPUTS: 'Events_MonthInputs'
    };
    return map[cat];
  }
};`,
  },
  {
    fileName: 'PeriodService.gs',
    roleLao: 'ຄຳນວນງວດ 26–25 ໃນເຂດເວລາ Asia/Vientiane, ເປີດ/ປິດງວດ',
    code: `/**
 * PeriodService.gs — 26th to 25th Payroll Period Calculation
 */
const PeriodService = {
  calculatePeriodFromDdMmYyyy: function(dateStr) {
    const parts = dateStr.split('/');
    const day = Number(parts[0]);
    let month = Number(parts[1]);
    let year = Number(parts[2]);
    if (day >= 26) {
      month += 1;
      if (month > 12) { month = 1; year += 1; }
    }
    return year + '-' + String(month).padStart(2, '0');
  },
  closePeriodWithSnapshot: function(periodId) {
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const userEmail = Session.getActiveUser().getEmail();
      const role = AuthService.resolveUserRole(userEmail);
      if (role === 'STORE_MANAGER') {
        throw new Error('ຜູ້ຈັດການຮ້ານບໍ່ມີສິດປິດງວດເງິນເດືອນ');
      }
      DriveService.createArchiveSnapshot(periodId, userEmail);
      return { closed: true, periodId: periodId };
    } finally {
      lock.releaseLock();
    }
  }
};`,
  },
  {
    fileName: 'ImportExportService.gs',
    roleLao: 'ສຳເນົາແມ່ແບບຈາກ 00_Source_Template ແລ້ວຂຽນສະເພາະ input cells ລົງ 02_Audit_Exports',
    code: `/**
 * ImportExportService.gs — Strict Read-Only Template Copy & Export Register
 */
const ImportExportService = {
  createExport: function(periodId) {
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      const props = PropertiesService.getScriptProperties();
      const templateFileId = props.getProperty('SOURCE_TEMPLATE_FILE_ID');
      const exportFolderId = props.getProperty('FOLDER_02_AUDIT_EXPORTS_ID');

      const seqKey = 'SEQ_EXP_' + periodId;
      const nextSeq = Number(props.getProperty(seqKey) || '0') + 1;
      props.setProperty(seqKey, String(nextSeq));

      const stamp = Utilities.formatDate(new Date(), 'Asia/Vientiane', 'yyyyMMdd-HHmmss');
      const fileName = 'TG-EXPORT-' + periodId + '-' + String(nextSeq).padStart(4, '0') + '-' + stamp + '.xlsx';
      const exportId = 'EXP-' + periodId + '-' + String(nextSeq).padStart(4, '0');

      const templateFile = DriveApp.getFileById(templateFileId);
      const exportFolder = DriveApp.getFolderById(exportFolderId);
      const copiedFile = templateFile.makeCopy(fileName, exportFolder);

      // Compute SHA-256 Checksum & record in Export_Register
      const bytes = copiedFile.getBlob().getBytes();
      const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes)
        .map(function(b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); })
        .join('');

      DriveService.registerExport(exportId, periodId, fileName, copiedFile.getId(), digest);
      return { exportId: exportId, fileName: fileName, driveFileId: copiedFile.getId(), checksumSha256: digest };
    } finally {
      lock.releaseLock();
    }
  }
};`,
  },
  {
    fileName: 'Index.html',
    roleLao: 'ໂຄງສ້າງ HTML ໄຟລ໌ດຽວ (<style>, <body>, <script>) ທີ່ເອີ້ນ google.script.run ຕາມຫົວຂໍ້ 16.1',
    code: `<!DOCTYPE html>
<html lang="lo">
<head>
  <meta charset="UTF-8">
  <title>ລະບົບນຳເຂົ້າຂໍ້ມູນເງິນເດືອນ The Garden</title>
  <!-- ==================== SECTION 1: <style> ==================== -->
  <style>
    :root { --bg: #F8FAFC; --surface: #FFFFFF; --text: #0F172A; --accent: #059669; }
    body { font-family: 'Noto Sans Lao', sans-serif; background: var(--bg); color: var(--text); margin: 0; }
    @media print { @page { size: A4 portrait; margin: 12mm; } .no-print { display: none !important; } }
  </style>
</head>
<body>
  <!-- ==================== SECTION 2: <body> App Shell ==================== -->
  <div id="app-shell">ກຳລັງໂຫຼດຂໍ້ມູນຈາກ Google Sheets & Drive...</div>

  <!-- ==================== SECTION 3: <script> Client Logic ==================== -->
  <script>
    const AppState = { bootstrap: null, activeTab: 'dashboard' };
    function init() {
      if (window.google && google.script && google.script.run) {
        google.script.run.withSuccessHandler(function(data) {
          AppState.bootstrap = data;
          renderApp();
        }).getBootstrap();
      }
    }
    function renderApp() {
      document.getElementById('app-shell').textContent =
        'ເຊື່ອມຕໍ່ສຳເລັດ: ' + AppState.bootstrap.userEmail + ' (' + AppState.bootstrap.role + ')';
    }
    window.addEventListener('DOMContentLoaded', init);
  </script>
</body>
</html>`,
  },
];
