import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePeriodFromDate,
  getPeriodDateRange,
  isDateInPeriod,
  formatEventId,
  formatExportId,
  formatBundleId,
  formatStandardFileName,
  isExampleRow,
  computeEventIdempotencyKey,
  validateEventPayload,
  validatePreExport,
  maskBankAccount,
  EmployeeRecord,
  PayrollPeriod,
  PayrollEventRecord,
} from './payrollRules';

const mockEmployees: EmployeeRecord[] = [
  {
    employeeId: 'EMP-001',
    nameLao: 'ທ້າວ ສົມຊາຍ ພົມມະວົງ',
    nameEn: 'Somxay Phommavong',
    position: 'Head Barista · ຫົວໜ້າບາຣິສຕ້າ',
    scannerId: '101',
    usesScanner: 'Yes',
    dayOff: 'Mon',
    shiftStart: '07:00',
    shiftEnd: '15:30',
    monthlySalary: 5500000,
    sso: 'Yes',
    bankAccount: '16012000123456',
    startDate: '01/03/2025',
    status: 'ACTIVE',
    checkedInPayroll: false,
    storeId: 'STORE-VTE-01',
    version: 1,
    updatedAt: '2026-10-01T08:00:00+07:00',
    updatedBy: 'gardennakedespresso@gmail.com',
  },
  {
    employeeId: 'EMP-002',
    nameLao: 'ນາງ ຈັນສຸດາ ວົງສະຫວັນ',
    nameEn: 'Chansouda Vongsavanh',
    position: 'Cashier · ແຄັດເຊຍ',
    scannerId: '102',
    usesScanner: 'Yes',
    dayOff: 'Tue',
    shiftStart: '08:00',
    shiftEnd: '16:30',
    monthlySalary: 4200000,
    sso: 'Yes',
    bankAccount: '16012000998877',
    startDate: '15/05/2025',
    status: 'ACTIVE',
    checkedInPayroll: true, // Already ticked ✓ Checked in Payroll
    storeId: 'STORE-VTE-01',
    version: 1,
    updatedAt: '2026-10-01T08:00:00+07:00',
    updatedBy: 'gardennakedespresso@gmail.com',
  },
];

test('26–25 Payroll Period calculation handles boundary dates 25 and 26 accurately', () => {
  // 25/09/2026 belongs to 2026-09
  assert.equal(calculatePeriodFromDate('25/09/2026'), '2026-09');
  // 26/09/2026 belongs to 2026-10
  assert.equal(calculatePeriodFromDate('26/09/2026'), '2026-10');
  // 25/10/2026 belongs to 2026-10
  assert.equal(calculatePeriodFromDate('25/10/2026'), '2026-10');
  // 26/10/2026 belongs to 2026-11
  assert.equal(calculatePeriodFromDate('26/10/2026'), '2026-11');
  // Year rollover: 26/12/2026 belongs to 2027-01
  assert.equal(calculatePeriodFromDate('26/12/2026'), '2027-01');

  const range = getPeriodDateRange('2026-10');
  assert.ok(range);
  assert.equal(range.startDate, '26/09/2026');
  assert.equal(range.endDate, '25/10/2026');

  assert.equal(isDateInPeriod('26/09/2026', '2026-10'), true);
  assert.equal(isDateInPeriod('25/10/2026', '2026-10'), true);
  assert.equal(isDateInPeriod('25/09/2026', '2026-10'), false);
});

test('Sequence and file naming formatters match specification Section 3.2 and 5.1', () => {
  assert.equal(formatEventId('2026-10', 'LEAVE', 124), 'EVT-2026-10-LEAVE-000124');
  assert.equal(formatExportId('2026-10', 7), 'EXP-2026-10-0007');
  assert.equal(formatBundleId('2026-10', 3), 'PDF-2026-10-0003');

  const fixedDate = new Date(Date.UTC(2026, 9, 25, 11, 5, 0)); // 18:05:00 in Asia/Vientiane (+7)
  assert.equal(
    formatStandardFileName('EXPORT', '2026-10', 7, 'xlsx', fixedDate),
    'TG-EXPORT-2026-10-0007-20261025-180500.xlsx'
  );
});

test('Example row detection filters out e.g. rows', () => {
  assert.equal(isExampleRow(['e.g. EMP-001', 'Somxay']), true);
  assert.equal(isExampleRow(['EMP-001', 'e.g. Sick leave']), true);
  assert.equal(isExampleRow(['EMP-001', 'ທ້າວ ສົມຊາຍ ພົມມະວົງ']), false);
});

test('Validation blocks mismatched name on existing Employee ID and refuses Checked in Payroll staff', () => {
  // Conflict on existing ID with wrong name
  const mismatch = validateEventPayload(
    'NEW_STAFF',
    '2026-10',
    'EMP-001',
    { mode: 'new', nameLao: 'ຊື່ອື່ນທີ່ບໍ່ກົງ' },
    mockEmployees
  );
  assert.equal(mismatch.valid, false);
  assert.ok(mismatch.fieldErrors.employeeId.includes('ຊື່ບໍ່ກົງກັນ'));

  // Refuses employee already ticked ✓ Checked in Payroll (EMP-002)
  const checkedRefusal = validateEventPayload(
    'LEAVE',
    '2026-10',
    'EMP-002',
    { leaveType: 'Sick leave · ລາป่วย', fromDate: '01/10/2026', toDate: '02/10/2026' },
    mockEmployees
  );
  assert.equal(checkedRefusal.valid, false);
  assert.ok(checkedRefusal.fieldErrors.employeeId.includes('ຖືກຕິກ ✓ ກວດແລ້ວ'));
});

test('Validation enforces Swap absentDateReplaced, Leave date order, and rejects commas in numeric strings', () => {
  // Swap without absentDateReplaced fails
  const swapFail = validateEventPayload(
    'DAY_OFF_WORK',
    '2026-10',
    'EMP-001',
    { dayOffWorked: '04/10/2026', usedFor: 'Swap', absentDateReplaced: '' },
    mockEmployees
  );
  assert.equal(swapFail.valid, false);
  assert.ok(swapFail.fieldErrors.absentDateReplaced);

  // OT x1.5 without absentDateReplaced succeeds
  const otPass = validateEventPayload(
    'DAY_OFF_WORK',
    '2026-10',
    'EMP-001',
    { dayOffWorked: '04/10/2026', usedFor: 'OT x1.5', absentDateReplaced: '' },
    mockEmployees
  );
  assert.equal(otPass.valid, true);
  assert.equal(otPass.resolvedAutoNameLao, 'ທ້າວ ສົມຊາຍ ພົມມະວົງ');

  // Comma in amount rejected
  const commaFail = validateEventPayload(
    'ADVANCES',
    '2026-10',
    'EMP-001',
    { date: '05/10/2026', advanceType: 'New advance · ເບີກໃໝ່', amount: '500,000' },
    mockEmployees
  );
  assert.equal(commaFail.valid, false);
  assert.ok(commaFail.fieldErrors.amount.includes('ຫ້າມໃສ່ເຄື່ອງໝາຍຈຸດ'));
});

test('New staff in same batch allows subsequent Leave event in same batch & Pre-Export checklist validates accurately', () => {
  const batchNew = new Map<string, string>([['EMP-099', 'ນາງ ມະນີ ໄຊຍະວົງ']]);
  const leaveForBatchNew = validateEventPayload(
    'LEAVE',
    '2026-10',
    'EMP-099',
    { leaveType: 'Annual leave · ລາພັກປະຈຳປີ', fromDate: '10/10/2026', toDate: '11/10/2026' },
    mockEmployees,
    batchNew
  );
  assert.equal(leaveForBatchNew.valid, true);
  assert.equal(leaveForBatchNew.resolvedAutoNameLao, 'ນາງ ມະນີ ໄຊຍະວົງ');

  const period: PayrollPeriod = {
    periodId: '2026-10',
    startDate: '26/09/2026',
    endDate: '25/10/2026',
    status: 'OPEN',
    openedBy: 'gardennakedespresso@gmail.com',
    openedAt: '2026-09-26T08:00:00+07:00',
  };

  const payload = { leaveType: 'Annual leave · ລາພັກປະຈຳປີ', fromDate: '10/10/2026', toDate: '11/10/2026' };
  const ev: PayrollEventRecord = {
    eventId: 'EVT-2026-10-LEAVE-000001',
    periodId: '2026-10',
    category: 'LEAVE',
    employeeId: 'EMP-001',
    autoNameLao: 'ທ້າວ ສົມຊາຍ ພົມມະວົງ',
    storeId: 'STORE-VTE-01',
    payload,
    version: 1,
    idempotencyKey: computeEventIdempotencyKey('LEAVE', '2026-10', 'EMP-001', payload),
    status: 'VALID',
    createdBy: 'gardennakedespresso@gmail.com',
    createdAt: '2026-10-10T09:00:00+07:00',
    updatedBy: 'gardennakedespresso@gmail.com',
    updatedAt: '2026-10-10T09:00:00+07:00',
    revisionHistory: [],
  };

  const check = validatePreExport(period, [ev], mockEmployees);
  assert.equal(check.canExport, true);
  assert.equal(check.issues.length, 0);
  assert.equal(maskBankAccount('16012000123456', false), '**********-3456');
});

import {
  generateTemplatePreservingWorkbook,
  parseExcelImportBuffer,
  TEMPLATE_SHEET_NAMES,
} from './excelTemplateEngine';
import { INITIAL_REFERENCE_LISTS } from './seedData';

test('Excel template generation preserves 9 visible sheets + hidden Lists sheet and handles duplicate imports safely', async () => {
  const payload = { leaveType: 'Sick leave · ລາປ່ວຍ', fromDate: '02/10/2026', toDate: '03/10/2026', reason: 'Fever', status: '' };
  const ev: PayrollEventRecord = {
    eventId: 'EVT-2026-10-LEAVE-000001',
    periodId: '2026-10',
    category: 'LEAVE',
    employeeId: 'EMP-001',
    autoNameLao: 'ທ້າວ ສົມຊາຍ ພົມມະວົງ',
    storeId: 'STORE-VTE-01',
    payload,
    version: 1,
    idempotencyKey: computeEventIdempotencyKey('LEAVE', '2026-10', 'EMP-001', payload),
    status: 'VALID',
    createdBy: 'gardennakedespresso@gmail.com',
    createdAt: '2026-10-02T09:00:00+07:00',
    updatedBy: 'gardennakedespresso@gmail.com',
    updatedAt: '2026-10-02T09:00:00+07:00',
    revisionHistory: [],
  };

  const xlsxBytes = await generateTemplatePreservingWorkbook(
    '2026-10',
    [ev],
    mockEmployees,
    INITIAL_REFERENCE_LISTS,
    true
  );
  assert.ok(xlsxBytes.byteLength > 1000);

  // First import when event is NOT yet in database -> 1 readyToImport
  const firstPreview = await parseExcelImportBuffer(
    xlsxBytes,
    'TheGarden_Import_Template_2026-10-27.xlsx',
    '2026-10',
    mockEmployees,
    []
  );
  assert.equal(firstPreview.sheetStructureValid, true);
  assert.equal(firstPreview.readyToImport.length, 1);
  assert.equal(firstPreview.skippedDuplicates.length, 0);
  assert.equal(firstPreview.readyToImport[0].sheetName, TEMPLATE_SHEET_NAMES.LEAVE);

  // Second import when event IS already in database -> 0 readyToImport, 1 skippedDuplicates
  const secondPreview = await parseExcelImportBuffer(
    xlsxBytes,
    'TheGarden_Import_Template_2026-10-27.xlsx',
    '2026-10',
    mockEmployees,
    [ev]
  );
  assert.equal(secondPreview.readyToImport.length, 0);
  assert.equal(secondPreview.skippedDuplicates.length, 1);
});

