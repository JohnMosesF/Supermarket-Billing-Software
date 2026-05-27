import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-mist p-6 dark:bg-slate-950">
      <div className="panel p-8 text-center">
        <h1 className="text-2xl font-bold">Page not found</h1>
        <p className="mt-2 text-slate-500">The page you opened does not exist.</p>
        <Link className="btn-primary mt-5" to="/">Go to dashboard</Link>
      </div>
    </div>
  );
}
