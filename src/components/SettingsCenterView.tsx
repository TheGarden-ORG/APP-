import React, { useState } from 'react';
import {
  Archive,
  Building2,
  CalendarClock,
  CheckCircle2,
  CloudCog,
  Code2,
  Copy,
  DatabaseBackup,
  FileSpreadsheet,
  FileText,
  ListChecks,
  Lock,
  Plus,
  RefreshCw,
  Save,
  ShieldAlert,
  Users,
} from 'lucide-react';
import {
  AuditLogRecord,
  PayrollPeriod,
  ReferenceLists,
  UserRole,
  getPeriodDateRange,
} from '../utils/payrollRules';
import { SystemSettingsState } from '../utils/seedData';
import { APPS_SCRIPT_MODULES } from '../utils/appsScriptBlueprint';
import { ConfirmDialogModal } from './ConfirmDialogModal';

export type SettingsSubTab =
  | 'ORG_BRANCH'
  | 'PAYROLL_PERIOD'
  | 'ROLES_APPROVERS'
  | 'REFERENCE_LISTS'
  | 'GOOGLE_WORKSPACE'
  | 'IMPORT_EXPORT'
  | 'PDF_DOCS'
  | 'BACKUP_RETENTION'
  | 'SYSTEM_STATUS'
  | 'APPS_SCRIPT';

export interface SettingsCenterViewProps {
  settings: SystemSettingsState;
  periods: PayrollPeriod[];
  referenceLists: ReferenceLists;
  auditLogs: AuditLogRecord[];
  userRole: UserRole;
  userEmail: string;
  isGoogleConnected: boolean;
  isSyncingWorkspace: boolean;
  onUpdateSettings: (nextSettings: SystemSettingsState, reasonLao: string) => void;
  onOpenNewPeriod: (periodId: string, reasonLao: string) => { ok: boolean; messageLao: string };
  onTogglePeriodClose: (periodId: string, reasonLao: string) => void;
  onUpdateReferenceList: (nextLists: ReferenceLists, reasonLao: string) => void;
  onProvisionWorkspace: () => Promise<void>;
  onSyncWorkspaceNow: () => Promise<void>;
  onCreateSnapshotBackup: (reasonLao: string) => void;
  onRestoreSnapshotRehearsal: (reasonLao: string) => void;
}

export const SettingsCenterView: React.FC<SettingsCenterViewProps> = ({
  settings,
  periods,
  referenceLists,
  auditLogs,
  userRole,
  userEmail,
  isGoogleConnected,
  isSyncingWorkspace,
  onUpdateSettings,
  onOpenNewPeriod,
  onTogglePeriodClose,
  onUpdateReferenceList,
  onProvisionWorkspace,
  onSyncWorkspaceNow,
  onCreateSnapshotBackup,
  onRestoreSnapshotRehearsal,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<SettingsSubTab>('ORG_BRANCH');
  const [draftSettings, setDraftSettings] = useState<SystemSettingsState>(settings);
  const [newPeriodInput, setNewPeriodInput] = useState<string>('2026-12');
  const [newRefCategory, setNewRefCategory] = useState<keyof ReferenceLists>('leaveTypes');
  const [newRefValue, setNewRefValue] = useState<string>('');
  const [newRefLabel, setNewRefLabel] = useState<string>('');
  const [selectedAppsScriptIdx, setSelectedAppsScriptIdx] = useState<number>(0);
  const [copiedFile, setCopiedFile] = useState<string | null>(null);
  const [bannerLao, setBannerLao] = useState<string | null>(null);

  // Confirmation modal with mandatory reason for Audit_Log (Section 15.2)
  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string;
    description: string;
    items: string[];
    onExecute: (reason: string) => void;
  } | null>(null);
  const [changeReason, setChangeReason] = useState<string>('');

  const isAdmin = userRole === 'SYSTEM_ADMIN';
  const isAuditOrAdmin = userRole === 'AUDIT_TEAM' || userRole === 'SYSTEM_ADMIN';

  const navGroups: Array<{
    id: SettingsSubTab;
    labelLao: string;
    roleNote: string;
    icon: React.ReactNode;
  }> = [
    {
      id: 'ORG_BRANCH',
      labelLao: '1. ຂໍ້ມູນອົງກອນ / ຮ້ານ',
      roleNote: 'ຜູ້ດູແລ',
      icon: <Building2 className="h-4 w-4" />,
    },
    {
      id: 'PAYROLL_PERIOD',
      labelLao: '2. ຮອບເງິນເດືອນ (26–25)',
      roleNote: 'ກວດສອບ/ຜູ້ດູແລ',
      icon: <CalendarClock className="h-4 w-4" />,
    },
    {
      id: 'ROLES_APPROVERS',
      labelLao: '3. ສິດທິ ແລະ ຜູ້ອະນຸມັດ',
      roleNote: 'ຜູ້ດູແລ',
      icon: <Users className="h-4 w-4" />,
    },
    {
      id: 'REFERENCE_LISTS',
      labelLao: '4. ລາຍການອ້າງອີງ (Lists)',
      roleNote: 'ຜູ້ດູແລ',
      icon: <ListChecks className="h-4 w-4" />,
    },
    {
      id: 'GOOGLE_WORKSPACE',
      labelLao: '5. Google Workspace / Drive',
      roleNote: 'ຜູ້ດູແລລະບົບ',
      icon: <CloudCog className="h-4 w-4" />,
    },
    {
      id: 'IMPORT_EXPORT',
      labelLao: '6. ນຳເຂົ້າ / ສົ່ງອອກ Excel',
      roleNote: 'ກວດສອບ/ຜູ້ດູແລ',
      icon: <FileSpreadsheet className="h-4 w-4" />,
    },
    {
      id: 'PDF_DOCS',
      labelLao: '7. PDF ລວມຊຸດ & ຜູ້ລົງນາມ',
      roleNote: 'ກວດສອບ/ຜູ້ດູແລ',
      icon: <FileText className="h-4 w-4" />,
    },
    {
      id: 'BACKUP_RETENTION',
      labelLao: '8. ສຳຮອງຂໍ້ມູນ / ການເກັບຮັກສາ',
      roleNote: 'ຜູ້ດູແລ',
      icon: <DatabaseBackup className="h-4 w-4" />,
    },
    {
      id: 'SYSTEM_STATUS',
      labelLao: '9. ສະຖານະລະບົບ & Audit Log',
      roleNote: 'ຕາມບົດບາດ',
      icon: <Archive className="h-4 w-4" />,
    },
    {
      id: 'APPS_SCRIPT',
      labelLao: '10. Apps Script & Index.html',
      roleNote: 'ໂຄງສ້າງຫົວຂໍ້ 16',
      icon: <Code2 className="h-4 w-4" />,
    },
  ];

  const requestConfirmedSave = (
    title: string,
    description: string,
    items: string[],
    onExecute: (reason: string) => void
  ) => {
    setChangeReason('');
    setPendingConfirm({ title, description, items, onExecute });
  };

  return (
    <div className="space-y-6">
      {/* Top Policy Notice per Section 15 */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              ສູນກາງການຕັ້ງຄ່າລະບົບ (System_Settings & Reference_Lists)
            </h2>
            <p className="text-xs text-slate-500">
              ຄ່າທັງໝົດຖືກບັນທຶກແຍກໃນ Google Sheets ລະບົບ · ຫ້າມບັນທຶກຄ່າຕັ້ງ ຫຼື metadata ເຂົ້າໃນໄຟລ໌ Excel ແມ່ແບບສົ່ງກວດ
            </p>
          </div>
          <div className="text-right font-mono text-xs text-slate-600">
            <div>ຜູ້ປ່ຽນລ່າສຸດ: {settings.lastUpdatedBy}</div>
            <div>ເວລາປ່ຽນ: {settings.lastUpdatedAt}</div>
          </div>
        </div>

        {userRole === 'STORE_MANAGER' && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <Lock className="h-4 w-4 shrink-0 text-amber-700" />
            <span>
              ທ່ານກຳລັງເຂົ້າໃຊ້ໃນບົດບາດ <strong>ຜູ້ຈັດການຮ້ານ (STORE_MANAGER)</strong> — ສາມາດກວດເບິ່ງຄ່າຕັ້ງຄ່າໄດ້ຢ່າງດຽວ
              (ບໍ່ມີສິດແກ້ໄຂ System_Settings, Reference_Lists ຫຼື ປິດງວດເງິນເດືອນ ຕາມຫົວຂໍ້ທີ 6 ແລະ 13.9).
            </span>
          </div>
        )}

        {bannerLao && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-950">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>{bannerLao}</span>
          </div>
        )}
      </div>

      {/* Main 2-column layout: Left Sub-navigation + Right Content */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <aside className="lg:col-span-3">
          <nav
            aria-label="ໝວດການຕັ້ງຄ່າ"
            className="rounded-xl border border-slate-200 bg-white p-2 space-y-1"
          >
            {navGroups.map((g) => {
              const active = activeSubTab === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setActiveSubTab(g.id)}
                  className={`flex min-h-[44px] w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                    active
                      ? 'bg-slate-900 font-semibold text-white'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {g.icon}
                    <span>{g.labelLao}</span>
                  </span>
                  <span
                    className={`text-[10px] ${active ? 'text-slate-300' : 'text-slate-400'}`}
                  >
                    {g.roleNote}
                  </span>
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="lg:col-span-9 rounded-xl border border-slate-200 bg-white p-6">
          {/* 1. ORG_BRANCH */}
          {activeSubTab === 'ORG_BRANCH' && (
            <div className="space-y-5">
              <div className="border-b border-slate-200 pb-3">
                <h3 className="text-base font-bold text-slate-900">
                  1. ຂໍ້ມູນອົງກອນ / ຮ້ານ ແລະ ສາຂາ (Store ID & Row-Level Scope)
                </h3>
                <p className="text-xs text-slate-500">
                  Store ID ເກັບເປັນ metadata ພາຍໃນຖານຂໍ້ມູນລະບົບເທົ່ານັ້ນ (ບໍ່ເພີ່ມລົງໃນ Excel Template)
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="set-org-lao" className="block text-xs font-semibold text-slate-700">
                    ຊື່ອົງກອນ (ພາສາລາວ)
                  </label>
                  <input
                    id="set-org-lao"
                    type="text"
                    disabled={!isAdmin}
                    value={draftSettings.organizationNameLao}
                    onChange={(e) =>
                      setDraftSettings({ ...draftSettings, organizationNameLao: e.target.value })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label htmlFor="set-org-tz" className="block text-xs font-semibold text-slate-700">
                    ເຂດເວລາມາດຕະຖານຂອງ Server (Timezone)
                  </label>
                  <input
                    id="set-org-tz"
                    type="text"
                    disabled
                    value={draftSettings.defaultTimezone}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-mono"
                  />
                </div>
              </div>

              <div>
                <div className="text-xs font-bold text-slate-900">
                  ລາຍຊື່ສາຂາ ແລະ ຂອບເຂດຂໍ້ມູນທີ່ຜູ້ຈັດການເບິ່ງໄດ້ ({draftSettings.branches.length} ສາຂາ):
                </div>
                <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Store ID</th>
                        <th className="px-3 py-2 font-semibold">ຊື່ສາຂາ (ລາວ)</th>
                        <th className="px-3 py-2 font-semibold">ອີເມວຜູ້ຈັດການທີ່ມີສິດເບິ່ງ</th>
                        <th className="px-3 py-2 font-semibold">ສະຖານະ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {draftSettings.branches.map((b) => (
                        <tr key={b.storeId}>
                          <td className="px-3 py-2 font-mono font-bold">{b.storeId}</td>
                          <td className="px-3 py-2">{b.nameLao}</td>
                          <td className="px-3 py-2 font-mono text-[11px]">
                            {b.managerEmails.join(', ')}
                          </td>
                          <td className="px-3 py-2">
                            {b.active ? 'ເປີດໃຊ້ງານ' : 'ປິດຊົ່ວຄາວ'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {isAdmin && (
                <div className="flex justify-end border-t border-slate-200 pt-4">
                  <button
                    type="button"
                    onClick={() =>
                      requestConfirmedSave(
                        'ຢືນຢັນການບັນທຶກຂໍ້ມູນອົງກອນ ແລະ ສາຂາ',
                        'ການປ່ຽນແປງຈະຖືກບັນທຶກລົງ System_Settings ພ້ອມສ້າງ Settings Change ID ໃນ Audit_Log.',
                        [`ຊື່ອົງກອນ: ${draftSettings.organizationNameLao}`],
                        (reason) => {
                          onUpdateSettings(draftSettings, reason);
                          setBannerLao('ບັນທຶກຂໍ້ມູນອົງກອນ/ສາຂາລົງ System_Settings ແລ້ວ');
                        }
                      )
                    }
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    <Save className="h-4 w-4" />
                    <span>ບັນທຶກການຕັ້ງຄ່າໝວດນີ້</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 2. PAYROLL_PERIOD */}
          {activeSubTab === 'PAYROLL_PERIOD' && (
            <div className="space-y-5">
              <div className="border-b border-slate-200 pb-3">
                <h3 className="text-base font-bold text-slate-900">
                  2. ຮອບເງິນເດືອນຢືນຢັນ (ວັນທີ 26 ຫາ 25) ແລະ ການເປີດ/ປິດງວດ
                </h3>
                <p className="text-xs text-slate-500">
                  ການປິດງວດຈະສ້າງ Snapshot ສຳຮອງຂໍ້ມູນໄປ 03_Archive_Backups ແລະ ປ່ຽນງວດເປັນອ່ານຢ່າງດຽວ
                </p>
              </div>

              {isAuditOrAdmin && (
                <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div>
                    <label htmlFor="new-period-id" className="block text-xs font-semibold text-slate-700">
                      ສ້າງງວດໃໝ່ (YYYY-MM):
                    </label>
                    <input
                      id="new-period-id"
                      type="text"
                      value={newPeriodInput}
                      onChange={(e) => setNewPeriodInput(e.target.value)}
                      placeholder="2026-12"
                      className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono"
                    />
                  </div>
                  <div className="text-xs text-slate-600 pb-2 font-mono">
                    {(() => {
                      const r = getPeriodDateRange(newPeriodInput);
                      return r
                        ? `ຊ່ວງວັນທີອັດຕະໂນມັດ: ${r.startDate} – ${r.endDate}`
                        : 'ຮູບແບບຕ້ອງເປັນ YYYY-MM';
                    })()}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      requestConfirmedSave(
                        `ຢືນຢັນການເປີດງວດເງິນເດືອນໃໝ່ ${newPeriodInput}`,
                        'ລະບົບຈະກຳນົດວັນທີ 26 ຫາ 25 ອັດຕະໂນມັດ ແລະ ບັນທຶກ Event ເປີດງວດລົງໃນ Audit_Log.',
                        [`ງວດໃໝ່: ${newPeriodInput}`],
                        (reason) => {
                          const res = onOpenNewPeriod(newPeriodInput, reason);
                          setBannerLao(res.messageLao);
                        }
                      )
                    }
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    <Plus className="h-4 w-4" />
                    <span>ສ້າງງວດໃໝ່</span>
                  </button>
                </div>
              )}

              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2.5 font-semibold">ລະຫັດງວດ</th>
                      <th className="px-3 py-2.5 font-semibold">ວັນເລີ່ມ (26)</th>
                      <th className="px-3 py-2.5 font-semibold">ວັນສິ້ນສຸດ (25)</th>
                      <th className="px-3 py-2.5 font-semibold">ສະຖານະ</th>
                      <th className="px-3 py-2.5 font-semibold">ຜູ້ເປີດ / ເວລາ</th>
                      <th className="px-3 py-2.5 font-semibold text-right">ການຄວບຄຸມ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {periods.map((p) => (
                      <tr key={p.periodId}>
                        <td className="px-3 py-2.5 font-mono font-bold">{p.periodId}</td>
                        <td className="px-3 py-2.5 font-mono">{p.startDate}</td>
                        <td className="px-3 py-2.5 font-mono">{p.endDate}</td>
                        <td className="px-3 py-2.5 font-semibold">
                          {p.status === 'OPEN' ? (
                            <span className="text-emerald-700">ເປີດຮັບຂໍ້ມູນ (OPEN)</span>
                          ) : (
                            <span className="text-slate-600">ປິດງວດແລ້ວ · ອ່ານຢ່າງດຽວ (CLOSED)</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[11px] text-slate-600">
                          {p.openedBy} · {p.openedAt.slice(0, 10)}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {isAuditOrAdmin ? (
                            <button
                              type="button"
                              onClick={() =>
                                requestConfirmedSave(
                                  p.status === 'OPEN'
                                    ? `ຢືນຢັນການປິດງວດ ${p.periodId} ແລະ ສ້າງ Snapshot ສຳຮອງ`
                                    : `ຢືນຢັນການເປີດງວດ ${p.periodId} ຄືນໃໝ່`,
                                  p.status === 'OPEN'
                                    ? 'ລະບົບຈະສ້າງ Snapshot ໄປ 03_Archive_Backups ແລະ ລັອກງວດນີ້ເປັນອ່ານຢ່າງດຽວ.'
                                    : 'ການເປີດງວດຄືນໃໝ່ຈະອະນຸຍາດໃຫ້ບັນທຶກ Revision ເພີ່ມເຕີມໄດ້.',
                                  [`ງວດ: ${p.periodId} (${p.startDate} – ${p.endDate})`],
                                  (reason) => {
                                    onTogglePeriodClose(p.periodId, reason);
                                    setBannerLao(`ອັບເດດສະຖານະງວດ ${p.periodId} ສຳເລັດແລ້ວ`);
                                  }
                                )
                              }
                              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              {p.status === 'OPEN' ? 'ປິດງວດ & ສຳຮອງ' : 'ເປີດງວດຄືນໃໝ່'}
                            </button>
                          ) : (
                            <span className="text-slate-400">ສະເພາະທີມກວດສອບ</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 3. ROLES_APPROVERS */}
          {activeSubTab === 'ROLES_APPROVERS' && (
            <div className="space-y-5">
              <div className="border-b border-slate-200 pb-3">
                <h3 className="text-base font-bold text-slate-900">
                  3. ຕາຕະລາງສິດທິ (Role Matrix) ແລະ ຜູ້ມີອຳນາດອະນຸມັດ (ຫົວຂໍ້ທີ 6 ແລະ 15.3)
                </h3>
                <p className="text-xs text-slate-500">
                  ກຳນົດຜູ້ອະນຸມັດລາພັກ, ຜູ້ປິດງວດ, ຜູ້ສ້າງ Export ແລະ ຜູ້ຢືນຢັນ Export ສຸດທ້າຍ
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="ap-leave" className="block text-xs font-semibold text-slate-700">
                    ຜູ້ອະນຸມັດລາພັກ (Leave Approver Email)
                  </label>
                  <input
                    id="ap-leave"
                    type="text"
                    disabled={!isAdmin}
                    value={draftSettings.leaveApproverEmail}
                    onChange={(e) =>
                      setDraftSettings({ ...draftSettings, leaveApproverEmail: e.target.value })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label htmlFor="ap-close" className="block text-xs font-semibold text-slate-700">
                    ຜູ້ມີສິດປິດງວດເງິນເດືອນ (Period Closer Email)
                  </label>
                  <input
                    id="ap-close"
                    type="text"
                    disabled={!isAdmin}
                    value={draftSettings.periodCloserEmail}
                    onChange={(e) =>
                      setDraftSettings({ ...draftSettings, periodCloserEmail: e.target.value })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label htmlFor="ap-exp" className="block text-xs font-semibold text-slate-700">
                    ຜູ້ສ້າງໄຟລ໌ Export (Export Creator Email)
                  </label>
                  <input
                    id="ap-exp"
                    type="text"
                    disabled={!isAdmin}
                    value={draftSettings.exportCreatorEmail}
                    onChange={(e) =>
                      setDraftSettings({ ...draftSettings, exportCreatorEmail: e.target.value })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label htmlFor="ap-final" className="block text-xs font-semibold text-slate-700">
                    ຜູ້ຢືນຢັນ Export ສຸດທ້າຍ (Final Approver Email)
                  </label>
                  <input
                    id="ap-final"
                    type="text"
                    disabled={!isAdmin}
                    value={draftSettings.finalExportApproverEmail}
                    onChange={(e) =>
                      setDraftSettings({
                        ...draftSettings,
                        finalExportApproverEmail: e.target.value,
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono disabled:bg-slate-100"
                  />
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2 font-semibold">ການເຮັດວຽກ</th>
                      <th className="px-3 py-2 font-semibold">ຜູ້ຈັດການຮ້ານ</th>
                      <th className="px-3 py-2 font-semibold">ທີມກວດສອບ</th>
                      <th className="px-3 py-2 font-semibold">ຜູ້ດູແລລະບົບ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    <tr>
                      <td className="px-3 py-2">ເບິ່ງຂໍ້ມູນຮ້ານຕົນ / ສ້າງເຫດການໃນງວດເປີດ</td>
                      <td className="px-3 py-2 text-emerald-700 font-semibold">ໄດ້ (ສະເພາະສາຂາຕົນ)</td>
                      <td className="px-3 py-2 text-emerald-700 font-semibold">ໄດ້ທຸກສາຂາ</td>
                      <td className="px-3 py-2 text-emerald-700 font-semibold">ໄດ້ທຸກສາຂາ</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2">ແກ້ໄຂຫຼັງສົ່ງ Export</td>
                      <td className="px-3 py-2">ສົ່ງຄຳຂໍ / ຕາມສິດ</td>
                      <td className="px-3 py-2 text-emerald-700 font-semibold">ໄດ້ (ສ້າງ Revision)</td>
                      <td className="px-3 py-2 text-emerald-700 font-semibold">ໄດ້ (ສ້າງ Revision)</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2">ອະນຸມັດ / ປິດງວດເງິນເດືອນ</td>
                      <td className="px-3 py-2 text-red-600 font-semibold">ບໍ່ໄດ້</td>
                      <td className="px-3 py-2 text-emerald-700 font-semibold">ໄດ້</td>
                      <td className="px-3 py-2 text-emerald-700 font-semibold">ໄດ້</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2">ຈັດການ Reference Lists, ສິດທິ, Folder IDs</td>
                      <td className="px-3 py-2 text-red-600 font-semibold">ບໍ່ໄດ້</td>
                      <td className="px-3 py-2 text-red-600 font-semibold">ບໍ່ໄດ້</td>
                      <td className="px-3 py-2 text-emerald-700 font-semibold">ໄດ້</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {isAdmin && (
                <div className="flex justify-end border-t border-slate-200 pt-4">
                  <button
                    type="button"
                    onClick={() =>
                      requestConfirmedSave(
                        'ຢືນຢັນການບັນທຶກສິດທິ ແລະ ຜູ້ອະນຸມັດ',
                        'ລະບົບຈະບັນທຶກລາຍຊື່ຜູ້ອະນຸມັດໃໝ່ລົງໃນ System_Settings ແລະ Audit_Log.',
                        [
                          `ຜູ້ອະນຸມັດລາ: ${draftSettings.leaveApproverEmail}`,
                          `ຜູ້ປິດງວດ: ${draftSettings.periodCloserEmail}`,
                        ],
                        (reason) => {
                          onUpdateSettings(draftSettings, reason);
                          setBannerLao('ບັນທຶກສິດທິ ແລະ ຜູ້ອະນຸມັດສຳເລັດແລ້ວ');
                        }
                      )
                    }
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    <Save className="h-4 w-4" />
                    <span>ບັນທຶກຜູ້ອະນຸມັດ</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 4. REFERENCE_LISTS */}
          {activeSubTab === 'REFERENCE_LISTS' && (
            <div className="space-y-5">
              <div className="border-b border-slate-200 pb-3">
                <h3 className="text-base font-bold text-slate-900">
                  4. ລາຍການອ້າງອີງພາຍໃນ (Reference_Lists · ກົງກັບແຜ່ນ Lists)
                </h3>
                <p className="text-xs text-slate-500">
                  ກົດຫົວຂໍ້ 15.2: ຄ່າອ້າງອີງທີ່ຖືກໃຊ້ແລ້ວ ຫ້າມລຶບ — ໃຫ້ໃຊ້ການ “ປິດການໃຊ້ (Disable)” ແທນ
                </p>
              </div>

              <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div>
                  <label htmlFor="ref-cat-select" className="block text-xs font-semibold text-slate-700">
                    ໝວດລາຍການອ້າງອີງ:
                  </label>
                  <select
                    id="ref-cat-select"
                    value={newRefCategory}
                    onChange={(e) => setNewRefCategory(e.target.value as keyof ReferenceLists)}
                    className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold"
                  >
                    <option value="leaveTypes">ປະເພດລາພັກ (Leave Types)</option>
                    <option value="positions">ຕຳແໜ່ງງານ (Positions)</option>
                    <option value="advanceTypes">ປະເພດເບີກລ່ວງໜ້າ (Advance Types)</option>
                    <option value="extraShiftTypes">ປະເພດກະເສີມ (Extra Shift Types)</option>
                    <option value="dayOffWorkTypes">ປະເພດເຮັດວຽກມື້ພັກ (Day-Off Work Types)</option>
                    <option value="leaveStatuses">ສະຖານະການລາ (Leave Statuses)</option>
                  </select>
                </div>

                {isAdmin && (
                  <>
                    <div>
                      <label htmlFor="ref-val-input" className="block text-xs font-semibold text-slate-700">
                        ຄ່າ (Value):
                      </label>
                      <input
                        id="ref-val-input"
                        type="text"
                        value={newRefValue}
                        onChange={(e) => setNewRefValue(e.target.value)}
                        placeholder="ເຊັ່ນ Special Leave · ລາພິເສດ"
                        className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                      />
                    </div>
                    <div>
                      <label htmlFor="ref-lbl-input" className="block text-xs font-semibold text-slate-700">
                        ຄຳອະທິບາຍພາສາລາວ:
                      </label>
                      <input
                        id="ref-lbl-input"
                        type="text"
                        value={newRefLabel}
                        onChange={(e) => setNewRefLabel(e.target.value)}
                        placeholder="ຄຳອະທິບາຍ..."
                        className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={!newRefValue.trim()}
                      onClick={() => {
                        const updated: ReferenceLists = {
                          ...referenceLists,
                          [newRefCategory]: [
                            ...referenceLists[newRefCategory],
                            {
                              value: newRefValue.trim(),
                              labelLao: (newRefLabel || newRefValue).trim(),
                              active: true,
                              effectiveDate: '27/10/2026',
                            },
                          ],
                        };
                        onUpdateReferenceList(updated, `ເພີ່ມຄ່າອ້າງອີງໃໝ່ ${newRefValue}`);
                        setNewRefValue('');
                        setNewRefLabel('');
                        setBannerLao('ເພີ່ມລາຍການອ້າງອີງໃໝ່ລົງ Reference_Lists ແລ້ວ');
                      }}
                      className="inline-flex min-h-[38px] items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <Plus className="h-4 w-4" />
                      <span>ເພີ່ມລາຍການ</span>
                    </button>
                  </>
                )}
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2 font-semibold">ຄ່າອ້າງອີງ (Value)</th>
                      <th className="px-3 py-2 font-semibold">ສະແດງໃນຟອມພາສາລາວ</th>
                      <th className="px-3 py-2 font-semibold">ວັນທີມີຜົນ (Effective Date)</th>
                      <th className="px-3 py-2 font-semibold">ສະຖານະ</th>
                      <th className="px-3 py-2 font-semibold text-right">ການຄວບຄຸມ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {referenceLists[newRefCategory].map((item, idx) => (
                      <tr key={item.value}>
                        <td className="px-3 py-2 font-mono font-semibold">{item.value}</td>
                        <td className="px-3 py-2">{item.labelLao}</td>
                        <td className="px-3 py-2 font-mono">{item.effectiveDate}</td>
                        <td className="px-3 py-2">
                          {item.active ? (
                            <span className="text-emerald-700 font-semibold">ເປີດໃຊ້</span>
                          ) : (
                            <span className="text-slate-400">ປິດການໃຊ້ແລ້ວ</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => {
                                const listCopy = [...referenceLists[newRefCategory]];
                                listCopy[idx] = { ...item, active: !item.active };
                                onUpdateReferenceList(
                                  { ...referenceLists, [newRefCategory]: listCopy },
                                  `ປ່ຽນສະຖານະຄ່າອ້າງອີງ ${item.value}`
                                );
                              }}
                              className="rounded border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                            >
                              {item.active ? 'ປິດການໃຊ້ (ຫ້າມລຶບ)' : 'ເປີດໃຊ້ຄືນ'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 5. GOOGLE_WORKSPACE */}
          {activeSubTab === 'GOOGLE_WORKSPACE' && (
            <div className="space-y-5">
              <div className="border-b border-slate-200 pb-3">
                <h3 className="text-base font-bold text-slate-900">
                  5. ການເຊື່ອມຕໍ່ Google Sheets (ຖານຂໍ້ມູນກາງ) ແລະ Google Drive (ຄັງໄຟລ໌ກາງ)
                </h3>
                <p className="text-xs text-slate-500">
                  ໂຄງສ້າງໂຟນເດີມາດຕະຖານ TheGarden_Payroll_System (00 ຫາ 05) · ບໍ່ສະແດງ ຫຼື ບັນທຶກ Secret ໃນ UI
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold text-slate-900">
                      ສະຖານະການເຊື່ອມຕໍ່ບັນຊີ Google Workspace OAuth 2.0:
                    </div>
                    <div className="mt-0.5 text-xs text-slate-600">
                      {isGoogleConnected
                        ? `ເຊື່ອມຕໍ່ແລ້ວໃນຊື່ ${userEmail} · ພ້ອມສ້າງໂຟນເດີ Drive ແລະ ຊິ້ງ Google Sheets`
                        : 'ຍັງບໍ່ໄດ້ເຂົ້າສູ່ລະບົບດ້ວຍ Google (ກົດປຸ່ມ Sign in with Google ຢູ່ແຖບດ້ານເທິງເພື່ອເຊື່ອມຕໍ່ຈິງ)'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!isGoogleConnected || isSyncingWorkspace || !isAdmin}
                      onClick={onProvisionWorkspace}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                    >
                      <CloudCog className="h-4 w-4" />
                      <span>ສ້າງໂຟນເດີ Drive 00–05 & ຖານຂໍ້ມູນ Sheets ອັດຕະໂນມັດ</span>
                    </button>
                    <button
                      type="button"
                      disabled={!isGoogleConnected || isSyncingWorkspace || !settings.systemSpreadsheetId}
                      onClick={onSyncWorkspaceNow}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <RefreshCw className={`h-4 w-4 ${isSyncingWorkspace ? 'animate-spin' : ''}`} />
                      <span>ຊິ້ງຂໍ້ມູນຂຶ້ນ Google Sheets ດຽວນີ້</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="gw-sheet-id" className="block text-xs font-semibold text-slate-700">
                    System Spreadsheet ID (ຖານຂໍ້ມູນກາງ 14 ແຜ່ນ)
                  </label>
                  <input
                    id="gw-sheet-id"
                    type="text"
                    disabled={!isAdmin}
                    value={draftSettings.systemSpreadsheetId}
                    onChange={(e) =>
                      setDraftSettings({ ...draftSettings, systemSpreadsheetId: e.target.value })
                    }
                    placeholder="ກົດປຸ່ມສ້າງອັດຕະໂນມັດ ຫຼື ວາງ Spreadsheet ID..."
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label htmlFor="gw-root-id" className="block text-xs font-semibold text-slate-700">
                    Root Folder ID (TheGarden_Payroll_System)
                  </label>
                  <input
                    id="gw-root-id"
                    type="text"
                    disabled={!isAdmin}
                    value={draftSettings.rootDriveFolderId}
                    onChange={(e) =>
                      setDraftSettings({ ...draftSettings, rootDriveFolderId: e.target.value })
                    }
                    placeholder="ກົດປຸ່ມສ້າງອັດຕະໂນມັດ ຫຼື ວາງ Folder ID..."
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono disabled:bg-slate-100"
                  />
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 p-4">
                <div className="text-xs font-bold text-slate-900">
                  ໂຄງສ້າງໂຟນເດີບັງຄັບໃນ Google Drive (Section 3.2):
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 font-mono text-xs text-slate-700">
                  <div>├── {draftSettings.folderMapping.sourceTemplate}/ (ອ່ານຢ່າງດຽວ)</div>
                  <div>├── {draftSettings.folderMapping.incomingUploads}/ (ໄຟລ໌ຮັບເຂົ້າ)</div>
                  <div>├── {draftSettings.folderMapping.auditExports}/ (Excel ສົ່ງກວດ)</div>
                  <div>├── {draftSettings.folderMapping.archiveBackups}/ (Snapshot ສຳຮອງ)</div>
                  <div>├── {draftSettings.folderMapping.eventLogs}/ (CSV/JSON ເຫດການ)</div>
                  <div>└── {draftSettings.folderMapping.pdfBundles}/ (ເອກະສານ PDF A4)</div>
                </div>
              </div>
            </div>
          )}

          {/* 6. IMPORT_EXPORT */}
          {activeSubTab === 'IMPORT_EXPORT' && (
            <div className="space-y-4">
              <div className="border-b border-slate-200 pb-3">
                <h3 className="text-base font-bold text-slate-900">
                  6. ກົດການນຳເຂົ້າ / ສົ່ງອອກ ແລະ ຄວາມເຂົ້າກັນໄດ້ຂອງ Excel Template
                </h3>
                <p className="text-xs text-slate-500">
                  ຫ້າມແກ້ຊື່ແຜ່ນ, ຄໍລຳ, ສູດ ຫຼື validation ຂອງແມ່ແບບຕົ້ນສະບັບຈາກ UI (Section 15.2)
                </p>
              </div>

              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3.5">
                  <div>
                    <div className="font-bold text-slate-900">
                      ແມ່ແບບຕົ້ນສະບັບທີ່ອະນຸຍາດ (Read-Only Source Template)
                    </div>
                    <div className="text-slate-500">
                      9 ແຜ່ນສະແດງຜົນ + 1 ແຜ່ນ Lists ຊ່ອນ · ກວດສອບກັບ Microsoft Excel ແລ້ວ
                    </div>
                  </div>
                  <span className="font-mono font-semibold text-emerald-700">
                    {draftSettings.allowedTemplateVersion}
                  </span>
                </div>

                <label className="flex items-center justify-between rounded-lg border border-slate-200 p-3.5">
                  <div>
                    <div className="font-bold text-slate-900">
                      ກວດກັນຂໍ້ມູນຊ້ຳດ້ວຍ Idempotency Key (Strict Idempotency Check)
                    </div>
                    <div className="text-slate-500">
                      ປ້ອງກັນການກົດ Save ຊ້ຳ ແລະ ການອັບໂຫຼດໄຟລ໌ Excel ເດີມຊ້ຳ 2 ຄັ້ງ
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    disabled={!isAuditOrAdmin}
                    checked={draftSettings.strictIdempotencyCheck}
                    onChange={(e) =>
                      setDraftSettings({
                        ...draftSettings,
                        strictIdempotencyCheck: e.target.checked,
                      })
                    }
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                  />
                </label>

                <label className="flex items-center justify-between rounded-lg border border-slate-200 p-3.5">
                  <div>
                    <div className="font-bold text-slate-900">
                      ປະຕິເສດການແກ້ໄຂພະນັກງານທີ່ຕິກ ✓ Checked in Payroll ແລ້ວ
                    </div>
                    <div className="text-slate-500">
                      ຕາມກົດຂໍ້ທີ 7 ໃນແຜ່ນ Guide · ຕ້ອງເອົາຕິກອອກກ່ອນຈຶ່ງແກ້ໄຂໄດ້
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    disabled={!isAuditOrAdmin}
                    checked={draftSettings.refuseCheckedPayrollRows}
                    onChange={(e) =>
                      setDraftSettings({
                        ...draftSettings,
                        refuseCheckedPayrollRows: e.target.checked,
                      })
                    }
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                  />
                </label>
              </div>
            </div>
          )}

          {/* 7. PDF_DOCS */}
          {activeSubTab === 'PDF_DOCS' && (
            <div className="space-y-4">
              <div className="border-b border-slate-200 pb-3">
                <h3 className="text-base font-bold text-slate-900">
                  7. ການຕັ້ງຄ່າຊຸດເອກະສານ PDF A4 ແລະ ຜູ້ລົງນາມອະນຸມັດ
                </h3>
                <p className="text-xs text-slate-500">
                  ຂະໜາດ A4 · ຂອບເຈ້ຍຢ່າງໜ້ອຍ 12 mm · ຝັງຟອນພາສາລາວ Noto Sans Lao
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="pdf-sig-1" className="block text-xs font-semibold text-slate-700">
                    ຕຳແໜ່ງຜູ້ສ້າງເອກະສານ (Prepared By)
                  </label>
                  <input
                    id="pdf-sig-1"
                    type="text"
                    disabled={!isAuditOrAdmin}
                    value={draftSettings.pdfSignatoryPreparedBy}
                    onChange={(e) =>
                      setDraftSettings({
                        ...draftSettings,
                        pdfSignatoryPreparedBy: e.target.value,
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label htmlFor="pdf-sig-2" className="block text-xs font-semibold text-slate-700">
                    ຕຳແໜ່ງຜູ້ກວດສອບ (Reviewed By)
                  </label>
                  <input
                    id="pdf-sig-2"
                    type="text"
                    disabled={!isAuditOrAdmin}
                    value={draftSettings.pdfSignatoryReviewedBy}
                    onChange={(e) =>
                      setDraftSettings({
                        ...draftSettings,
                        pdfSignatoryReviewedBy: e.target.value,
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label htmlFor="pdf-sig-3" className="block text-xs font-semibold text-slate-700">
                    ຕຳແໜ່ງຜູ້ອະນຸມັດຈ່າຍ (Approved By)
                  </label>
                  <input
                    id="pdf-sig-3"
                    type="text"
                    disabled={!isAuditOrAdmin}
                    value={draftSettings.pdfSignatoryApprovedBy}
                    onChange={(e) =>
                      setDraftSettings({
                        ...draftSettings,
                        pdfSignatoryApprovedBy: e.target.value,
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>
              </div>

              {isAuditOrAdmin && (
                <div className="flex justify-end border-t border-slate-200 pt-4">
                  <button
                    type="button"
                    onClick={() =>
                      requestConfirmedSave(
                        'ຢືນຢັນການບັນທຶກຄ່າຕັ້ງ PDF A4 ແລະ ຜູ້ລົງນາມ',
                        'ຄ່າຜູ້ລົງນາມ ແລະ Footer ຈະຖືກໃຊ້ໃນການສ້າງ PDF Bundle ທຸກສະບັບຕໍ່ໄປ.',
                        [
                          `ຜູ້ສ້າງ: ${draftSettings.pdfSignatoryPreparedBy}`,
                          `ຜູ້ກວດສອບ: ${draftSettings.pdfSignatoryReviewedBy}`,
                          `ຜູ້ອະນຸມັດ: ${draftSettings.pdfSignatoryApprovedBy}`,
                        ],
                        (reason) => {
                          onUpdateSettings(draftSettings, reason);
                          setBannerLao('ບັນທຶກການຕັ້ງຄ່າ PDF ລວມຊຸດສຳເລັດແລ້ວ');
                        }
                      )
                    }
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    <Save className="h-4 w-4" />
                    <span>ບັນທຶກຄ່າຕັ້ງ PDF</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 8. BACKUP_RETENTION */}
          {activeSubTab === 'BACKUP_RETENTION' && (
            <div className="space-y-5">
              <div className="border-b border-slate-200 pb-3">
                <h3 className="text-base font-bold text-slate-900">
                  8. ການສຳຮອງຂໍ້ມູນ (03_Archive_Backups), ໄລຍະເກັບຮັກສາ (Retention) ແລະ ທົດສອບ Restore
                </h3>
                <p className="text-xs text-slate-500">
                  ມາດຕະຖານການຍອມຮັບຂໍ້ທີ 10: ສາມາດ Restore Snapshot ຂອງງວດທົດລອງໄດ້ ໂດຍບໍ່ທຳລາຍ Export ຫຼື Audit Log ທີ່ມີຢູ່
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-200 p-3.5">
                  <div className="text-xs text-slate-500">ໄລຍະເກັບຂໍ້ມູນເງິນເດືອນ (Payroll)</div>
                  <div className="mt-1 text-lg font-bold font-mono text-slate-900">
                    {draftSettings.payrollRetentionMonths} ເດືອນ (5 ປີ)
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 p-3.5">
                  <div className="text-xs text-slate-500">ໄລຍະເກັບຂໍ້ມູນບັນຊີທະນາຄານ</div>
                  <div className="mt-1 text-lg font-bold font-mono text-slate-900">
                    {draftSettings.bankDataRetentionMonths} ເດືອນ (3 ປີ)
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 p-3.5">
                  <div className="text-xs text-slate-500">ໄລຍະເກັບ Audit Log (Append-Only)</div>
                  <div className="mt-1 text-lg font-bold font-mono text-slate-900">
                    {draftSettings.auditLogRetentionMonths} ເດືອນ (7 ປີ)
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <button
                  type="button"
                  disabled={!isAdmin}
                  onClick={() =>
                    requestConfirmedSave(
                      'ຢືນຢັນການສ້າງ Archive Snapshot ສຳຮອງຂໍ້ມູນທັນທີ',
                      'ລະບົບຈະສ້າງ Snapshot ຂອງຂໍ້ມູນງວດປັດຈຸບັນ ແລະ ບັນທຶກລົງ 03_Archive_Backups ພ້ອມ SHA-256 Checksum.',
                      [`ໂຟນເດີ: 03_Archive_Backups/${settings.activePeriodId}`],
                      (reason) => {
                        onCreateSnapshotBackup(reason);
                        setBannerLao('ສ້າງ Archive Snapshot ໄວ້ໃນ 03_Archive_Backups ສຳເລັດແລ້ວ');
                      }
                    )
                  }
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  <DatabaseBackup className="h-4 w-4" />
                  <span>ສ້າງ Snapshot ສຳຮອງດຽວນີ້ (03_Archive_Backups)</span>
                </button>

                <button
                  type="button"
                  disabled={!isAdmin}
                  onClick={() =>
                    requestConfirmedSave(
                      'ຢືນຢັນການທົດສອບກູ້ຄືນຂໍ້ມູນ (Restore Rehearsal)',
                      'ທົດສອບກູ້ຄືນ Snapshot ຂອງງວດໂດຍຮັກສາທະບຽນ Export_Register ແລະ Audit_Log ທັງໝົດໄວ້ຄົບຖ້ວນ (Acceptance Criterion #10).',
                      ['ກວດສອບຄວາມຄົບຖ້ວນຂອງ Employees, Events, Export_Register ແລະ Audit_Log'],
                      (reason) => {
                        onRestoreSnapshotRehearsal(reason);
                        setBannerLao(
                          'ທົດສອບ Restore Snapshot ສຳເລັດ 100% — Export_Register ແລະ Audit_Log ຍັງຄົງຢູ່ຄົບຖ້ວນ'
                        );
                      }
                    )
                  }
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  <RefreshCw className="h-4 w-4 text-emerald-600" />
                  <span>ທົດສອບ Restore Snapshot (ໂດຍບໍ່ທຳລາຍ Export/Audit)</span>
                </button>
              </div>
            </div>
          )}

          {/* 9. SYSTEM_STATUS & AUDIT_LOG */}
          {activeSubTab === 'SYSTEM_STATUS' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    9. ສະຖານະລະບົບ ແລະ ບັນທຶກການກວດສອບ (Immutable Audit_Log)
                  </h3>
                  <p className="text-xs text-slate-500">
                    ບັນທຶກທຸກການສ້າງ, ແກ້ໄຂ, ນຳເຂົ້າ, ສົ່ງອອກ, ເປີດ/ປິດງວດ ແລະ ປ່ຽນການຕັ້ງຄ່າ (ຫ້າມຜູ້ໃຊ້ລຶບ)
                  </p>
                </div>
                <span className="font-mono text-xs text-slate-500">
                  ເວີຊັນແອັບ: {settings.appVersion}
                </span>
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Audit ID</th>
                      <th className="px-3 py-2 font-semibold">ວັນເວລາ (Asia/Vientiane)</th>
                      <th className="px-3 py-2 font-semibold">ຜູ້ໃຊ້ (ບົດບາດ)</th>
                      <th className="px-3 py-2 font-semibold">ການກະທຳ</th>
                      <th className="px-3 py-2 font-semibold">ວັດຖຸ (Object ID)</th>
                      <th className="px-3 py-2 font-semibold">ລາຍລະອຽດພາສາລາວ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {auditLogs
                      .filter((log) =>
                        userRole === 'STORE_MANAGER' ? log.userEmail === userEmail : true
                      )
                      .map((log) => (
                        <tr key={log.auditId} className="hover:bg-slate-50">
                          <td className="px-3 py-2 font-mono font-semibold">{log.auditId}</td>
                          <td className="px-3 py-2 font-mono text-[11px]">{log.timestamp}</td>
                          <td className="px-3 py-2">
                            <div className="font-mono text-[11px]">{log.userEmail}</div>
                            <div className="text-[10px] text-slate-500">{log.userRole}</div>
                          </td>
                          <td className="px-3 py-2 font-mono text-[11px] font-semibold">
                            {log.action}
                          </td>
                          <td className="px-3 py-2 font-mono text-[11px]">{log.objectId}</td>
                          <td className="px-3 py-2 text-slate-700">{log.summaryLao}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 10. APPS_SCRIPT & SINGLE-FILE INDEX.HTML (Section 16) */}
          {activeSubTab === 'APPS_SCRIPT' && (
            <div className="space-y-4">
              <div className="border-b border-slate-200 pb-3">
                <h3 className="text-base font-bold text-slate-900">
                  10. ໂຄງສ້າງ Google Apps Script (.gs) ແລະ Single-File Index.html (ຫົວຂໍ້ທີ 16)
                </h3>
                <p className="text-xs text-slate-500">
                  ອ່ານຢ່າງດຽວຈາກ UI (ຫ້າມແກ້ Code ຈາກ Browser ເພື່ອຄວາມປອດໄພຕາມຫົວຂໍ້ 15.2) · ສາມາດຄັດລອກໄປວາງໃນໂປຣເຈັກ clasp / Google Apps Script ໄດ້ທັນທີ
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {APPS_SCRIPT_MODULES.map((m, idx) => (
                  <button
                    key={m.fileName}
                    type="button"
                    onClick={() => setSelectedAppsScriptIdx(idx)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-mono font-semibold ${
                      selectedAppsScriptIdx === idx
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-950'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {m.fileName}
                  </button>
                ))}
              </div>

              {APPS_SCRIPT_MODULES[selectedAppsScriptIdx] && (
                <div className="rounded-lg border border-slate-200 bg-slate-900 p-4 text-slate-100">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2 text-xs">
                    <div>
                      <span className="font-mono font-bold text-emerald-400">
                        {APPS_SCRIPT_MODULES[selectedAppsScriptIdx].fileName}
                      </span>
                      <span className="ml-2 text-slate-400">
                        — {APPS_SCRIPT_MODULES[selectedAppsScriptIdx].roleLao}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(
                          APPS_SCRIPT_MODULES[selectedAppsScriptIdx].code
                        );
                        setCopiedFile(APPS_SCRIPT_MODULES[selectedAppsScriptIdx].fileName);
                        setTimeout(() => setCopiedFile(null), 2000);
                      }}
                      className="inline-flex items-center gap-1 rounded bg-slate-800 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-700"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      <span>
                        {copiedFile === APPS_SCRIPT_MODULES[selectedAppsScriptIdx].fileName
                          ? 'ຄັດລອກແລ້ວ!'
                          : 'ຄັດລອກ Code'}
                      </span>
                    </button>
                  </div>
                  <pre className="mt-3 max-h-80 overflow-auto text-xs font-mono leading-relaxed text-slate-200">
                    {APPS_SCRIPT_MODULES[selectedAppsScriptIdx].code}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialogModal
        open={Boolean(pendingConfirm)}
        titleLao={pendingConfirm?.title || ''}
        descriptionLao={pendingConfirm?.description || ''}
        affectedItemsLao={pendingConfirm?.items || []}
        requireReasonInput={true}
        reasonValue={changeReason}
        onReasonChange={setChangeReason}
        confirmLabelLao="ຢືນຢັນ ແລະ ບັນທຶກລົງ Audit_Log"
        onConfirm={() => {
          if (pendingConfirm) {
            const fn = pendingConfirm.onExecute;
            const r = changeReason;
            setPendingConfirm(null);
            fn(r);
          }
        }}
        onCancel={() => setPendingConfirm(null)}
      />
    </div>
  );
};
