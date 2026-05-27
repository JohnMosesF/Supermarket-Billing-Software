export function StatCard({ icon: Icon, label, value, accent = 'bg-emerald-50 text-emerald-700' }) {
  return (
    <div className="panel p-4">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-md ${accent}`}>
          <Icon size={20} />
        </div>
        <div>
          <p className="text-xs font-medium uppercase text-slate-500 dark:text-slate-400">{label}</p>
          <p className="text-xl font-bold text-slate-950 dark:text-white">{value}</p>
        </div>
      </div>
    </div>
  );
}
