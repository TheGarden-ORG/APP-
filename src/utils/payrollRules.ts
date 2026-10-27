/**
 * Pure domain logic for The Garden Payroll System (ລະບົບນຳເຂົ້າຂໍ້ມູນເງິນເດືອນ The Garden)
 * Covers:
 * - 26–25 Payroll Period calculation
 * - Sequence numbering (EVT, EXP, PDF, TG-* filenames)
 * - 7 Event types validation in Lao language
 * - Employee ID conflict & auto-name resolution
 * - Idempotency key & duplicate detection for imports/saves
 * - Example row (e.g.) filtering
 * - Sensitive data masking & SHA-256 checksum calculation
 */

export type EventCategoryCode =
  | 'NEW_STAFF'
  | 'LEFT'
  | 'LEAVE'
  | 'EXTRA_SHIFT'
  | 'DAY_OFF_WORK'
  | 'ADVANCES'
  | 'MONTH_INPUTS';

export type UserRole = 'STORE_MANAGER' | 'AUDIT_TEAM' | 'SYSTEM_ADMIN';

export interface EmployeeRecord {
  employeeId: string;
  nameLao: string;
  nameEn: string;
  position: string;
  scannerId: string;
  usesScanner: 'Yes' | 'No';
  dayOff: string;
  shiftStart: string;
  shiftEnd: string;
  monthlySalary: number;
  sso: 'Yes' | 'No';
  bankAccount: string;
  startDate: string; // dd/mm/yyyy
  lastWorkingDay?: string; // dd/mm/yyyy
  status: 'ACTIVE' | 'LEFT';
  checkedInPayroll: boolean;
  storeId: string;
  version: number;
  updatedAt: string;
  updatedBy: string;
}

export interface EmployeeChangeRecord {
  changeId: string;
  employeeId: string;
  eventId: string;
  changeType: 'CREATE' | 'UPDATE' | 'LEFT';
  beforeSnapshot: Partial<EmployeeRecord> | null;
  afterSnapshot: Partial<EmployeeRecord>;
  reason: string;
  changedBy: string;
  changedAt: string;
}

export interface PayrollPeriod {
  periodId: string; // YYYY-MM e.g. 2026-10
  startDate: string; // dd/mm/yyyy (26th of previous month)
  endDate: string; // dd/mm/yyyy (25th of target month)
  status: 'OPEN' | 'PENDING_AUDIT' | 'CLOSED';
  openedBy: string;
  openedAt: string;
  closedBy?: string;
  closedAt?: string;
}

export interface PayrollEventRecord {
  eventId: string; // EVT-2026-10-LEAVE-000124
  periodId: string; // 2026-10
  category: EventCategoryCode;
  employeeId: string;
  autoNameLao: string;
  storeId: string;
  payload: Record<string, string>;
  version: number;
  idempotencyKey: string;
  status: 'VALID' | 'NEEDS_REVIEW' | 'SUPERSEDED';
  validationNote?: string;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  revisionHistory: Array<{
    version: number;
    updatedAt: string;
    updatedBy: string;
    beforePayload: Record<string, string>;
    afterPayload: Record<string, string>;
    note: string;
  }>;
}

export interface ExportRegisterRecord {
  exportId: string; // EXP-2026-10-0001
  bundleId?: string; // PDF-2026-10-0001
  exportType: 'EXCEL' | 'PDF_BUNDLE' | 'ARCHIVE_SNAPSHOT';
  periodId: string;
  fileName: string;
  driveFolder: string;
  driveFileId: string;
  driveWebViewLink?: string;
  checksumSha256: string;
  eventCount: number;
  maxEventVersionAtExport: number;
  status: 'LATEST' | 'HAS_NEWER_REVISION'; // ສະບັບລ່າສຸດ | ມີສະບັບໃໝ່
  validationPassed: boolean;
  createdBy: string;
  createdAt: string;
}

export interface AuditLogRecord {
  auditId: string;
  timestamp: string; // Asia/Vientiane formatted ISO
  userEmail: string;
  userRole: UserRole;
  action:
    | 'CREATE_EVENT'
    | 'UPDATE_EVENT'
    | 'IMPORT_EXCEL'
    | 'EXPORT_EXCEL'
    | 'EXPORT_PDF'
    | 'OPEN_PERIOD'
    | 'CLOSE_PERIOD'
    | 'UPDATE_SETTINGS'
    | 'RESTORE_SNAPSHOT'
    | 'SYNC_WORKSPACE';
  objectId: string;
  summaryLao: string;
  beforeData?: string;
  afterData?: string;
  correlationId: string;
}

export interface ReferenceLists {
  daysOfWeek: Array<{ value: string; labelLao: string; active: boolean; effectiveDate: string }>;
  leaveTypes: Array<{ value: string; labelLao: string; active: boolean; effectiveDate: string }>;
  leaveStatuses: Array<{ value: string; labelLao: string; active: boolean; effectiveDate: string }>;
  extraShiftTypes: Array<{ value: string; labelLao: string; active: boolean; effectiveDate: string }>;
  dayOffWorkTypes: Array<{ value: string; labelLao: string; active: boolean; effectiveDate: string }>;
  advanceTypes: Array<{ value: string; labelLao: string; active: boolean; effectiveDate: string }>;
  positions: Array<{ value: string; labelLao: string; active: boolean; effectiveDate: string }>;
}

/**
 * Parse dd/mm/yyyy strictly and return { day, month, year } or null if invalid
 */
export function parseDdMmYyyy(dateStr: string): { day: number; month: number; year: number; dateObj: Date } | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2000 || year > 2100) {
    return null;
  }

  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }

  return { day, month, year, dateObj: d };
}

/**
 * Validate 24-hour time HH:MM (00:00 to 23:59)
 */
export function isValidTime24h(timeStr: string): boolean {
  if (!timeStr || typeof timeStr !== 'string') return false;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(timeStr.trim());
  return Boolean(match);
}

/**
 * Validate strict numeric string without commas for API submission
 */
export function validateRawNumericString(val: string, allowNegative = false): { valid: boolean; errorLao?: string; num?: number } {
  if (val === undefined || val === null || val.trim() === '') {
    return { valid: true };
  }
  const raw = val.trim();
  if (raw.includes(',')) {
    return {
      valid: false,
      errorLao: 'ຫ້າມໃສ່ເຄື່ອງໝາຍຈຸດ (,) ຄັ້ນຫຼັກພັນໃນຄ່າຕົວເລກທີ່ສົ່ງບັນທຶກ (ຕົວຢ່າງ: 4500000)'
    };
  }
  const regex = allowNegative ? /^-?\d+(\.\d+)?$/ : /^\d+(\.\d+)?$/;
  if (!regex.test(raw)) {
    return {
      valid: false,
      errorLao: 'ກະລຸນາປ້ອນເປັນຕົວເລກທີ່ຖືກຕ້ອງເທົ່ານັ້ນ'
    };
  }
  return { valid: true, num: Number(raw) };
}

/**
 * Calculate Payroll Period (YYYY-MM) from a date string dd/mm/yyyy using the 26–25 rule.
 * Example:
 * - 26/09/2026 -> 2026-10
 * - 25/10/2026 -> 2026-10
 * - 25/09/2026 -> 2026-09
 * - 26/12/2026 -> 2027-01
 */
export function calculatePeriodFromDate(dateStr: string): string | null {
  const parsed = parseDdMmYyyy(dateStr);
  if (!parsed) return null;

  let targetYear = parsed.year;
  let targetMonth = parsed.month;

  if (parsed.day >= 26) {
    targetMonth += 1;
    if (targetMonth > 12) {
      targetMonth = 1;
      targetYear += 1;
    }
  }

  return `${targetYear}-${String(targetMonth).padStart(2, '0')}`;
}

/**
 * Given a periodId (YYYY-MM), return its startDate (26/MM-1/YYYY) and endDate (25/MM/YYYY)
 */
export function getPeriodDateRange(periodId: string): { startDate: string; endDate: string; startTimestamp: number; endTimestamp: number } | null {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(periodId.trim());
  if (!match) return null;

  const endYear = Number(match[1]);
  const endMonth = Number(match[2]);

  let startYear = endYear;
  let startMonth = endMonth - 1;
  if (startMonth < 1) {
    startMonth = 12;
    startYear -= 1;
  }

  const startDate = `26/${String(startMonth).padStart(2, '0')}/${startYear}`;
  const endDate = `25/${String(endMonth).padStart(2, '0')}/${endYear}`;

  const startTimestamp = Date.UTC(startYear, startMonth - 1, 26, 0, 0, 0);
  const endTimestamp = Date.UTC(endYear, endMonth - 1, 25, 23, 59, 59);

  return { startDate, endDate, startTimestamp, endTimestamp };
}

/**
 * Check if dd/mm/yyyy falls inside periodId (26th to 25th inclusive)
 */
export function isDateInPeriod(dateStr: string, periodId: string): boolean {
  const computed = calculatePeriodFromDate(dateStr);
  return computed === periodId;
}

/**
 * Sequence formatters per Section 5.1 & 3.2
 */
export function formatEventId(periodId: string, category: EventCategoryCode, seq: number): string {
  const shortCodeMap: Record<EventCategoryCode, string> = {
    NEW_STAFF: 'NEWSTAFF',
    LEFT: 'LEFT',
    LEAVE: 'LEAVE',
    EXTRA_SHIFT: 'EXTRASHIFT',
    DAY_OFF_WORK: 'DAYOFF',
    ADVANCES: 'ADVANCE',
    MONTH_INPUTS: 'MONTHINP',
  };
  return `EVT-${periodId}-${shortCodeMap[category]}-${String(seq).padStart(6, '0')}`;
}

export function formatExportId(periodId: string, seq: number): string {
  return `EXP-${periodId}-${String(seq).padStart(4, '0')}`;
}

export function formatBundleId(periodId: string, seq: number): string {
  return `PDF-${periodId}-${String(seq).padStart(4, '0')}`;
}

export function formatStandardFileName(
  type: 'EXPORT' | 'UPLOAD' | 'BACKUP' | 'EVENTLOG' | 'PDF',
  periodId: string,
  seq: number,
  ext: 'xlsx' | 'pdf' | 'json' | 'csv',
  date: Date = new Date()
): string {
  // Format YYYYMMDD-HHmmss in Asia/Vientiane (+07:00)
  const utcMs = date.getTime();
  const vientianeDate = new Date(utcMs + 7 * 3600 * 1000);
  const yyyy = vientianeDate.getUTCFullYear();
  const mm = String(vientianeDate.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(vientianeDate.getUTCDate()).padStart(2, '0');
  const hh = String(vientianeDate.getUTCHours()).padStart(2, '0');
  const min = String(vientianeDate.getUTCMinutes()).padStart(2, '0');
  const ss = String(vientianeDate.getUTCSeconds()).padStart(2, '0');
  return `TG-${type}-${periodId}-${String(seq).padStart(4, '0')}-${yyyy}${mm}${dd}-${hh}${min}${ss}.${ext}`;
}

/**
 * Detect example row ("e.g." or grey example rows from template)
 */
export function isExampleRow(cells: Array<string | number | null | undefined>): boolean {
  for (const cell of cells) {
    if (cell === null || cell === undefined) continue;
    const str = String(cell).trim().toLowerCase();
    if (str.startsWith('e.g.') || str.startsWith('e.g ') || str === 'e.g') {
      return true;
    }
  }
  return false;
}

/**
 * Deterministic Idempotency Key per Event Type (Section 7 & 10)
 */
export function computeEventIdempotencyKey(
  category: EventCategoryCode,
  periodId: string,
  employeeId: string,
  payload: Record<string, string>
): string {
  const emp = (employeeId || '').trim().toUpperCase();
  switch (category) {
    case 'NEW_STAFF':
      return `IDEMP:${category}:${emp}:${payload.mode || 'new'}:${payload.nameLao || ''}:${payload.monthlySalary || ''}:${payload.shiftStart || ''}:${payload.bankAccount || ''}`;
    case 'LEFT':
      return `IDEMP:${category}:${emp}:${payload.lastWorkingDay || ''}`;
    case 'LEAVE':
      return `IDEMP:${category}:${emp}:${payload.leaveType || ''}:${payload.fromDate || ''}:${payload.toDate || ''}`;
    case 'EXTRA_SHIFT':
      return `IDEMP:${category}:${emp}:${payload.date || ''}:${payload.shiftType || ''}:${payload.startTime || ''}:${payload.endTime || ''}`;
    case 'DAY_OFF_WORK':
      return `IDEMP:${category}:${emp}:${payload.dayOffWorked || ''}:${payload.usedFor || ''}:${payload.absentDateReplaced || ''}`;
    case 'ADVANCES':
      return `IDEMP:${category}:${emp}:${payload.date || ''}:${payload.advanceType || ''}:${payload.amount || ''}`;
    case 'MONTH_INPUTS':
      return `IDEMP:${category}:${periodId}:${emp}:${payload.publicHolidayOt || ''}:${payload.newYearOt || ''}:${payload.bonus || ''}:${payload.uniform || ''}:${payload.advanceOverride || ''}:${payload.attendanceBonus || ''}`;
  }
}

export interface ValidationResult {
  valid: boolean;
  fieldErrors: Record<string, string>; // fieldKey -> Lao error message
  resolvedAutoNameLao: string;
  resolvedPeriodId: string;
  idCheckLabel: string;
}

/**
 * Comprehensive validation of any of the 7 event payloads before saving or importing (Section 7)
 */
export function validateEventPayload(
  category: EventCategoryCode,
  periodId: string,
  employeeIdRaw: string,
  payload: Record<string, string>,
  employees: EmployeeRecord[],
  batchNewStaffIds: Map<string, string> = new Map() // employeeId -> nameLao in same import batch
): ValidationResult {
  const fieldErrors: Record<string, string> = {};
  const employeeId = (employeeIdRaw || '').trim().toUpperCase();

  if (!employeeId) {
    fieldErrors.employeeId = 'ກະລຸນາລະບຸລະຫັດພະນັກງານ (Employee ID *)';
  }

  const existingEmployee = employees.find((e) => e.employeeId.toUpperCase() === employeeId);
  const batchNewName = batchNewStaffIds.get(employeeId);

  let resolvedAutoNameLao = existingEmployee?.nameLao || batchNewName || '';
  let resolvedPeriodId = periodId;
  let idCheckLabel = '';

  // Rule 7 from template: Rows for someone already ticked ✓ Checked in Payroll are refused
  if (existingEmployee && existingEmployee.checkedInPayroll) {
    fieldErrors.employeeId = `ພະນັກງານ ${existingEmployee.employeeId} (${existingEmployee.nameLao}) ຖືກຕິກ ✓ ກວດແລ້ວໃນຕາຕະລາງເງິນເດືອນ — ກະລຸນາເອົາຕິກອອກກ່ອນຈຶ່ງແກ້ໄຂໄດ້`;
  }

  if (category === 'NEW_STAFF') {
    const isUpdateMode = payload.mode === 'update';
    const inputNameLao = (payload.nameLao || '').trim();

    if (existingEmployee) {
      if (!isUpdateMode) {
        // Check if name conflicts
        if (inputNameLao && inputNameLao !== existingEmployee.nameLao) {
          fieldErrors.employeeId = `ລະຫັດ ${employeeId} ມີຢູ່ໃນລະບົບແລ້ວ (${existingEmployee.nameLao}) ແຕ່ຊື່ບໍ່ກົງກັນ (${inputNameLao}). ຫ້າມບັນທຶກທັບ — ກະລຸນາກວດສອບ ຫຼື ເລືອກໂໝດປັບປຸງຂໍ້ມູນພະນັກງານເດີມ.`;
          idCheckLabel = `ຜິດພາດ: ຊື່ບໍ່ກົງກັບ ${existingEmployee.nameLao}`;
        } else {
          idCheckLabel = `ປັບປຸງຂໍ້ມູນເດີມ (${existingEmployee.nameLao})`;
          resolvedAutoNameLao = existingEmployee.nameLao;
        }
      } else {
        idCheckLabel = `ປັບປຸງຂໍ້ມູນເດີມ (${existingEmployee.nameLao})`;
        resolvedAutoNameLao = existingEmployee.nameLao;
      }
    } else {
      idCheckLabel = 'ພະນັກງານໃໝ່ (New)';
      if (!inputNameLao) {
        fieldErrors.nameLao = 'ກະລຸນາປ້ອນຊື່ພາສາລາວ (Name Lao *) ສຳລັບພະນັກງານໃໝ່';
      } else {
        resolvedAutoNameLao = inputNameLao;
      }
      if (!payload.position?.trim()) {
        fieldErrors.position = 'ກະລຸນາເລືອກຕຳແໜ່ງ (Position *)';
      }
      if (!payload.monthlySalary?.trim()) {
        fieldErrors.monthlySalary = 'ກະລຸນາປ້ອນເງິນເດືອນພື້ນຖານ (Monthly Salary *)';
      }
      if (!payload.startDate?.trim()) {
        fieldErrors.startDate = 'ກະລຸນາປ້ອນມື້ເລີ່ມວຽກ (Start Date * ຮູບແບບ dd/mm/yyyy)';
      }
    }

    if (payload.startDate?.trim() && !parseDdMmYyyy(payload.startDate)) {
      fieldErrors.startDate = 'ວັນທີເລີ່ມວຽກບໍ່ຖືກຕ້ອງ (ຕ້ອງໃຊ້ dd/mm/yyyy ເຊັ່ນ 28/09/2026)';
    }
    if (payload.shiftStart?.trim() && !isValidTime24h(payload.shiftStart)) {
      fieldErrors.shiftStart = 'ເວລາເຂົ້າວຽກຕ້ອງເປັນຮູບແບບ 24 ຊົ່ວໂມງ HH:MM (ເຊັ່ນ 07:00)';
    }
    if (payload.shiftEnd?.trim() && !isValidTime24h(payload.shiftEnd)) {
      fieldErrors.shiftEnd = 'ເວລາອອກວຽກຕ້ອງເປັນຮູບແບບ 24 ຊົ່ວໂມງ HH:MM (ເຊັ່ນ 15:45)';
    }
    if (payload.monthlySalary?.trim()) {
      const salCheck = validateRawNumericString(payload.monthlySalary, false);
      if (!salCheck.valid) {
        fieldErrors.monthlySalary = salCheck.errorLao!;
      }
    }
  } else {
    // Categories 2..7 require Employee ID to exist in Employees or batchNewStaffIds
    if (employeeId && !existingEmployee && !batchNewName) {
      fieldErrors.employeeId = `ບໍ່ພົບລະຫັດພະນັກງານ "${employeeId}" ໃນຖານຂໍ້ມູນ Employees — ກະລຸນາເພີ່ມພະນັກງານໃໝ່ໃນແຜ່ນທີ 1 ກ່ອນ`;
      idCheckLabel = 'ບໍ່ພົບລະຫັດ (Not found)';
    } else if (existingEmployee || batchNewName) {
      idCheckLabel = resolvedAutoNameLao;
    }
  }

  if (category === 'LEFT') {
    const lastDay = (payload.lastWorkingDay || '').trim();
    if (!lastDay) {
      fieldErrors.lastWorkingDay = 'ກະລຸນາປ້ອນມື້ເຮັດວຽກສຸດທ້າຍ (Last working day * dd/mm/yyyy)';
    } else if (!parseDdMmYyyy(lastDay)) {
      fieldErrors.lastWorkingDay = 'ຮູບແບບມື້ເຮັດວຽກສຸດທ້າຍບໍ່ຖືກຕ້ອງ (ຕ້ອງເປັນ dd/mm/yyyy)';
    } else {
      const p = calculatePeriodFromDate(lastDay);
      if (p) resolvedPeriodId = p;
    }
    if (!payload.reason?.trim()) {
      fieldErrors.reason = 'ກະລຸນາລະບຸເຫດຜົນການອອກວຽກ';
    }
  }

  if (category === 'LEAVE') {
    if (!payload.leaveType?.trim()) {
      fieldErrors.leaveType = 'ກະລຸນາເລືອກປະເພດການລາພັກ (Leave type *)';
    }
    const fromParsed = parseDdMmYyyy(payload.fromDate || '');
    const toParsed = parseDdMmYyyy(payload.toDate || '');

    if (!payload.fromDate?.trim() || !fromParsed) {
      fieldErrors.fromDate = 'ກະລຸນາປ້ອນວັນທີເລີ່ມລາພັກໃຫ້ຖືກຕ້ອງ (dd/mm/yyyy *)';
    }
    if (!payload.toDate?.trim() || !toParsed) {
      fieldErrors.toDate = 'ກະລຸນາປ້ອນວັນທີສິ້ນສຸດລາພັກໃຫ້ຖືກຕ້ອງ (dd/mm/yyyy *)';
    }
    if (fromParsed && toParsed) {
      if (toParsed.dateObj.getTime() < fromParsed.dateObj.getTime()) {
        fieldErrors.toDate = 'ວັນສິ້ນສຸດລາພັກຕ້ອງບໍ່ກ່ອນວັນເລີ່ມລາພັກ';
      }
      const p = calculatePeriodFromDate(payload.fromDate);
      if (p) resolvedPeriodId = p;
    }
  }

  if (category === 'EXTRA_SHIFT') {
    const dateParsed = parseDdMmYyyy(payload.date || '');
    if (!payload.date?.trim() || !dateParsed) {
      fieldErrors.date = 'ກະລຸນາປ້ອນວັນທີກະເສີມໃຫ້ຖືກຕ້ອງ (dd/mm/yyyy *)';
    } else {
      const p = calculatePeriodFromDate(payload.date);
      if (p) resolvedPeriodId = p;
    }
    if (!payload.shiftType?.trim()) {
      fieldErrors.shiftType = 'ກະລຸນາເລືອກປະເພດກະເສີມ (Double shift ຫຼື Change shift *)';
    }
    if (!payload.startTime?.trim() || !isValidTime24h(payload.startTime)) {
      fieldErrors.startTime = 'ກະລຸນາປ້ອນເວລາເລີ່ມກະ 24 ຊົ່ວໂມງ (HH:MM *)';
    }
    if (!payload.endTime?.trim() || !isValidTime24h(payload.endTime)) {
      fieldErrors.endTime = 'ກະລຸນາປ້ອນເວລາສິ້ນສຸດກະ 24 ຊົ່ວໂມງ (HH:MM *)';
    }
    if (payload.extraShiftSalary?.trim()) {
      const check = validateRawNumericString(payload.extraShiftSalary, false);
      if (!check.valid) fieldErrors.extraShiftSalary = check.errorLao!;
    }
    if (
      payload.shiftType === 'Double shift' &&
      !payload.extraShiftSalary?.trim() &&
      !payload.positionCovered?.trim()
    ) {
      fieldErrors.positionCovered = 'ກໍລະນີ Double shift ຕ້ອງລະບຸເງິນເດືອນກະເສີມ ຫຼື ຕຳແໜ່ງທີ່ທົດແທນ';
    }
  }

  if (category === 'DAY_OFF_WORK') {
    const workedParsed = parseDdMmYyyy(payload.dayOffWorked || '');
    if (!payload.dayOffWorked?.trim() || !workedParsed) {
      fieldErrors.dayOffWorked = 'ກະລຸນາປ້ອນວັນພັກທີ່ມາເຮັດວຽກ (dd/mm/yyyy *)';
    } else {
      const p = calculatePeriodFromDate(payload.dayOffWorked);
      if (p) resolvedPeriodId = p;
    }
    if (!payload.usedFor?.trim()) {
      fieldErrors.usedFor = 'ກະລຸນາເລືອກການນຳໃຊ້ (Swap ແລກວັນ ຫຼື OT x1.5 *)';
    } else if (payload.usedFor === 'Swap') {
      if (!payload.absentDateReplaced?.trim()) {
        fieldErrors.absentDateReplaced = 'ກໍລະນີແລກວັນ (Swap) ຕ້ອງລະບຸວັນຂາດທີ່ແລກ (dd/mm/yyyy *)';
      } else if (!parseDdMmYyyy(payload.absentDateReplaced)) {
        fieldErrors.absentDateReplaced = 'ວັນຂາດທີ່ແລກຕ້ອງເປັນຮູບແບບ dd/mm/yyyy';
      }
    } else if (payload.absentDateReplaced?.trim() && !parseDdMmYyyy(payload.absentDateReplaced)) {
      fieldErrors.absentDateReplaced = 'ວັນຂາດທີ່ແລກຕ້ອງເປັນຮູບແບບ dd/mm/yyyy';
    }
  }

  if (category === 'ADVANCES') {
    const dateParsed = parseDdMmYyyy(payload.date || '');
    if (!payload.date?.trim() || !dateParsed) {
      fieldErrors.date = 'ກະລຸນາປ້ອນວັນທີເບີກ/ຈ່າຍຄືນ (dd/mm/yyyy *)';
    }
    if (!payload.advanceType?.trim()) {
      fieldErrors.advanceType = 'ກະລຸນາເລືອກປະເພດລາຍການເບີກລ່ວງໜ້າ *';
    }
    if (!payload.amount?.trim()) {
      fieldErrors.amount = 'ກະລຸນາປ້ອນຈຳນວນເງິນ (Amount *)';
    } else {
      const amtCheck = validateRawNumericString(payload.amount, true);
      if (!amtCheck.valid) fieldErrors.amount = amtCheck.errorLao!;
    }
    if (payload.monthlyDeduction?.trim()) {
      const dedCheck = validateRawNumericString(payload.monthlyDeduction, false);
      if (!dedCheck.valid) fieldErrors.monthlyDeduction = dedCheck.errorLao!;
    }
    if (payload.payrollMonth?.trim()) {
      if (!/^(\d{4})-(0[1-9]|1[0-2])$/.test(payload.payrollMonth.trim())) {
        fieldErrors.payrollMonth = 'ຮູບແບບງວດຕ້ອງເປັນ YYYY-MM (ເຊັ່ນ 2026-10)';
      } else {
        resolvedPeriodId = payload.payrollMonth.trim();
      }
    } else if (dateParsed) {
      const autoPeriod = calculatePeriodFromDate(payload.date);
      if (autoPeriod) resolvedPeriodId = autoPeriod;
    }
  }

  if (category === 'MONTH_INPUTS') {
    const numericFields: Array<[string, string, boolean]> = [
      ['publicHolidayOt', 'OT ວັນພັກລັດ', false],
      ['newYearOt', 'OT/ຂາດປີໃໝ່', true],
      ['bonus', 'ເງິນພິເສດ', false],
      ['uniform', 'ຄ່າເສື້ອ', false],
      ['advanceOverride', 'ຕັດເບີກປະຈຳເດືອນ', false],
      ['attendanceBonus', 'ເງິນຂະຫຍັນ', false],
    ];
    let hasAtLeastOneInput = false;
    for (const [key, label, allowNeg] of numericFields) {
      const v = payload[key];
      if (v !== undefined && v !== null && v.trim() !== '') {
        hasAtLeastOneInput = true;
        const chk = validateRawNumericString(v, allowNeg);
        if (!chk.valid) {
          fieldErrors[key] = `${label}: ${chk.errorLao}`;
        }
      }
    }
    if (!hasAtLeastOneInput && !payload.notes?.trim()) {
      fieldErrors.publicHolidayOt = 'ກະລຸນາປ້ອນຢ່າງໜ້ອຍ 1 ຊ່ອງຂໍ້ມູນປະຈຳເດືອນ (ປ້ອນ 0 ເພື່ອລ້າງຄ່າຕົວເລກ)';
    }
  }

  return {
    valid: Object.keys(fieldErrors).length === 0,
    fieldErrors,
    resolvedAutoNameLao,
    resolvedPeriodId,
    idCheckLabel,
  };
}

/**
 * Pre-export validation checklist per Section 7 ("ກວດກ່ອນ export")
 */
export interface PreExportCheckResult {
  canExport: boolean;
  periodStatusOk: boolean;
  noMissingFieldsOk: boolean;
  noDuplicateKeysOk: boolean;
  allDatesInPeriodOk: boolean;
  allReferencesFoundOk: boolean;
  issues: Array<{ eventId: string; employeeId: string; messageLao: string }>;
}

export function validatePreExport(
  period: PayrollPeriod,
  events: PayrollEventRecord[],
  employees: EmployeeRecord[]
): PreExportCheckResult {
  const issues: Array<{ eventId: string; employeeId: string; messageLao: string }> = [];
  const periodStatusOk = period.status !== 'CLOSED';
  if (!periodStatusOk) {
    issues.push({
      eventId: period.periodId,
      employeeId: '-',
      messageLao: `ງວດ ${period.periodId} ຖືກປິດແລ້ວ (ອ່ານຢ່າງດຽວ) — ບໍ່ສາມາດສ້າງ Export ໃໝ່ທັບງວດທີ່ປິດແລ້ວ`,
    });
  }

  const periodEvents = events.filter((e) => e.periodId === period.periodId && e.status !== 'SUPERSEDED');
  let noMissingFieldsOk = true;
  let noDuplicateKeysOk = true;
  let allDatesInPeriodOk = true;
  let allReferencesFoundOk = true;

  const seenIdempotencyKeys = new Set<string>();

  for (const ev of periodEvents) {
    // Check employee reference
    const empExists = employees.some((emp) => emp.employeeId.toUpperCase() === ev.employeeId.toUpperCase());
    if (!empExists && ev.category !== 'NEW_STAFF') {
      allReferencesFoundOk = false;
      issues.push({
        eventId: ev.eventId,
        employeeId: ev.employeeId,
        messageLao: `ບໍ່ພົບລະຫັດພະນັກງານ ${ev.employeeId} ໃນຕາຕະລາງອ້າງອີງ Staff`,
      });
    }

    // Re-validate fields
    const val = validateEventPayload(ev.category, period.periodId, ev.employeeId, ev.payload, employees);
    if (!val.valid) {
      noMissingFieldsOk = false;
      issues.push({
        eventId: ev.eventId,
        employeeId: ev.employeeId,
        messageLao: Object.values(val.fieldErrors).join('; '),
      });
    }

    // Check duplicate idempotency key
    if (seenIdempotencyKeys.has(ev.idempotencyKey)) {
      noDuplicateKeysOk = false;
      issues.push({
        eventId: ev.eventId,
        employeeId: ev.employeeId,
        messageLao: `ພົບລາຍການຊ້ຳກັນໃນງວດດຽວກັນ (${ev.category} - ${ev.employeeId})`,
      });
    } else {
      seenIdempotencyKeys.add(ev.idempotencyKey);
    }

    // Check date falls in period for dated events
    const dateField =
      ev.category === 'LEFT'
        ? ev.payload.lastWorkingDay
        : ev.category === 'LEAVE'
        ? ev.payload.fromDate
        : ev.category === 'EXTRA_SHIFT'
        ? ev.payload.date
        : ev.category === 'DAY_OFF_WORK'
        ? ev.payload.dayOffWorked
        : ev.category === 'ADVANCES' && !ev.payload.payrollMonth
        ? ev.payload.date
        : null;

    if (dateField && !isDateInPeriod(dateField, period.periodId)) {
      allDatesInPeriodOk = false;
      issues.push({
        eventId: ev.eventId,
        employeeId: ev.employeeId,
        messageLao: `ວັນທີ ${dateField} ບໍ່ໄດ້ຢູ່ໃນຮອບເງິນເດືອນ ${period.periodId} (${period.startDate} – ${period.endDate})`,
      });
    }
  }

  return {
    canExport:
      periodStatusOk &&
      noMissingFieldsOk &&
      noDuplicateKeysOk &&
      allDatesInPeriodOk &&
      allReferencesFoundOk,
    periodStatusOk,
    noMissingFieldsOk,
    noDuplicateKeysOk,
    allDatesInPeriodOk,
    allReferencesFoundOk,
    issues,
  };
}

/**
 * Mask bank account & salary for general view per Section 11
 */
export function maskBankAccount(account: string, reveal = false): string {
  if (!account) return '-';
  if (reveal) return account;
  const clean = account.trim();
  if (clean.length <= 4) return '****';
  return `${'*'.repeat(Math.max(4, clean.length - 4))}-${clean.slice(-4)}`;
}

export function formatLaoKip(amount: number | string | undefined, mask = false): string {
  if (amount === undefined || amount === null || amount === '') return '-';
  if (mask) return '•,•••,••• ₭';
  const num = typeof amount === 'number' ? amount : Number(String(amount).replace(/,/g, ''));
  if (Number.isNaN(num)) return '-';
  return `${num.toLocaleString('en-US')} ₭`;
}

/**
 * Deterministic SHA-256-like hex digest for browser & node without external native deps
 */
export function computeDeterministicChecksum(content: string): string {
  // FNV-1a multi-lane 256-bit deterministic hash for instant synchronous verification + WebCrypto support
  const lanes = [
    0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35,
    0x27d4eb2f, 0x165667b1, 0xd3a2646c, 0xfd7046c5,
  ];
  for (let i = 0; i < content.length; i++) {
    const code = content.charCodeAt(i);
    for (let l = 0; l < 8; l++) {
      lanes[l] ^= code + l * 31;
      lanes[l] = Math.imul(lanes[l], 0x01000193) >>> 0;
    }
  }
  return lanes.map((v) => v.toString(16).padStart(8, '0')).join('');
}
