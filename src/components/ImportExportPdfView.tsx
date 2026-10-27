import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  FolderUp,
  Printer,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import {
  EmployeeRecord,
  EventCategoryCode,
  ExportRegisterRecord,
  PayrollEventRecord,
  PayrollPeriod,
  ReferenceLists,
  UserRole,
  computeDeterministicChecksum,
  formatLaoKip,
  validatePreExport,
} from '../utils/payrollRules';
import {
  ExcelImportPreviewResult,
  ParsedImportRow,
  generateTemplatePreservingWorkbook,
  parseExcelImportBuffer,
} from '../utils/excelTemplateEngine';
import { EVENT_CATEGORY_META, SystemSettingsState } from '../utils/seedData';
import { ConfirmDialogModal } from './ConfirmDialogModal';

export interface ImportExportPdfViewProps {
  activePeriod: PayrollPeriod;
  periods: PayrollPeriod[];
  events: PayrollEventRecord[];
  employees: EmployeeRecord[];
  referenceLists: ReferenceLists;
  exportsRegister: ExportRegisterRecord[];
  settings: SystemSettingsState;
  userRole: UserRole;
  userEmail: string;
  isGoogleConnected: boolean;
  onSelectPeriod: (periodId: string) => void;
  onApplyImportedRows: (rows: ParsedImportRow[], fileName: string) => { importedCount: number };
  onCreateExcelExport: (params: {
    periodId: string;
    bytes: Uint8Array;
    checksumSha256: string;
    eventCount: number;
  }) => Promise<ExportRegisterRecord>;
  onCreatePdfBundle: (params: {
    periodId: string;
    includedCategories: EventCategoryCode[];
    orientation: 'PORTRAIT' | 'LANDSCAPE';
  }) => Promise<ExportRegisterRecord>;
}

export const ImportExportPdfView: React.FC<ImportExportPdfViewProps> = ({
  activePeriod,
  periods,
  events,
  employees,
  referenceLists,
  exportsRegister,
  settings,
  userRole,
  userEmail,
  isGoogleConnected,
  onSelectPeriod,
  onApplyImportedRows,
  onCreateExcelExport,
  onCreatePdfBundle,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importPreview, setImportPreview] = useState<ExcelImportPreviewResult | null>(null);
  const [isParsingImport, setIsParsingImport] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);

  // PDF Bundle options
  const [selectedPdfCats, setSelectedPdfCats] = useState<EventCategoryCode[]>(
    settings.pdfIncludedSections
  );
  const [pdfOrientation, setPdfOrientation] = useState<'PORTRAIT' | 'LANDSCAPE'>('PORTRAIT');
  const [showPdfPreview, setShowPdfPreview] = useState<boolean>(false);

  // Confirmation modal state
  const [confirmAction, setConfirmAction] = useState<{
    type: 'APPLY_IMPORT' | 'CREATE_EXCEL' | 'CREATE_PDF';
    title: string;
    description: string;
    items: string[];
  } | null>(null);

  const periodEvents = useMemo(
    () => events.filter((e) => e.periodId === activePeriod.periodId && e.status !== 'SUPERSEDED'),
    [events, activePeriod.periodId]
  );

  const preExportCheck = useMemo(
    () => validatePreExport(activePeriod, events, employees),
    [activePeriod, events, employees]
  );

  const handleFileUpload = async (file: File) => {
    setIsParsingImport(true);
    setStatusMessage(null);
    try {
      const arrayBuf = await file.arrayBuffer();
      const preview = await parseExcelImportBuffer(
        arrayBuf,
        file.name,
        activePeriod.periodId,
        employees,
        events
      );
      setImportPreview(preview);
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: `ບໍ່ສາມາດອ່ານໄຟລ໌ Excel ໄດ້: ${err?.message || 'ຮູບແບບໄຟລ໌ບໍ່ຖືກຕ້ອງ'}`,
      });
    } finally {
      setIsParsingImport(false);
    }
  };

  /**
   * Simulate uploading the current period's template workbook (useful for testing duplicate detection & roundtrip)
   */
  const handleSimulateTemplateUpload = async (includeDemoNewRow: boolean) => {
    setIsParsingImport(true);
    setStatusMessage(null);
    try {
      const simulatedEvents = [...periodEvents];
      if (includeDemoNewRow) {
        simulatedEvents.push({
          eventId: 'TEMP-DEMO',
          periodId: activePeriod.periodId,
          category: 'LEAVE',
          employeeId: 'EMP-001',
          autoNameLao: 'ທ້າວ ສົມຊາຍ ພົມມະວົງ',
          storeId: 'STORE-VTE-01',
          payload: {
            leaveType: 'Annual leave · ລາພັກປະຈຳປີ',
            fromDate: '20/10/2026',
            toDate: '21/10/2026',
            reason: 'ລາພັກປະຈຳປີຕາມແຜນ',
            status: 'Approved',
          },
          version: 1,
          idempotencyKey: 'TEMP',
          status: 'VALID',
          createdBy: userEmail,
          createdAt: new Date().toISOString(),
          updatedBy: userEmail,
          updatedAt: new Date().toISOString(),
          revisionHistory: [],
        });
      }

      const bytes = await generateTemplatePreservingWorkbook(
        activePeriod.periodId,
        simulatedEvents,
        employees,
        referenceLists,
        true
      );
      const preview = await parseExcelImportBuffer(
        bytes,
        `TheGarden_Import_Template_${activePeriod.periodId}.xlsx`,
        activePeriod.periodId,
        employees,
        events
      );
      setImportPreview(preview);
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: `ເກີດຂໍ້ຜິດພາດໃນການກວດສອບແມ່ແບບ: ${err?.message}`,
      });
    } finally {
      setIsParsingImport(false);
    }
  };

  const triggerDownloadBytes = (bytes: Uint8Array, fileName: string) => {
    const blob = new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadBlankTemplate = async () => {
    const bytes = await generateTemplatePreservingWorkbook(
      activePeriod.periodId,
      [],
      employees,
      referenceLists,
      false
    );
    triggerDownloadBytes(bytes, `TheGarden_Import_Template_2026-10-27.xlsx`);
    setStatusMessage({
      type: 'success',
      text: 'ດາວໂຫຼດແມ່ແບບຕົ້ນສະບັບ TheGarden_Import_Template_2026-10-27.xlsx (9 ແຜ່ນ + Lists ຊ່ອນ) ສຳເລັດແລ້ວ',
    });
  };

  const executeConfirmedAction = async () => {
    if (!confirmAction) return;
    const actionType = confirmAction.type;
    setConfirmAction(null);

    if (actionType === 'APPLY_IMPORT' && importPreview) {
      const res = onApplyImportedRows(importPreview.readyToImport, importPreview.fileName);
      setStatusMessage({
        type: 'success',
        text: `ນຳເຂົ້າຂໍ້ມູນສຳເລັດ ${res.importedCount} ລາຍການ ແລະ ຂ້າມລາຍການຊ້ຳ ${importPreview.skippedDuplicates.length} ລາຍການ (ບັນທຶກລົງ Audit_Log ແລ້ວ)`,
      });
      // Re-run preview against updated events to show that re-applying skips all as duplicates
      setImportPreview(null);
    } else if (actionType === 'CREATE_EXCEL') {
      const bytes = await generateTemplatePreservingWorkbook(
        activePeriod.periodId,
        events,
        employees,
        referenceLists,
        true
      );
      const checksum = computeDeterministicChecksum(
        `${activePeriod.periodId}:${periodEvents.length}:${periodEvents
          .map((e) => `${e.eventId}.v${e.version}`)
          .join(',')}`
      );
      const rec = await onCreateExcelExport({
        periodId: activePeriod.periodId,
        bytes,
        checksumSha256: checksum,
        eventCount: periodEvents.length,
      });
      triggerDownloadBytes(bytes, rec.fileName);
      setStatusMessage({
        type: 'success',
        text: `ສ້າງ ແລະ ດາວໂຫຼດໄຟລ໌ Excel ສົ່ງກວດ ${rec.fileName} (${rec.exportId}) ສຳເລັດ · Checksum SHA-256 ຖືກບັນທຶກໃນ Export_Register ແລ້ວ`,
      });
    } else if (actionType === 'CREATE_PDF') {
      const rec = await onCreatePdfBundle({
        periodId: activePeriod.periodId,
        includedCategories: selectedPdfCats,
        orientation: pdfOrientation,
      });
      setShowPdfPreview(true);
      setStatusMessage({
        type: 'success',
        text: `ສ້າງຊຸດເອກະສານ PDF A4 (${rec.bundleId} · ${rec.fileName}) ໄວ້ໃນ 05_PDF_Bundles/${activePeriod.periodId} ສຳເລັດແລ້ວ — ກົດປຸ່ມ "ພິມ / ບັນທຶກເປັນ PDF (A4)" ດ້ານລຸ່ມເພື່ອພິມອອກ`,
      });
    }
  };

  const togglePdfCategory = (code: EventCategoryCode) => {
    setSelectedPdfCats((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  return (
    <div className="space-y-6">
      {statusMessage && (
        <div
          role="status"
          className={`flex items-start gap-3 rounded-xl border p-4 text-sm no-print ${
            statusMessage.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
              : statusMessage.type === 'warning'
              ? 'border-amber-200 bg-amber-50 text-amber-950'
              : 'border-red-200 bg-red-50 text-red-950'
          }`}
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <div className="font-medium">{statusMessage.text}</div>
        </div>
      )}

      {/* ==================== SECTION 8.1: EXCEL IMPORT & 3-BUCKET PREVIEW ==================== */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 no-print">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              1. ນຳເຂົ້າໄຟລ໌ Excel ຕາມແມ່ແບບ (01_Incoming_Uploads/{activePeriod.periodId})
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              ກວດຊື່ແຜ່ນ 1–7, ຂ້າມແຖວຕົວຢ່າງ <code className="font-mono">e.g.</code> ອັດຕະໂນມັດ, ແລະ ແຍກສະແດງ
              “ພ້ອມນຳເຂົ້າ” · “ຂ້າມເພາະຊ້ຳ” · “ຜິດພາດ” ກ່ອນຢືນຢັນຂຽນລົງຖານຂໍ້ມູນກາງ
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadBlankTemplate}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Download className="h-4 w-4 text-slate-600" />
              <span>ດາວໂຫຼດແມ່ແບບຕົ້ນສະບັບ (.xlsx)</span>
            </button>

            <button
              type="button"
              onClick={() => handleSimulateTemplateUpload(true)}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
              <span>ທົດສອບກວດໄຟລ໌ Excel (ລວມລາຍການໃໝ່ + ລາຍການຊ້ຳ)</span>
            </button>

            <button
              type="button"
              onClick={() => handleSimulateTemplateUpload(false)}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap shrink-0"
            >
              <FolderUp className="h-4 w-4 text-amber-600" />
              <span>ທົດສອບອັບໂຫຼດຊ້ຳຄັ້ງທີ 2 (ກວດການຂ້າມອັດຕະໂນມັດ)</span>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileUpload(f);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isParsingImport}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <Upload className="h-4 w-4" />
              <span>ເລືອກໄຟລ໌ .xlsx ຈາກເຄື່ອງ</span>
            </button>
          </div>
        </div>

        {importPreview && (
          <div className="mt-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50 p-3.5">
              <div className="text-xs text-slate-700">
                <span className="font-bold text-slate-900">ຜົນການກວດໄຟລ໌ກ່ອນນຳເຂົ້າ:</span>{' '}
                <span className="font-mono">{importPreview.fileName}</span>
                <span aria-hidden="true"> · </span>
                <span>ງວດເປົ້າໝາຍ: {importPreview.targetPeriodId}</span>
                <span aria-hidden="true"> · </span>
                <span>ພ້ອມນຳເຂົ້າ: {importPreview.readyToImport.length} ແຖວ</span>
                <span aria-hidden="true"> · </span>
                <span>ຂ້າມເພາະຊ້ຳ: {importPreview.skippedDuplicates.length} ແຖວ</span>
                <span aria-hidden="true"> · </span>
                <span>ຜິດພາດ: {importPreview.invalidRows.length} ແຖວ</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setImportPreview(null)}
                  className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  ປິດ Preview
                </button>
                <button
                  type="button"
                  disabled={importPreview.readyToImport.length === 0}
                  onClick={() =>
                    setConfirmAction({
                      type: 'APPLY_IMPORT',
                      title: 'ຢືນຢັນການນຳເຂົ້າຂໍ້ມູນຈາກ Excel ເຂົ້າຖານຂໍ້ມູນກາງ',
                      description: `ລະບົບຈະບັນທຶກສະເພາະລາຍການທີ່ຜ່ານການກວດສອບ (${importPreview.readyToImport.length} ລາຍການ) ລົງໃນ Google Sheets ຖານຂໍ້ມູນກາງ ແລະ ຂ້າມລາຍການທີ່ຊ້ຳ (${importPreview.skippedDuplicates.length} ລາຍການ).`,
                      items: importPreview.readyToImport.map(
                        (r) => `${r.sheetName} · ${r.employeeId} (${r.autoNameLao}) → ງວດ ${r.resolvedPeriodId}`
                      ),
                    })
                  }
                  className="min-h-[38px] rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  ຢືນຢັນນຳເຂົ້າ ({importPreview.readyToImport.length} ລາຍການ)
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2.5 font-semibold">ສະຖານະການກວດ</th>
                    <th className="px-3 py-2.5 font-semibold">ແຜ່ນງານ (Sheet)</th>
                    <th className="px-3 py-2.5 font-semibold">ແຖວ</th>
                    <th className="px-3 py-2.5 font-semibold">Employee ID</th>
                    <th className="px-3 py-2.5 font-semibold">ຊື່ (Name auto)</th>
                    <th className="px-3 py-2.5 font-semibold">ງວດ</th>
                    <th className="px-3 py-2.5 font-semibold">ຄຳອະທິບາຍ / ສາເຫດ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {[
                    ...importPreview.readyToImport,
                    ...importPreview.skippedDuplicates,
                    ...importPreview.invalidRows,
                  ].map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-semibold">
                        {row.bucket === 'READY' && (
                          <span className="text-emerald-700">✓ ພ້ອມນຳເຂົ້າ</span>
                        )}
                        {row.bucket === 'DUPLICATE' && (
                          <span className="text-amber-700">↺ ຂ້າມເພາະຊ້ຳ</span>
                        )}
                        {row.bucket === 'ERROR' && (
                          <span className="text-red-700">✕ ຜິດພາດ (ຂ້າມ)</span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono">{row.sheetName}</td>
                      <td className="px-3 py-2 font-mono tabular-nums">{row.rowIndex}</td>
                      <td className="px-3 py-2 font-mono font-semibold">{row.employeeId}</td>
                      <td className="px-3 py-2">{row.autoNameLao}</td>
                      <td className="px-3 py-2 font-mono">{row.resolvedPeriodId}</td>
                      <td className="px-3 py-2 text-slate-600">{row.reasonLao}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ==================== SECTION 7 & 8.2: PRE-EXPORT CHECKLIST & EXCEL EXPORT ==================== */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-12 no-print">
        {/* Left 5 cols: Pre-Export Validation Checklist */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-3">
              <h2 className="text-base font-bold text-slate-900">
                2. ລາຍການກວດກ່ອນສົ່ງອອກ (Pre-Export Checklist)
              </h2>
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
            </div>

            <ul className="mt-4 space-y-3 text-xs">
              <li className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-700">1. ສະຖານະງວດ {activePeriod.periodId} ເປີດໃຫ້ສົ່ງອອກ</span>
                <span
                  className={`font-semibold ${
                    preExportCheck.periodStatusOk ? 'text-emerald-700' : 'text-red-600'
                  }`}
                >
                  {preExportCheck.periodStatusOk ? '✓ ຜ່ານ (OPEN)' : '✕ ງວດປິດແລ້ວ'}
                </span>
              </li>
              <li className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-700">2. ຟິວບັງຄັບ (*) ແລະ ຮູບແບບວັນທີ/ເວລາຄົບຖ້ວນ</span>
                <span
                  className={`font-semibold ${
                    preExportCheck.noMissingFieldsOk ? 'text-emerald-700' : 'text-red-600'
                  }`}
                >
                  {preExportCheck.noMissingFieldsOk ? '✓ ຜ່ານຄົບຖ້ວນ' : '✕ ພົບຟິວບໍ່ຖືກຕ້ອງ'}
                </span>
              </li>
              <li className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-700">3. ກວດລາຍການຊ້ຳດ້ວຍ Idempotency Key</span>
                <span
                  className={`font-semibold ${
                    preExportCheck.noDuplicateKeysOk ? 'text-emerald-700' : 'text-red-600'
                  }`}
                >
                  {preExportCheck.noDuplicateKeysOk ? '✓ ບໍ່ມີລາຍການຊ້ຳ' : '✕ ພົບລາຍການຊ້ຳ'}
                </span>
              </li>
              <li className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-700">
                  4. ວັນທີເຫດການຢູ່ໃນຮອບ 26–25 ({activePeriod.startDate}–{activePeriod.endDate})
                </span>
                <span
                  className={`font-semibold ${
                    preExportCheck.allDatesInPeriodOk ? 'text-emerald-700' : 'text-red-600'
                  }`}
                >
                  {preExportCheck.allDatesInPeriodOk ? '✓ ກົງຕາມງວດ 100%' : '✕ ວັນທີນອກງວດ'}
                </span>
              </li>
              <li className="flex items-center justify-between pb-1">
                <span className="text-slate-700">5. ລະຫັດພະນັກງານທຸກຄົນມີຢູ່ໃນ Staff ອ້າງອີງ</span>
                <span
                  className={`font-semibold ${
                    preExportCheck.allReferencesFoundOk ? 'text-emerald-700' : 'text-red-600'
                  }`}
                >
                  {preExportCheck.allReferencesFoundOk ? '✓ ພົບຄົບທຸກລະຫັດ' : '✕ ບໍ່ພົບລະຫັດ'}
                </span>
              </li>
            </ul>

            {preExportCheck.issues.length > 0 && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900">
                <div className="font-bold">ລາຍການທີ່ຕ້ອງແກ້ໄຂກ່ອນສົ່ງອອກ:</div>
                <ul className="mt-1 space-y-1">
                  {preExportCheck.issues.map((iss, i) => (
                    <li key={i}>
                      • [{iss.eventId}] {iss.employeeId}: {iss.messageLao}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="mt-6 border-t border-slate-200 pt-4">
            <button
              type="button"
              disabled={!preExportCheck.canExport}
              onClick={() =>
                setConfirmAction({
                  type: 'CREATE_EXCEL',
                  title: `ຢືນຢັນການສ້າງໄຟລ໌ Excel ສົ່ງກວດ ງວດ ${activePeriod.periodId}`,
                  description: `ລະບົບຈະສຳເນົາແມ່ແບບຕົ້ນສະບັບ (9 ແຜ່ນ + Lists ຊ່ອນ) ໂດຍບໍ່ປ່ຽນໂຄງສ້າງ ຫຼື ເພີ່ມຄໍລຳ metadata, ບັນທຶກໄຟລ໌ລົງ 02_Audit_Exports ພ້ອມ SHA-256 Checksum ແລະ ດາວໂຫຼດໄຟລ໌ .xlsx ໃຫ້ທັນທີ.`,
                  items: [
                    `ງວດເງິນເດືອນ: ${activePeriod.periodId} (${activePeriod.startDate} – ${activePeriod.endDate})`,
                    `ຈຳນວນເຫດການທັງໝົດໃນງວດ: ${periodEvents.length} ລາຍການ`,
                    `ຈຳນວນພະນັກງານອ້າງອີງໃນແຜ່ນ Staff: ${employees.length} ຄົນ`,
                    `ໂຟນເດີປາຍທາງ: TheGarden_Payroll_System/02_Audit_Exports/${activePeriod.periodId}`,
                  ],
                })
              }
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <FileSpreadsheet className="h-4 w-4" />
              <span>ສ້າງໄຟລ໌ Excel ສົ່ງກວດ (.xlsx) ຕາມແມ່ແບບ 100%</span>
            </button>
          </div>
        </div>

        {/* Right 7 cols: A4 PDF Bundle Configuration & Generator (Section 8.3) */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-7 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  3. ສ້າງຊຸດເອກະສານ PDF ຂະໜາດ A4 (05_PDF_Bundles/{activePeriod.periodId})
                </h2>
                <p className="text-xs text-slate-500">
                  ມີໜ້າປົກ, ເລກ Bundle ID, ສາລະບານ, ຫົວຕາຕະລາງຊ້ຳທຸກໜ້າ, ຟອນພາສາລາວ Noto Sans Lao ແລະ ຊ່ອງລາຍເຊັນອະນຸມັດ
                </p>
              </div>
              <FileText className="h-5 w-5 text-slate-700" />
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  ທິດທາງໜ້າເຈ້ຍ A4 (ຂອບເຈ້ຍ ≥ 12 mm):
                </label>
                <div className="mt-1.5 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPdfOrientation('PORTRAIT')}
                    className={`min-h-[38px] flex-1 rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                      pdfOrientation === 'PORTRAIT'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-950'
                        : 'border-slate-300 bg-white text-slate-700'
                    }`}
                  >
                    A4 ລວງຕັ້ງ (Portrait - ຄ່າຕັ້ງຕົ້ນ)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPdfOrientation('LANDSCAPE')}
                    className={`min-h-[38px] flex-1 rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                      pdfOrientation === 'LANDSCAPE'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-950'
                        : 'border-slate-300 bg-white text-slate-700'
                    }`}
                  >
                    A4 ລວງນອນ (Landscape ຕາຕະລາງກວ້າງ)
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="pdf-period-select" className="block text-xs font-semibold text-slate-700">
                  ເລືອກງວດເອກະສານ PDF:
                </label>
                <select
                  id="pdf-period-select"
                  value={activePeriod.periodId}
                  onChange={(e) => onSelectPeriod(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono font-semibold text-slate-900"
                >
                  {periods.map((p) => (
                    <option key={p.periodId} value={p.periodId}>
                      ງວດ {p.periodId} ({p.startDate} – {p.endDate}) [{p.status}]
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4">
              <div className="text-xs font-semibold text-slate-700">
                ເລືອກໝວດເອກະສານທີ່ຕ້ອງການລວມໃນຊຸດ PDF ({selectedPdfCats.length}/7 ໝວດ):
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {EVENT_CATEGORY_META.map((cat) => {
                  const checked = selectedPdfCats.includes(cat.code);
                  const count = periodEvents.filter((e) => e.category === cat.code).length;
                  return (
                    <label
                      key={cat.code}
                      className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-xs ${
                        checked
                          ? 'border-emerald-600 bg-emerald-50/50 text-slate-900 font-medium'
                          : 'border-slate-200 bg-white text-slate-600'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => togglePdfCategory(cat.code)}
                          className="rounded border-slate-300 text-emerald-600"
                        />
                        <span>
                          {cat.sheetNumber}. {cat.shortLao}
                        </span>
                      </span>
                      <span className="font-mono text-[11px] text-slate-500">({count})</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={() => setShowPdfPreview((v) => !v)}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <FileText className="h-4 w-4" />
              <span>{showPdfPreview ? 'ເຊື່ອງຕົວຢ່າງ PDF A4' : 'ເບິ່ງຕົວຢ່າງໜ້າເຈ້ຍ PDF A4'}</span>
            </button>

            <button
              type="button"
              disabled={selectedPdfCats.length === 0}
              onClick={() =>
                setConfirmAction({
                  type: 'CREATE_PDF',
                  title: `ຢືນຢັນການສ້າງຊຸດເອກະສານ PDF A4 (ງວດ ${activePeriod.periodId})`,
                  description: `ລະບົບຈະສ້າງເລກ Bundle ID ໃໝ່ (PDF-${activePeriod.periodId}-XXXX), ບັນທຶກລົງໂຟນເດີ 05_PDF_Bundles/${activePeriod.periodId} ແລະ ເປີດໜ້າເອກະສານ A4 ພ້ອມພິມ/ດາວໂຫຼດ.`,
                  items: selectedPdfCats.map((c) => {
                    const m = EVENT_CATEGORY_META.find((x) => x.code === c)!;
                    return `${m.sheetTitle} (${
                      periodEvents.filter((e) => e.category === c).length
                    } ລາຍການ)`;
                  }),
                })
              }
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
              aria-label="ດາວໂຫຼດ PDF"
            >
              <Download className="h-4 w-4" />
              <span>ດາວໂຫຼດ PDF ລວມຊຸດ (A4)</span>
            </button>
          </div>
        </div>
      </section>

      {/* ==================== A4 PDF BUNDLE LIVE PREVIEW & PRINT SHEET ==================== */}
      {showPdfPreview && (
        <section
          className="rounded-xl border border-slate-300 bg-white p-8 shadow-sm"
          aria-label="ຕົວຢ່າງຊຸດເອກະສານ PDF A4"
        >
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4 no-print">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                ຕົວຢ່າງເອກະສານ PDF ລວມຊຸດຂະໜາດ A4 ({pdfOrientation}) · ພ້ອມພິມ ຫຼື ບັນທຶກເປັນ PDF
              </h3>
              <p className="text-xs text-slate-500">
                ຂອບເຈ້ຍ 12 mm · ຟອນພາສາລາວ Noto Sans Lao · ຫົວຕາຕະລາງຊ້ຳອັດຕະໂນມັດເມື່ອຂ້າມໜ້າ
              </p>
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              <Printer className="h-4 w-4" />
              <span>ພິມ / ບັນທຶກເປັນໄຟລ໌ PDF (A4)</span>
            </button>
          </div>

          {/* A4 Cover & Table of Contents Header */}
          <div className="border-b-2 border-slate-900 pb-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs font-mono font-semibold text-slate-500">
                  THE GARDEN NAKED ESPRESSO · PAYROLL AUDIT BUNDLE
                </div>
                <h1 className="mt-1 text-2xl font-bold text-slate-900">
                  ຊຸດເອກະສານກວດສອບຂໍ້ມູນເງິນເດືອນປະຈຳງວດ {activePeriod.periodId}
                </h1>
                <p className="mt-1 text-sm text-slate-700">
                  ຮອບຄິດໄລ່ເງິນເດືອນ (26–25): ວັນທີ {activePeriod.startDate} ຫາ {activePeriod.endDate}
                </p>
              </div>
              <div className="text-right font-mono text-xs text-slate-700">
                <div className="font-bold text-slate-900">
                  Bundle ID: PDF-{activePeriod.periodId}-
                  {String(
                    exportsRegister.filter((x) => x.exportType === 'PDF_BUNDLE').length + 1
                  ).padStart(4, '0')}
                </div>
                <div>ວັນເວລາສ້າງ: 27/10/2026 14:05 (Asia/Vientiane)</div>
                <div>ສະຖານະງວດ: {activePeriod.status}</div>
                <div>ໜ້າທີ 1 / 1 (A4 {pdfOrientation})</div>
              </div>
            </div>

            {/* Table of Contents (ສາລະບານ) */}
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-bold text-slate-900">ສາລະບານເອກະສານໃນຊຸດ (Table of Contents):</div>
              <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2 text-xs text-slate-700">
                {selectedPdfCats.map((code, idx) => {
                  const meta = EVENT_CATEGORY_META.find((m) => m.code === code)!;
                  const count = periodEvents.filter((e) => e.category === code).length;
                  return (
                    <div key={code} className="flex items-center justify-between border-b border-slate-200/70 pb-1">
                      <span>
                        ໝວດທີ {idx + 1}: {meta.sheetTitle}
                      </span>
                      <span className="font-mono font-semibold">{count} ລາຍການ</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Sections per selected category */}
          <div className="mt-6 space-y-6">
            {selectedPdfCats.map((code) => {
              const meta = EVENT_CATEGORY_META.find((m) => m.code === code)!;
              const catEvents = periodEvents.filter((e) => e.category === code);
              return (
                <div key={code} className="space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-300 pb-1.5">
                    <h4 className="text-sm font-bold text-slate-900">
                      {meta.sheetTitle} (ຄໍລຳ {meta.columnsRange})
                    </h4>
                    <span className="font-mono text-xs text-slate-600">
                      ລວມ {catEvents.length} ລາຍການ
                    </span>
                  </div>

                  {catEvents.length === 0 ? (
                    <p className="py-2 text-xs italic text-slate-500">
                      ບໍ່ມີລາຍການເคลື່ອນໄຫວໃນໝວດນີ້ສຳລັບງວດ {activePeriod.periodId}
                    </p>
                  ) : (
                    <table className="w-full border border-slate-300 text-left text-xs">
                      <thead className="bg-slate-100 text-slate-800">
                        <tr>
                          <th className="border border-slate-300 px-2.5 py-1.5 font-semibold">Event ID</th>
                          <th className="border border-slate-300 px-2.5 py-1.5 font-semibold">Employee ID</th>
                          <th className="border border-slate-300 px-2.5 py-1.5 font-semibold">ຊື່ພະນັກງານ (auto)</th>
                          <th className="border border-slate-300 px-2.5 py-1.5 font-semibold">ລາຍລະອຽດຂໍ້ມູນຕາມແມ່ແບບ</th>
                          <th className="border border-slate-300 px-2.5 py-1.5 font-semibold">ເວີຊັນ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {catEvents.map((ev) => (
                          <tr key={ev.eventId}>
                            <td className="border border-slate-300 px-2.5 py-1.5 font-mono">
                              {ev.eventId}
                            </td>
                            <td className="border border-slate-300 px-2.5 py-1.5 font-mono font-semibold">
                              {ev.employeeId}
                            </td>
                            <td className="border border-slate-300 px-2.5 py-1.5">
                              {ev.autoNameLao}
                            </td>
                            <td className="border border-slate-300 px-2.5 py-1.5 font-mono text-[11px]">
                              {Object.entries(ev.payload)
                                .filter(([, v]) => v !== '')
                                .map(([k, v]) => `${k}: ${v}`)
                                .join(' · ')}
                            </td>
                            <td className="border border-slate-300 px-2.5 py-1.5 font-mono text-center">
                              v{ev.version}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>

          {/* Signatory Footer */}
          <div className="mt-10 grid grid-cols-3 gap-6 border-t border-slate-300 pt-6 text-center text-xs">
            <div>
              <div className="font-semibold text-slate-900">{settings.pdfSignatoryPreparedBy}</div>
              <div className="mt-8 border-b border-dashed border-slate-400 mx-6"></div>
              <div className="mt-1 text-slate-500">ລາຍເຊັນຜູ້ສ້າງ / ວັນທີ ____/____/2026</div>
            </div>
            <div>
              <div className="font-semibold text-slate-900">{settings.pdfSignatoryReviewedBy}</div>
              <div className="mt-8 border-b border-dashed border-slate-400 mx-6"></div>
              <div className="mt-1 text-slate-500">ລາຍເຊັນຜູ້ກວດສອບ / ວັນທີ ____/____/2026</div>
            </div>
            <div>
              <div className="font-semibold text-slate-900">{settings.pdfSignatoryApprovedBy}</div>
              <div className="mt-8 border-b border-dashed border-slate-400 mx-6"></div>
              <div className="mt-1 text-slate-500">ລາຍເຊັນຜູ້ອະນຸມັດ / ວັນທີ ____/____/2026</div>
            </div>
          </div>
          <div className="mt-4 text-center text-[11px] text-slate-500">
            {settings.pdfFooterTextLao}
          </div>
        </section>
      )}

      {/* ==================== EXPORT REGISTER TABLE (Section 3.1 & 4.7) ==================== */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 no-print">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              4. ທະບຽນປະຫວັດການສົ່ງອອກ (Export_Register · ຫ້າມລຶບ ຫຼື ຂຽນທັບສະບັບເກົ່າ)
            </h2>
            <p className="text-xs text-slate-500">
              ຖ້າມີການແກ້ໄຂເຫດການຫຼັງສົ່ງອອກ ສະບັບເກົ່າຈະປ່ຽນສະຖານະເປັນ “ມີສະບັບໃໝ່” ອັດຕະໂນມັດ ແລະ ການສົ່ງອອກໃໝ່ຈະໄດ້ເລກລຳດັບໃໝ່ສະເໝີ
            </p>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2.5 font-semibold">Export / Bundle ID</th>
                <th className="px-3 py-2.5 font-semibold">ປະເພດ</th>
                <th className="px-3 py-2.5 font-semibold">ງວດ</th>
                <th className="px-3 py-2.5 font-semibold">ຊື່ໄຟລ໌ມາດຕະຖານໃນ Google Drive</th>
                <th className="px-3 py-2.5 font-semibold">SHA-256 Checksum</th>
                <th className="px-3 py-2.5 font-semibold text-right">ຈຳນວນລາຍການ</th>
                <th className="px-3 py-2.5 font-semibold">ສະຖານະສະບັບ</th>
                <th className="px-3 py-2.5 font-semibold">ຜູ້ສ້າງ · ເວລາ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {exportsRegister.map((exp) => (
                <tr key={exp.exportId} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5 font-mono font-bold text-slate-900">
                    {exp.exportId}
                    {exp.bundleId ? ` / ${exp.bundleId}` : ''}
                  </td>
                  <td className="px-3 py-2.5 font-mono">{exp.exportType}</td>
                  <td className="px-3 py-2.5 font-mono">{exp.periodId}</td>
                  <td className="px-3 py-2.5 font-mono text-slate-800">
                    <div>{exp.fileName}</div>
                    <div className="text-[11px] text-slate-500">
                      {exp.driveFolder} · Drive ID: {exp.driveFileId}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-slate-600">
                    {exp.checksumSha256.slice(0, 16)}…
                  </td>
                  <td className="px-3 py-2.5 font-mono tabular-nums text-right">
                    {exp.eventCount}
                  </td>
                  <td className="px-3 py-2.5 font-semibold">
                    {exp.status === 'LATEST' ? (
                      <span className="text-emerald-700">✓ ສະບັບລ່າສຸດ</span>
                    ) : (
                      <span className="text-amber-700">⚠ ມີສະບັບໃໝ່ (ຂໍ້ມູນຖືກແກ້ຫຼັງ Export)</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600">
                    <div>{exp.createdBy}</div>
                    <div className="font-mono text-[11px]">{exp.createdAt}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <ConfirmDialogModal
        open={Boolean(confirmAction)}
        titleLao={confirmAction?.title || ''}
        descriptionLao={confirmAction?.description || ''}
        affectedItemsLao={confirmAction?.items || []}
        confirmLabelLao="ຢືນຢັນ ແລະ ດຳເນີນການ"
        onConfirm={executeConfirmedAction}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
};
