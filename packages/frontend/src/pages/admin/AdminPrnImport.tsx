import { useState, type FormEvent } from 'react';
import { api, formatErrorMessage } from '../../api.js';
import { UploadCloud, CheckCircle2, AlertCircle } from 'lucide-react';

export function AdminPrnImport() {
  const [inputText, setInputText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState<number | null>(null);

  const parseInput = (text: string): Array<{ prn: string; name: string }> => {
    const trimmed = text.trim();
    if (!trimmed) return [];

    // Try JSON first
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (Array.isArray(parsed)) {
          return parsed as Array<{ prn: string; name: string }>;
        }
        if (typeof parsed === 'object' && parsed !== null && 'records' in parsed) {
          return (parsed as { records: Array<{ prn: string; name: string }> }).records;
        }
      } catch {
        // Fall back to CSV parse
      }
    }

    // Parse CSV lines
    const lines = trimmed
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const records: Array<{ prn: string; name: string }> = [];

    for (const line of lines) {
      if (line.toLowerCase().startsWith('prn,name') || line.toLowerCase().startsWith('prn, name')) {
        continue;
      }
      const parts = line.split(',').map((p) => p.trim().replace(/^["']|["']$/g, ''));
      if (parts.length >= 2 && parts[0] && parts[1]) {
        records.push({ prn: parts[0], name: parts[1] });
      }
    }

    return records;
  };

  const handleImport = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setImportedCount(null);

    const records = parseInput(inputText);
    if (records.length === 0) {
      setError('Please provide valid JSON or CSV data containing PRN and Name columns.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.importPrns(records);
      setImportedCount(res.imported);
      setInputText('');
    } catch (err) {
      setError(formatErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Import Campus PRN Allowlist</h2>
        <p className="text-xs text-slate-500">
          Upload pre-approved student roll records from the College Academic Registrar
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-2xl bg-red-50 p-4 text-xs text-red-700 border border-red-200">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {importedCount !== null && (
        <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 p-4 text-xs text-emerald-800 border border-emerald-200 font-semibold">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <span>Successfully imported {importedCount} PRN records into the allowlist.</span>
        </div>
      )}

      <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-200 space-y-4">
        <form onSubmit={handleImport} className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold uppercase text-slate-600">
                PRN Data (CSV or JSON)
              </label>
              <span className="text-[11px] text-slate-400">
                Supported format: CSV (PRN,Name) or JSON Array
              </span>
            </div>
            <textarea
              rows={8}
              required
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={`PRN-2024-001, Jay Wani\nPRN-2024-002, Alice Smith\nPRN-2024-003, Bob Johnson`}
              className="w-full rounded-xl border border-slate-300 p-3 text-xs font-mono focus:border-slate-900 focus:outline-none"
            ></textarea>
          </div>

          <button
            type="submit"
            disabled={submitting || !inputText.trim()}
            className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-xs font-bold text-white shadow-sm hover:bg-slate-800 transition disabled:opacity-50"
          >
            <UploadCloud className="h-4 w-4" />
            <span>{submitting ? 'Importing Records...' : 'Import PRN Allowlist'}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
