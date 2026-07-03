export function PageHeader({ title, description, actions }) {
  return (
    <div className="mb-5 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white/80 p-4 shadow-soft backdrop-blur sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900/80">
      <div>
        <h1 className="text-2xl font-bold text-slate-950 dark:text-white">{title}</h1>
        {description ? <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
