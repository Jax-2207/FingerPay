import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type AdminLogRecord } from '../../api.js';

export function AdminLogs() {
  const [limit, setLimit] = useState(50);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'logs', limit],
    queryFn: () => api.getAdminLogs(limit),
  });

  const logs = data?.logs ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">System Audit Trail</h2>
          <p className="text-xs text-slate-500">
            Immutable log of all administrative and privileged contract operations
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500">Show:</span>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold focus:border-slate-900 focus:outline-none"
          >
            <option value={25}>25 entries</option>
            <option value={50}>50 entries</option>
            <option value={100}>100 entries</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-900 border-t-transparent"></div>
        </div>
      ) : error ? (
        <div className="rounded-2xl bg-white p-6 text-center text-xs text-red-500 shadow-sm border border-slate-200">
          Failed to load audit logs. Please try again.
        </div>
      ) : logs.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center text-xs text-slate-400 shadow-sm border border-slate-200">
          No audit log entries recorded yet.
        </div>
      ) : (
        <div className="rounded-2xl bg-white shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-400 font-bold uppercase border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Action</th>
                  <th className="py-2.5 px-3">Actor</th>
                  <th className="py-2.5 px-3">Metadata</th>
                  <th className="py-2.5 px-3 text-right">Log ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log: AdminLogRecord) => (
                  <tr key={log.id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-3">
                      <span className="font-bold text-slate-900 font-mono text-[11px] bg-slate-100 px-2 py-0.5 rounded-md">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-600">
                      {log.actorUid ? `${log.actorUid.slice(0, 10)}...` : 'System'}
                    </td>
                    <td className="py-3 px-3 text-slate-500 max-w-xs truncate font-mono text-[11px]">
                      {JSON.stringify(log.meta || {})}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-slate-400 text-[10px]">
                      {log.id.slice(0, 8)}...
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
