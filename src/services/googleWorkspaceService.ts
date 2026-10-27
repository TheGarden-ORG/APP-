import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  AuditLogRecord,
  EmployeeChangeRecord,
  EmployeeRecord,
  ExportRegisterRecord,
  PayrollEventRecord,
  PayrollPeriod,
} from '../utils/payrollRules';
import { SystemSettingsState } from '../utils/seedData';

export const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets',
];

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
for (const scope of SCOPES) {
  provider.addScope(scope);
}

let isSigningIn = false;
// In-memory access token cache (NEVER stored in localStorage/sessionStorage per security rule)
let cachedAccessToken: string | null = null;

// Draft form cache key (cleared on logout per Section 1.1: "local cache ໃຊ້ໄດ້ພຽງເພື່ອຊ່ວຍໜ້າຈໍ/ຮ່າງທີ່ຍັງບໍ່ບັນທຶກ ແລະຕ້ອງລຶບເມື່ອອອກຈາກລະບົບ")
export const DRAFT_FORM_STORAGE_KEY = 'tg_unsaved_event_draft_v1';

export const clearUnsavedDraftCache = () => {
  try {
    sessionStorage.removeItem(DRAFT_FORM_STORAGE_KEY);
    localStorage.removeItem(DRAFT_FORM_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
};

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      clearUnsavedDraftCache();
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('ບໍ່ສາມາດດຶງ Access Token ຈາກ Google Sign-In ໄດ້');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logout = async () => {
  clearUnsavedDraftCache();
  cachedAccessToken = null;
  await auth.signOut();
};

export interface WorkspaceProvisionResult {
  rootFolderId: string;
  subfolders: Record<string, string>;
  spreadsheetId: string;
  spreadsheetUrl: string;
}

/**
 * Create a folder in Google Drive if it doesn't already exist
 */
async function ensureDriveFolder(
  token: string,
  folderName: string,
  parentId?: string
): Promise<string> {
  const qParts = [
    `mimeType='application/vnd.google-apps.folder'`,
    `name='${folderName.replace(/'/g, "\\'")}'`,
    `trashed=false`,
  ];
  if (parentId) {
    qParts.push(`'${parentId}' in parents`);
  }
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    qParts.join(' and ')
  )}&fields=files(id,name)`;

  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (searchRes.ok) {
    const searchData = await searchRes.json();
    if (searchData.files && searchData.files.length > 0) {
      return searchData.files[0].id;
    }
  }

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });
  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`ສ້າງໂຟນເດີ Drive (${folderName}) ບໍ່ສຳເລັດ: ${errText}`);
  }
  const created = await createRes.json();
  return created.id;
}

/**
 * Provision TheGarden_Payroll_System folder structure & Central Google Sheet (Section 3.1 & 3.2)
 */
export async function provisionGoogleWorkspaceInfrastructure(
  settings: SystemSettingsState
): Promise<WorkspaceProvisionResult> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('ກະລຸນາເຂົ້າສູ່ລະບົບດ້ວຍ Google ກ່ອນເຊື່ອມຕໍ່ Google Drive ແລະ Sheets');
  }

  // 1. Create Root Folder: TheGarden_Payroll_System
  const rootFolderId = await ensureDriveFolder(token, settings.rootDriveFolderName || 'TheGarden_Payroll_System');

  // 2. Create 6 Standard Subfolders
  const folderNames = [
    settings.folderMapping.sourceTemplate,
    settings.folderMapping.incomingUploads,
    settings.folderMapping.auditExports,
    settings.folderMapping.archiveBackups,
    settings.folderMapping.eventLogs,
    settings.folderMapping.pdfBundles,
  ];
  const subfolders: Record<string, string> = {};
  for (const name of folderNames) {
    subfolders[name] = await ensureDriveFolder(token, name, rootFolderId);
  }

  // 3. Create Central System Spreadsheet with all 14 system sheets per Section 3.1
  const systemSheetTitles = [
    'Employees',
    'Employee_Changes',
    'Payroll_Periods',
    'Events_NewStaff',
    'Events_Left',
    'Events_Leave',
    'Events_ExtraShift',
    'Events_DayOffWork',
    'Events_Advances',
    'Events_MonthInputs',
    'Reference_Lists',
    'Export_Register',
    'Audit_Log',
    'System_Settings',
  ];

  const createSheetRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        title: `TheGarden_Payroll_Central_DB_${settings.activePeriodId}`,
        locale: 'en_US',
        timeZone: 'Asia/Vientiane',
      },
      sheets: systemSheetTitles.map((title) => ({
        properties: { title },
      })),
    }),
  });

  if (!createSheetRes.ok) {
    const errText = await createSheetRes.text();
    throw new Error(`ສ້າງ Google Sheets ຖານຂໍ້ມູນກາງບໍ່ສຳເລັດ: ${errText}`);
  }

  const sheetData = await createSheetRes.json();
  return {
    rootFolderId,
    subfolders,
    spreadsheetId: sheetData.spreadsheetId,
    spreadsheetUrl: sheetData.spreadsheetUrl,
  };
}

/**
 * Sync current state to the provisioned Google Spreadsheet using batchUpdate
 */
export async function syncStateToGoogleSheets(
  spreadsheetId: string,
  employees: EmployeeRecord[],
  employeeChanges: EmployeeChangeRecord[],
  periods: PayrollPeriod[],
  events: PayrollEventRecord[],
  exportsReg: ExportRegisterRecord[],
  auditLogs: AuditLogRecord[]
): Promise<{ updatedCells: number }> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('ກະລຸນາເຂົ້າສູ່ລະບົບດ້ວຍ Google ກ່ອນຊິ້ງຂໍ້ມູນໄປ Google Sheets');
  }

  const dataRanges = [
    {
      range: 'Employees!A1',
      values: [
        [
          'Employee ID',
          'Name (Lao)',
          'Name (English)',
          'Position',
          'Scanner ID',
          'Uses Scanner',
          'Day Off',
          'Shift Start',
          'Shift End',
          'Monthly Salary',
          'SSO',
          'Bank Account',
          'Start Date',
          'Last Working Day',
          'Status',
          'Checked In Payroll',
          'Store ID',
          'Version',
          'Updated At',
          'Updated By',
        ],
        ...employees.map((e) => [
          e.employeeId,
          e.nameLao,
          e.nameEn,
          e.position,
          e.scannerId,
          e.usesScanner,
          e.dayOff,
          e.shiftStart,
          e.shiftEnd,
          e.monthlySalary,
          e.sso,
          e.bankAccount,
          e.startDate,
          e.lastWorkingDay || '',
          e.status,
          e.checkedInPayroll ? 'TRUE' : 'FALSE',
          e.storeId,
          e.version,
          e.updatedAt,
          e.updatedBy,
        ]),
      ],
    },
    {
      range: 'Employee_Changes!A1',
      values: [
        ['Change ID', 'Employee ID', 'Event ID', 'Change Type', 'Before', 'After', 'Reason', 'Changed By', 'Changed At'],
        ...employeeChanges.map((c) => [
          c.changeId,
          c.employeeId,
          c.eventId,
          c.changeType,
          JSON.stringify(c.beforeSnapshot || {}),
          JSON.stringify(c.afterSnapshot),
          c.reason,
          c.changedBy,
          c.changedAt,
        ]),
      ],
    },
    {
      range: 'Payroll_Periods!A1',
      values: [
        ['Period ID', 'Start Date (26)', 'End Date (25)', 'Status', 'Opened By', 'Opened At', 'Closed By', 'Closed At'],
        ...periods.map((p) => [
          p.periodId,
          p.startDate,
          p.endDate,
          p.status,
          p.openedBy,
          p.openedAt,
          p.closedBy || '',
          p.closedAt || '',
        ]),
      ],
    },
    {
      range: 'Export_Register!A1',
      values: [
        [
          'Export ID',
          'Bundle ID',
          'Type',
          'Period ID',
          'File Name',
          'Drive Folder',
          'Drive File ID',
          'SHA-256 Checksum',
          'Event Count',
          'Status',
          'Created By',
          'Created At',
        ],
        ...exportsReg.map((x) => [
          x.exportId,
          x.bundleId || '',
          x.exportType,
          x.periodId,
          x.fileName,
          x.driveFolder,
          x.driveFileId,
          x.checksumSha256,
          x.eventCount,
          x.status,
          x.createdBy,
          x.createdAt,
        ]),
      ],
    },
    {
      range: 'Audit_Log!A1',
      values: [
        ['Audit ID', 'Timestamp', 'User Email', 'Role', 'Action', 'Object ID', 'Summary (Lao)', 'Correlation ID'],
        ...auditLogs.map((a) => [
          a.auditId,
          a.timestamp,
          a.userEmail,
          a.userRole,
          a.action,
          a.objectId,
          a.summaryLao,
          a.correlationId,
        ]),
      ],
    },
  ];

  // Add the 7 event sheets
  const categorySheetMap: Array<[string, string]> = [
    ['NEW_STAFF', 'Events_NewStaff'],
    ['LEFT', 'Events_Left'],
    ['LEAVE', 'Events_Leave'],
    ['EXTRA_SHIFT', 'Events_ExtraShift'],
    ['DAY_OFF_WORK', 'Events_DayOffWork'],
    ['ADVANCES', 'Events_Advances'],
    ['MONTH_INPUTS', 'Events_MonthInputs'],
  ];

  for (const [cat, sheetName] of categorySheetMap) {
    const catEvents = events.filter((e) => e.category === cat);
    dataRanges.push({
      range: `${sheetName}!A1`,
      values: [
        [
          'Event ID',
          'Period ID',
          'Employee ID',
          'Auto Name (Lao)',
          'Store ID',
          'Payload JSON',
          'Version',
          'Idempotency Key',
          'Status',
          'Created By',
          'Created At',
          'Updated At',
        ],
        ...catEvents.map((ev) => [
          ev.eventId,
          ev.periodId,
          ev.employeeId,
          ev.autoNameLao,
          ev.storeId,
          JSON.stringify(ev.payload),
          ev.version,
          ev.idempotencyKey,
          ev.status,
          ev.createdBy,
          ev.createdAt,
          ev.updatedAt,
        ]),
      ],
    });
  }

  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: dataRanges,
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ຊິ້ງຂໍ້ມູນໄປ Google Sheets ບໍ່ສຳເລັດ: ${errText}`);
  }

  const result = await res.json();
  return { updatedCells: result.totalUpdatedCells || 0 };
}

/**
 * Upload a binary or JSON file to Google Drive folder (01_Incoming_Uploads, 02_Audit_Exports, 03_Archive_Backups, 05_PDF_Bundles)
 */
export async function uploadFileToGoogleDrive(
  fileName: string,
  mimeType: string,
  contentBytes: Uint8Array | string,
  folderId?: string
): Promise<{ fileId: string; webViewLink?: string }> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('ກະລຸນາເຂົ້າສູ່ລະບົບດ້ວຍ Google ກ່ອນອັບໂຫຼດໄຟລ໌ຂຶ້ນ Google Drive');
  }

  const metadata = {
    name: fileName,
    mimeType,
    ...(folderId ? { parents: [folderId] } : {}),
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  const fileBlob =
    typeof contentBytes === 'string'
      ? new Blob([contentBytes], { type: mimeType })
      : new Blob([contentBytes], { type: mimeType });
  form.append('file', fileBlob);

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: form,
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ອັບໂຫຼດໄຟລ໌ຂຶ້ນ Google Drive ບໍ່ສຳເລັດ: ${errText}`);
  }

  const data = await res.json();
  return { fileId: data.id, webViewLink: data.webViewLink };
}
