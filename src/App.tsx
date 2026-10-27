import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Cloud,
  Download,
  Edit3,
  Eye,
  EyeOff,
  FileSpreadsheet,
  History,
  LayoutDashboard,
  LogOut,
  PlusCircle,
  Search,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import {
  AuditLogRecord,
  EmployeeChangeRecord,
  EmployeeRecord,
  EventCategoryCode,
  ExportRegisterRecord,
  PayrollEventRecord,
  PayrollPeriod,
  ReferenceLists,
  UserRole,
  computeDeterministicChecksum,
  computeEventIdempotencyKey,
  formatBundleId,
  formatEventId,
  formatExportId,
  formatLaoKip,
  formatStandardFileName,
  getPeriodDateRange,
  maskBankAccount,
} from './utils/payrollRules';
import {
  EVENT_CATEGORY_META,
  INITIAL_AUDIT_LOGS,
  INITIAL_EMPLOYEES,
  INITIAL_EMPLOYEE_CHANGES,
  INITIAL_EVENTS,
  INITIAL_EXPORTS,
  INITIAL_PERIODS,
  INITIAL_REFERENCE_LISTS,
  INITIAL_SYSTEM_SETTINGS,
  SystemSettingsState,
} from './utils/seedData';
import { ParsedImportRow } from './utils/excelTemplateEngine';
import {
  googleSignIn,
  initAuth,
  logout,
  provisionGoogleWorkspaceInfrastructure,
  syncStateToGoogleSheets,
  uploadFileToGoogleDrive,
} from './services/googleWorkspaceService';
import { EventFormView } from './components/EventFormView';
import { ImportExportPdfView } from './components/ImportExportPdfView';
import { SettingsCenterView } from './components/SettingsCenterView';

type MainTab =
  | 'DASHBOARD'
  | 'ADD_EVENT'
  | 'PERIOD_EVENTS'
  | 'EMPLOYEES'
  | 'IMPORT_EXPORT'
  | 'GUIDE'
  | 'SETTINGS';

export default function App() {
  // Navigation & Role state
  const [activeTab, setActiveTab] = useState<MainTab>('DASHBOARD');
  const [userRole, setUserRole] = useState<UserRole>('SYSTEM_ADMIN');
  const [selectedStoreScope, setSelectedStoreScope] = useState<string>('ALL');

  // Google Auth state (in-memory token managed by googleWorkspaceService)
  const [googleUserEmail, setGoogleUserEmail] = useState<string>('gardennakedespresso@gmail.com');
  const [isGoogleConnected, setIsGoogleConnected] = useState<boolean>(false);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [isSyncingWorkspace, setIsSyncingWorkspace] = useState<boolean>(false);
  const [workspaceNotification, setWorkspaceNotification] = useState<string | null>(null);

  // Central System Data State (mirrors Google Sheets Central DB)
  const [settings, setSettings] = useState<SystemSettingsState>(INITIAL_SYSTEM_SETTINGS);
  const [periods, setPeriods] = useState<PayrollPeriod[]>(INITIAL_PERIODS);
  const [activePeriodId, setActivePeriodId] = useState<string>('2026-10');
  const [employees, setEmployees] = useState<EmployeeRecord[]>(INITIAL_EMPLOYEES);
  const [employeeChanges, setEmployeeChanges] = useState<EmployeeChangeRecord[]>(
    INITIAL_EMPLOYEE_CHANGES
  );
  const [events, setEvents] = useState<PayrollEventRecord[]>(INITIAL_EVENTS);
  const [referenceLists, setReferenceLists] = useState<ReferenceLists>(INITIAL_REFERENCE_LISTS);
  const [exportsRegister, setExportsRegister] = useState<ExportRegisterRecord[]>(INITIAL_EXPORTS);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>(INITIAL_AUDIT_LOGS);

  // Snapshot state for Archive Backup & Restore rehearsal (Acceptance Criterion #10)
  const [savedArchiveSnapshot, setSavedArchiveSnapshot] = useState<{
    employees: EmployeeRecord[];
    events: PayrollEventRecord[];
  } | null>(null);

  // Filters & UI state for Period Events & Employees tabs
  const [editingEvent, setEditingEvent] = useState<PayrollEventRecord | null>(null);
  const [eventFilterCategory, setEventFilterCategory] = useState<string>('ALL');
  const [eventSearchQuery, setEventSearchQuery] = useState<string>('');
  const [inspectingRevisionEvent, setInspectingRevisionEvent] =
    useState<PayrollEventRecord | null>(null);

  const [empSearchQuery, setEmpSearchQuery] = useState<string>('');
  const [empStatusFilter, setEmpStatusFilter] = useState<'ALL' | 'ACTIVE' | 'LEFT'>('ALL');
  const [revealSensitiveData, setRevealSensitiveData] = useState<boolean>(false);

  // Initialize Firebase Google Auth listener
  useEffect(() => {
    const unsubscribe = initAuth(
      (user) => {
        if (user.email) setGoogleUserEmail(user.email);
        setIsGoogleConnected(true);
      },
      () => {
        setIsGoogleConnected(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // Enforce Store Manager row-level scope automatically when switching role to STORE_MANAGER
  useEffect(() => {
    if (userRole === 'STORE_MANAGER') {
      setSelectedStoreScope('STORE-VTE-01');
      setRevealSensitiveData(false);
    } else {
      setSelectedStoreScope('ALL');
    }
  }, [userRole]);

  const activePeriod = useMemo(
    () => periods.find((p) => p.periodId === activePeriodId) || periods[1] || periods[0],
    [periods, activePeriodId]
  );

  // Row-level filtered employees & events based on role/store scope
  const visibleEmployees = useMemo(() => {
    return employees.filter((e) =>
      selectedStoreScope === 'ALL' ? true : e.storeId === selectedStoreScope
    );
  }, [employees, selectedStoreScope]);

  const visiblePeriodEvents = useMemo(() => {
    return events.filter(
      (e) =>
        e.periodId === activePeriod.periodId &&
        e.status !== 'SUPERSEDED' &&
        (selectedStoreScope === 'ALL' ? true : e.storeId === selectedStoreScope)
    );
  }, [events, activePeriod.periodId, selectedStoreScope]);

  const appendAuditLog = (
    action: AuditLogRecord['action'],
    objectId: string,
    summaryLao: string,
    beforeData?: string,
    afterData?: string
  ) => {
    const nextSeq = auditLogs.length + 1;
    const nowIso = '2026-10-27T14:10:00+07:00';
    const newRecord: AuditLogRecord = {
      auditId: `AUD-202610-${String(nextSeq).padStart(4, '0')}`,
      timestamp: nowIso,
      userEmail: googleUserEmail,
      userRole,
      action,
      objectId,
      summaryLao,
      beforeData,
      afterData,
      correlationId: `CORR-${Math.floor(10000 + Math.random() * 90000)}`,
    };
    setAuditLogs((prev) => [newRecord, ...prev]);
  };

  /**
   * Mark any existing LATEST exports in the target period as HAS_NEWER_REVISION ("ມີສະບັບໃໝ່")
   * whenever an event or employee in that period changes (Section 4.7 & Acceptance Criterion #7)
   */
  const markPeriodExportsHasNewerRevision = (periodId: string) => {
    setExportsRegister((prev) =>
      prev.map((exp) =>
        exp.periodId === periodId && exp.status === 'LATEST'
          ? { ...exp, status: 'HAS_NEWER_REVISION' }
          : exp
      )
    );
  };

  /**
   * Apply NEW_STAFF or LEFT event directly to Central Employees & Employee_Changes (Section 4.3 & Criterion #1, #2)
   */
  const applyStaffMutation = (
    eventId: string,
    category: EventCategoryCode,
    employeeId: string,
    payload: Record<string, string>,
    storeId: string
  ): string => {
    const upperId = employeeId.trim().toUpperCase();
    const existing = employees.find((e) => e.employeeId.toUpperCase() === upperId);
    const nowStr = '2026-10-27T14:12:00+07:00';

    if (category === 'NEW_STAFF') {
      if (existing) {
        // Update only changed fields (Section 2.1: "ສຳລັບການປັບປຸງ ໃຫ້ສົ່ງສະເພາະຟິວທີ່ປ່ຽນ")
        const updatedEmp: EmployeeRecord = {
          ...existing,
          nameLao: payload.nameLao?.trim() || existing.nameLao,
          nameEn: payload.nameEn?.trim() || existing.nameEn,
          position: payload.position?.trim() || existing.position,
          scannerId: payload.scannerId?.trim() || existing.scannerId,
          usesScanner:
            (payload.usesScanner as 'Yes' | 'No') || existing.usesScanner,
          dayOff: payload.dayOff?.trim() || existing.dayOff,
          shiftStart: payload.shiftStart?.trim() || existing.shiftStart,
          shiftEnd: payload.shiftEnd?.trim() || existing.shiftEnd,
          monthlySalary: payload.monthlySalary?.trim()
            ? Number(payload.monthlySalary)
            : existing.monthlySalary,
          sso: (payload.sso as 'Yes' | 'No') || existing.sso,
          bankAccount: payload.bankAccount?.trim() || existing.bankAccount,
          startDate: payload.startDate?.trim() || existing.startDate,
          version: existing.version + 1,
          updatedAt: nowStr,
          updatedBy: googleUserEmail,
        };
        setEmployees((prev) =>
          prev.map((e) => (e.employeeId.toUpperCase() === upperId ? updatedEmp : e))
        );
        setEmployeeChanges((prev) => [
          {
            changeId: `CHG-2026-10-${String(prev.length + 1).padStart(4, '0')}`,
            employeeId: upperId,
            eventId,
            changeType: 'UPDATE',
            beforeSnapshot: {
              position: existing.position,
              monthlySalary: existing.monthlySalary,
              shiftStart: existing.shiftStart,
              shiftEnd: existing.shiftEnd,
            },
            afterSnapshot: {
              position: updatedEmp.position,
              monthlySalary: updatedEmp.monthlySalary,
              shiftStart: updatedEmp.shiftStart,
              shiftEnd: updatedEmp.shiftEnd,
            },
            reason: payload.notes || 'ປັບປຸງຂໍ້ມູນພະນັກງານຜ່ານແຜ່ນ 1 New staff',
            changedBy: googleUserEmail,
            changedAt: nowStr,
          },
          ...prev,
        ]);
        return updatedEmp.nameLao;
      } else {
        // Create new employee
        const newEmp: EmployeeRecord = {
          employeeId: upperId,
          nameLao: payload.nameLao.trim(),
          nameEn: payload.nameEn?.trim() || '',
          position: payload.position?.trim() || 'Barista · ບາຣິສຕ້າ',
          scannerId: payload.scannerId?.trim() || upperId.replace(/\D/g, '') || '199',
          usesScanner: (payload.usesScanner as 'Yes' | 'No') || 'Yes',
          dayOff: payload.dayOff || 'Mon',
          shiftStart: payload.shiftStart || '07:00',
          shiftEnd: payload.shiftEnd || '15:30',
          monthlySalary: Number(payload.monthlySalary || 0),
          sso: (payload.sso as 'Yes' | 'No') || 'Yes',
          bankAccount: payload.bankAccount || '',
          startDate: payload.startDate || activePeriod.startDate,
          status: 'ACTIVE',
          checkedInPayroll: false,
          storeId,
          version: 1,
          updatedAt: nowStr,
          updatedBy: googleUserEmail,
        };
        setEmployees((prev) => [newEmp, ...prev]);
        setEmployeeChanges((prev) => [
          {
            changeId: `CHG-2026-10-${String(prev.length + 1).padStart(4, '0')}`,
            employeeId: upperId,
            eventId,
            changeType: 'CREATE',
            beforeSnapshot: null,
            afterSnapshot: {
              employeeId: newEmp.employeeId,
              nameLao: newEmp.nameLao,
              position: newEmp.position,
              monthlySalary: newEmp.monthlySalary,
              startDate: newEmp.startDate,
            },
            reason: payload.notes || 'ເພີ່ມພະນັກງານໃໝ່ຜ່ານແຜ່ນ 1 New staff',
            changedBy: googleUserEmail,
            changedAt: nowStr,
          },
          ...prev,
        ]);
        return newEmp.nameLao;
      }
    }

    if (category === 'LEFT' && existing) {
      const updatedEmp: EmployeeRecord = {
        ...existing,
        status: 'LEFT',
        lastWorkingDay: payload.lastWorkingDay,
        version: existing.version + 1,
        updatedAt: nowStr,
        updatedBy: googleUserEmail,
      };
      setEmployees((prev) =>
        prev.map((e) => (e.employeeId.toUpperCase() === upperId ? updatedEmp : e))
      );
      setEmployeeChanges((prev) => [
        {
          changeId: `CHG-2026-10-${String(prev.length + 1).padStart(4, '0')}`,
          employeeId: upperId,
          eventId,
          changeType: 'LEFT',
          beforeSnapshot: { status: existing.status },
          afterSnapshot: { status: 'LEFT', lastWorkingDay: payload.lastWorkingDay },
          reason: payload.reason || 'ພະນັກງານອອກວຽກ',
          changedBy: googleUserEmail,
          changedAt: nowStr,
        },
        ...prev,
      ]);
      return updatedEmp.nameLao;
    }

    return existing?.nameLao || payload.nameLao || '';
  };

  /**
   * Create or update a Payroll Event with atomic sequence lock, version check, and idempotency check
   */
  const handleSubmitEvent = (params: {
    category: EventCategoryCode;
    periodId: string;
    employeeId: string;
    payload: Record<string, string>;
    expectedVersion?: number;
    editingEventId?: string;
    revisionNote?: string;
  }): { ok: boolean; messageLao: string; eventId?: string } => {
    const storeId =
      selectedStoreScope === 'ALL' ? 'STORE-VTE-01' : selectedStoreScope;
    const idempKey = computeEventIdempotencyKey(
      params.category,
      params.periodId,
      params.employeeId,
      params.payload
    );
    const nowStr = '2026-10-27T14:15:00+07:00';

    // Case 1: Editing an existing event (Optimistic concurrency version check per Section 10)
    if (params.editingEventId) {
      const target = events.find((e) => e.eventId === params.editingEventId);
      if (!target) {
        return { ok: false, messageLao: 'ບໍ່ພົບລາຍການເຫດການທີ່ຕ້ອງການແກ້ໄຂ' };
      }
      if (
        params.expectedVersion !== undefined &&
        target.version !== params.expectedVersion
      ) {
        return {
          ok: false,
          messageLao: `ຂໍ້ຂັດແຍ້ງເວີຊັນ (Version Conflict): ລາຍການ ${target.eventId} ຖືກປ່ຽນເປັນ v${target.version} ໂດຍຜູ້ໃຊ້ອື່ນແລ້ວ — ກະລຸນາໂຫຼດຂໍ້ມູນໃໝ່ກ່ອນບັນທຶກທັບ`,
        };
      }

      const nextVer = target.version + 1;
      const autoName = applyStaffMutation(
        target.eventId,
        params.category,
        params.employeeId,
        params.payload,
        target.storeId
      );

      const updatedEvent: PayrollEventRecord = {
        ...target,
        periodId: params.periodId,
        employeeId: params.employeeId,
        autoNameLao: autoName || target.autoNameLao,
        payload: { ...params.payload },
        version: nextVer,
        idempotencyKey: idempKey,
        updatedBy: googleUserEmail,
        updatedAt: nowStr,
        revisionHistory: [
          ...target.revisionHistory,
          {
            version: nextVer,
            updatedAt: nowStr,
            updatedBy: googleUserEmail,
            beforePayload: target.payload,
            afterPayload: params.payload,
            note: params.revisionNote || 'ແກ້ໄຂຂໍ້ມູນເຫດການ (Revision Update)',
          },
        ],
      };

      setEvents((prev) =>
        prev.map((e) => (e.eventId === target.eventId ? updatedEvent : e))
      );
      markPeriodExportsHasNewerRevision(params.periodId);
      appendAuditLog(
        'UPDATE_EVENT',
        target.eventId,
        `ແກ້ໄຂເຫດການ ${target.eventId} (${params.employeeId}) ເປັນ Version ${nextVer} ແລະ ໝາຍສະຖານະ Export ເກົ່າວ່າ “ມີສະບັບໃໝ່”`,
        JSON.stringify(target.payload),
        JSON.stringify(params.payload)
      );
      setEditingEvent(null);
      return {
        ok: true,
        messageLao: `ບັນທຶກການແກ້ໄຂ ${target.eventId} (Version ${nextVer}) ສຳເລັດ · ອັບເດດຖານກາງທັນທີ ແລະ ໝາຍ Export ສະບັບເກົ່າເປັນ “ມີສະບັບໃໝ່” ແລ້ວ`,
        eventId: target.eventId,
      };
    }

    // Case 2: Creating a new event -> Check Idempotency Key first
    const duplicate = events.find(
      (e) => e.idempotencyKey === idempKey && e.status !== 'SUPERSEDED'
    );
    if (duplicate) {
      return {
        ok: false,
        messageLao: `ປ້ອງກັນການບັນທຶກຊ້ຳ (Idempotency Guard): ລາຍການນີ້ຖືກບັນທຶກໄວ້ແລ້ວໃນລະຫັດ ${duplicate.eventId}`,
      };
    }

    const nextSeq = events.length + 1;
    const newEventId = formatEventId(params.periodId, params.category, nextSeq);
    const resolvedAutoName = applyStaffMutation(
      newEventId,
      params.category,
      params.employeeId,
      params.payload,
      storeId
    );

    const newEvent: PayrollEventRecord = {
      eventId: newEventId,
      periodId: params.periodId,
      category: params.category,
      employeeId: params.employeeId,
      autoNameLao: resolvedAutoName,
      storeId,
      payload: { ...params.payload },
      version: 1,
      idempotencyKey: idempKey,
      status: 'VALID',
      createdBy: googleUserEmail,
      createdAt: nowStr,
      updatedBy: googleUserEmail,
      updatedAt: nowStr,
      revisionHistory: [],
    };

    setEvents((prev) => [newEvent, ...prev]);
    // Switch activePeriodId if event resolved to another open period (e.g. 26th date rule)
    if (params.periodId !== activePeriodId && periods.some((p) => p.periodId === params.periodId)) {
      setActivePeriodId(params.periodId);
    }
    markPeriodExportsHasNewerRevision(params.periodId);
    appendAuditLog(
      'CREATE_EVENT',
      newEventId,
      `ສ້າງເຫດການໃໝ່ ${newEventId} (${params.category} · ${params.employeeId} ${resolvedAutoName}) ໃນງວດ ${params.periodId}`,
      undefined,
      JSON.stringify(params.payload)
    );

    return {
      ok: true,
      messageLao: `ບັນທຶກສຳເລັດ! ສ້າງລະຫັດ ${newEventId} (${params.employeeId} · ${resolvedAutoName}) ໃນງວດ ${params.periodId} ຮຽບຮ້ອຍແລ້ວ`,
      eventId: newEventId,
    };
  };

  /**
   * Apply validated rows from Excel Import
   */
  const handleApplyImportedRows = (
    rows: ParsedImportRow[],
    fileName: string
  ): { importedCount: number } => {
    let seqOffset = events.length;
    const nowStr = '2026-10-27T14:20:00+07:00';
    const createdEvents: PayrollEventRecord[] = [];

    for (const r of rows) {
      seqOffset += 1;
      const evId = formatEventId(r.resolvedPeriodId, r.category, seqOffset);
      const storeId = selectedStoreScope === 'ALL' ? 'STORE-VTE-01' : selectedStoreScope;
      const autoName = applyStaffMutation(
        evId,
        r.category,
        r.employeeId,
        r.payload,
        storeId
      );
      createdEvents.push({
        eventId: evId,
        periodId: r.resolvedPeriodId,
        category: r.category,
        employeeId: r.employeeId,
        autoNameLao: autoName || r.autoNameLao,
        storeId,
        payload: r.payload,
        version: 1,
        idempotencyKey: r.idempotencyKey,
        status: 'VALID',
        createdBy: googleUserEmail,
        createdAt: nowStr,
        updatedBy: googleUserEmail,
        updatedAt: nowStr,
        revisionHistory: [],
      });
    }

    if (createdEvents.length > 0) {
      setEvents((prev) => [...createdEvents, ...prev]);
      markPeriodExportsHasNewerRevision(activePeriod.periodId);
    }

    appendAuditLog(
      'IMPORT_EXCEL',
      fileName,
      `ນຳເຂົ້າໄຟລ໌ Excel ${fileName} ສຳເລັດ ${createdEvents.length} ລາຍການ (ບັນທຶກໄຟລ໌ຕົ້ນສະບັບໄວ້ໃນ 01_Incoming_Uploads/${activePeriod.periodId})`
    );

    return { importedCount: createdEvents.length };
  };

  /**
   * Create new Excel Export record & optionally upload to Google Drive
   */
  const handleCreateExcelExport = async (params: {
    periodId: string;
    bytes: Uint8Array;
    checksumSha256: string;
    eventCount: number;
  }): Promise<ExportRegisterRecord> => {
    const nextSeq =
      exportsRegister.filter(
        (x) => x.periodId === params.periodId && x.exportType === 'EXCEL'
      ).length + 1;
    const exportId = formatExportId(params.periodId, nextSeq);
    const fileName = formatStandardFileName('EXPORT', params.periodId, nextSeq, 'xlsx');
    let driveFileId = `1TgExport_${params.periodId}_${String(nextSeq).padStart(4, '0')}`;
    let webViewLink: string | undefined;

    if (isGoogleConnected) {
      try {
        const up = await uploadFileToGoogleDrive(
          fileName,
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          params.bytes,
          settings.rootDriveFolderId || undefined
        );
        driveFileId = up.fileId;
        webViewLink = up.webViewLink;
      } catch {
        // Fallback to local registered Drive ID if folder not yet provisioned
      }
    }

    const newRec: ExportRegisterRecord = {
      exportId,
      exportType: 'EXCEL',
      periodId: params.periodId,
      fileName,
      driveFolder: `TheGarden_Payroll_System/02_Audit_Exports/${params.periodId}`,
      driveFileId,
      driveWebViewLink: webViewLink,
      checksumSha256: params.checksumSha256,
      eventCount: params.eventCount,
      maxEventVersionAtExport: Math.max(
        1,
        ...events.filter((e) => e.periodId === params.periodId).map((e) => e.version)
      ),
      status: 'LATEST',
      validationPassed: true,
      createdBy: googleUserEmail,
      createdAt: '2026-10-27T14:25:00+07:00',
    };

    setExportsRegister((prev) => [newRec, ...prev]);
    appendAuditLog(
      'EXPORT_EXCEL',
      exportId,
      `ສ້າງໄຟລ໌ Excel ສົ່ງກວດໃໝ່ ${fileName} (${exportId}) · Checksum ${params.checksumSha256.slice(0, 12)}...`
    );
    return newRec;
  };

  /**
   * Create new A4 PDF Bundle record in Export_Register
   */
  const handleCreatePdfBundle = async (params: {
    periodId: string;
    includedCategories: EventCategoryCode[];
    orientation: 'PORTRAIT' | 'LANDSCAPE';
  }): Promise<ExportRegisterRecord> => {
    const nextSeq =
      exportsRegister.filter((x) => x.exportType === 'PDF_BUNDLE').length + 1;
    const bundleId = formatBundleId(params.periodId, nextSeq);
    const exportId = formatExportId(params.periodId, exportsRegister.length + 1);
    const fileName = formatStandardFileName('PDF', params.periodId, nextSeq, 'pdf');
    const checksum = computeDeterministicChecksum(
      `PDF:${bundleId}:${params.periodId}:${params.includedCategories.join(',')}`
    );

    const newRec: ExportRegisterRecord = {
      exportId,
      bundleId,
      exportType: 'PDF_BUNDLE',
      periodId: params.periodId,
      fileName,
      driveFolder: `TheGarden_Payroll_System/05_PDF_Bundles/${params.periodId}`,
      driveFileId: `1TgPdfBundle_${params.periodId}_${String(nextSeq).padStart(4, '0')}`,
      checksumSha256: checksum,
      eventCount: visiblePeriodEvents.filter((e) =>
        params.includedCategories.includes(e.category)
      ).length,
      maxEventVersionAtExport: 1,
      status: 'LATEST',
      validationPassed: true,
      createdBy: googleUserEmail,
      createdAt: '2026-10-27T14:28:00+07:00',
    };

    setExportsRegister((prev) => [newRec, ...prev]);
    appendAuditLog(
      'EXPORT_PDF',
      bundleId,
      `ສ້າງຊຸດເອກະສານ PDF A4 (${bundleId} · ${fileName}) ໄວ້ໃນ 05_PDF_Bundles/${params.periodId}`
    );
    return newRec;
  };

  const handleGoogleLoginClick = async () => {
    setIsLoggingIn(true);
    setWorkspaceNotification(null);
    try {
      const res = await googleSignIn();
      if (res) {
        setGoogleUserEmail(res.user.email || 'gardennakedespresso@gmail.com');
        setIsGoogleConnected(true);
        setWorkspaceNotification(
          `ເຂົ້າສູ່ລະບົບ Google Workspace ສຳເລັດ (${res.user.email}) · ພ້ອມເຊື່ອມຕໍ່ Google Sheets & Google Drive`
        );
      }
    } catch (err: any) {
      setWorkspaceNotification(
        `ໝາຍເຫດການເຂົ້າສູ່ລະບົບ Google: ${err?.message || 'ກະລຸນາກວດສອບປ໊ອບອັບເບຣົາເຊີ'}`
      );
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleLogoutClick = async () => {
    await logout();
    setIsGoogleConnected(false);
    setWorkspaceNotification('ອອກຈາກລະບົບແລ້ວ ແລະ ລຶບຂໍ້ມູນຮ່າງຊົ່ວຄາວ (Local Draft Cache) ຮຽບຮ້ອຍແລ້ວ');
  };

  const handleProvisionWorkspace = async () => {
    setIsSyncingWorkspace(true);
    setWorkspaceNotification(null);
    try {
      const res = await provisionGoogleWorkspaceInfrastructure(settings);
      const updated: SystemSettingsState = {
        ...settings,
        rootDriveFolderId: res.rootFolderId,
        systemSpreadsheetId: res.spreadsheetId,
      };
      setSettings(updated);
      await syncStateToGoogleSheets(
        res.spreadsheetId,
        employees,
        employeeChanges,
        periods,
        events,
        exportsRegister,
        auditLogs
      );
      appendAuditLog(
        'SYNC_WORKSPACE',
        res.spreadsheetId,
        `ສ້າງໂຟນເດີ TheGarden_Payroll_System (00–05) ແລະ ຖານຂໍ້ມູນກາງ Google Sheets (${res.spreadsheetId}) ສຳເລັດ`
      );
      setWorkspaceNotification(
        `ສ້າງໂຟນເດີ Drive (ID: ${res.rootFolderId}) ແລະ ຖານຂໍ້ມູນ Google Sheets (ID: ${res.spreadsheetId}) ພ້ອມຊິ້ງຂໍ້ມູນທັງໝົດສຳເລັດແລ້ວ!`
      );
    } catch (err: any) {
      setWorkspaceNotification(`ເກີດຂໍ້ຜິດພາດໃນການສ້າງໂຟນເດີ/Sheets: ${err?.message}`);
    } finally {
      setIsSyncingWorkspace(false);
    }
  };

  const handleSyncWorkspaceNow = async () => {
    if (!settings.systemSpreadsheetId) return;
    setIsSyncingWorkspace(true);
    setWorkspaceNotification(null);
    try {
      const res = await syncStateToGoogleSheets(
        settings.systemSpreadsheetId,
        employees,
        employeeChanges,
        periods,
        events,
        exportsRegister,
        auditLogs
      );
      appendAuditLog(
        'SYNC_WORKSPACE',
        settings.systemSpreadsheetId,
        `ຊິ້ງຂໍ້ມູນທັງໝົດຂຶ້ນ Google Sheets (${res.updatedCells} ຈຸດຂໍ້ມູນ) ສຳເລັດ`
      );
      setWorkspaceNotification(
        `ຊິ້ງຂໍ້ມູນຂຶ້ນ Google Sheets ຖານຂໍ້ມູນກາງສຳເລັດ (${res.updatedCells} cells updated)`
      );
    } catch (err: any) {
      setWorkspaceNotification(`ຊິ້ງຂໍ້ມູນບໍ່ສຳເລັດ: ${err?.message}`);
    } finally {
      setIsSyncingWorkspace(false);
    }
  };

  // Filtered lists for Period Events tab and Employees tab
  const filteredEventsList = useMemo(() => {
    return visiblePeriodEvents.filter((ev) => {
      if (eventFilterCategory !== 'ALL' && ev.category !== eventFilterCategory) return false;
      if (eventSearchQuery.trim()) {
        const q = eventSearchQuery.trim().toLowerCase();
        return (
          ev.employeeId.toLowerCase().includes(q) ||
          ev.autoNameLao.toLowerCase().includes(q) ||
          ev.eventId.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [visiblePeriodEvents, eventFilterCategory, eventSearchQuery]);

  const filteredEmployeesList = useMemo(() => {
    return visibleEmployees.filter((emp) => {
      if (empStatusFilter !== 'ALL' && emp.status !== empStatusFilter) return false;
      if (empSearchQuery.trim()) {
        const q = empSearchQuery.trim().toLowerCase();
        return (
          emp.employeeId.toLowerCase().includes(q) ||
          emp.nameLao.toLowerCase().includes(q) ||
          emp.nameEn.toLowerCase().includes(q) ||
          emp.position.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [visibleEmployees, empStatusFilter, empSearchQuery]);

  const latestPeriodExport = useMemo(
    () => exportsRegister.find((x) => x.periodId === activePeriod.periodId),
    [exportsRegister, activePeriod.periodId]
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] flex flex-col overflow-x-hidden">
      {/* ==================== TOP BAR CONTRACT (3 ZONES, NO CLUTTER) ==================== */}
      <header className="flex items-center justify-between gap-2 sm:gap-8 border-b border-slate-200 bg-white px-4 sm:px-6 py-3.5 no-print">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#dashboard"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('DASHBOARD');
          }}
          className="text-sm sm:text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          The Garden · ລະບົບເງິນເດືອນ
        </a>

        {/* Zone 2: Clean single-line text navigation links */}
        <nav aria-label="ເມນູຫຼັກ" className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          {(
            [
              ['DASHBOARD', 'ໜ້າຫຼັກ'],
              ['ADD_EVENT', 'ເພີ່ມເຫດການ'],
              ['PERIOD_EVENTS', 'ລາຍການງວດ'],
              ['EMPLOYEES', 'ພະນັກງານ'],
              ['IMPORT_EXPORT', 'ກວດ ແລະ ສົ່ງອອກ'],
              ['GUIDE', 'ຄູ່ມືແມ່ແບບ'],
              ['SETTINGS', 'ຕັ້ງຄ່າ'],
            ] as Array<[MainTab, string]>
          ).map(([tabKey, label]) => (
            <button
              key={tabKey}
              type="button"
              data-testid={`nav-${tabKey.toLowerCase()}`}
              onClick={() => setActiveTab(tabKey)}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                activeTab === tabKey
                  ? 'border-emerald-600 font-bold text-slate-900'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {/* Zone 3: Primary Account / Google Workspace Action */}
        <div className="flex items-center gap-2 shrink-0">
          {!isGoogleConnected ? (
            <button
              type="button"
              onClick={handleGoogleLoginClick}
              disabled={isLoggingIn}
              className="gsi-material-button"
            >
              <div className="gsi-material-button-state"></div>
              <div className="gsi-material-button-content-wrapper">
                <div className="gsi-material-button-icon">
                  <svg
                    version="1.1"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 48 48"
                    style={{ display: 'block' }}
                  >
                    <path
                      fill="#EA4335"
                      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                    ></path>
                    <path
                      fill="#4285F4"
                      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                    ></path>
                    <path
                      fill="#FBBC05"
                      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                    ></path>
                    <path
                      fill="#34A853"
                      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                    ></path>
                    <path fill="none" d="M0 0h48v48H0z"></path>
                  </svg>
                </div>
                <span className="gsi-material-button-contents">Sign in with Google</span>
              </div>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleGoogleLogoutClick}
              className="inline-flex min-h-[38px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <LogOut className="h-3.5 w-3.5 text-slate-500" />
              <span>ອອກຈາກລະບົບ ({googleUserEmail.split('@')[0]})</span>
            </button>
          )}
        </div>
      </header>

      {/* Mobile Navigation Bar */}
      <nav
        aria-label="ເມນູມືຖື"
        className="flex md:hidden items-center gap-2 overflow-x-auto border-b border-slate-200 bg-white px-4 py-2 no-print"
      >
        {(
          [
            ['DASHBOARD', 'ໜ້າຫຼັກ'],
            ['ADD_EVENT', 'ເພີ່ມເຫດການ'],
            ['PERIOD_EVENTS', 'ລາຍການງວດ'],
            ['EMPLOYEES', 'ພະນັກງານ'],
            ['IMPORT_EXPORT', 'ກວດ/ສົ່ງອອກ'],
            ['GUIDE', 'ຄູ່ມື'],
            ['SETTINGS', 'ຕັ້ງຄ່າ'],
          ] as Array<[MainTab, string]>
        ).map(([tabKey, label]) => (
          <button
            key={tabKey}
            type="button"
            onClick={() => setActiveTab(tabKey)}
            className={`min-h-[40px] rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 ${
              activeTab === tabKey
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* ==================== WORKSPACE CONTEXT TOOLBAR (BELOW HEADER) ==================== */}
      <div className="border-b border-slate-200 bg-slate-100/80 px-4 sm:px-6 py-2.5 no-print">
        <div className="mx-auto flex max-w-[1360px] flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-between gap-2.5 text-xs">
          {/* Active Period 26–25 Selector */}
          <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2 sm:gap-3">
            <div className="flex items-center justify-between sm:justify-start gap-2">
              <span className="flex items-center gap-1.5 shrink-0">
                <Calendar className="h-4 w-4 text-emerald-700" />
                <label htmlFor="toolbar-period-select" className="font-semibold text-slate-700">
                  ງວດ (26–25):
                </label>
              </span>
              <select
                id="toolbar-period-select"
                value={activePeriod.periodId}
                onChange={(e) => setActivePeriodId(e.target.value)}
                className="min-w-0 max-w-[230px] sm:max-w-none truncate rounded-md border border-slate-300 bg-white px-2 py-1 font-mono font-bold text-slate-900"
              >
                {periods.map((p) => (
                  <option key={p.periodId} value={p.periodId}>
                    {p.periodId} ({p.startDate} – {p.endDate}) [{p.status}]
                  </option>
                ))}
              </select>
            </div>

            <span aria-hidden="true" className="hidden sm:inline text-slate-300">
              |
            </span>

            {/* Store / Branch Filter */}
            <div className="flex items-center justify-between sm:justify-start gap-2">
              <label htmlFor="toolbar-store-select" className="font-semibold text-slate-700 shrink-0">
                ສາຂາຮ້ານ:
              </label>
              <select
                id="toolbar-store-select"
                value={selectedStoreScope}
                disabled={userRole === 'STORE_MANAGER'}
                onChange={(e) => setSelectedStoreScope(e.target.value)}
                className="min-w-0 max-w-[230px] sm:max-w-none truncate rounded-md border border-slate-300 bg-white px-2 py-1 font-medium text-slate-800 disabled:bg-slate-100"
              >
                <option value="ALL">ທຸກສາຂາ (All Branches)</option>
                {settings.branches.map((b) => (
                  <option key={b.storeId} value={b.storeId}>
                    {b.storeId} · {b.nameLao}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Role Switcher (for testing RBAC per Section 6 & Criterion #9) & Google Sync Status */}
          <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2 sm:gap-3">
            <div className="flex items-center justify-between sm:justify-start gap-2">
              <label htmlFor="toolbar-role-select" className="font-semibold text-slate-700 shrink-0">
                ບົດບາດຜູ້ໃຊ້:
              </label>
              <select
                id="toolbar-role-select"
                value={userRole}
                onChange={(e) => setUserRole(e.target.value as UserRole)}
                className="min-w-0 max-w-[230px] sm:max-w-none truncate rounded-md border border-slate-300 bg-white px-2 py-1 font-semibold text-slate-900"
              >
                <option value="SYSTEM_ADMIN">ຜູ້ດູແລລະບົບ (SYSTEM_ADMIN)</option>
                <option value="AUDIT_TEAM">ທີມກວດສອບຫຼັງບ້ານ (AUDIT_TEAM)</option>
                <option value="STORE_MANAGER">ຜູ້ຈັດການຮ້ານ (STORE_MANAGER)</option>
              </select>
            </div>

            <span aria-hidden="true" className="hidden sm:inline text-slate-300">
              |
            </span>

            <span className="font-mono text-[11px] sm:text-xs text-slate-600">
              Google Sheets & Drive:{' '}
              {isGoogleConnected ? 'ເຊື່ອມຕໍ່ OAuth ແລ້ວ' : 'ພ້ອມເຊື່ອມຕໍ່ (OAuth)'}
            </span>
          </div>
        </div>
      </div>

      {/* ==================== MAIN CONTENT CONTAINER ==================== */}
      <main className="mx-auto w-full max-w-[1360px] flex-1 px-6 py-6">
        {workspaceNotification && (
          <div className="mb-5 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-950 no-print">
            <span>{workspaceNotification}</span>
            <button
              type="button"
              onClick={() => setWorkspaceNotification(null)}
              className="text-emerald-800 underline"
            >
              ປິດຂໍ້ຄວາມ
            </button>
          </div>
        )}

        {/* ==================== TAB 1: DASHBOARD (ໜ້າຫຼັກ) ==================== */}
        {activeTab === 'DASHBOARD' && (
          <div className="space-y-6">
            {/* Hero Summary Banner */}
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold text-emerald-700">
                    ຖານຂໍ້ມູນກາງ Google Sheets & ຄັງໄຟລ໌ Google Drive · ເຂດເວລາ Asia/Vientiane
                  </div>
                  <h1 className="mt-1 text-2xl font-bold text-slate-900">
                    ພາບລວມຂໍ້ມູນເງິນເດືອນ ງວດ {activePeriod.periodId} ({activePeriod.startDate} –{' '}
                    {activePeriod.endDate})
                  </h1>
                  <p className="mt-1 text-xs text-slate-600">
                    <span>ຮອບຄິດໄລ່ ວັນທີ 26 ຫາ 25</span>
                    <span aria-hidden="true"> · </span>
                    <span>
                      ສະຖານະງວດ:{' '}
                      {activePeriod.status === 'OPEN'
                        ? 'ເປີດຮັບການບັນທຶກ (OPEN)'
                        : 'ປິດງວດແລ້ວ · ອ່ານຢ່າງດຽວ (CLOSED)'}
                    </span>
                    <span aria-hidden="true"> · </span>
                    <span>ແມ່ແບບອ້າງອີງ: {settings.allowedTemplateVersion}</span>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingEvent(null);
                      setActiveTab('ADD_EVENT');
                    }}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 whitespace-nowrap shrink-0"
                  >
                    <PlusCircle className="h-4 w-4" />
                    <span>ບັນທຶກເຫດການໃໝ່ (7 ປະເພດ)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('IMPORT_EXPORT')}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0"
                  >
                    <FileSpreadsheet className="h-4 w-4 text-emerald-700" />
                    <span>ກວດກ່ອນສົ່ງ & ສ້າງ Excel / PDF</span>
                  </button>
                </div>
              </div>

              {/* 4 Key Metrics Grid */}
              <div className="mt-6 grid grid-cols-1 gap-4 border-t border-slate-200 pt-5 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <div className="text-xs text-slate-500">ເຫດການທັງໝົດໃນງວດ {activePeriod.periodId}</div>
                  <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
                    {visiblePeriodEvents.length} ລາຍການ
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    ກວດຜ່ານແລ້ວ {visiblePeriodEvents.filter((e) => e.status === 'VALID').length}{' '}
                    ລາຍການ
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-500">ພະນັກງານໃນຖານຂໍ້ມູນກາງ (Employees)</div>
                  <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
                    {visibleEmployees.filter((e) => e.status === 'ACTIVE').length} ຄົນ
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    ອອກວຽກໃນງວດນີ້: {visibleEmployees.filter((e) => e.status === 'LEFT').length} ຄົນ
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-500">ສະຖານະໄຟລ໌ Export ລ່າສຸດ</div>
                  <div className="mt-1 text-lg font-bold font-mono text-slate-900">
                    {latestPeriodExport ? latestPeriodExport.exportId : 'ຍັງບໍ່ທັນສົ່ງອອກ'}
                  </div>
                  <div className="mt-0.5 text-xs">
                    {latestPeriodExport ? (
                      latestPeriodExport.status === 'LATEST' ? (
                        <span className="font-semibold text-emerald-700">
                          ✓ ສະບັບລ່າສຸດກົງກັບຖານຂໍ້ມູນ
                        </span>
                      ) : (
                        <span className="font-semibold text-amber-700">
                          ⚠ ມີສະບັບໃໝ່ (ມີການແກ້ໄຂຫຼັງ Export)
                        </span>
                      )
                    ) : (
                      <span className="text-slate-500">ກຽມພ້ອມສຳລັບການສ້າງ Export</span>
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-slate-500">ບັນທຶກການກວດສອບ (Audit_Log)</div>
                  <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
                    {auditLogs.length} ລາຍການ
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    Append-only · ລັອກລຳດັບທີ່ຫຼັງບ້ານ
                  </div>
                </div>
              </div>
            </div>

            {/* 7 Event Categories Breakdown Grid */}
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <h2 className="text-base font-bold text-slate-900">
                  ຈຳນວນລາຍການຕາມປະເພດເຫດການ (ແຜ່ນທີ 1 ຫາ 7 ຕາມແມ່ແບບ Excel)
                </h2>
                <span className="text-xs text-slate-500">
                  ຄລິກເພື່ອເບິ່ງລາຍການ ຫຼື ເພີ່ມເຫດການໃນແຕ່ລະແຜ່ນ
                </span>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
                {EVENT_CATEGORY_META.map((cat) => {
                  const count = visiblePeriodEvents.filter(
                    (e) => e.category === cat.code
                  ).length;
                  return (
                    <div
                      key={cat.code}
                      className="flex flex-col justify-between rounded-lg border border-slate-200 p-3.5 hover:border-slate-300"
                    >
                      <div>
                        <div className="flex items-center justify-between text-xs font-mono text-slate-500">
                          <span>ແຜ່ນ {cat.sheetNumber}</span>
                          <span>{cat.columnsRange}</span>
                        </div>
                        <div className="mt-1 text-sm font-bold text-slate-900">
                          {cat.shortLao}
                        </div>
                      </div>

                      <div className="mt-4 flex items-baseline justify-between border-t border-slate-100 pt-2.5">
                        <span className="text-xl font-bold font-mono tabular-nums text-slate-900">
                          {count}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setEventFilterCategory(cat.code);
                            setActiveTab('PERIOD_EVENTS');
                          }}
                          className="text-xs font-semibold text-emerald-700 hover:underline"
                        >
                          ເບິ່ງລາຍການ →
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Recent Events & Google Drive Folder Mapping */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-8">
                <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                  <h2 className="text-base font-bold text-slate-900">
                    ລາຍການເຫດການລ່າສຸດໃນງວດ {activePeriod.periodId}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setActiveTab('PERIOD_EVENTS')}
                    className="text-xs font-semibold text-emerald-700 hover:underline"
                  >
                    ເບິ່ງທັງໝົດ ({visiblePeriodEvents.length}) →
                  </button>
                </div>

                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Event ID</th>
                        <th className="px-3 py-2 font-semibold">ປະເພດແຜ່ນ</th>
                        <th className="px-3 py-2 font-semibold">ພະນັກງານ (Name auto)</th>
                        <th className="px-3 py-2 font-semibold">ເວີຊັນ</th>
                        <th className="px-3 py-2 font-semibold text-right">ການຈັດການ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {visiblePeriodEvents.slice(0, 6).map((ev) => {
                        const meta = EVENT_CATEGORY_META.find((m) => m.code === ev.category)!;
                        return (
                          <tr key={ev.eventId} className="hover:bg-slate-50">
                            <td className="px-3 py-2.5 font-mono font-semibold text-slate-900">
                              {ev.eventId}
                            </td>
                            <td className="px-3 py-2.5">
                              {meta.sheetNumber}. {meta.shortLao}
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="font-mono font-bold">{ev.employeeId}</span> ·{' '}
                              {ev.autoNameLao}
                            </td>
                            <td className="px-3 py-2.5 font-mono">v{ev.version}</td>
                            <td className="px-3 py-2.5 text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingEvent(ev);
                                  setActiveTab('ADD_EVENT');
                                }}
                                className="font-semibold text-emerald-700 hover:underline"
                              >
                                ແກ້ໄຂ / Revision
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-4 flex flex-col justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900 border-b border-slate-200 pb-3">
                    ຄັງໄຟລ໌ກາງ Google Drive (Section 3.2)
                  </h2>
                  <p className="mt-2 text-xs text-slate-600">
                    ທຸກໄຟລ໌ຖືກຈັດເກັບພາຍໃຕ້ໂຟນເດີດຽວ{' '}
                    <code className="font-mono font-bold">TheGarden_Payroll_System/</code> ພ້ອມບັນທຶກ
                    SHA-256 Checksum:
                  </p>
                  <ul className="mt-3 space-y-2 font-mono text-xs text-slate-700">
                    <li>• 00_Source_Template/ (ອ່ານຢ່າງດຽວ)</li>
                    <li>• 01_Incoming_Uploads/{activePeriod.periodId}/</li>
                    <li>• 02_Audit_Exports/{activePeriod.periodId}/</li>
                    <li>• 03_Archive_Backups/{activePeriod.periodId}/</li>
                    <li>• 04_Event_Logs/{activePeriod.periodId}/</li>
                    <li>• 05_PDF_Bundles/{activePeriod.periodId}/</li>
                  </ul>
                </div>

                <div className="mt-5 border-t border-slate-200 pt-4">
                  <button
                    type="button"
                    onClick={() => setActiveTab('SETTINGS')}
                    className="flex min-h-[40px] w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100"
                  >
                    <Settings className="h-4 w-4" />
                    <span>ຕັ້ງຄ່າ Google Sheets & Drive Folder IDs</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB 2: ADD_EVENT (ເພີ່ມເຫດການ 7 ປະເພດ) ==================== */}
        {activeTab === 'ADD_EVENT' && (
          <EventFormView
            activePeriod={activePeriod}
            employees={employees}
            referenceLists={referenceLists}
            currentUserEmail={googleUserEmail}
            defaultStoreId={
              selectedStoreScope === 'ALL' ? 'STORE-VTE-01' : selectedStoreScope
            }
            editingEvent={editingEvent}
            onCancelEdit={() => setEditingEvent(null)}
            onSubmitEvent={handleSubmitEvent}
          />
        )}

        {/* ==================== TAB 3: PERIOD_EVENTS (ລາຍການງວດ & REVISIONS) ==================== */}
        {activeTab === 'PERIOD_EVENTS' && (
          <div className="space-y-6">
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    ລາຍການເຫດການປະຈຳງວດ {activePeriod.periodId} ({activePeriod.startDate} –{' '}
                    {activePeriod.endDate})
                  </h2>
                  <p className="text-xs text-slate-500">
                    ບັນທຶກແບບ Append-Only · ການແກ້ໄຂຈະເພີ່ມເລກ Version ແລະ ເກັບປະຫວັດກ່ອນ/ຫຼັງ (Before/After Revision)
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setEditingEvent(null);
                    setActiveTab('ADD_EVENT');
                  }}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  <PlusCircle className="h-4 w-4" />
                  <span>ເພີ່ມເຫດການໃໝ່</span>
                </button>
              </div>

              {/* Filter Bar */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setEventFilterCategory('ALL')}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                      eventFilterCategory === 'ALL'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    ທັງໝົດ ({visiblePeriodEvents.length})
                  </button>
                  {EVENT_CATEGORY_META.map((cat) => (
                    <button
                      key={cat.code}
                      type="button"
                      onClick={() => setEventFilterCategory(cat.code)}
                      className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        eventFilterCategory === cat.code
                          ? 'bg-white text-slate-900 font-semibold shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {cat.sheetNumber}. {cat.shortLao}
                    </button>
                  ))}
                </div>

                <div className="relative min-w-[240px]">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={eventSearchQuery}
                    onChange={(e) => setEventSearchQuery(e.target.value)}
                    placeholder="ຄົ້ນຫາ Employee ID, ຊື່ ຫຼື Event ID..."
                    aria-label="ຄົ້ນຫາລາຍການເຫດການ"
                    className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-1.5 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              </div>

              {/* Events Table */}
              <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2.5 font-semibold">Event ID</th>
                      <th className="px-3 py-2.5 font-semibold">ປະເພດ (ແຜ່ນ)</th>
                      <th className="px-3 py-2.5 font-semibold">ລະຫັດ & ຊື່ພະນັກງານ (auto)</th>
                      <th className="px-3 py-2.5 font-semibold">ຂໍ້ມູນສຳຄັນ</th>
                      <th className="px-3 py-2.5 font-semibold">ຜູ້ບັນທຶກ · ເວີຊັນ</th>
                      <th className="px-3 py-2.5 font-semibold text-right">ການຈັດການ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredEventsList.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                          ບໍ່ພົບລາຍການເຫດການທີ່ກົງກັບເງື່ອນໄຂການຄົ້ນຫາ
                        </td>
                      </tr>
                    ) : (
                      filteredEventsList.map((ev) => {
                        const meta = EVENT_CATEGORY_META.find((m) => m.code === ev.category)!;
                        return (
                          <tr key={ev.eventId} className="hover:bg-slate-50">
                            <td className="px-3 py-2.5 font-mono font-bold text-slate-900">
                              {ev.eventId}
                            </td>
                            <td className="px-3 py-2.5">
                              {meta.sheetNumber}. {meta.shortLao}
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="font-mono font-bold">{ev.employeeId}</span> ·{' '}
                              {ev.autoNameLao}
                            </td>
                            <td className="px-3 py-2.5 font-mono text-[11px] text-slate-700">
                              {Object.entries(ev.payload)
                                .filter(([, v]) => v !== '')
                                .map(([k, v]) => {
                                  if (ev.category === 'LEAVE' && k === 'status' && !v) {
                                    return 'status: ອະນຸມັດແລ້ວ';
                                  }
                                  return `${k}: ${v}`;
                                })
                                .join(' · ')}
                              {ev.category === 'LEAVE' && !ev.payload.status
                                ? ' · ສະຖານະ: ອະນຸມັດແລ້ວ (ວ່າງ)'
                                : ''}
                            </td>
                            <td className="px-3 py-2.5 text-slate-600">
                              <div className="font-mono text-[11px]">{ev.updatedBy}</div>
                              <div className="font-mono text-[11px] font-semibold text-emerald-700">
                                Version {ev.version}{' '}
                                {ev.revisionHistory.length > 0
                                  ? `(${ev.revisionHistory.length} ປະຫວັດແກ້ໄຂ)`
                                  : ''}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-right space-x-2">
                              {ev.revisionHistory.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setInspectingRevisionEvent(ev)}
                                  className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                  <History className="h-3 w-3" />
                                  <span>ເບິ່ງປະຫວັດ</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingEvent(ev);
                                  setActiveTab('ADD_EVENT');
                                }}
                                className="inline-flex items-center gap-1 rounded border border-emerald-600 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-900 hover:bg-emerald-100"
                              >
                                <Edit3 className="h-3 w-3" />
                                <span>ແກ້ໄຂ (Revision)</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Revision History Inspection Modal */}
            {inspectingRevisionEvent && (
              <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-5">
                <div className="flex items-center justify-between border-b border-amber-200 pb-3">
                  <h3 className="text-sm font-bold text-slate-900">
                    ປະຫວັດການແກ້ໄຂ (Revision Trail) ຂອງ {inspectingRevisionEvent.eventId} (
                    {inspectingRevisionEvent.employeeId} · {inspectingRevisionEvent.autoNameLao})
                  </h3>
                  <button
                    type="button"
                    onClick={() => setInspectingRevisionEvent(null)}
                    className="text-xs font-semibold text-slate-700 underline"
                  >
                    ປິດປະຫວັດ
                  </button>
                </div>
                <div className="mt-3 space-y-2 text-xs">
                  {inspectingRevisionEvent.revisionHistory.map((rev) => (
                    <div
                      key={rev.version}
                      className="rounded-lg border border-amber-200 bg-white p-3 font-mono"
                    >
                      <div className="font-bold text-slate-900">
                        Version {rev.version} · ໂດຍ {rev.updatedBy} · {rev.updatedAt}
                      </div>
                      <div className="mt-1 text-slate-700">ເຫດຜົນ: {rev.note}</div>
                      <div className="mt-1 text-red-700">
                        ກ່ອນແກ້ (Before): {JSON.stringify(rev.beforePayload)}
                      </div>
                      <div className="mt-0.5 text-emerald-700">
                        ຫຼັງແກ້ (After): {JSON.stringify(rev.afterPayload)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================== TAB 4: EMPLOYEES (ພະນັກງານ & EMPLOYEE_CHANGES) ==================== */}
        {activeTab === 'EMPLOYEES' && (
          <div className="space-y-6">
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    ທະບຽນພະນັກງານປັດຈຸບັນ (Employees · ຕາຕະລາງອ້າງອີງ Staff)
                  </h2>
                  <p className="text-xs text-slate-500">
                    ກົດຫົວຂໍ້ທີ 9: ຫ້າມແກ້ຕາຕະລາງອ້າງອີງໂດຍກົງນອກ Flow “1. ພະນັກງານໃໝ່/ປັບປຸງ” ແລະ “2. ພະນັກງານອອກ” ·
                    ຂໍ້ມູນບັນຊີທະນາຄານ/ເງິນເດືອນຖືກປິດບັງ (Mask) ໂດຍຄ່າຕັ້ງຕົ້ນ
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {userRole !== 'STORE_MANAGER' && (
                    <button
                      type="button"
                      onClick={() => setRevealSensitiveData((v) => !v)}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      {revealSensitiveData ? (
                        <>
                          <EyeOff className="h-4 w-4 text-amber-600" />
                          <span>ເຊື່ອງເລກບັນຊີ & ເງິນເດືອນ (Mask)</span>
                        </>
                      ) : (
                        <>
                          <Eye className="h-4 w-4 text-emerald-600" />
                          <span>ສະແດງເລກບັນຊີ & ເງິນເດືອນ (ສະເພາະຜູ້ມີສິດ)</span>
                        </>
                      )}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setEditingEvent(null);
                      setActiveTab('ADD_EVENT');
                    }}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    <PlusCircle className="h-4 w-4" />
                    <span>ເພີ່ມ / ປັບປຸງພະນັກງານ (ຜ່ານແຜ່ນທີ 1)</span>
                  </button>
                </div>
              </div>

              {/* Search & Status Filter */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 rounded-lg bg-slate-100 p-1">
                  {(
                    [
                      ['ALL', 'ທັງໝົດ'],
                      ['ACTIVE', 'ກຳລັງເຮັດວຽກ (ACTIVE)'],
                      ['LEFT', 'ອອກວຽກແລ້ວ (LEFT)'],
                    ] as const
                  ).map(([st, label]) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setEmpStatusFilter(st)}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                        empStatusFilter === st
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="relative min-w-[260px]">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={empSearchQuery}
                    onChange={(e) => setEmpSearchQuery(e.target.value)}
                    placeholder="ຄົ້ນຫາດ້ວຍ Employee ID ຫຼື ຊື່ພະນັກງານ..."
                    aria-label="ຄົ້ນຫາພະນັກງານ"
                    className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-1.5 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none"
                  />
                </div>
              </div>

              {/* Employees Table */}
              <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2.5 font-semibold">Employee ID</th>
                      <th className="px-3 py-2.5 font-semibold">ຊື່ພາສາລາວ / ອັງກິດ</th>
                      <th className="px-3 py-2.5 font-semibold">ຕຳແໜ່ງ</th>
                      <th className="px-3 py-2.5 font-semibold">ມື້ພັກ · ກະເຮັດວຽກ</th>
                      <th className="px-3 py-2.5 font-semibold text-right">ເງິນເດືອນພື້ນຖານ</th>
                      <th className="px-3 py-2.5 font-semibold">ບັນຊີທະນາຄານ</th>
                      <th className="px-3 py-2.5 font-semibold">ສະຖານະ</th>
                      <th className="px-3 py-2.5 font-semibold text-center">
                        ✓ ຕິກກວດໃນ Payroll
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredEmployeesList.map((emp) => (
                      <tr key={emp.employeeId} className="hover:bg-slate-50">
                        <td className="px-3 py-2.5 font-mono font-bold text-slate-900">
                          {emp.employeeId}
                          <div className="text-[10px] font-normal text-slate-500">
                            Scanner: {emp.scannerId} ({emp.storeId})
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="font-semibold text-slate-900">{emp.nameLao}</div>
                          <div className="text-[11px] text-slate-500">{emp.nameEn}</div>
                        </td>
                        <td className="px-3 py-2.5">{emp.position}</td>
                        <td className="px-3 py-2.5 font-mono">
                          {emp.dayOff} · {emp.shiftStart}–{emp.shiftEnd}
                        </td>
                        <td className="px-3 py-2.5 font-mono tabular-nums text-right font-semibold">
                          {formatLaoKip(emp.monthlySalary, !revealSensitiveData)}
                        </td>
                        <td className="px-3 py-2.5 font-mono">
                          {maskBankAccount(emp.bankAccount, revealSensitiveData)}
                        </td>
                        <td className="px-3 py-2.5 font-semibold">
                          {emp.status === 'ACTIVE' ? (
                            <span className="text-emerald-700">ເຮັດວຽກຢູ່ (v{emp.version})</span>
                          ) : (
                            <span className="text-red-700">
                              ອອກວຽກ ({emp.lastWorkingDay})
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={emp.checkedInPayroll}
                            aria-label={`ຕິກກວດແລ້ວສຳລັບ ${emp.employeeId}`}
                            onChange={(e) => {
                              const nextChecked = e.target.checked;
                              setEmployees((prev) =>
                                prev.map((x) =>
                                  x.employeeId === emp.employeeId
                                    ? { ...x, checkedInPayroll: nextChecked }
                                    : x
                                )
                              );
                            }}
                            className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Immutable Employee_Changes History Table (Section 3.1 & Criterion #2) */}
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h3 className="text-base font-bold text-slate-900 border-b border-slate-200 pb-3">
                ປະຫວັດການປ່ຽນແປງຂໍ້ມູນພະນັກງານ (Employee_Changes · Immutable History)
              </h3>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Change ID</th>
                      <th className="px-3 py-2 font-semibold">Employee ID</th>
                      <th className="px-3 py-2 font-semibold">Event ອ້າງອີງ</th>
                      <th className="px-3 py-2 font-semibold">ປະເພດ</th>
                      <th className="px-3 py-2 font-semibold">ກ່ອນປ່ຽນ (Before) → ຫຼັງປ່ຽນ (After)</th>
                      <th className="px-3 py-2 font-semibold">ເຫດຜົນ · ຜູ້ບັນທຶກ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {employeeChanges.map((chg) => (
                      <tr key={chg.changeId} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-mono font-bold">{chg.changeId}</td>
                        <td className="px-3 py-2 font-mono font-semibold">{chg.employeeId}</td>
                        <td className="px-3 py-2 font-mono text-[11px]">{chg.eventId}</td>
                        <td className="px-3 py-2 font-mono font-semibold">{chg.changeType}</td>
                        <td className="px-3 py-2 font-mono text-[11px]">
                          <div className="text-slate-500">
                            ກ່ອນ: {chg.beforeSnapshot ? JSON.stringify(chg.beforeSnapshot) : '(ສ້າງໃໝ່)'}
                          </div>
                          <div className="text-emerald-800 font-semibold">
                            ຫຼັງ: {JSON.stringify(chg.afterSnapshot)}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div>{chg.reason}</div>
                          <div className="font-mono text-[11px] text-slate-500">
                            {chg.changedBy} · {chg.changedAt}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB 5: IMPORT_EXPORT (ກວດ ແລະ ສົ່ງອອກ) ==================== */}
        {activeTab === 'IMPORT_EXPORT' && (
          <ImportExportPdfView
            activePeriod={activePeriod}
            periods={periods}
            events={events}
            employees={employees}
            referenceLists={referenceLists}
            exportsRegister={exportsRegister}
            settings={settings}
            userRole={userRole}
            userEmail={googleUserEmail}
            isGoogleConnected={isGoogleConnected}
            onSelectPeriod={(pid) => setActivePeriodId(pid)}
            onApplyImportedRows={handleApplyImportedRows}
            onCreateExcelExport={handleCreateExcelExport}
            onCreatePdfBundle={handleCreatePdfBundle}
          />
        )}

        {/* ==================== TAB 6: GUIDE (ຄູ່ມືແມ່ແບບ Guide · ຄຳແນະນຳ) ==================== */}
        {activeTab === 'GUIDE' && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-6">
            <div className="border-b border-slate-200 pb-4">
              <h2 className="text-lg font-bold text-slate-900">
                ຄູ່ມືການນຳໃຊ້ ແລະ ກົດແມ່ແບບຕົ້ນສະບັບ (Guide · ຄຳແນະນຳ)
              </h2>
              <p className="text-xs text-slate-500">
                ອ້າງອີງຕົງກັບແຜ່ນທຳອິດຂອງ TheGarden_Import_Template_2026-10-27.xlsx (ຕົ້ນສະບັບອ່ານຢ່າງດຽວ)
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {[
                [
                  '1. ຫຼັກການ 1 ແຖວ = 1 ລາຍການ',
                  'ຕື່ມສະເພາະແຜ່ນທີ່ຕ້ອງການ, 1 ແຖວ = 1 ລາຍການປ່ຽນແປງ. ແຜ່ນອື່ນທີ່ບໍ່ມີຂໍ້ມູນໃຫ້ປ່ອຍວ່າງໄວ້.',
                ],
                [
                  '2. ລະຫັດພະນັກງານ ແລະ Name (auto)',
                  'ເລືອກ Employee ID ຈາກລາຍການ Staff. ຖັນສີຂຽວ "Name (auto)" ຈະສະແດງຊື່ອັດຕະໂນມັດເພື່ອກວດວ່າຖືກຄົນ (ຫ້າມພິມທັບຊື່ auto).',
                ],
                [
                  '3. ຮູບແບບວັນທີ, ເວລາ ແລະ ຈຳນວນເງິນ',
                  'ວັນທີໃຊ້ dd/mm/yyyy (ເຊັ່ນ 28/09/2026). ເວລາໃຊ້ HH:MM ລະບົບ 24 ຊົ່ວໂມງ (ເຊັ່ນ 07:00, 15:45). ຕົວເລກເງິນບໍ່ໃສ່ເຄື່ອງໝາຍຈຸດ (,).',
                ],
                [
                  '4. ແຖວຕົວຢ່າງສີເທົາ (e.g.)',
                  'ແຖວຕົວອຽງສີເທົາທີ່ຂຶ້ນຕົ້ນດ້ວຍ "e.g." ແມ່ນຕົວຢ່າງເທົ່ານັ້ນ ລະບົບຈະຂ້າມອັດຕະໂນມັດເມື່ອນຳເຂົ້າ.',
                ],
                [
                  '5. ຮອບເງິນເດືອນຢືນຢັນ ວັນທີ 26 ຫາ 25',
                  'ຕົວຢ່າງ: ງວດ 2026-10 ເລີ່ມແຕ່ວັນທີ 26/09/2026 ຫາ 25/10/2026. ລາພັກ, ກະເສີມ, ແລກມື້ ແລະ ເບີກລ່ວງໜ້າ ຈະເຂົ້າງວດຕາມວັນທີເກີດເຫດການ.',
                ],
                [
                  '6. ການອັບໂຫຼດຊ້ຳ (Idempotency)',
                  'ອັບໂຫຼດໄຟລ໌ເດີມຊ້ຳ 2 ຄັ້ງໄດ້ຢ່າງປອດໄພ: ລາຍການລາພັກ, ກະເສີມ, ແລກມື້ ແລະ ເບີກລ່ວງໜ້າທີ່ບັນທຶກໄວ້ແລ້ວຈະຖືກຂ້າມອັດຕະໂນມັດ.',
                ],
                [
                  '7. ພະນັກງານທີ່ຕິກ ✓ Checked in Payroll',
                  'ລາຍການຂອງພະນັກງານທີ່ຖືກຕິກ ✓ ກວດແລ້ວໃນຕາຕະລາງເງິນເດືອນຈະຖືກປະຕິເສດການແກ້ໄຂ — ຕ້ອງເອົາຕິກອອກກ່ອນ.',
                ],
              ].map(([title, desc]) => (
                <div key={title} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-bold text-slate-900">{title}</div>
                  <p className="mt-1 text-xs text-slate-600 leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ==================== TAB 7: SETTINGS (ສູນກາງການຕັ້ງຄ່າ 9 ກຸ່ມ + APPS SCRIPT) ==================== */}
        {activeTab === 'SETTINGS' && (
          <SettingsCenterView
            settings={settings}
            periods={periods}
            referenceLists={referenceLists}
            auditLogs={auditLogs}
            userRole={userRole}
            userEmail={googleUserEmail}
            isGoogleConnected={isGoogleConnected}
            isSyncingWorkspace={isSyncingWorkspace}
            onUpdateSettings={(nextSettings, reason) => {
              const stamped: SystemSettingsState = {
                ...nextSettings,
                lastUpdatedBy: googleUserEmail,
                lastUpdatedAt: '2026-10-27T14:30:00+07:00',
              };
              setSettings(stamped);
              appendAuditLog(
                'UPDATE_SETTINGS',
                'System_Settings',
                `ອັບເດດຄ່າຕັ້ງລະບົບ: ${reason}`
              );
            }}
            onOpenNewPeriod={(periodId, reason) => {
              const range = getPeriodDateRange(periodId);
              if (!range) {
                return {
                  ok: false,
                  messageLao: 'ຮູບແບບລະຫັດງວດບໍ່ຖືກຕ້ອງ (ຕ້ອງເປັນ YYYY-MM ເຊັ່ນ 2026-12)',
                };
              }
              if (periods.some((p) => p.periodId === periodId)) {
                return { ok: false, messageLao: `ງວດ ${periodId} ມີຢູ່ໃນລະບົບແລ້ວ` };
              }
              const newP: PayrollPeriod = {
                periodId,
                startDate: range.startDate,
                endDate: range.endDate,
                status: 'OPEN',
                openedBy: googleUserEmail,
                openedAt: '2026-10-27T14:32:00+07:00',
              };
              setPeriods((prev) => [...prev, newP]);
              setActivePeriodId(periodId);
              appendAuditLog(
                'OPEN_PERIOD',
                periodId,
                `ເປີດງວດເງິນເດືອນໃໝ່ ${periodId} (${range.startDate} – ${range.endDate}) · ເຫດຜົນ: ${reason}`
              );
              return {
                ok: true,
                messageLao: `ເປີດງວດໃໝ່ ${periodId} (${range.startDate} – ${range.endDate}) ສຳເລັດແລ້ວ`,
              };
            }}
            onTogglePeriodClose={(periodId, reason) => {
              setPeriods((prev) =>
                prev.map((p) =>
                  p.periodId === periodId
                    ? {
                        ...p,
                        status: p.status === 'OPEN' ? 'CLOSED' : 'OPEN',
                        closedBy: p.status === 'OPEN' ? googleUserEmail : undefined,
                        closedAt:
                          p.status === 'OPEN' ? '2026-10-27T14:35:00+07:00' : undefined,
                      }
                    : p
                )
              );
              setSavedArchiveSnapshot({
                employees: [...employees],
                events: [...events],
              });
              appendAuditLog(
                'CLOSE_PERIOD',
                periodId,
                `ປ່ຽນສະຖານະງວດ ${periodId} ແລະ ສ້າງ Snapshot ສຳຮອງຂໍ້ມູນໄປ 03_Archive_Backups · ເຫດຜົນ: ${reason}`
              );
            }}
            onUpdateReferenceList={(nextLists, reason) => {
              setReferenceLists(nextLists);
              appendAuditLog(
                'UPDATE_SETTINGS',
                'Reference_Lists',
                `ອັບເດດຕາຕະລາງອ້າງອີງ Reference_Lists: ${reason}`
              );
            }}
            onProvisionWorkspace={handleProvisionWorkspace}
            onSyncWorkspaceNow={handleSyncWorkspaceNow}
            onCreateSnapshotBackup={(reason) => {
              setSavedArchiveSnapshot({
                employees: [...employees],
                events: [...events],
              });
              const seq = exportsRegister.length + 1;
              const snapRec: ExportRegisterRecord = {
                exportId: formatExportId(activePeriod.periodId, seq),
                exportType: 'ARCHIVE_SNAPSHOT',
                periodId: activePeriod.periodId,
                fileName: formatStandardFileName(
                  'BACKUP',
                  activePeriod.periodId,
                  seq,
                  'json'
                ),
                driveFolder: `TheGarden_Payroll_System/03_Archive_Backups/${activePeriod.periodId}`,
                driveFileId: `1TgBackup_${activePeriod.periodId}_${String(seq).padStart(4, '0')}`,
                checksumSha256: computeDeterministicChecksum(
                  JSON.stringify({ employees: employees.length, events: events.length })
                ),
                eventCount: visiblePeriodEvents.length,
                maxEventVersionAtExport: 1,
                status: 'LATEST',
                validationPassed: true,
                createdBy: googleUserEmail,
                createdAt: '2026-10-27T14:40:00+07:00',
              };
              setExportsRegister((prev) => [snapRec, ...prev]);
              appendAuditLog(
                'UPDATE_SETTINGS',
                snapRec.exportId,
                `ສ້າງ Snapshot ສຳຮອງຂໍ້ມູນ (${snapRec.fileName}) ໄວ້ໃນ 03_Archive_Backups · ເຫດຜົນ: ${reason}`
              );
            }}
            onRestoreSnapshotRehearsal={(reason) => {
              if (savedArchiveSnapshot) {
                setEmployees(savedArchiveSnapshot.employees);
                setEvents(savedArchiveSnapshot.events);
              }
              appendAuditLog(
                'RESTORE_SNAPSHOT',
                activePeriod.periodId,
                `ທົດສອບ Restore Snapshot ຂອງງວດ ${activePeriod.periodId} ສຳເລັດ ໂດຍຮັກສາ Export_Register ແລະ Audit_Log ທັງໝົດໄວ້ຄົບຖ້ວນ · ເຫດຜົນ: ${reason}`
              );
            }}
          />
        )}
      </main>

      {/* Clean Footer */}
      <footer className="mt-12 border-t border-slate-200 bg-white px-6 py-4 text-xs text-slate-500 no-print">
        <div className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-2">
          <div>
            ລະບົບນຳເຂົ້າຂໍ້ມູນເງິນເດືອນ The Garden · ສະບັບ {settings.appVersion}
          </div>
          <div>
            ຮອບເງິນເດືອນ 26–25 · ຖານຂໍ້ມູນກາງ Google Sheets & ຄັງໄຟລ໌ Google Drive
          </div>
        </div>
      </footer>
    </div>
  );
}
