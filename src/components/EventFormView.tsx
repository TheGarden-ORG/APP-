import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  HelpCircle,
  Lock,
  RotateCcw,
  Save,
  UserCheck,
} from 'lucide-react';
import {
  EmployeeRecord,
  EventCategoryCode,
  PayrollEventRecord,
  PayrollPeriod,
  ReferenceLists,
  calculatePeriodFromDate,
  validateEventPayload,
} from '../utils/payrollRules';
import { EVENT_CATEGORY_META } from '../utils/seedData';
import { DRAFT_FORM_STORAGE_KEY } from '../services/googleWorkspaceService';

export interface EventFormViewProps {
  activePeriod: PayrollPeriod;
  employees: EmployeeRecord[];
  referenceLists: ReferenceLists;
  currentUserEmail: string;
  defaultStoreId: string;
  editingEvent: PayrollEventRecord | null;
  onCancelEdit: () => void;
  onSubmitEvent: (params: {
    category: EventCategoryCode;
    periodId: string;
    employeeId: string;
    payload: Record<string, string>;
    expectedVersion?: number;
    editingEventId?: string;
    revisionNote?: string;
  }) => { ok: boolean; messageLao: string; eventId?: string };
}

export const EventFormView: React.FC<EventFormViewProps> = ({
  activePeriod,
  employees,
  referenceLists,
  currentUserEmail,
  defaultStoreId,
  editingEvent,
  onCancelEdit,
  onSubmitEvent,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<EventCategoryCode>(
    editingEvent ? editingEvent.category : 'NEW_STAFF'
  );
  const [employeeId, setEmployeeId] = useState<string>(editingEvent ? editingEvent.employeeId : '');
  const [payload, setPayload] = useState<Record<string, string>>(() => {
    if (editingEvent) return { ...editingEvent.payload };
    try {
      const savedDraft = sessionStorage.getItem(DRAFT_FORM_STORAGE_KEY);
      if (savedDraft) {
        const parsed = JSON.parse(savedDraft);
        if (parsed && parsed.payload) return parsed.payload;
      }
    } catch {
      // ignore
    }
    return {
      mode: 'new',
      position: 'Barista · ບາຣິສຕ້າ',
      usesScanner: 'Yes',
      sso: 'Yes',
      dayOff: 'Mon',
      shiftStart: '07:00',
      shiftEnd: '15:30',
      startDate: '26/09/2026',
    };
  });

  const [revisionNote, setRevisionNote] = useState<string>('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [showSheetGuide, setShowSheetGuide] = useState<boolean>(false);

  // Sync when editingEvent changes
  useEffect(() => {
    if (editingEvent) {
      setSelectedCategory(editingEvent.category);
      setEmployeeId(editingEvent.employeeId);
      setPayload({ ...editingEvent.payload });
      setFieldErrors({});
      setFeedbackBanner(null);
    }
  }, [editingEvent]);

  // Save unsaved draft to sessionStorage (cleared on save or logout per Section 1.1)
  useEffect(() => {
    if (!editingEvent) {
      try {
        sessionStorage.setItem(
          DRAFT_FORM_STORAGE_KEY,
          JSON.stringify({ category: selectedCategory, employeeId, payload })
        );
      } catch {
        // ignore
      }
    }
  }, [selectedCategory, employeeId, payload, editingEvent]);

  const matchedEmployee = useMemo(
    () => employees.find((e) => e.employeeId.toUpperCase() === employeeId.trim().toUpperCase()),
    [employees, employeeId]
  );

  const liveValidation = useMemo(
    () =>
      validateEventPayload(
        selectedCategory,
        activePeriod.periodId,
        employeeId,
        payload,
        employees
      ),
    [selectedCategory, activePeriod.periodId, employeeId, payload, employees]
  );

  const activeCategoryMeta = useMemo(
    () => EVENT_CATEGORY_META.find((m) => m.code === selectedCategory)!,
    [selectedCategory]
  );

  const handleCategorySwitch = (cat: EventCategoryCode) => {
    if (editingEvent) onCancelEdit();
    setSelectedCategory(cat);
    setFieldErrors({});
    setFeedbackBanner(null);

    if (cat === 'NEW_STAFF') {
      setPayload({
        mode: matchedEmployee ? 'update' : 'new',
        nameLao: matchedEmployee?.nameLao || '',
        nameEn: matchedEmployee?.nameEn || '',
        position: referenceLists.positions.find((p) => p.active)?.value || 'Barista · ບາຣິສຕ້າ',
        scannerId: '',
        usesScanner: 'Yes',
        dayOff: 'Mon',
        shiftStart: '07:00',
        shiftEnd: '15:30',
        monthlySalary: '',
        sso: 'Yes',
        bankAccount: '',
        startDate: activePeriod.startDate,
        notes: '',
      });
    } else if (cat === 'LEFT') {
      setPayload({ lastWorkingDay: activePeriod.endDate, reason: '' });
    } else if (cat === 'LEAVE') {
      setPayload({
        leaveType: referenceLists.leaveTypes.find((l) => l.active)?.value || 'Sick leave · ລາປ່ວຍ',
        fromDate: activePeriod.startDate,
        toDate: activePeriod.startDate,
        reason: '',
        status: '',
      });
    } else if (cat === 'EXTRA_SHIFT') {
      setPayload({
        date: activePeriod.startDate,
        shiftType: 'Double shift',
        startTime: '15:30',
        endTime: '22:00',
        extraShiftSalary: '',
        positionCovered: 'Barista · ບາຣິສຕ້າ',
        notes: '',
      });
    } else if (cat === 'DAY_OFF_WORK') {
      setPayload({
        dayOffWorked: activePeriod.startDate,
        usedFor: 'Swap',
        absentDateReplaced: '',
        notes: '',
      });
    } else if (cat === 'ADVANCES') {
      setPayload({
        date: activePeriod.startDate,
        advanceType: 'New advance · ເບີກໃໝ່',
        amount: '',
        monthlyDeduction: '',
        payrollMonth: '',
        notes: '',
      });
    } else if (cat === 'MONTH_INPUTS') {
      setPayload({
        publicHolidayOt: '',
        newYearOt: '',
        bonus: '',
        uniform: '',
        advanceOverride: '',
        attendanceBonus: '',
        notes: '',
      });
    }
  };

  const updateField = (key: string, val: string) => {
    setPayload((prev) => ({ ...prev, [key]: val }));
    if (fieldErrors[key]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedbackBanner(null);

    if (activePeriod.status === 'CLOSED') {
      setFeedbackBanner({
        type: 'error',
        message: `ງວດ ${activePeriod.periodId} ຖືກປິດແລ້ວ (ອ່ານຢ່າງດຽວ) — ບໍ່ສາມາດເພີ່ມ ຫຼື ແກ້ໄຂເຫດການໄດ້`,
      });
      return;
    }

    const check = validateEventPayload(
      selectedCategory,
      activePeriod.periodId,
      employeeId,
      payload,
      employees
    );

    if (!check.valid) {
      setFieldErrors(check.fieldErrors);
      setFeedbackBanner({
        type: 'error',
        message: 'ກະລຸນາກວດສອບຟິວທີ່ແจ້ງເຕືອນສີແດງດ້ານລຸ່ມ ກ່ອນກົດບັນທຶກ',
      });
      return;
    }

    const res = onSubmitEvent({
      category: selectedCategory,
      periodId: check.resolvedPeriodId,
      employeeId: employeeId.trim().toUpperCase(),
      payload,
      expectedVersion: editingEvent?.version,
      editingEventId: editingEvent?.eventId,
      revisionNote: revisionNote.trim() || undefined,
    });

    if (res.ok) {
      setFieldErrors({});
      setFeedbackBanner({
        type: 'success',
        message: res.messageLao,
      });
      try {
        sessionStorage.removeItem(DRAFT_FORM_STORAGE_KEY);
      } catch {
        // ignore
      }
      if (!editingEvent && selectedCategory === 'NEW_STAFF') {
        // Keep the new employeeId in state so user can immediately click Leave/Extra shift for that same ID (Acceptance Criterion #1)
      }
    } else {
      setFeedbackBanner({
        type: 'error',
        message: res.messageLao,
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* 7 Category Selector Buttons (Section 9: "ປຸ່ມໃຫຍ່ 7 ປະເພດ") */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              ເລືອກປະເພດເຫດການເງິນເດືອນ (7 ແຜ່ນມາດຕະຖານຕາມແມ່ແບບ Excel)
            </h2>
            <p className="text-xs text-slate-500">
              1 ແຖວ = 1 ລາຍການ · ກວດສອບອັດຕະໂນມັດກ່ອນບັນທຶກລົງ Google Sheets ຖານຂໍ້ມູນກາງ
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowSheetGuide((v) => !v)}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
          >
            <HelpCircle className="h-4 w-4 text-emerald-600" />
            <span>{showSheetGuide ? 'ເຊື່ອງຄຳແນະນຳແຜ່ນນີ້' : 'ເບິ່ງກົດແມ່ແບບຂອງແຜ່ນນີ້'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-7">
          {EVENT_CATEGORY_META.map((cat) => {
            const isSelected = selectedCategory === cat.code;
            return (
              <button
                key={cat.code}
                type="button"
                onClick={() => handleCategorySwitch(cat.code)}
                className={`flex min-h-[56px] flex-col justify-between rounded-lg border p-3 text-left transition-colors ${
                  isSelected
                    ? 'border-emerald-600 bg-emerald-50/70 text-emerald-950'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between gap-1 text-xs font-mono text-slate-500">
                  <span>ແຜ່ນທີ {cat.sheetNumber}</span>
                  <span>{cat.columnsRange}</span>
                </div>
                <div className="mt-1 text-xs font-bold leading-snug">{cat.shortLao}</div>
              </button>
            );
          })}
        </div>

        {showSheetGuide && (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
            <div className="font-semibold text-slate-900">
              {activeCategoryMeta.sheetTitle} (ຄໍລຳ {activeCategoryMeta.columnsRange})
            </div>
            <p className="mt-1">{activeCategoryMeta.descriptionLao}</p>
          </div>
        )}
      </div>

      {/* Main Event Form */}
      <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">{activeCategoryMeta.titleLao}</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              <span>ແຜ່ນຕົ້ນສະບັບ: {activeCategoryMeta.sheetTitle}</span>
              <span aria-hidden="true"> · </span>
              <span>ງວດປັດຈຸບັນ: {activePeriod.periodId} ({activePeriod.startDate} – {activePeriod.endDate})</span>
              <span aria-hidden="true"> · </span>
              <span>ສາຂາ: {defaultStoreId}</span>
            </p>
          </div>

          {/* Real-time soft-lock & version indicator per Section 10 */}
          <div className="flex items-center gap-3 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5 font-mono">
              <Lock className="h-3.5 w-3.5 text-emerald-600" />
              <span>
                ກຳລັງແກ້ໄຂໂດຍ: {currentUserEmail} (Lock ອ່ອນ 2 ນາທີ · Version{' '}
                {editingEvent ? editingEvent.version : 1})
              </span>
            </span>
          </div>
        </div>

        {feedbackBanner && (
          <div
            role="status"
            className={`flex items-start gap-3 rounded-lg border p-3.5 text-sm ${
              feedbackBanner.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-red-200 bg-red-50 text-red-900'
            }`}
          >
            {feedbackBanner.type === 'success' ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            )}
            <div className="font-medium">{feedbackBanner.message}</div>
          </div>
        )}

        {/* Employee Lookup & Auto-Name / Auto-Check Row (Common to all 7 event sheets) */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label htmlFor="ev-employee-id" className="block text-xs font-semibold text-slate-700">
              ລະຫັດພະນັກງານ (Employee ID *)
            </label>
            <div className="mt-1 flex gap-2">
              <input
                id="ev-employee-id"
                type="text"
                list="staff-id-datalist"
                value={employeeId}
                onChange={(e) => {
                  const val = e.target.value;
                  setEmployeeId(val);
                  if (fieldErrors.employeeId) {
                    setFieldErrors((prev) => {
                      const next = { ...prev };
                      delete next.employeeId;
                      return next;
                    });
                  }
                }}
                placeholder="ເຊັ່ນ EMP-001 ຫຼື EMP-019"
                className={`w-full rounded-lg border px-3 py-2 text-sm font-mono uppercase text-slate-900 focus:outline-none ${
                  fieldErrors.employeeId
                    ? 'border-red-500 bg-red-50/30'
                    : 'border-slate-300 focus:border-emerald-600'
                }`}
              />
              <datalist id="staff-id-datalist">
                {employees.map((emp) => (
                  <option key={emp.employeeId} value={emp.employeeId}>
                    {emp.nameLao} ({emp.position})
                  </option>
                ))}
              </datalist>
            </div>
            {fieldErrors.employeeId && (
              <p className="mt-1 text-xs font-medium text-red-600">{fieldErrors.employeeId}</p>
            )}
          </div>

          {/* Green "Name (auto)" & "ID check (auto)" read-only display matching Excel template */}
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
            <div className="flex items-center justify-between text-xs font-semibold text-emerald-900">
              <span>Name (auto) · ຊື່ອັດຕະໂນມັດຈາກຖານກາງ</span>
              <UserCheck className="h-4 w-4 text-emerald-700" />
            </div>
            <div className="mt-1 text-sm font-bold text-emerald-950" data-testid="auto-name-display">
              {matchedEmployee
                ? matchedEmployee.nameLao
                : selectedCategory === 'NEW_STAFF' && payload.nameLao
                ? `${payload.nameLao} (ພະນັກງານໃໝ່)`
                : employeeId.trim()
                ? 'ບໍ່ພົບໃນ Staff (ກະລຸນາເພີ່ມໃນແຜ່ນທີ 1 ກ່ອນ)'
                : 'ເລືອກ ຫຼື ພິມລະຫັດພະນັກງານ...'}
            </div>
            <div className="mt-0.5 text-[11px] text-emerald-800">
              ຫ້າມພິມທັບຊື່ auto · ລະບົບດຶງຈາກ Employee ID ໂດຍກົງ
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
              <span>ID check (auto) & ງວດທີ່ຄຳນວນ (26–25)</span>
              <Clock className="h-4 w-4 text-slate-500" />
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-900 font-mono">
              ງວດ: {liveValidation.resolvedPeriodId}
            </div>
            <div className="mt-0.5 text-xs text-slate-600">
              ສະຖານະ ID: {liveValidation.idCheckLabel || '-'}
              {matchedEmployee?.checkedInPayroll ? ' · ⚠ ຕິກກວດແລ້ວ (Checked)' : ''}
            </div>
          </div>
        </div>

        {/* ==================== 1. NEW_STAFF FORM ==================== */}
        {selectedCategory === 'NEW_STAFF' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <span className="text-xs font-semibold text-slate-700">ຮູບແບບການບັນທຶກ (ແຜ່ນທີ 1):</span>
              <button
                type="button"
                onClick={() => updateField('mode', 'new')}
                className={`min-h-[38px] rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  payload.mode !== 'update'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white text-slate-700 border border-slate-300'
                }`}
              >
                ເພີ່ມພະນັກງານໃໝ່ (ໃຊ້ ID ຈາກເຄື່ອງສະແກນ)
              </button>
              <button
                type="button"
                onClick={() => {
                  updateField('mode', 'update');
                  if (matchedEmployee && !payload.nameLao) {
                    updateField('nameLao', matchedEmployee.nameLao);
                  }
                }}
                className={`min-h-[38px] rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  payload.mode === 'update'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white text-slate-700 border border-slate-300'
                }`}
              >
                ປັບປຸງຂໍ້ມູນພະນັກງານເດີມ (ສົ່ງສະເພາະຟິວທີ່ປ່ຽນ)
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label htmlFor="ns-name-lao" className="block text-xs font-semibold text-slate-700">
                  ຊື່ພາສາລາວ (Name Lao *)
                </label>
                <input
                  id="ns-name-lao"
                  type="text"
                  value={payload.nameLao || ''}
                  onChange={(e) => updateField('nameLao', e.target.value)}
                  placeholder="ເຊັ່ນ ນາງ ມະນີວັນ ໄຊຍະວົງ"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
                {fieldErrors.nameLao && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.nameLao}</p>
                )}
              </div>

              <div>
                <label htmlFor="ns-name-en" className="block text-xs font-semibold text-slate-700">
                  ຊື່ພາສາອັງກິດ (Name English)
                </label>
                <input
                  id="ns-name-en"
                  type="text"
                  value={payload.nameEn || ''}
                  onChange={(e) => updateField('nameEn', e.target.value)}
                  placeholder="e.g. Manivanh Xayavong"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="ns-position" className="block text-xs font-semibold text-slate-700">
                  ຕຳແໜ່ງ (Position *)
                </label>
                <select
                  id="ns-position"
                  value={payload.position || ''}
                  onChange={(e) => updateField('position', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                >
                  <option value="">-- ເລືອກຕຳແໜ່ງ --</option>
                  {referenceLists.positions
                    .filter((p) => p.active)
                    .map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.labelLao}
                      </option>
                    ))}
                </select>
                {fieldErrors.position && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.position}</p>
                )}
              </div>

              <div>
                <label htmlFor="ns-scanner-id" className="block text-xs font-semibold text-slate-700">
                  ລະຫັດເຄື່ອງສະແກນນິ້ວມື (Scanner ID)
                </label>
                <input
                  id="ns-scanner-id"
                  type="text"
                  value={payload.scannerId || ''}
                  onChange={(e) => updateField('scannerId', e.target.value)}
                  placeholder="ເຊັ່ນ 119"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="ns-uses-scanner" className="block text-xs font-semibold text-slate-700">
                  ໃຊ້ເຄື່ອງສະແກນ (Uses Scanner)
                </label>
                <select
                  id="ns-uses-scanner"
                  value={payload.usesScanner || 'Yes'}
                  onChange={(e) => updateField('usesScanner', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="Yes">Yes · ໃຊ້ເຄື່ອງສະແກນ</option>
                  <option value="No">No · ບໍ່ໃຊ້ເຄື່ອງສະແກນ</option>
                </select>
              </div>

              <div>
                <label htmlFor="ns-day-off" className="block text-xs font-semibold text-slate-700">
                  ມື້ພັກປະຈຳອາທິດ (Day off)
                </label>
                <select
                  id="ns-day-off"
                  value={payload.dayOff || 'Mon'}
                  onChange={(e) => updateField('dayOff', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  {referenceLists.daysOfWeek
                    .filter((d) => d.active)
                    .map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.labelLao}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label htmlFor="ns-shift-start" className="block text-xs font-semibold text-slate-700">
                  ເວລາເຂົ້າວຽກ (HH:MM 24h)
                </label>
                <input
                  id="ns-shift-start"
                  type="text"
                  value={payload.shiftStart || ''}
                  onChange={(e) => updateField('shiftStart', e.target.value)}
                  placeholder="07:00"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900"
                />
                {fieldErrors.shiftStart && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.shiftStart}</p>
                )}
              </div>

              <div>
                <label htmlFor="ns-shift-end" className="block text-xs font-semibold text-slate-700">
                  ເວລາອອກວຽກ (HH:MM 24h)
                </label>
                <input
                  id="ns-shift-end"
                  type="text"
                  value={payload.shiftEnd || ''}
                  onChange={(e) => updateField('shiftEnd', e.target.value)}
                  placeholder="15:30"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900"
                />
                {fieldErrors.shiftEnd && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.shiftEnd}</p>
                )}
              </div>

              <div>
                <label htmlFor="ns-salary" className="block text-xs font-semibold text-slate-700">
                  ເງິນເດືອນພື້ນຖານ (ກີບ - ບໍ່ໃສ່ຈຸດ ,) *
                </label>
                <input
                  id="ns-salary"
                  type="text"
                  value={payload.monthlySalary || ''}
                  onChange={(e) => updateField('monthlySalary', e.target.value)}
                  placeholder="ເຊັ່ນ 4500000"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900"
                />
                {fieldErrors.monthlySalary && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.monthlySalary}</p>
                )}
              </div>

              <div>
                <label htmlFor="ns-sso" className="block text-xs font-semibold text-slate-700">
                  ປະກັນສັງຄົມ (SSO)
                </label>
                <select
                  id="ns-sso"
                  value={payload.sso || 'Yes'}
                  onChange={(e) => updateField('sso', e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="Yes">Yes · หັກປະກັນສັງຄົມ</option>
                  <option value="No">No · ບໍ່ຫັກປະກັນສັງຄົມ</option>
                </select>
              </div>

              <div>
                <label htmlFor="ns-bank" className="block text-xs font-semibold text-slate-700">
                  ເລກບັນຊີທະນາຄານ (Bank Account)
                </label>
                <input
                  id="ns-bank"
                  type="text"
                  value={payload.bankAccount || ''}
                  onChange={(e) => updateField('bankAccount', e.target.value)}
                  placeholder="16012000XXXXXX"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900"
                />
              </div>

              <div>
                <label htmlFor="ns-start-date" className="block text-xs font-semibold text-slate-700">
                  ມື້ເລີ່ມວຽກ (dd/mm/yyyy *)
                </label>
                <input
                  id="ns-start-date"
                  type="text"
                  value={payload.startDate || ''}
                  onChange={(e) => updateField('startDate', e.target.value)}
                  placeholder="26/09/2026"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900"
                />
                {fieldErrors.startDate && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.startDate}</p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="ns-notes" className="block text-xs font-semibold text-slate-700">
                ໝາຍເຫດ (Notes)
              </label>
              <input
                id="ns-notes"
                type="text"
                value={payload.notes || ''}
                onChange={(e) => updateField('notes', e.target.value)}
                placeholder="ໝາຍເຫດເພີ່ມເຕີມ..."
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </div>
          </div>
        )}

        {/* ==================== 2. LEFT FORM ==================== */}
        {selectedCategory === 'LEFT' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="left-last-day" className="block text-xs font-semibold text-slate-700">
                ມື້ເຮັດວຽກສຸດທ້າຍ (Last working day * dd/mm/yyyy)
              </label>
              <input
                id="left-last-day"
                type="text"
                value={payload.lastWorkingDay || ''}
                onChange={(e) => updateField('lastWorkingDay', e.target.value)}
                placeholder="18/10/2026"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900"
              />
              {fieldErrors.lastWorkingDay && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.lastWorkingDay}</p>
              )}
              <p className="mt-1 text-xs text-slate-500">
                ຍັງຄິດເງິນເດືອນໃນງວດປັດຈຸບັນຕາມປົກກະຕິ ແລະ ຈະບໍ່ຖືກດຶງໄປງວດถັດໄປ
              </p>
            </div>

            <div>
              <label htmlFor="left-reason" className="block text-xs font-semibold text-slate-700">
                ເຫດຜົນການອອກວຽກ (Reason / Notes *)
              </label>
              <input
                id="left-reason"
                type="text"
                value={payload.reason || ''}
                onChange={(e) => updateField('reason', e.target.value)}
                placeholder="ລະບຸເຫດຜົນການລາອອກ..."
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
              {fieldErrors.reason && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.reason}</p>
              )}
            </div>
          </div>
        )}

        {/* ==================== 3. LEAVE FORM ==================== */}
        {selectedCategory === 'LEAVE' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="leave-type" className="block text-xs font-semibold text-slate-700">
                ປະເພດການລາພັກ (Leave type *)
              </label>
              <select
                id="leave-type"
                value={payload.leaveType || ''}
                onChange={(e) => updateField('leaveType', e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                <option value="">-- ເລືອກປະເພດລາ --</option>
                {referenceLists.leaveTypes
                  .filter((l) => l.active)
                  .map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.labelLao}
                    </option>
                  ))}
              </select>
              {fieldErrors.leaveType && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.leaveType}</p>
              )}
            </div>

            <div>
              <label htmlFor="leave-from" className="block text-xs font-semibold text-slate-700">
                ຈາກວັນທີ (From date * dd/mm/yyyy)
              </label>
              <input
                id="leave-from"
                type="text"
                value={payload.fromDate || ''}
                onChange={(e) => updateField('fromDate', e.target.value)}
                placeholder="02/10/2026"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900"
              />
              {fieldErrors.fromDate && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.fromDate}</p>
              )}
            </div>

            <div>
              <label htmlFor="leave-to" className="block text-xs font-semibold text-slate-700">
                ຫາວັນທີ (To date * dd/mm/yyyy)
              </label>
              <input
                id="leave-to"
                type="text"
                value={payload.toDate || ''}
                onChange={(e) => updateField('toDate', e.target.value)}
                placeholder="03/10/2026"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900"
              />
              {fieldErrors.toDate && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.toDate}</p>
              )}
            </div>

            <div>
              <label htmlFor="leave-status" className="block text-xs font-semibold text-slate-700">
                ສະຖານະ (ວ່າງ = ອະນຸມັດແລ້ວ)
              </label>
              <select
                id="leave-status"
                value={payload.status || ''}
                onChange={(e) => updateField('status', e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                <option value="">(ວ່າງ) ຕີຄວາມເປັນ: ອະນຸມັດແລ້ວ (Approved)</option>
                {referenceLists.leaveStatuses
                  .filter((s) => s.active)
                  .map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.labelLao}
                    </option>
                  ))}
              </select>
            </div>

            <div className="sm:col-span-2 lg:col-span-4">
              <label htmlFor="leave-reason" className="block text-xs font-semibold text-slate-700">
                ເຫດຜົນການລາພັກ (Reason)
              </label>
              <input
                id="leave-reason"
                type="text"
                value={payload.reason || ''}
                onChange={(e) => updateField('reason', e.target.value)}
                placeholder="ເຊັ່ນ ໄປກວດສຸຂະພາບ..."
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </div>
          </div>
        )}

        {/* ==================== 4. EXTRA_SHIFT FORM ==================== */}
        {selectedCategory === 'EXTRA_SHIFT' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label htmlFor="ex-date" className="block text-xs font-semibold text-slate-700">
                ວັນທີເຮັດກະເສີມ/ປ່ຽນກະ (Date * dd/mm/yyyy)
              </label>
              <input
                id="ex-date"
                type="text"
                value={payload.date || ''}
                onChange={(e) => updateField('date', e.target.value)}
                placeholder="08/10/2026"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900"
              />
              {fieldErrors.date && <p className="mt-1 text-xs text-red-600">{fieldErrors.date}</p>}
            </div>

            <div>
              <label htmlFor="ex-type" className="block text-xs font-semibold text-slate-700">
                ປະເພດ (Type *)
              </label>
              <select
                id="ex-type"
                value={payload.shiftType || 'Double shift'}
                onChange={(e) => updateField('shiftType', e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                {referenceLists.extraShiftTypes
                  .filter((t) => t.active)
                  .map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.labelLao}
                    </option>
                  ))}
              </select>
              {fieldErrors.shiftType && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.shiftType}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="ex-start" className="block text-xs font-semibold text-slate-700">
                  ເວລາເລີ່ມ (HH:MM *)
                </label>
                <input
                  id="ex-start"
                  type="text"
                  value={payload.startTime || ''}
                  onChange={(e) => updateField('startTime', e.target.value)}
                  placeholder="15:30"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900"
                />
                {fieldErrors.startTime && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.startTime}</p>
                )}
              </div>
              <div>
                <label htmlFor="ex-end" className="block text-xs font-semibold text-slate-700">
                  ເວລາສິ້ນສຸດ (HH:MM *)
                </label>
                <input
                  id="ex-end"
                  type="text"
                  value={payload.endTime || ''}
                  onChange={(e) => updateField('endTime', e.target.value)}
                  placeholder="22:00"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900"
                />
                {fieldErrors.endTime && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.endTime}</p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="ex-salary" className="block text-xs font-semibold text-slate-700">
                ເງິນເດືອນກະເສີມ (ຖ້າມີ - ບໍ່ໃສ່ຈຸດ)
              </label>
              <input
                id="ex-salary"
                type="text"
                value={payload.extraShiftSalary || ''}
                onChange={(e) => updateField('extraShiftSalary', e.target.value)}
                placeholder="ເຊັ່ນ 4500000"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900"
              />
              {fieldErrors.extraShiftSalary && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.extraShiftSalary}</p>
              )}
            </div>

            <div>
              <label htmlFor="ex-pos" className="block text-xs font-semibold text-slate-700">
                ຕຳແໜ່ງທົດແທນ (Position covered)
              </label>
              <select
                id="ex-pos"
                value={payload.positionCovered || ''}
                onChange={(e) => updateField('positionCovered', e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                <option value="">-- ເລືອກຕຳແໜ່ງທົດແທນ --</option>
                {referenceLists.positions
                  .filter((p) => p.active)
                  .map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.labelLao}
                    </option>
                  ))}
              </select>
              {fieldErrors.positionCovered && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.positionCovered}</p>
              )}
            </div>

            <div>
              <label htmlFor="ex-notes" className="block text-xs font-semibold text-slate-700">
                ໝາຍເຫດ (Notes)
              </label>
              <input
                id="ex-notes"
                type="text"
                value={payload.notes || ''}
                onChange={(e) => updateField('notes', e.target.value)}
                placeholder="ໝາຍເຫດ..."
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </div>
          </div>
        )}

        {/* ==================== 5. DAY_OFF_WORK FORM ==================== */}
        {selectedCategory === 'DAY_OFF_WORK' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="dow-date" className="block text-xs font-semibold text-slate-700">
                ວັນພັກທີ່ມາເຮັດວຽກ (Day off worked * dd/mm/yyyy)
              </label>
              <input
                id="dow-date"
                type="text"
                value={payload.dayOffWorked || ''}
                onChange={(e) => updateField('dayOffWorked', e.target.value)}
                placeholder="07/10/2026"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900"
              />
              {fieldErrors.dayOffWorked && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.dayOffWorked}</p>
              )}
            </div>

            <div>
              <label htmlFor="dow-used-for" className="block text-xs font-semibold text-slate-700">
                ໃຊ້ເພື່ອ (Used for *: Swap ຫຼື OT x1.5)
              </label>
              <select
                id="dow-used-for"
                value={payload.usedFor || 'Swap'}
                onChange={(e) => updateField('usedFor', e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                {referenceLists.dayOffWorkTypes
                  .filter((d) => d.active)
                  .map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.labelLao}
                    </option>
                  ))}
              </select>
              {fieldErrors.usedFor && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.usedFor}</p>
              )}
            </div>

            <div>
              <label htmlFor="dow-absent-date" className="block text-xs font-semibold text-slate-700">
                ວັນຂາດທີ່ແລກ (Absent date replaced {payload.usedFor === 'Swap' ? '*' : '(ບໍ່ບັງຄັບ)'})
              </label>
              <input
                id="dow-absent-date"
                type="text"
                value={payload.absentDateReplaced || ''}
                onChange={(e) => updateField('absentDateReplaced', e.target.value)}
                placeholder="12/10/2026"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900"
              />
              {fieldErrors.absentDateReplaced && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.absentDateReplaced}</p>
              )}
            </div>

            <div>
              <label htmlFor="dow-notes" className="block text-xs font-semibold text-slate-700">
                ໝາຍເຫດ (Notes)
              </label>
              <input
                id="dow-notes"
                type="text"
                value={payload.notes || ''}
                onChange={(e) => updateField('notes', e.target.value)}
                placeholder="ໝາຍເຫດ..."
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </div>
          </div>
        )}

        {/* ==================== 6. ADVANCES FORM ==================== */}
        {selectedCategory === 'ADVANCES' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label htmlFor="adv-date" className="block text-xs font-semibold text-slate-700">
                ວັນທີ (Date * dd/mm/yyyy)
              </label>
              <input
                id="adv-date"
                type="text"
                value={payload.date || ''}
                onChange={(e) => updateField('date', e.target.value)}
                placeholder="14/10/2026"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900"
              />
              {fieldErrors.date && <p className="mt-1 text-xs text-red-600">{fieldErrors.date}</p>}
            </div>

            <div>
              <label htmlFor="adv-type" className="block text-xs font-semibold text-slate-700">
                ປະເພດລາຍການ (Type *)
              </label>
              <select
                id="adv-type"
                value={payload.advanceType || ''}
                onChange={(e) => updateField('advanceType', e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                {referenceLists.advanceTypes
                  .filter((a) => a.active)
                  .map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.labelLao}
                    </option>
                  ))}
              </select>
              {fieldErrors.advanceType && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.advanceType}</p>
              )}
            </div>

            <div>
              <label htmlFor="adv-amount" className="block text-xs font-semibold text-slate-700">
                ຈຳນວນເງິນ (Amount * ບໍ່ໃສ່ຈຸດ ,)
              </label>
              <input
                id="adv-amount"
                type="text"
                value={payload.amount || ''}
                onChange={(e) => updateField('amount', e.target.value)}
                placeholder="1200000"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900"
              />
              {fieldErrors.amount && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.amount}</p>
              )}
            </div>

            <div>
              <label htmlFor="adv-deduction" className="block text-xs font-semibold text-slate-700">
                ຫັກປະຈຳເດືອນ (Monthly deduction - ວ່າງ = ຄ່າເດີມ/ທັງໝົດ)
              </label>
              <input
                id="adv-deduction"
                type="text"
                value={payload.monthlyDeduction || ''}
                onChange={(e) => updateField('monthlyDeduction', e.target.value)}
                placeholder="600000"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900"
              />
              {fieldErrors.monthlyDeduction && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.monthlyDeduction}</p>
              )}
            </div>

            <div>
              <label htmlFor="adv-month" className="block text-xs font-semibold text-slate-700">
                ງວດເງິນເດືອນ (ວ່າງ = ຄຳນວນຈາກວັນທີດ້ວຍກົດ 26–25)
              </label>
              <input
                id="adv-month"
                type="text"
                value={payload.payrollMonth || ''}
                onChange={(e) => updateField('payrollMonth', e.target.value)}
                placeholder={
                  calculatePeriodFromDate(payload.date || '') || activePeriod.periodId
                }
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900"
              />
              {fieldErrors.payrollMonth && (
                <p className="mt-1 text-xs text-red-600">{fieldErrors.payrollMonth}</p>
              )}
            </div>

            <div>
              <label htmlFor="adv-notes" className="block text-xs font-semibold text-slate-700">
                ໝາຍເຫດ (Notes)
              </label>
              <input
                id="adv-notes"
                type="text"
                value={payload.notes || ''}
                onChange={(e) => updateField('notes', e.target.value)}
                placeholder="ໝາຍເຫດ..."
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </div>
          </div>
        )}

        {/* ==================== 7. MONTH_INPUTS FORM ==================== */}
        {selectedCategory === 'MONTH_INPUTS' && (
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              <strong>ກົດແຜ່ນທີ 7 (C3 = {activePeriod.periodId}):</strong> ຊ່ອງວ່າງ = ບໍ່ປ່ຽນແປງຄ່າເດີມ ·
              ພິມ <code className="font-mono font-bold">0</code> ເພື່ອລ້າງຄ່າຕົວເລກ · ຫ້າມໃສ່ເຄື່ອງໝາຍຈຸດ (,)
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label htmlFor="mi-pub-ot" className="block text-xs font-semibold text-slate-700">
                  OT ວັນພັກລັດ (Public holiday OT days)
                </label>
                <input
                  id="mi-pub-ot"
                  type="text"
                  value={payload.publicHolidayOt || ''}
                  onChange={(e) => updateField('publicHolidayOt', e.target.value)}
                  placeholder="ເຊັ່ນ 1 ຫຼື 0"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900"
                />
                {fieldErrors.publicHolidayOt && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.publicHolidayOt}</p>
                )}
              </div>

              <div>
                <label htmlFor="mi-ny-ot" className="block text-xs font-semibold text-slate-700">
                  OT / ຂາດປີໃໝ່ (New Year OT / absent)
                </label>
                <input
                  id="mi-ny-ot"
                  type="text"
                  value={payload.newYearOt || ''}
                  onChange={(e) => updateField('newYearOt', e.target.value)}
                  placeholder="ເຊັ່ນ 2 ຫຼື -1"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900"
                />
                {fieldErrors.newYearOt && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.newYearOt}</p>
                )}
              </div>

              <div>
                <label htmlFor="mi-bonus" className="block text-xs font-semibold text-slate-700">
                  ເງິນພິເສດ / ໂບນັດ (Bonus ກີບ)
                </label>
                <input
                  id="mi-bonus"
                  type="text"
                  value={payload.bonus || ''}
                  onChange={(e) => updateField('bonus', e.target.value)}
                  placeholder="ເຊັ່ນ 350000"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900"
                />
                {fieldErrors.bonus && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.bonus}</p>
                )}
              </div>

              <div>
                <label htmlFor="mi-uniform" className="block text-xs font-semibold text-slate-700">
                  ເສື້ອພະນັກງານ (Shirts / Uniform)
                </label>
                <input
                  id="mi-uniform"
                  type="text"
                  value={payload.uniform || ''}
                  onChange={(e) => updateField('uniform', e.target.value)}
                  placeholder="ເຊັ່ນ 0 ຫຼື 150000"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900"
                />
                {fieldErrors.uniform && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.uniform}</p>
                )}
              </div>

              <div>
                <label htmlFor="mi-adv-override" className="block text-xs font-semibold text-slate-700">
                  ຕັດເບີກສະເພາະເດືອນນີ້ (Advance deduction override)
                </label>
                <input
                  id="mi-adv-override"
                  type="text"
                  value={payload.advanceOverride || ''}
                  onChange={(e) => updateField('advanceOverride', e.target.value)}
                  placeholder="ປ່ອຍວ່າງ = ຕັດຕາມປົກກະຕິ"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900"
                />
                {fieldErrors.advanceOverride && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.advanceOverride}</p>
                )}
              </div>

              <div>
                <label htmlFor="mi-att-bonus" className="block text-xs font-semibold text-slate-700">
                  ເງິນຂະຫຍັນ (Attendance bonus)
                </label>
                <input
                  id="mi-att-bonus"
                  type="text"
                  value={payload.attendanceBonus || ''}
                  onChange={(e) => updateField('attendanceBonus', e.target.value)}
                  placeholder="ເຊັ່ນ 300000"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900"
                />
                {fieldErrors.attendanceBonus && (
                  <p className="mt-1 text-xs text-red-600">{fieldErrors.attendanceBonus}</p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="mi-notes" className="block text-xs font-semibold text-slate-700">
                ໝາຍເຫດ (Notes)
              </label>
              <input
                id="mi-notes"
                type="text"
                value={payload.notes || ''}
                onChange={(e) => updateField('notes', e.target.value)}
                placeholder="ໝາຍເຫດປະຈຳເດືອນ..."
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </div>
          </div>
        )}

        {/* Revision note if editing an existing event */}
        {editingEvent && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4">
            <label htmlFor="ev-revision-note" className="block text-xs font-bold text-amber-900">
              ກຳລັງແກ້ໄຂລາຍການເດີມ ({editingEvent.eventId} · Version {editingEvent.version} →{' '}
              {editingEvent.version + 1}) — ລະບຸເຫດຜົນການແກ້ໄຂ (Revision Note):
            </label>
            <input
              id="ev-revision-note"
              type="text"
              value={revisionNote}
              onChange={(e) => setRevisionNote(e.target.value)}
              placeholder="ເຊັ່ນ ປັບວັນທີຕາມໃບຢັ້ງຢືນແພດສະບັບຈິງ..."
              className="mt-1.5 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-slate-900"
            />
          </div>
        )}

        {/* Form Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
          <div className="text-xs text-slate-500">
            ກົດບັນທຶກແລ້ວລະບົບຈະລັອກລຳດັບ, ສ້າງ Event ID, ຂຽນ Audit Log ແລະ ອັບເດດ Employees ທັນທີ
          </div>
          <div className="flex items-center gap-3">
            {editingEvent ? (
              <button
                type="button"
                onClick={onCancelEdit}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <RotateCcw className="h-4 w-4" />
                <span>ຍົກເລີກການແກ້ໄຂ</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleCategorySwitch(selectedCategory)}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <RotateCcw className="h-4 w-4" />
                <span>ລ້າງຟອມ</span>
              </button>
            )}

            <button
              type="submit"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors whitespace-nowrap shrink-0"
            >
              <Save className="h-4 w-4" />
              <span>
                {editingEvent
                  ? `ບັນທຶກ Revision ໃໝ່ (v${editingEvent.version + 1})`
                  : 'ກວດສອບ ແລະ ບັນທຶກເຫດການ'}
              </span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
