'use client';

import React, { useState } from 'react';
import { Upload, X, CheckCircle2, AlertCircle, FileSpreadsheet } from 'lucide-react';

export interface ParsedPreviewRow {
  rowNumber: number;
  valid: boolean;
  error?: string;
  raw: Record<string, unknown>;
  display: Record<string, string | number>;
}

interface ExcelImportModalProps {
  open: boolean;
  title: string;
  description: string;
  columns: Array<{ key: string; label: string; align?: 'left' | 'right' }>;
  onParseRows: (rows: Record<string, unknown>[]) => ParsedPreviewRow[];
  onConfirmImport: (validRows: ParsedPreviewRow[]) => Promise<void>;
  onClose: () => void;
}

export function ExcelImportModal({
  open,
  title,
  description,
  columns,
  onParseRows,
  onConfirmImport,
  onClose,
}: ExcelImportModalProps) {
  const [fileName, setFileName] = useState('');
  const [previewRows, setPreviewRows] = useState<ParsedPreviewRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [parseError, setParseError] = useState('');

  if (!open) return null;

  const validRows = previewRows.filter((r) => r.valid);
  const invalidCount = previewRows.length - validRows.length;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError('');
    setParsing(true);
    setFileName(file.name);

    try {
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheet = workbook.SheetNames[0];
      if (!firstSheet) {
        setParseError('File Excel tidak memiliki sheet yang dapat dibaca.');
        setPreviewRows([]);
        return;
      }
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        workbook.Sheets[firstSheet],
        { defval: '' }
      );
      if (rawRows.length === 0) {
        setParseError('Tidak ditemukan baris data pada file yang diunggah.');
        setPreviewRows([]);
        return;
      }
      const parsed = onParseRows(rawRows);
      setPreviewRows(parsed);
    } catch (err) {
      setParseError(
        err instanceof Error ? err.message : 'Gagal membaca file Excel/CSV.'
      );
      setPreviewRows([]);
    } finally {
      setParsing(false);
    }
  };

  const handleConfirm = async () => {
    if (validRows.length === 0) return;
    setSubmitting(true);
    try {
      await onConfirmImport(validRows);
      setPreviewRows([]);
      setFileName('');
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-4xl max-h-[90vh] flex flex-col bg-white rounded-xl border border-slate-200 shadow-xl">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-teal-50 text-teal-700">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">{title}</h3>
              <p className="text-xs text-slate-500">{description}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
            aria-label="Tutup modal import"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl p-6 cursor-pointer hover:border-teal-600 hover:bg-slate-50 transition-colors">
            <Upload className="w-7 h-7 text-slate-400 mb-2" />
            <span className="text-sm font-semibold text-slate-800">
              {fileName || 'Pilih file Excel (.xlsx / .xls) atau CSV'}
            </span>
            <span className="text-xs text-slate-500 mt-1">
              Pastikan kolom sesuai dengan Template Excel yang disediakan
            </span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>

          {parsing && (
            <p className="text-sm text-slate-600">Membaca dan memvalidasi data...</p>
          )}
          {parseError && (
            <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{parseError}</span>
            </div>
          )}

          {previewRows.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-slate-600">
                <span>
                  Total dibaca: <strong className="text-slate-900">{previewRows.length}</strong> baris
                  {' · '}
                  <span className="text-emerald-700 font-semibold">{validRows.length} Valid</span>
                  {invalidCount > 0 && (
                    <>
                      {' · '}
                      <span className="text-red-700 font-semibold">{invalidCount} Error</span>
                    </>
                  )}
                </span>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-x-auto max-h-72">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 font-semibold">#</th>
                      <th className="px-3 py-2 font-semibold">Validasi</th>
                      {columns.map((c) => (
                        <th
                          key={c.key}
                          className={`px-3 py-2 font-semibold ${
                            c.align === 'right' ? 'text-right' : 'text-left'
                          }`}
                        >
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {previewRows.map((r) => (
                      <tr key={r.rowNumber} className={r.valid ? 'bg-white' : 'bg-red-50/60'}>
                        <td className="px-3 py-2 font-mono tabular-nums text-slate-500">
                          {r.rowNumber}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {r.valid ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Valid
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-red-700 font-medium">
                              <AlertCircle className="w-3.5 h-3.5" /> {r.error}
                            </span>
                          )}
                        </td>
                        {columns.map((c) => (
                          <td
                            key={c.key}
                            className={`px-3 py-2 ${
                              c.align === 'right'
                                ? 'text-right font-mono tabular-nums'
                                : 'text-left'
                            }`}
                          >
                            {r.display[c.key] ?? '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3 bg-slate-50 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={validRows.length === 0 || submitting}
            onClick={handleConfirm}
            className="px-4 py-2 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-50"
          >
            {submitting
              ? 'Menyimpan...'
              : `Simpan ${validRows.length} Baris Valid`}
          </button>
        </div>
      </div>
    </div>
  );
}
