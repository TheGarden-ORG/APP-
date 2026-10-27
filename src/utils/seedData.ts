import {
  AuditLogRecord,
  EmployeeChangeRecord,
  EmployeeRecord,
  EventCategoryCode,
  ExportRegisterRecord,
  PayrollEventRecord,
  PayrollPeriod,
  ReferenceLists,
  computeEventIdempotencyKey,
} from './payrollRules';

export interface StoreBranch {
  storeId: string;
  nameLao: string;
  nameEn: string;
  timezone: string;
  managerEmails: string[];
  active: boolean;
}

export interface SystemSettingsState {
  // 1. ຂໍ້ມູນອົງກອນ/ຮ້ານ
  organizationNameLao: string;
  organizationNameEn: string;
  defaultTimezone: string;
  branches: StoreBranch[];
  // 2. ຮອບເງິນເດືອນ
  periodStartDay: number; // 26
  periodEndDay: number; // 25
  activePeriodId: string; // 2026-10
  requireTwoStepPeriodClose: boolean;
  // 3. ສິດທິແລະຜູ້ອະນຸມັດ
  leaveApproverEmail: string;
  periodCloserEmail: string;
  exportCreatorEmail: string;
  finalExportApproverEmail: string;
  allowManagerDraftExport: boolean;
  allowPostExportRevision: boolean;
  // 4. Google Workspace / Drive
  allowedWorkspaceDomain: string;
  driveStorageMode: 'SHARED_DRIVE' | 'CENTRAL_MY_DRIVE';
  systemSpreadsheetId: string;
  rootDriveFolderName: string;
  rootDriveFolderId: string;
  folderMapping: {
    sourceTemplate: string; // 00_Source_Template
    incomingUploads: string; // 01_Incoming_Uploads
    auditExports: string; // 02_Audit_Exports
    archiveBackups: string; // 03_Archive_Backups
    eventLogs: string; // 04_Event_Logs
    pdfBundles: string; // 05_PDF_Bundles
  };
  fileNamePattern: string;
  // 5. ນຳເຂົ້າ/ສົ່ງອອກ
  targetPayrollIntegrationMode: 'EXCEL_IMPORT_ONLY' | 'API_AND_EXCEL';
  allowedTemplateVersion: string;
  templateCompatibilityStatus: 'VERIFIED_EXCEL_2026' | 'NEEDS_TEST';
  strictIdempotencyCheck: boolean;
  refuseCheckedPayrollRows: boolean;
  // 6. PDF ແລະເອກະສານ
  pdfPaperSize: 'A4';
  pdfDefaultOrientation: 'PORTRAIT' | 'LANDSCAPE_WIDE_TABLES';
  pdfMarginMm: number;
  pdfIncludedSections: EventCategoryCode[];
  pdfSignatoryPreparedBy: string;
  pdfSignatoryReviewedBy: string;
  pdfSignatoryApprovedBy: string;
  pdfFooterTextLao: string;
  // 7. ສຳຮອງ/ການເກັບຮັກສາ
  nightlyBackupEnabled: boolean;
  prePostExportSnapshotEnabled: boolean;
  payrollRetentionMonths: number;
  bankDataRetentionMonths: number;
  auditLogRetentionMonths: number;
  lastBackupRestoreTestDate: string;
  // Metadata
  lastUpdatedBy: string;
  lastUpdatedAt: string;
  appVersion: string;
}

export const EVENT_CATEGORY_META: Array<{
  code: EventCategoryCode;
  sheetNumber: number;
  sheetTitle: string;
  titleLao: string;
  shortLao: string;
  columnsRange: string;
  descriptionLao: string;
}> = [
  {
    code: 'NEW_STAFF',
    sheetNumber: 1,
    sheetTitle: '1 New staff · ພະນັກງານໃໝ່',
    titleLao: '1. ພະນັກງານໃໝ່ / ປັບປຸງຂໍ້ມູນ',
    shortLao: 'ພະນັກງານໃໝ່/ປັບປຸງ',
    columnsRange: 'A:P',
    descriptionLao: 'ສ້າງພະນັກງານໃໝ່ (ໃຊ້ ID ຈາກເຄື່ອງສະແກນ) ຫຼື ປັບປຸງສະເພາະຟິວທີ່ປ່ຽນຂອງພະນັກງານເດີມ',
  },
  {
    code: 'LEFT',
    sheetNumber: 2,
    sheetTitle: '2 Left · ພະນັກງານອອກ',
    titleLao: '2. ພະນັກງານອອກວຽກ',
    shortLao: 'ພະນັກງານອອກ',
    columnsRange: 'A:D',
    descriptionLao: 'ບັນທຶກມື້ເຮັດວຽກສຸດທ້າຍ ແລະ ເຫດຜົນ; ຍັງຄິດໄລ່ເງິນໃນງວດປັດຈຸບັນຕາມປົກກະຕິ',
  },
  {
    code: 'LEAVE',
    sheetNumber: 3,
    sheetTitle: '3 Leave · ລາພັກ',
    titleLao: '3. ລາພັກ (1 ຄຳຮ້ອງ = 1 ແຖວ)',
    shortLao: 'ລາພັກ',
    columnsRange: 'A:G',
    descriptionLao: 'ບັນທຶກວັນລາພັກ; ມື້ພັກປະຈຳອາທິດໃນຊ່ວງວັນລາບໍ່ຖືກນັບຊ້ຳ; ສະຖານະວ່າງ = ອະນຸມັດແລ້ວ',
  },
  {
    code: 'EXTRA_SHIFT',
    sheetNumber: 4,
    sheetTitle: '4 Extra shift · ກະເສີມ',
    titleLao: '4. ກະເສີມ / ປ່ຽນກະ',
    shortLao: 'ກະເສີມ/ປ່ຽນກະ',
    columnsRange: 'A:I',
    descriptionLao: 'ເຮັດ 2 ກະ (Double shift) ຫຼື ປ່ຽນກະ (Change shift) ພ້ອມເວລາເຂົ້າ-ອອກ ແລະ ຕຳແໜ່ງທົດແທນ',
  },
  {
    code: 'DAY_OFF_WORK',
    sheetNumber: 5,
    sheetTitle: '5 Day-off work · ມາເຮັດມື້ພັກ',
    titleLao: '5. ມາເຮັດວຽກມື້ພັກ',
    shortLao: 'ເຮັດວຽກມື້ພັກ',
    columnsRange: 'A:F',
    descriptionLao: 'ມາເຮັດວຽກໃນມື້ພັກປະຈຳອາທິດ: ເລືອກແລກວັນຂາດ (Swap) ຫຼື ຄິດເປັນ OT x1.5',
  },
  {
    code: 'ADVANCES',
    sheetNumber: 6,
    sheetTitle: '6 Advances · ເບີກລ່ວງໜ້າ',
    titleLao: '6. ເບີກເງິນລ່ວງໜ້າ / ຈ່າຍຄືນ',
    shortLao: 'ເບີກລ່ວງໜ້າ',
    columnsRange: 'A:H',
    descriptionLao: 'ເບີກໃໝ່, ຈ່າຍຄືນເງິນສົດ, ດອກເບ້ຍ ຫຼື ປັບຍອດ; ຖ້າບໍ່ລະບຸງວດ ລະບົບຄຳນວນຕາມກົດ 26–25',
  },
  {
    code: 'MONTH_INPUTS',
    sheetNumber: 7,
    sheetTitle: '7 Month inputs · ປ້ອນປະຈຳເດືອນ',
    titleLao: '7. ປ້ອນຂໍ້ມູນປະຈຳງວດ',
    shortLao: 'ປ້ອນປະຈຳງວດ',
    columnsRange: 'C3 & A:J',
    descriptionLao: 'OT ວັນພັກລັດ, ປີໃໝ່, ເງິນພິເສດ, ເສື້ອ, ຕັດເບີກ, ເງິນຂະຫຍັນ (ຊ່ອງວ່າງ = ບໍ່ປ່ຽນ, 0 = ລ້າງຄ່າ)',
  },
];

export const INITIAL_REFERENCE_LISTS: ReferenceLists = {
  daysOfWeek: [
    { value: 'Mon', labelLao: 'Mon · ວັນຈັນ', active: true, effectiveDate: '01/01/2026' },
    { value: 'Tue', labelLao: 'Tue · ວັນອັງຄານ', active: true, effectiveDate: '01/01/2026' },
    { value: 'Wed', labelLao: 'Wed · ວັນພຸດ', active: true, effectiveDate: '01/01/2026' },
    { value: 'Thu', labelLao: 'Thu · ວັນພະຫັດ', active: true, effectiveDate: '01/01/2026' },
    { value: 'Fri', labelLao: 'Fri · ວັນສຸກ', active: true, effectiveDate: '01/01/2026' },
    { value: 'Sat', labelLao: 'Sat · ວັນເສົາ', active: true, effectiveDate: '01/01/2026' },
    { value: 'Sun', labelLao: 'Sun · ວັນອາທິດ', active: true, effectiveDate: '01/01/2026' },
  ],
  leaveStatuses: [
    { value: 'Approved', labelLao: 'Approved · ອະນຸມັດແລ້ວ (ຄ່າຕັ້ງຕົ້ນເມື່ອວ່າງ)', active: true, effectiveDate: '01/01/2026' },
    { value: 'Pending', labelLao: 'Pending · ລໍຖ້າອະນຸມັດ', active: true, effectiveDate: '01/01/2026' },
    { value: 'Unpaid', labelLao: 'Unpaid · ລາບໍ່ຮັບເງິນ (ຫັກເງິນ)', active: true, effectiveDate: '01/01/2026' },
    { value: 'Rejected', labelLao: 'Rejected · ບໍ່ອະນຸມັດ', active: true, effectiveDate: '01/01/2026' },
  ],
  leaveTypes: [
    { value: 'Sick leave · ລາປ່ວຍ', labelLao: 'Sick leave · ລາປ່ວຍ', active: true, effectiveDate: '01/01/2026' },
    { value: 'Annual leave · ລາພັກປະຈຳປີ', labelLao: 'Annual leave · ລາພັກປະຈຳປີ', active: true, effectiveDate: '01/01/2026' },
    { value: 'Personal leave · ລາກິດ', labelLao: 'Personal leave · ລາກິດ', active: true, effectiveDate: '01/01/2026' },
    { value: 'Unpaid leave · ລາບໍ່ຮັບເງິນ', labelLao: 'Unpaid leave · ລາບໍ່ຮັບເງິນ', active: true, effectiveDate: '01/01/2026' },
    { value: 'Maternity leave · ລາເກີດລູກ', labelLao: 'Maternity leave · ລາເກີດລູກ', active: true, effectiveDate: '01/01/2026' },
  ],
  extraShiftTypes: [
    { value: 'Double shift', labelLao: 'Double shift · ເຮັດ 2 ກະ (ກະເສີມ)', active: true, effectiveDate: '01/01/2026' },
    { value: 'Change shift', labelLao: 'Change shift · ປ່ຽນກະເຮັດວຽກ', active: true, effectiveDate: '01/01/2026' },
  ],
  dayOffWorkTypes: [
    { value: 'Swap', labelLao: 'Swap · ແລກມື້ຂາດ (ຕ້ອງໃສ່ວັນຂາດທີ່ແລກ)', active: true, effectiveDate: '01/01/2026' },
    { value: 'OT x1.5', labelLao: 'OT x1.5 · ຄິດເງິນ OT ມື້ພັກ x1.5', active: true, effectiveDate: '01/01/2026' },
  ],
  advanceTypes: [
    { value: 'New advance · ເບີກໃໝ່', labelLao: 'New advance · ເບີກເງິນລ່ວງໜ້າໃໝ່', active: true, effectiveDate: '01/01/2026' },
    { value: 'Cash repayment · ຈ່າຍຄືນເງິນສົດ', labelLao: 'Cash repayment · ຈ່າຍຄືນເງິນສົດ', active: true, effectiveDate: '01/01/2026' },
    { value: 'Interest · ດອກເບ້ຍ', labelLao: 'Interest · ດອກເບ້ຍ', active: true, effectiveDate: '01/01/2026' },
    { value: 'Adjustment · ປັບຍອດ', labelLao: 'Adjustment · ປັບປຸງຍອດເບີກ', active: true, effectiveDate: '01/01/2026' },
  ],
  positions: [
    { value: 'Store Manager · ຜູ້ຈັດການຮ້ານ', labelLao: 'Store Manager · ຜູ້ຈັດການຮ້ານ', active: true, effectiveDate: '01/01/2026' },
    { value: 'Head Barista · ຫົວໜ້າບາຣິສຕ້າ', labelLao: 'Head Barista · ຫົວໜ້າບາຣິສຕ້າ', active: true, effectiveDate: '01/01/2026' },
    { value: 'Barista · ບາຣິສຕ້າ', labelLao: 'Barista · ບາຣິສຕ້າ', active: true, effectiveDate: '01/01/2026' },
    { value: 'Pastry Chef · ຊ່າງເຂົ້າໜົມ', labelLao: 'Pastry Chef · ຊ່າງເຂົ້າໜົມ', active: true, effectiveDate: '01/01/2026' },
    { value: 'Kitchen Staff · ພະນັກງານຄົວ', labelLao: 'Kitchen Staff · ພະນັກງານຄົວ', active: true, effectiveDate: '01/01/2026' },
    { value: 'Cashier / Service · ແຄັດເຊຍ/ບໍລິການ', labelLao: 'Cashier / Service · ແຄັດເຊຍ/ບໍລິການ', active: true, effectiveDate: '01/01/2026' },
    { value: 'Cleaner / Utility · ອະນາໄມ', labelLao: 'Cleaner / Utility · ອະນາໄມ', active: true, effectiveDate: '01/01/2026' },
  ],
};

export const INITIAL_EMPLOYEES: EmployeeRecord[] = [
  {
    employeeId: 'EMP-001',
    nameLao: 'ທ້າວ ສົມຊາຍ ພົມມະວົງ',
    nameEn: 'Somxay Phommavong',
    position: 'Head Barista · ຫົວໜ້າບາຣິສຕ້າ',
    scannerId: '101',
    usesScanner: 'Yes',
    dayOff: 'Mon',
    shiftStart: '06:30',
    shiftEnd: '15:00',
    monthlySalary: 5800000,
    sso: 'Yes',
    bankAccount: '16012000123456',
    startDate: '01/02/2025',
    status: 'ACTIVE',
    checkedInPayroll: false,
    storeId: 'STORE-VTE-01',
    version: 2,
    updatedAt: '2026-10-18T09:15:00+07:00',
    updatedBy: 'gardennakedespresso@gmail.com',
  },
  {
    employeeId: 'EMP-002',
    nameLao: 'ນາງ ຈັນສຸດາ ວົງສະຫວັນ',
    nameEn: 'Chansouda Vongsavanh',
    position: 'Cashier / Service · ແຄັດເຊຍ/ບໍລິການ',
    scannerId: '102',
    usesScanner: 'Yes',
    dayOff: 'Tue',
    shiftStart: '07:30',
    shiftEnd: '16:00',
    monthlySalary: 4400000,
    sso: 'Yes',
    bankAccount: '16012000998877',
    startDate: '15/04/2025',
    status: 'ACTIVE',
    checkedInPayroll: false,
    storeId: 'STORE-VTE-01',
    version: 1,
    updatedAt: '2026-10-10T10:00:00+07:00',
    updatedBy: 'gardennakedespresso@gmail.com',
  },
  {
    employeeId: 'EMP-003',
    nameLao: 'ນາງ ພອນທິບ ສີສຸວັນ',
    nameEn: 'Phonethip Sisouvanh',
    position: 'Pastry Chef · ຊ່າງເຂົ້າໜົມ',
    scannerId: '103',
    usesScanner: 'Yes',
    dayOff: 'Wed',
    shiftStart: '06:00',
    shiftEnd: '14:30',
    monthlySalary: 6200000,
    sso: 'Yes',
    bankAccount: '16012000445566',
    startDate: '10/01/2025',
    status: 'ACTIVE',
    checkedInPayroll: false,
    storeId: 'STORE-VTE-01',
    version: 1,
    updatedAt: '2026-10-05T11:20:00+07:00',
    updatedBy: 'gardennakedespresso@gmail.com',
  },
  {
    employeeId: 'EMP-004',
    nameLao: 'ທ້າວ ບຸນມີ ໄຊຍະຈັກ',
    nameEn: 'Bounmy Xayachack',
    position: 'Barista · ບາຣິສຕ້າ',
    scannerId: '104',
    usesScanner: 'Yes',
    dayOff: 'Thu',
    shiftStart: '13:30',
    shiftEnd: '22:00',
    monthlySalary: 4600000,
    sso: 'Yes',
    bankAccount: '16012000778899',
    startDate: '20/06/2025',
    lastWorkingDay: '18/10/2026',
    status: 'LEFT',
    checkedInPayroll: false,
    storeId: 'STORE-VTE-01',
    version: 2,
    updatedAt: '2026-10-18T16:40:00+07:00',
    updatedBy: 'manager.sihom@thegarden.la',
  },
  {
    employeeId: 'EMP-005',
    nameLao: 'ທ້າວ ອານຸສອນ ແກ້ວມະນີ',
    nameEn: 'Anousone Keomany',
    position: 'Kitchen Staff · ພະນັກງານຄົວ',
    scannerId: '105',
    usesScanner: 'Yes',
    dayOff: 'Fri',
    shiftStart: '07:00',
    shiftEnd: '15:30',
    monthlySalary: 4500000,
    sso: 'Yes',
    bankAccount: '16012000332211',
    startDate: '01/08/2025',
    status: 'ACTIVE',
    checkedInPayroll: false,
    storeId: 'STORE-VTE-02',
    version: 1,
    updatedAt: '2026-10-12T14:00:00+07:00',
    updatedBy: 'gardennakedespresso@gmail.com',
  },
  {
    employeeId: 'EMP-006',
    nameLao: 'ນາງ ລັດດາວັນ ຈັນທະວົງ',
    nameEn: 'Laddavanh Chanthavong',
    position: 'Barista · ບາຣິສຕ້າ',
    scannerId: '106',
    usesScanner: 'Yes',
    dayOff: 'Sun',
    shiftStart: '07:00',
    shiftEnd: '15:30',
    monthlySalary: 4700000,
    sso: 'Yes',
    bankAccount: '16012000665544',
    startDate: '26/09/2026',
    status: 'ACTIVE',
    checkedInPayroll: true,
    storeId: 'STORE-VTE-01',
    version: 1,
    updatedAt: '2026-09-26T08:30:00+07:00',
    updatedBy: 'gardennakedespresso@gmail.com',
  },
];

export const INITIAL_EMPLOYEE_CHANGES: EmployeeChangeRecord[] = [
  {
    changeId: 'CHG-2026-10-0001',
    employeeId: 'EMP-006',
    eventId: 'EVT-2026-10-NEWSTAFF-000001',
    changeType: 'CREATE',
    beforeSnapshot: null,
    afterSnapshot: {
      employeeId: 'EMP-006',
      nameLao: 'ນາງ ລັດດາວັນ ຈັນທະວົງ',
      position: 'Barista · ບາຣິສຕ້າ',
      monthlySalary: 4700000,
      startDate: '26/09/2026',
    },
    reason: 'ຮັບພະນັກງານບາຣິສຕ້າໃໝ່ ກະເຊົ້າ ສາຂາສີຫອມ',
    changedBy: 'gardennakedespresso@gmail.com',
    changedAt: '2026-09-26T08:30:00+07:00',
  },
  {
    changeId: 'CHG-2026-10-0002',
    employeeId: 'EMP-001',
    eventId: 'EVT-2026-10-NEWSTAFF-000002',
    changeType: 'UPDATE',
    beforeSnapshot: { monthlySalary: 5500000, shiftStart: '07:00', shiftEnd: '15:30' },
    afterSnapshot: { monthlySalary: 5800000, shiftStart: '06:30', shiftEnd: '15:00' },
    reason: 'ປັບຂຶ້ນເງິນເດືອນປະຈຳໄຕມາດ ແລະ ປ່ຽນໂມງເຂົ້າເປີດຮ້ານ 06:30',
    changedBy: 'gardennakedespresso@gmail.com',
    changedAt: '2026-10-01T09:15:00+07:00',
  },
  {
    changeId: 'CHG-2026-10-0003',
    employeeId: 'EMP-004',
    eventId: 'EVT-2026-10-LEFT-000003',
    changeType: 'LEFT',
    beforeSnapshot: { status: 'ACTIVE' },
    afterSnapshot: { status: 'LEFT', lastWorkingDay: '18/10/2026' },
    reason: 'ລາອອກເພື່ອກັບໄປຮຽນຕໍ່ຕ່າງແຂວງ (ຍັງຄິດເງິນເດືອນງວດ 2026-10 ຮອດວັນທີ 18/10/2026)',
    changedBy: 'manager.sihom@thegarden.la',
    changedAt: '2026-10-18T16:40:00+07:00',
  },
];

export const INITIAL_PERIODS: PayrollPeriod[] = [
  {
    periodId: '2026-09',
    startDate: '26/08/2026',
    endDate: '25/09/2026',
    status: 'CLOSED',
    openedBy: 'gardennakedespresso@gmail.com',
    openedAt: '2026-08-26T08:00:00+07:00',
    closedBy: 'gardennakedespresso@gmail.com',
    closedAt: '2026-09-26T17:30:00+07:00',
  },
  {
    periodId: '2026-10',
    startDate: '26/09/2026',
    endDate: '25/10/2026',
    status: 'OPEN',
    openedBy: 'gardennakedespresso@gmail.com',
    openedAt: '2026-09-26T08:00:00+07:00',
  },
  {
    periodId: '2026-11',
    startDate: '26/10/2026',
    endDate: '25/11/2026',
    status: 'OPEN',
    openedBy: 'gardennakedespresso@gmail.com',
    openedAt: '2026-10-26T08:00:00+07:00',
  },
];

function makeSeedEvent(
  eventId: string,
  periodId: string,
  category: EventCategoryCode,
  employeeId: string,
  autoNameLao: string,
  storeId: string,
  payload: Record<string, string>,
  createdAt: string,
  createdBy = 'gardennakedespresso@gmail.com'
): PayrollEventRecord {
  return {
    eventId,
    periodId,
    category,
    employeeId,
    autoNameLao,
    storeId,
    payload,
    version: 1,
    idempotencyKey: computeEventIdempotencyKey(category, periodId, employeeId, payload),
    status: 'VALID',
    createdBy,
    createdAt,
    updatedBy: createdBy,
    updatedAt: createdAt,
    revisionHistory: [],
  };
}

export const INITIAL_EVENTS: PayrollEventRecord[] = [
  makeSeedEvent(
    'EVT-2026-10-NEWSTAFF-000001',
    '2026-10',
    'NEW_STAFF',
    'EMP-006',
    'ນາງ ລັດດາວັນ ຈັນທະວົງ',
    'STORE-VTE-01',
    {
      mode: 'new',
      nameLao: 'ນາງ ລັດດາວັນ ຈັນທະວົງ',
      nameEn: 'Laddavanh Chanthavong',
      position: 'Barista · ບາຣິສຕ້າ',
      scannerId: '106',
      usesScanner: 'Yes',
      dayOff: 'Sun',
      shiftStart: '07:00',
      shiftEnd: '15:30',
      monthlySalary: '4700000',
      sso: 'Yes',
      bankAccount: '16012000665544',
      startDate: '26/09/2026',
      notes: 'ພະນັກງານໃໝ່ ເລີ່ມວັນທຳອິດຂອງງວດ 2026-10',
    },
    '2026-09-26T08:30:00+07:00'
  ),
  makeSeedEvent(
    'EVT-2026-10-NEWSTAFF-000002',
    '2026-10',
    'NEW_STAFF',
    'EMP-001',
    'ທ້າວ ສົມຊາຍ ພົມມະວົງ',
    'STORE-VTE-01',
    {
      mode: 'update',
      nameLao: 'ທ້າວ ສົມຊາຍ ພົມມະວົງ',
      nameEn: '',
      position: '',
      scannerId: '',
      usesScanner: '',
      dayOff: '',
      shiftStart: '06:30',
      shiftEnd: '15:00',
      monthlySalary: '5800000',
      sso: '',
      bankAccount: '',
      startDate: '',
      notes: 'ປັບຂຶ້ນເງິນເດືອນ ແລະ ໂມງເຂົ້າກະເຊົ້າ',
    },
    '2026-10-01T09:15:00+07:00'
  ),
  makeSeedEvent(
    'EVT-2026-10-LEFT-000003',
    '2026-10',
    'LEFT',
    'EMP-004',
    'ທ້າວ ບຸນມີ ໄຊຍະຈັກ',
    'STORE-VTE-01',
    {
      lastWorkingDay: '18/10/2026',
      reason: 'ລາອອກເພື່ອກັບໄປຮຽນຕໍ່ຕ່າງແຂວງ',
    },
    '2026-10-18T16:40:00+07:00',
    'manager.sihom@thegarden.la'
  ),
  makeSeedEvent(
    'EVT-2026-10-LEAVE-000004',
    '2026-10',
    'LEAVE',
    'EMP-002',
    'ນາງ ຈັນສຸດາ ວົງສະຫວັນ',
    'STORE-VTE-01',
    {
      leaveType: 'Sick leave · ລາປ່ວຍ',
      fromDate: '03/10/2026',
      toDate: '04/10/2026',
      reason: 'ໄຂ້ຫວັດ ມີໃບຢັ້ງຢືນແພດ',
      status: '', // Blank = Approved (ອະນຸມັດແລ້ວ)
    },
    '2026-10-04T10:15:00+07:00',
    'manager.sihom@thegarden.la'
  ),
  makeSeedEvent(
    'EVT-2026-10-EXTRASHIFT-000005',
    '2026-10',
    'EXTRA_SHIFT',
    'EMP-001',
    'ທ້າວ ສົມຊາຍ ພົມມະວົງ',
    'STORE-VTE-01',
    {
      date: '08/10/2026',
      shiftType: 'Double shift',
      startTime: '15:00',
      endTime: '22:00',
      extraShiftSalary: '',
      positionCovered: 'Barista · ບາຣິສຕ້າ',
      notes: 'ເຮັດກະເສີມແທນກະແລງ',
    },
    '2026-10-08T22:10:00+07:00',
    'manager.sihom@thegarden.la'
  ),
  makeSeedEvent(
    'EVT-2026-10-DAYOFF-000006',
    '2026-10',
    'DAY_OFF_WORK',
    'EMP-003',
    'ນາງ ພອນທິບ ສີສຸວັນ',
    'STORE-VTE-01',
    {
      dayOffWorked: '07/10/2026',
      usedFor: 'Swap',
      absentDateReplaced: '12/10/2026',
      notes: 'ມາເຮັດວັນພຸດ ເພື່ອແລກວັນຢຸດວັນທີ 12/10/2026',
    },
    '2026-10-07T17:00:00+07:00'
  ),
  makeSeedEvent(
    'EVT-2026-10-ADVANCE-000007',
    '2026-10',
    'ADVANCES',
    'EMP-005',
    'ທ້າວ ອານຸສອນ ແກ້ວມະນີ',
    'STORE-VTE-02',
    {
      date: '14/10/2026',
      advanceType: 'New advance · ເບີກໃໝ່',
      amount: '1200000',
      monthlyDeduction: '600000',
      payrollMonth: '2026-10',
      notes: 'ເບີກລ່ວງໜ້າຄ່າສ້ອມແປງລົດຈັກ ຜ່ອນຕັດ 2 ງວດ',
    },
    '2026-10-14T11:30:00+07:00'
  ),
  makeSeedEvent(
    'EVT-2026-10-MONTHINP-000008',
    '2026-10',
    'MONTH_INPUTS',
    'EMP-001',
    'ທ້າວ ສົມຊາຍ ພົມມະວົງ',
    'STORE-VTE-01',
    {
      publicHolidayOt: '1',
      newYearOt: '',
      bonus: '350000',
      uniform: '0',
      advanceOverride: '',
      attendanceBonus: '300000',
      notes: 'ເບ້ຍຂະຫຍັນຄົບ + ໂບນັດຍອດຂາຍກາເຟພິເສດ',
    },
    '2026-10-24T15:00:00+07:00'
  ),
];

export const INITIAL_EXPORTS: ExportRegisterRecord[] = [
  {
    exportId: 'EXP-2026-09-0003',
    bundleId: 'PDF-2026-09-0002',
    exportType: 'EXCEL',
    periodId: '2026-09',
    fileName: 'TG-EXPORT-2026-09-0003-20260925-181000.xlsx',
    driveFolder: 'TheGarden_Payroll_System/02_Audit_Exports/2026-09',
    driveFileId: '1TgDriveExport2026090003Xlsx',
    checksumSha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    eventCount: 19,
    maxEventVersionAtExport: 1,
    status: 'LATEST',
    validationPassed: true,
    createdBy: 'gardennakedespresso@gmail.com',
    createdAt: '2026-09-25T18:10:00+07:00',
  },
  {
    exportId: 'EXP-2026-10-0001',
    exportType: 'EXCEL',
    periodId: '2026-10',
    fileName: 'TG-EXPORT-2026-10-0001-20261025-180500.xlsx',
    driveFolder: 'TheGarden_Payroll_System/02_Audit_Exports/2026-10',
    driveFileId: '1TgDriveExport2026100001Xlsx',
    checksumSha256: '4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a',
    eventCount: 8,
    maxEventVersionAtExport: 1,
    status: 'LATEST',
    validationPassed: true,
    createdBy: 'gardennakedespresso@gmail.com',
    createdAt: '2026-10-25T18:05:00+07:00',
  },
];

export const INITIAL_AUDIT_LOGS: AuditLogRecord[] = [
  {
    auditId: 'AUD-202610-0001',
    timestamp: '2026-09-26T08:00:00+07:00',
    userEmail: 'gardennakedespresso@gmail.com',
    userRole: 'SYSTEM_ADMIN',
    action: 'OPEN_PERIOD',
    objectId: '2026-10',
    summaryLao: 'ເປີດຮອບເງິນເດືອນໃໝ່ 2026-10 (26/09/2026 – 25/10/2026)',
    correlationId: 'CORR-99201',
  },
  {
    auditId: 'AUD-202610-0002',
    timestamp: '2026-09-26T08:30:00+07:00',
    userEmail: 'gardennakedespresso@gmail.com',
    userRole: 'SYSTEM_ADMIN',
    action: 'CREATE_EVENT',
    objectId: 'EVT-2026-10-NEWSTAFF-000001',
    summaryLao: 'ເພີ່ມພະນັກງານໃໝ່ EMP-006 (ນາງ ລັດດາວັນ ຈັນທະວົງ) ພ້ອມອັບເດດຕາຕະລາງ Employees',
    afterData: '{"employeeId":"EMP-006","monthlySalary":4700000}',
    correlationId: 'CORR-99202',
  },
  {
    auditId: 'AUD-202610-0003',
    timestamp: '2026-10-18T16:40:00+07:00',
    userEmail: 'manager.sihom@thegarden.la',
    userRole: 'STORE_MANAGER',
    action: 'CREATE_EVENT',
    objectId: 'EVT-2026-10-LEFT-000003',
    summaryLao: 'ບັນທຶກພະນັກງານອອກວຽກ EMP-004 (ມື້ສຸດທ້າຍ 18/10/2026)',
    beforeData: '{"status":"ACTIVE"}',
    afterData: '{"status":"LEFT","lastWorkingDay":"18/10/2026"}',
    correlationId: 'CORR-99203',
  },
  {
    auditId: 'AUD-202610-0004',
    timestamp: '2026-10-25T18:05:00+07:00',
    userEmail: 'gardennakedespresso@gmail.com',
    userRole: 'AUDIT_TEAM',
    action: 'EXPORT_EXCEL',
    objectId: 'EXP-2026-10-0001',
    summaryLao: 'ສ້າງໄຟລ໌ Excel ສົ່ງກວດ TG-EXPORT-2026-10-0001-20261025-180500.xlsx ໄປຍັງ 02_Audit_Exports',
    correlationId: 'CORR-99204',
  },
];

export const INITIAL_SYSTEM_SETTINGS: SystemSettingsState = {
  organizationNameLao: 'ເດີ ກາເດັນ (The Garden Naked Espresso)',
  organizationNameEn: 'The Garden Naked Espresso Co., Ltd.',
  defaultTimezone: 'Asia/Vientiane (GMT+07:00)',
  branches: [
    {
      storeId: 'STORE-VTE-01',
      nameLao: 'ສາຂາ ສີຫອມ (Sihom Flagship)',
      nameEn: 'Sihom Flagship Store',
      timezone: 'Asia/Vientiane',
      managerEmails: ['manager.sihom@thegarden.la', 'gardennakedespresso@gmail.com'],
      active: true,
    },
    {
      storeId: 'STORE-VTE-02',
      nameLao: 'ສາຂາ ທາດຫຼວງ (Thatluang Garden)',
      nameEn: 'Thatluang Garden Branch',
      timezone: 'Asia/Vientiane',
      managerEmails: ['manager.thatluang@thegarden.la', 'gardennakedespresso@gmail.com'],
      active: true,
    },
    {
      storeId: 'STORE-LPQ-01',
      nameLao: 'ສາຂາ ຫຼວງພະບາງ (Luang Prabang Old Town)',
      nameEn: 'Luang Prabang Branch',
      timezone: 'Asia/Vientiane',
      managerEmails: ['manager.lpq@thegarden.la'],
      active: true,
    },
  ],
  periodStartDay: 26,
  periodEndDay: 25,
  activePeriodId: '2026-10',
  requireTwoStepPeriodClose: true,
  leaveApproverEmail: 'hr.audit@thegarden.la',
  periodCloserEmail: 'gardennakedespresso@gmail.com',
  exportCreatorEmail: 'audit@thegarden.la',
  finalExportApproverEmail: 'gardennakedespresso@gmail.com',
  allowManagerDraftExport: true,
  allowPostExportRevision: true,
  allowedWorkspaceDomain: 'gmail.com, thegarden.la',
  driveStorageMode: 'SHARED_DRIVE',
  systemSpreadsheetId: '',
  rootDriveFolderName: 'TheGarden_Payroll_System',
  rootDriveFolderId: '',
  folderMapping: {
    sourceTemplate: '00_Source_Template',
    incomingUploads: '01_Incoming_Uploads',
    auditExports: '02_Audit_Exports',
    archiveBackups: '03_Archive_Backups',
    eventLogs: '04_Event_Logs',
    pdfBundles: '05_PDF_Bundles',
  },
  fileNamePattern: 'TG-{ປະເພດ}-{ງວດ}-{ເລກລຳດັບ4ຫຼັກ}-{YYYYMMDD-HHmmss}.{ນາມສະກຸນ}',
  targetPayrollIntegrationMode: 'EXCEL_IMPORT_ONLY',
  allowedTemplateVersion: 'TheGarden_Import_Template_2026-10-27.xlsx',
  templateCompatibilityStatus: 'VERIFIED_EXCEL_2026',
  strictIdempotencyCheck: true,
  refuseCheckedPayrollRows: true,
  pdfPaperSize: 'A4',
  pdfDefaultOrientation: 'PORTRAIT',
  pdfMarginMm: 12,
  pdfIncludedSections: [
    'NEW_STAFF',
    'LEFT',
    'LEAVE',
    'EXTRA_SHIFT',
    'DAY_OFF_WORK',
    'ADVANCES',
    'MONTH_INPUTS',
  ],
  pdfSignatoryPreparedBy: 'ຜູ້ຈັດການຮ້ານ / ຝ່າຍບຸກຄະລາກອນ',
  pdfSignatoryReviewedBy: 'ຫົວໜ້າທີມກວດສອບຫຼັງບ້ານ (Audit Team)',
  pdfSignatoryApprovedBy: 'ຜູ້ອຳນວຍການ / ຜູ້ອະນຸມັດຈ່າຍເງິນເດືອນ',
  pdfFooterTextLao: 'ເອກະສານລັບສະເພາະພາຍໃນ The Garden · ກວດສອບຕາມຮອບບັນຊີ 26–25',
  nightlyBackupEnabled: true,
  prePostExportSnapshotEnabled: true,
  payrollRetentionMonths: 60,
  bankDataRetentionMonths: 36,
  auditLogRetentionMonths: 84,
  lastBackupRestoreTestDate: '15/10/2026',
  lastUpdatedBy: 'gardennakedespresso@gmail.com',
  lastUpdatedAt: '2026-10-27T07:00:00+07:00',
  appVersion: '1.0.0 (2026-10-27)',
};
