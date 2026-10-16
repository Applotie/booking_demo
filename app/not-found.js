import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-sm font-semibold text-brand-700">404</p>
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="text-sm text-slate-600">The page you are looking for does not exist.</p>
      <div className="mt-2 flex gap-4 text-sm font-medium">
        <Link href="/" className="text-brand-700 hover:underline">Bus tickets</Link>
        <Link href="/admin" className="text-brand-700 hover:underline">Operator admin</Link>
      </div>
    </div>
  );
}
