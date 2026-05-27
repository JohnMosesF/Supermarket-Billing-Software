export function EmptyState({ title = 'No records found', description = 'Add your first record to get started.' }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-500 dark:border-slate-700 dark:text-slate-400">
      <p className="font-semibold text-slate-800 dark:text-slate-200">{title}</p>
      <p className="mt-1 text-sm">{description}</p>
    </div>
  );
}
