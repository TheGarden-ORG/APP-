import React from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';

export interface ConfirmDialogProps {
  open: boolean;
  titleLao: string;
  descriptionLao: string;
  affectedItemsLao?: string[];
  confirmLabelLao?: string;
  cancelLabelLao?: string;
  variant?: 'primary' | 'warning' | 'danger';
  requireReasonInput?: boolean;
  reasonValue?: string;
  onReasonChange?: (val: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialogModal: React.FC<ConfirmDialogProps> = ({
  open,
  titleLao,
  descriptionLao,
  affectedItemsLao = [],
  confirmLabelLao = 'ຢືນຢັນການດຳເນີນການ',
  cancelLabelLao = 'ຍົກເລີກ',
  variant = 'primary',
  requireReasonInput = false,
  reasonValue = '',
  onReasonChange,
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;

  const canSubmit = !requireReasonInput || reasonValue.trim().length >= 3;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-[1px] no-print"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            {variant === 'Primary' || variant === 'primary' ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            ) : (
              <AlertTriangle
                className={`mt-0.5 h-5 w-5 shrink-0 ${
                  variant === 'danger' ? 'text-red-600' : 'text-amber-600'
                }`}
              />
            )}
            <div>
              <h2 id="confirm-dialog-title" className="text-base font-bold text-slate-900">
                {titleLao}
              </h2>
              <p className="mt-1.5 text-sm text-slate-600">{descriptionLao}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="ປິດໜ້າຕ່າງຢືນຢັນ"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {affectedItemsLao.length > 0 && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="text-xs font-semibold text-slate-700">
              ລາຍການທີ່ຈະຖືກບັນທຶກ / ປ່ຽນແປງ ({affectedItemsLao.length} ລາຍການ):
            </div>
            <ul className="mt-1.5 max-h-40 space-y-1 overflow-y-auto text-xs text-slate-600">
              {affectedItemsLao.map((item, i) => (
                <li key={i} className="font-mono">
                  • {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {requireReasonInput && (
          <div className="mt-4">
            <label htmlFor="confirm-reason-input" className="block text-xs font-semibold text-slate-700">
              ເຫດຜົນການປ່ຽນແປງ (ບັນທຶກລົງ Audit_Log) *
            </label>
            <input
              id="confirm-reason-input"
              type="text"
              value={reasonValue}
              onChange={(e) => onReasonChange && onReasonChange(e.target.value)}
              placeholder="ລະບຸເຫດຜົນຢ່າງໜ້ອຍ 3 ຕົວອັກສອນ..."
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
            />
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            {cancelLabelLao}
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={onConfirm}
            className={`min-h-[44px] rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 ${
              variant === 'danger'
                ? 'bg-red-600 hover:bg-red-700'
                : variant === 'warning'
                ? 'bg-amber-600 hover:bg-amber-700'
                : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {confirmLabelLao}
          </button>
        </div>
      </div>
    </div>
  );
};
