import { useQuery } from '@tanstack/react-query';
import { api, type SpendingAnalytics } from '../api.js';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { BarChart3, TrendingUp, ShoppingBag } from 'lucide-react';

const CATEGORY_COLORS = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b'];

export function Analytics() {
  const { data, isLoading, error } = useQuery<SpendingAnalytics>({
    queryKey: ['analytics', 'spending'],
    queryFn: () => api.getSpendingAnalytics(),
  });

  const categoryData = Object.entries(data?.totalsByCategory ?? {}).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    value,
  }));

  const dailyData = Object.entries(data?.totalsByDay ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-7)
    .map(([date, amount]) => ({
      date: date.slice(5), // MM-DD
      amount,
    }));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Spending Analytics</h2>
        <p className="text-xs text-slate-500">Last 30 days spending summary & trends</p>
      </div>

      {isLoading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent"></div>
        </div>
      ) : error ? (
        <div className="rounded-2xl bg-white p-6 text-center text-xs text-red-500 shadow-sm border border-slate-200">
          Failed to load spending analytics. Please try again.
        </div>
      ) : (
        <>
          {/* Total Spent Stat Card */}
          <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-200">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
              <TrendingUp className="h-4 w-4 text-blue-600" />
              <span>30-Day Campus Expenditure</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-4xl font-extrabold text-slate-900">
                {data?.totalSpent ?? 0}
              </span>
              <span className="text-base font-semibold text-blue-600">CPC</span>
            </div>
          </div>

          {/* Daily Spending Trend Chart */}
          <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-200">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 mb-4">
              <BarChart3 className="h-4 w-4 text-blue-600" />
              <span>Recent Daily Spending (CPC)</span>
            </div>

            {dailyData.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No recent daily activity recorded.
              </div>
            ) : (
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyData}>
                    <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                    <Tooltip
                      formatter={(val) => [`${val ?? 0} CPC`, 'Spent']}
                      contentStyle={{
                        borderRadius: '0.75rem',
                        fontSize: '12px',
                        border: '1px solid #e2e8f0',
                      }}
                    />
                    <Bar dataKey="amount" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Category Breakdown */}
          <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-200">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 mb-4">
              <ShoppingBag className="h-4 w-4 text-emerald-600" />
              <span>Spending by Category</span>
            </div>

            {categoryData.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No category breakdown available.
              </div>
            ) : (
              <div className="space-y-3">
                {categoryData.map((cat, idx) => {
                  const pct = data?.totalSpent
                    ? Math.round((cat.value / data.totalSpent) * 100)
                    : 0;
                  return (
                    <div key={cat.name} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold text-slate-800">{cat.name}</span>
                        <span className="font-bold text-slate-900">
                          {cat.value} CPC ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: CATEGORY_COLORS[idx % CATEGORY_COLORS.length],
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
