import ExcelJS from 'exceljs';
import {
  EmployeeRecord,
  EventCategoryCode,
  PayrollEventRecord,
  ReferenceLists,
  computeEventIdempotencyKey,
  isExampleRow,
  validateEventPayload,
} from './payrollRules';

export const TEMPLATE_SHEET_NAMES = {
  GUIDE: 'Guide · ຄຳແນະນຳ',
  NEW_STAFF: '1 New staff · ພະນັກງານໃໝ່',
  LEFT: '2 Left · ພະນັກງານອອກ',
  LEAVE: '3 Leave · ລາພັກ',
  EXTRA_SHIFT: '4 Extra shift · ກະເສີມ',
  DAY_OFF_WORK: '5 Day-off work · ມາເຮັດມື້ພັກ',
  ADVANCES: '6 Advances · ເບີກລ່ວງໜ້າ',
  MONTH_INPUTS: '7 Month inputs · ປ້ອນປະຈຳເດືອນ',
  STAFF: 'Staff',
  LISTS: 'Lists',
} as const;

export interface ParsedImportRow {
  rowIndex: number;
  sheetName: string;
  category: EventCategoryCode;
  employeeId: string;
  autoNameLao: string;
  resolvedPeriodId: string;
  payload: Record<string, string>;
  idempotencyKey: string;
  bucket: 'READY' | 'DUPLICATE' | 'ERROR';
  reasonLao: string;
}

export interface ExcelImportPreviewResult {
  fileName: string;
  targetPeriodId: string;
  sheetStructureValid: boolean;
  structureNotesLao: string[];
  readyToImport: ParsedImportRow[];
  skippedDuplicates: ParsedImportRow[];
  invalidRows: ParsedImportRow[];
}

/**
 * Generates an exact .xlsx Buffer matching TheGarden_Import_Template_2026-10-27.xlsx
 * Strict adherence to Section 2 & 8.2:
 * - Preserves 9 visible sheets + 1 hidden `Lists` sheet
 * - Writes ONLY event data into the exact columns/rows defined by the template
 * - Zero system metadata, Event IDs, timestamps, or extra columns in the exported workbook
 */
export async function generateTemplatePreservingWorkbook(
  periodId: string,
  events: PayrollEventRecord[],
  employees: EmployeeRecord[],
  referenceLists: ReferenceLists,
  includeEvents = true
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'The Garden Payroll System';
  wb.created = new Date();

  const periodEvents = includeEvents
    ? events.filter((e) => e.periodId === periodId && e.status !== 'SUPERSEDED')
    : [];

  // 0. Guide · ຄຳແນະນຳ (exact replica of attached guide)
  const wsGuide = wb.addWorksheet(TEMPLATE_SHEET_NAMES.GUIDE);
  wsGuide.columns = [{ width: 4 }, { width: 28 }, { width: 95 }];
  const guideRows: Array<[string | number, string]> = [
    ['The Garden · Payroll import template', ''],
    ['ແບບຟອມນຳເຂົ້າຂໍ້ມູນເງິນເດືອນ', ''],
    ['', ''],
    ['How to use · ວິທີໃຊ້', ''],
    [1, 'Fill only the sheets you need. One row = one change. Leave the other sheets empty. · ຕື່ມສະເພາະແຜ່ນທີ່ຕ້ອງການ, 1 ແຖວ = 1 ລາຍການ.'],
    [2, 'Employee ID: choose from the dropdown (the Staff sheet lists everyone). The green "Name (auto)" column shows the name so you can check it is the right person. · ເລືອກລະຫັດຈາກລາຍການ ແລ້ວກວດຊື່ໃນຖັນສີຂຽວ.'],
    [3, 'Dates as dd/mm/yyyy (e.g. 28/09/2026). Times as HH:MM, 24-hour (e.g. 07:00, 15:45, 00:30). Money without commas is fine. · ວັນທີ dd/mm/yyyy, ເວລາ HH:MM.'],
    [4, 'Grey italic rows starting with "e.g." are examples. They are never imported; you can leave or delete them. · ແຖວສີເທົາ ແມ່ນຕົວຢ່າງ ບໍ່ຖືກນຳເຂົ້າ.'],
    [5, 'In the payroll tool: open the Import tab, choose the payroll month, drop this file, check the preview, then press Apply. Rows with a red error are skipped; fix them and upload again. · ໃນໂປຣແກຣມ: ແຖບ Import → ວາງໄຟລ໌ → ກວດ → Apply.'],
    [6, 'Uploading the same file twice is safe: leave, shifts, swaps and advances that are already recorded are skipped. · ອັບໂຫຼດຊ້ຳໄດ້ ລາຍການທີ່ມີແລ້ວຈະຖືກຂ້າມ.'],
    [7, 'Rows for someone already ticked ✓ Checked in Payroll are refused. Untick them first. · ພະນັກງານທີ່ຕິກກວດແລ້ວ ຕ້ອງເອົາຕິກອອກກ່ອນ.'],
    ['', ''],
    ['Sheets · ແຜ່ນງານ', ''],
    ['1 New staff · ພະນັກງານໃໝ່', 'Type the Employee ID yourself: for a new person, use the ID set for them on the fingerprint scanner. To change someone already in the tool (salary raise, new shift, new bank account), type their ID and fill only the cells that change. · ພະນັກງານໃໝ່: ໃສ່ລະຫັດເອງ (ລະຫັດທີ່ຕັ້ງໄວ້ໃນເຄື່ອງສະແກນນິ້ວ). ປ່ຽນແປງຂໍ້ມູນ: ໃສ່ລະຫັດ ແລະ ຕື່ມສະເພາະຊ່ອງທີ່ປ່ຽນ.'],
    ['2 Left · ພະນັກງານອອກ', 'Last working day becomes their end date. They are paid for this pay period as usual and are not added to later months. · ວັນເຮັດວຽກມື້ສຸດທ້າຍ ຈະເປັນວັນອອກ.'],
    ['3 Leave · ລາພັກ', 'One row per leave request. The weekly day off inside the dates is not counted. Status blank = Approved. Approved leave is excused in payroll; unpaid leave is deducted. · ລາພັກ 1 ຄັ້ງ = 1 ແຖວ.'],
    ['4 Extra shift · ກະເສີມ', "Double shift = worked an extra shift as well as their own: enter the EXTRA shift's times, plus its monthly salary or the position covered. Change shift = worked a different shift that day: enter the shift actually worked. · ເຮັດ 2 ກະ: ໃສ່ເວລາຂອງກະເສີມ."],
    ['5 Day-off work · ມາເຮັດມື້ພັກ', 'Swap = the day off worked replaces an absent day (write the absent date). OT x1.5 = paid as OT day off. · ແລກມື້: ໃສ່ວັນທີທີ່ຂາດ.'],
    ['6 Advances · ເບີກລ່ວງໜ້າ', 'New advances, cash repayments, interest or adjustments. Payroll month blank = worked out from the date (26th – 25th). Monthly deduction sets how much is taken from salary each month (blank = keep current; for a first advance = the whole amount). · ເບີກເງິນ / ຈ່າຍຄືນ.'],
    ['7 Month inputs · ປ້ອນປະຈຳເດືອນ', 'Fills the same columns as the Payroll table. Blank cell = leave as it is. Type 0 to clear a number. Advance deduction here overrides the automatic deduction for this month only. · ຊ່ອງວ່າງ = ບໍ່ປ່ຽນ.'],
    ['Staff', 'Everyone in the tool when this template was made (reference only, not imported). New people from sheet 1 can be used in the other sheets of the same file. · ລາຍຊື່ພະນັກງານ (ອ້າງອີງ).'],
    ['', ''],
    ['Payroll month · ເດືອນເງິນເດືອນ', 'Sheet 7 goes into the month typed in its cell C3. If C3 is blank it goes into the month selected in the Import tab. Leave, shifts, swaps and advances go to whatever month their dates fall in (pay period 26th – 25th).'],
  ];
  wsGuide.addRow(['', '', '']);
  for (const [colB, colC] of guideRows) {
    wsGuide.addRow(['', colB, colC]);
  }

  // Helper to style headers and example row
  const styleHeaderAndExample = (ws: ExcelJS.Worksheet, headers: string[], exampleCells: string[], startRow = 4) => {
    const hRow = ws.getRow(startRow);
    hRow.values = headers;
    hRow.font = { bold: true, color: { argb: 'FF0F172A' } };
    hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };

    const exRow = ws.getRow(startRow + 1);
    exRow.values = exampleCells;
    exRow.font = { italic: true, color: { argb: 'FF64748B' } };
  };

  // 1. 1 New staff · ພະນັກງານໃໝ່ (A:P = 16 columns)
  const wsNewStaff = wb.addWorksheet(TEMPLATE_SHEET_NAMES.NEW_STAFF);
  wsNewStaff.getCell('A1').value = '1 New staff or change details · ພະນັກງານໃໝ່ ຫຼື ປ່ຽນແປງຂໍ້ມູນ (A:P)';
  wsNewStaff.getCell('A1').font = { bold: true, size: 12 };
  styleHeaderAndExample(
    wsNewStaff,
    [
      'Employee ID * · ລະຫັດ',
      'ID check (auto)',
      'Name (Lao) * · ຊື່ລາວ',
      'Name (English) · ຊື່ອັງກິດ',
      'Position · ຕຳແໜ່ງ',
      'Scanner ID · ລະຫັດສະແກນ',
      'Uses scanner · ໃຊ້ເຄື່ອງສະແກນ',
      'Day off · ມື້ພັກ',
      'Start time · ເວລາເຂົ້າ',
      'End time · ເວລາອອກ',
      'Monthly salary · ເງິນເດືອນ',
      'SSO · ປະກັນສັງຄົມ',
      'Bank account · ບັນຊີທະນາຄານ',
      'Start date · ມື້ເລີ່ມ',
      'Notes · ໝາຍເຫດ',
      'Existing staff (auto)',
    ],
    [
      'e.g. EMP-025',
      'New staff',
      'ນາງ ມະນີວັນ ໄຊຍະວົງ',
      'Manivanh Xayavong',
      'Barista · ບາຣິສຕ້າ',
      '125',
      'Yes',
      'Wed',
      '07:00',
      '15:30',
      '4500000',
      'Yes',
      '16012000556677',
      '28/09/2026',
      'e.g. New hire morning shift',
      '',
    ]
  );
  const newStaffEvents = periodEvents.filter((e) => e.category === 'NEW_STAFF');
  newStaffEvents.forEach((ev, idx) => {
    const r = 6 + idx;
    const row = wsNewStaff.getRow(r);
    row.getCell(1).value = ev.employeeId;
    row.getCell(2).value = {
      formula: `IF(A${r}="","",IF(COUNTIF(Staff!A:A,A${r})>0,"Update existing","New staff"))`,
      result: ev.payload.mode === 'update' ? 'Update existing' : 'New staff',
    };
    row.getCell(3).value = ev.payload.nameLao || '';
    row.getCell(4).value = ev.payload.nameEn || '';
    row.getCell(5).value = ev.payload.position || '';
    row.getCell(6).value = ev.payload.scannerId || '';
    row.getCell(7).value = ev.payload.usesScanner || '';
    row.getCell(8).value = ev.payload.dayOff || '';
    row.getCell(9).value = ev.payload.shiftStart || '';
    row.getCell(10).value = ev.payload.shiftEnd || '';
    row.getCell(11).value = ev.payload.monthlySalary ? Number(ev.payload.monthlySalary) : '';
    row.getCell(12).value = ev.payload.sso || '';
    row.getCell(13).value = ev.payload.bankAccount || '';
    row.getCell(14).value = ev.payload.startDate || '';
    row.getCell(15).value = ev.payload.notes || '';
    row.getCell(16).value = {
      formula: `IF(A${r}="","",IFERROR(VLOOKUP(A${r},Staff!A:B,2,FALSE),""))`,
      result: ev.autoNameLao || '',
    };
  });

  // 2. 2 Left · ພະນັກງານອອກ (A:D = 4 columns)
  const wsLeft = wb.addWorksheet(TEMPLATE_SHEET_NAMES.LEFT);
  wsLeft.getCell('A1').value = '2 Left staff · ພະນັກງານອອກ (A:D)';
  wsLeft.getCell('A1').font = { bold: true, size: 12 };
  styleHeaderAndExample(
    wsLeft,
    [
      'Employee ID * · ລະຫັດ',
      'Name (auto) · ຊື່ອັດຕະໂນມັດ',
      'Last working day * · ມື້ເຮັດວຽກສຸດທ້າຍ',
      'Reason / Notes · ເຫດຜົນ',
    ],
    ['e.g. EMP-004', 'ທ້າວ ບຸນມີ ໄຊຍະຈັກ', '15/10/2026', 'e.g. Resigned personal reasons']
  );
  const leftEvents = periodEvents.filter((e) => e.category === 'LEFT');
  leftEvents.forEach((ev, idx) => {
    const r = 6 + idx;
    const row = wsLeft.getRow(r);
    row.getCell(1).value = ev.employeeId;
    row.getCell(2).value = {
      formula: `IF(A${r}="","",IFERROR(VLOOKUP(A${r},Staff!A:B,2,FALSE),"Not found"))`,
      result: ev.autoNameLao,
    };
    row.getCell(3).value = ev.payload.lastWorkingDay || '';
    row.getCell(4).value = ev.payload.reason || '';
  });

  // 3. 3 Leave · ລາພັກ (A:G = 7 columns)
  const wsLeave = wb.addWorksheet(TEMPLATE_SHEET_NAMES.LEAVE);
  wsLeave.getCell('A1').value = '3 Leave · ລາພັກ (A:G)';
  wsLeave.getCell('A1').font = { bold: true, size: 12 };
  styleHeaderAndExample(
    wsLeave,
    [
      'Employee ID * · ລະຫັດ',
      'Name (auto) · ຊື່ອັດຕະໂນມັດ',
      'Leave type * · ປະເພດລາ',
      'From date * · ຈາກວັນທີ',
      'To date * · ຫາວັນທີ',
      'Reason · ເຫດຜົນ',
      'Status · ສະຖານະ',
    ],
    ['e.g. EMP-001', 'ທ້າວ ສົມຊາຍ ພົມມະວົງ', 'Sick leave · ລາປ່ວຍ', '02/10/2026', '03/10/2026', 'e.g. Medical checkup', 'Approved']
  );
  const leaveEvents = periodEvents.filter((e) => e.category === 'LEAVE');
  leaveEvents.forEach((ev, idx) => {
    const r = 6 + idx;
    const row = wsLeave.getRow(r);
    row.getCell(1).value = ev.employeeId;
    row.getCell(2).value = {
      formula: `IF(A${r}="","",IFERROR(VLOOKUP(A${r},Staff!A:B,2,FALSE),"Not found"))`,
      result: ev.autoNameLao,
    };
    row.getCell(3).value = ev.payload.leaveType || '';
    row.getCell(4).value = ev.payload.fromDate || '';
    row.getCell(5).value = ev.payload.toDate || '';
    row.getCell(6).value = ev.payload.reason || '';
    // Section 7 rule: Status blank exports as blank even though UI displays "ອະນຸມັດແລ້ວ"
    row.getCell(7).value = ev.payload.status || '';
  });

  // 4. 4 Extra shift · ກະເສີມ (A:I = 9 columns)
  const wsExtra = wb.addWorksheet(TEMPLATE_SHEET_NAMES.EXTRA_SHIFT);
  wsExtra.getCell('A1').value = '4 Extra shift · ກະເສີມ / ປ່ຽນກະ (A:I)';
  wsExtra.getCell('A1').font = { bold: true, size: 12 };
  styleHeaderAndExample(
    wsExtra,
    [
      'Employee ID * · ລະຫັດ',
      'Name (auto) · ຊື່ອັດຕະໂນມັດ',
      'Date * · ວັນທີ',
      'Type * · ປະເພດ',
      'Start time * · ເວລາເລີ່ມ',
      'End time * · ເວລາສິ້ນສຸດ',
      'Extra shift salary · ເງິນເດືອນກະເສີມ',
      'Position covered · ຕຳແໜ່ງທົດແທນ',
      'Notes · ໝາຍເຫດ',
    ],
    ['e.g. EMP-001', 'ທ້າວ ສົມຊາຍ ພົມມະວົງ', '05/10/2026', 'Double shift', '15:30', '22:00', '', 'Barista · ບາຣິສຕ້າ', 'e.g. Covered evening shift']
  );
  const extraEvents = periodEvents.filter((e) => e.category === 'EXTRA_SHIFT');
  extraEvents.forEach((ev, idx) => {
    const r = 6 + idx;
    const row = wsExtra.getRow(r);
    row.getCell(1).value = ev.employeeId;
    row.getCell(2).value = {
      formula: `IF(A${r}="","",IFERROR(VLOOKUP(A${r},Staff!A:B,2,FALSE),"Not found"))`,
      result: ev.autoNameLao,
    };
    row.getCell(3).value = ev.payload.date || '';
    row.getCell(4).value = ev.payload.shiftType || '';
    row.getCell(5).value = ev.payload.startTime || '';
    row.getCell(6).value = ev.payload.endTime || '';
    row.getCell(7).value = ev.payload.extraShiftSalary ? Number(ev.payload.extraShiftSalary) : '';
    row.getCell(8).value = ev.payload.positionCovered || '';
    row.getCell(9).value = ev.payload.notes || '';
  });

  // 5. 5 Day-off work · ມາເຮັດມື້ພັກ (A:F = 6 columns)
  const wsDayOff = wb.addWorksheet(TEMPLATE_SHEET_NAMES.DAY_OFF_WORK);
  wsDayOff.getCell('A1').value = '5 Day-off work · ມາເຮັດມື້ພັກ (A:F)';
  wsDayOff.getCell('A1').font = { bold: true, size: 12 };
  styleHeaderAndExample(
    wsDayOff,
    [
      'Employee ID * · ລະຫັດ',
      'Name (auto) · ຊື່ອັດຕະໂນມັດ',
      'Day off worked * · ວັນພັກທີ່ມາເຮັດ',
      'Used for * · ໃຊ້ເພື່ອ',
      'Absent date replaced · ວັນຂາດທີ່ແລກ',
      'Notes · ໝາຍເຫດ',
    ],
    ['e.g. EMP-001', 'ທ້າວ ສົມຊາຍ ພົມມະວົງ', '05/10/2026', 'Swap', '08/10/2026', 'e.g. Swapped Monday off']
  );
  const dayOffEvents = periodEvents.filter((e) => e.category === 'DAY_OFF_WORK');
  dayOffEvents.forEach((ev, idx) => {
    const r = 6 + idx;
    const row = wsDayOff.getRow(r);
    row.getCell(1).value = ev.employeeId;
    row.getCell(2).value = {
      formula: `IF(A${r}="","",IFERROR(VLOOKUP(A${r},Staff!A:B,2,FALSE),"Not found"))`,
      result: ev.autoNameLao,
    };
    row.getCell(3).value = ev.payload.dayOffWorked || '';
    row.getCell(4).value = ev.payload.usedFor || '';
    row.getCell(5).value = ev.payload.absentDateReplaced || '';
    row.getCell(6).value = ev.payload.notes || '';
  });

  // 6. 6 Advances · ເບີກລ່ວງໜ້າ (A:H = 8 columns)
  const wsAdvances = wb.addWorksheet(TEMPLATE_SHEET_NAMES.ADVANCES);
  wsAdvances.getCell('A1').value = '6 Advances · ເບີກລ່ວງໜ້າ (A:H)';
  wsAdvances.getCell('A1').font = { bold: true, size: 12 };
  styleHeaderAndExample(
    wsAdvances,
    [
      'Employee ID * · ລະຫັດ',
      'Name (auto) · ຊື່ອັດຕະໂນມັດ',
      'Date * · ວັນທີ',
      'Type * · ປະເພດ',
      'Amount * · ຈຳນວນ',
      'Monthly deduction · ຫັກປະຈຳເດືອນ',
      'Payroll month · ງວດ',
      'Notes · ໝາຍເຫດ',
    ],
    ['e.g. EMP-001', 'ທ້າວ ສົມຊາຍ ພົມມະວົງ', '10/10/2026', 'New advance · ເບີກໃໝ່', '1000000', '500000', '2026-10', 'e.g. Emergency advance']
  );
  const advanceEvents = periodEvents.filter((e) => e.category === 'ADVANCES');
  advanceEvents.forEach((ev, idx) => {
    const r = 6 + idx;
    const row = wsAdvances.getRow(r);
    row.getCell(1).value = ev.employeeId;
    row.getCell(2).value = {
      formula: `IF(A${r}="","",IFERROR(VLOOKUP(A${r},Staff!A:B,2,FALSE),"Not found"))`,
      result: ev.autoNameLao,
    };
    row.getCell(3).value = ev.payload.date || '';
    row.getCell(4).value = ev.payload.advanceType || '';
    row.getCell(5).value = ev.payload.amount ? Number(ev.payload.amount) : '';
    row.getCell(6).value = ev.payload.monthlyDeduction ? Number(ev.payload.monthlyDeduction) : '';
    row.getCell(7).value = ev.payload.payrollMonth || '';
    row.getCell(8).value = ev.payload.notes || '';
  });

  // 7. 7 Month inputs · ປ້ອນປະຈຳເດືອນ (C3 = periodId, A:J = 10 columns)
  const wsMonth = wb.addWorksheet(TEMPLATE_SHEET_NAMES.MONTH_INPUTS);
  wsMonth.getCell('A1').value = '7 Month inputs · ປ້ອນປະຈຳເດືອນ (C3 & A:J)';
  wsMonth.getCell('A1').font = { bold: true, size: 12 };
  wsMonth.getCell('B3').value = 'Payroll month · ງວດເງິນເດືອນ:';
  wsMonth.getCell('C3').value = periodId;
  wsMonth.getCell('C3').font = { bold: true };
  styleHeaderAndExample(
    wsMonth,
    [
      'Employee ID * · ລະຫັດ',
      'Name (auto) · ຊື່ອັດຕະໂນມັດ',
      'Public holiday OT · OT ວັນພັກລັດ',
      'New Year OT/absent · OT/ຂາດປີໃໝ່',
      'Bonus · ເງິນພິເສດ',
      'Shirts · ເສື້ອ',
      'Advance deduction · ຕັດເບີກ',
      'Attendance bonus · ເງິນຂະຫຍັນ',
      'Notes · ໝາຍເຫດ',
      'ID check (auto)',
    ],
    ['e.g. EMP-001', 'ທ້າວ ສົມຊາຍ ພົມມະວົງ', '1', '', '200000', '0', '', '300000', 'e.g. Full attendance', 'OK']
  );
  const monthEvents = periodEvents.filter((e) => e.category === 'MONTH_INPUTS');
  monthEvents.forEach((ev, idx) => {
    const r = 6 + idx;
    const row = wsMonth.getRow(r);
    row.getCell(1).value = ev.employeeId;
    row.getCell(2).value = {
      formula: `IF(A${r}="","",IFERROR(VLOOKUP(A${r},Staff!A:B,2,FALSE),"Not found"))`,
      result: ev.autoNameLao,
    };
    const toCellNum = (v?: string) => (v !== undefined && v !== '' ? Number(v) : '');
    row.getCell(3).value = toCellNum(ev.payload.publicHolidayOt);
    row.getCell(4).value = toCellNum(ev.payload.newYearOt);
    row.getCell(5).value = toCellNum(ev.payload.bonus);
    row.getCell(6).value = toCellNum(ev.payload.uniform);
    row.getCell(7).value = toCellNum(ev.payload.advanceOverride);
    row.getCell(8).value = toCellNum(ev.payload.attendanceBonus);
    row.getCell(9).value = ev.payload.notes || '';
    row.getCell(10).value = {
      formula: `IF(A${r}="","",IF(ISERROR(VLOOKUP(A${r},Staff!A:A,1,FALSE)),"Check ID","OK"))`,
      result: 'OK',
    };
  });

  // 8. Staff (Reference sheet from central Employees)
  const wsStaff = wb.addWorksheet(TEMPLATE_SHEET_NAMES.STAFF);
  wsStaff.getRow(1).values = [
    'Employee ID',
    'Name (Lao)',
    'Name (English)',
    'Position',
    'Scanner ID',
    'Uses Scanner',
    'Day Off',
    'Start Time',
    'End Time',
    'Monthly Salary',
    'SSO',
    'Bank Account',
    'Start Date',
    'Status',
  ];
  wsStaff.getRow(1).font = { bold: true };
  employees.forEach((emp) => {
    wsStaff.addRow([
      emp.employeeId,
      emp.nameLao,
      emp.nameEn,
      emp.position,
      emp.scannerId,
      emp.usesScanner,
      emp.dayOff,
      emp.shiftStart,
      emp.shiftEnd,
      emp.monthlySalary,
      emp.sso,
      emp.bankAccount,
      emp.startDate,
      emp.status,
    ]);
  });

  // 9. Lists (Hidden sheet with dropdown values)
  const wsLists = wb.addWorksheet(TEMPLATE_SHEET_NAMES.LISTS, { state: 'hidden' });
  wsLists.getRow(1).values = [
    'Days',
    'LeaveStatuses',
    'LeaveTypes',
    'ExtraShiftTypes',
    'DayOffWorkTypes',
    'AdvanceTypes',
    'Positions',
  ];
  const maxLen = Math.max(
    referenceLists.daysOfWeek.length,
    referenceLists.leaveStatuses.length,
    referenceLists.leaveTypes.length,
    referenceLists.extraShiftTypes.length,
    referenceLists.dayOffWorkTypes.length,
    referenceLists.advanceTypes.length,
    referenceLists.positions.length
  );
  for (let i = 0; i < maxLen; i++) {
    wsLists.addRow([
      referenceLists.daysOfWeek[i]?.value || '',
      referenceLists.leaveStatuses[i]?.value || '',
      referenceLists.leaveTypes[i]?.value || '',
      referenceLists.extraShiftTypes[i]?.value || '',
      referenceLists.dayOffWorkTypes[i]?.value || '',
      referenceLists.advanceTypes[i]?.value || '',
      referenceLists.positions[i]?.value || '',
    ]);
  }

  // Auto-size columns for readability
  for (const ws of wb.worksheets) {
    if (ws.name === TEMPLATE_SHEET_NAMES.GUIDE) continue;
    ws.columns.forEach((col) => {
      if (!col.width) col.width = 20;
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

/**
 * Parse an uploaded .xlsx file buffer and classify rows into:
 * - readyToImport (ພ້ອມນຳເຂົ້າ)
 * - skippedDuplicates (ຂ້າມເພາະຊ້ຳ)
 * - invalidRows (ຜິດພາດ)
 * Honors Section 8.1 & Acceptance Criterion #5
 */
export async function parseExcelImportBuffer(
  buffer: ArrayBuffer | Uint8Array,
  fileName: string,
  targetPeriodId: string,
  employees: EmployeeRecord[],
  existingEvents: PayrollEventRecord[]
): Promise<ExcelImportPreviewResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as ArrayBuffer);

  const structureNotesLao: string[] = [];
  const readyToImport: ParsedImportRow[] = [];
  const skippedDuplicates: ParsedImportRow[] = [];
  const invalidRows: ParsedImportRow[] = [];

  const existingIdempotencyKeys = new Set(
    existingEvents.filter((e) => e.status !== 'SUPERSEDED').map((e) => e.idempotencyKey)
  );
  const seenInCurrentFile = new Set<string>();
  const batchNewStaffIds = new Map<string, string>();

  const getCellText = (row: ExcelJS.Row, colIdx: number): string => {
    const cell = row.getCell(colIdx);
    const val = cell.value;
    if (val === null || val === undefined) return '';
    if (typeof val === 'object') {
      if ('result' in val && val.result !== undefined) return String(val.result).trim();
      if ('text' in val && typeof (val as { text: string }).text === 'string') return (val as { text: string }).text.trim();
      if (val instanceof Date) {
        const d = String(val.getUTCDate()).padStart(2, '0');
        const m = String(val.getUTCMonth() + 1).padStart(2, '0');
        const y = val.getUTCFullYear();
        return `${d}/${m}/${y}`;
      }
    }
    return String(val).trim();
  };

  const sheetConfigs: Array<{
    sheetName: string;
    category: EventCategoryCode;
    extractPayload: (row: ExcelJS.Row) => { employeeId: string; payload: Record<string, string> };
  }> = [
    {
      sheetName: TEMPLATE_SHEET_NAMES.NEW_STAFF,
      category: 'NEW_STAFF',
      extractPayload: (row) => {
        const employeeId = getCellText(row, 1);
        const existing = employees.some((e) => e.employeeId.toUpperCase() === employeeId.toUpperCase());
        return {
          employeeId,
          payload: {
            mode: existing ? 'update' : 'new',
            nameLao: getCellText(row, 3),
            nameEn: getCellText(row, 4),
            position: getCellText(row, 5),
            scannerId: getCellText(row, 6),
            usesScanner: getCellText(row, 7) || 'Yes',
            dayOff: getCellText(row, 8),
            shiftStart: getCellText(row, 9),
            shiftEnd: getCellText(row, 10),
            monthlySalary: getCellText(row, 11),
            sso: getCellText(row, 12) || 'Yes',
            bankAccount: getCellText(row, 13),
            startDate: getCellText(row, 14),
            notes: getCellText(row, 15),
          },
        };
      },
    },
    {
      sheetName: TEMPLATE_SHEET_NAMES.LEFT,
      category: 'LEFT',
      extractPayload: (row) => ({
        employeeId: getCellText(row, 1),
        payload: {
          lastWorkingDay: getCellText(row, 3),
          reason: getCellText(row, 4),
        },
      }),
    },
    {
      sheetName: TEMPLATE_SHEET_NAMES.LEAVE,
      category: 'LEAVE',
      extractPayload: (row) => ({
        employeeId: getCellText(row, 1),
        payload: {
          leaveType: getCellText(row, 3),
          fromDate: getCellText(row, 4),
          toDate: getCellText(row, 5),
          reason: getCellText(row, 6),
          status: getCellText(row, 7),
        },
      }),
    },
    {
      sheetName: TEMPLATE_SHEET_NAMES.EXTRA_SHIFT,
      category: 'EXTRA_SHIFT',
      extractPayload: (row) => ({
        employeeId: getCellText(row, 1),
        payload: {
          date: getCellText(row, 3),
          shiftType: getCellText(row, 4),
          startTime: getCellText(row, 5),
          endTime: getCellText(row, 6),
          extraShiftSalary: getCellText(row, 7),
          positionCovered: getCellText(row, 8),
          notes: getCellText(row, 9),
        },
      }),
    },
    {
      sheetName: TEMPLATE_SHEET_NAMES.DAY_OFF_WORK,
      category: 'DAY_OFF_WORK',
      extractPayload: (row) => ({
        employeeId: getCellText(row, 1),
        payload: {
          dayOffWorked: getCellText(row, 3),
          usedFor: getCellText(row, 4),
          absentDateReplaced: getCellText(row, 5),
          notes: getCellText(row, 6),
        },
      }),
    },
    {
      sheetName: TEMPLATE_SHEET_NAMES.ADVANCES,
      category: 'ADVANCES',
      extractPayload: (row) => ({
        employeeId: getCellText(row, 1),
        payload: {
          date: getCellText(row, 3),
          advanceType: getCellText(row, 4),
          amount: getCellText(row, 5),
          monthlyDeduction: getCellText(row, 6),
          payrollMonth: getCellText(row, 7),
          notes: getCellText(row, 8),
        },
      }),
    },
    {
      sheetName: TEMPLATE_SHEET_NAMES.MONTH_INPUTS,
      category: 'MONTH_INPUTS',
      extractPayload: (row) => ({
        employeeId: getCellText(row, 1),
        payload: {
          publicHolidayOt: getCellText(row, 3),
          newYearOt: getCellText(row, 4),
          bonus: getCellText(row, 5),
          uniform: getCellText(row, 6),
          advanceOverride: getCellText(row, 7),
          attendanceBonus: getCellText(row, 8),
          notes: getCellText(row, 9),
        },
      }),
    },
  ];

  let foundAnyTemplateSheet = false;

  for (const cfg of sheetConfigs) {
    const ws = wb.getWorksheet(cfg.sheetName);
    if (!ws) {
      structureNotesLao.push(`ບໍ່ພົບແຜ່ນ "${cfg.sheetName}" ໃນໄຟລ໌ທີ່ອັບໂຫຼດ`);
      continue;
    }
    foundAnyTemplateSheet = true;

    const sheetPeriodOverride =
      cfg.category === 'MONTH_INPUTS' ? getCellText(ws.getRow(3), 3) || targetPeriodId : targetPeriodId;

    for (let r = 5; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const rawCells: string[] = [];
      for (let c = 1; c <= 15; c++) {
        rawCells.push(getCellText(row, c));
      }
      if (rawCells.every((c) => !c)) continue;
      // Skip example rows starting with e.g.
      if (isExampleRow(rawCells)) continue;

      const { employeeId, payload } = cfg.extractPayload(row);
      if (!employeeId && Object.values(payload).every((v) => !v)) continue;

      const validation = validateEventPayload(
        cfg.category,
        sheetPeriodOverride,
        employeeId,
        payload,
        employees,
        batchNewStaffIds
      );

      const idempKey = computeEventIdempotencyKey(
        cfg.category,
        validation.resolvedPeriodId,
        employeeId,
        payload
      );

      if (!validation.valid) {
        invalidRows.push({
          rowIndex: r,
          sheetName: cfg.sheetName,
          category: cfg.category,
          employeeId,
          autoNameLao: validation.resolvedAutoNameLao || '-',
          resolvedPeriodId: validation.resolvedPeriodId,
          payload,
          idempotencyKey: idempKey,
          bucket: 'ERROR',
          reasonLao: Object.values(validation.fieldErrors).join(' · '),
        });
        continue;
      }

      if (existingIdempotencyKeys.has(idempKey) || seenInCurrentFile.has(idempKey)) {
        skippedDuplicates.push({
          rowIndex: r,
          sheetName: cfg.sheetName,
          category: cfg.category,
          employeeId,
          autoNameLao: validation.resolvedAutoNameLao,
          resolvedPeriodId: validation.resolvedPeriodId,
          payload,
          idempotencyKey: idempKey,
          bucket: 'DUPLICATE',
          reasonLao: existingIdempotencyKeys.has(idempKey)
            ? 'ມີລາຍການນີ້ບັນທຶກໄວ້ໃນຖານຂໍ້ມູນກາງແລ້ວ (Idempotency Key ກົງກັນ)'
            : 'ຊ້ຳກັນກັບແຖວກ່ອນໜ້າພາຍໃນໄຟລ໌ດຽວກັນ',
        });
        continue;
      }

      seenInCurrentFile.add(idempKey);
      if (cfg.category === 'NEW_STAFF' && payload.nameLao) {
        batchNewStaffIds.set(employeeId.toUpperCase(), payload.nameLao);
      }

      readyToImport.push({
        rowIndex: r,
        sheetName: cfg.sheetName,
        category: cfg.category,
        employeeId: employeeId.toUpperCase(),
        autoNameLao: validation.resolvedAutoNameLao,
        resolvedPeriodId: validation.resolvedPeriodId,
        payload,
        idempotencyKey: idempKey,
        bucket: 'READY',
        reasonLao: 'ກວດຜ່ານ ພ້ອມບັນທຶກເຂົ້າຖານຂໍ້ມູນກາງ',
      });
    }
  }

  return {
    fileName,
    targetPeriodId,
    sheetStructureValid: foundAnyTemplateSheet,
    structureNotesLao,
    readyToImport,
    skippedDuplicates,
    invalidRows,
  };
}
