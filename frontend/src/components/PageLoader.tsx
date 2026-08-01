export function PageLoader() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600 dark:border-primary-900 dark:border-t-primary-400" />
      <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
    </div>
  );
}
