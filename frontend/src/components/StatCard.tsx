import { memo, type ReactNode } from 'react';
import { Card } from './ui/Card';

interface StatCardProps {
  label: string;
  value: string;
  icon?: ReactNode;
  accent?: string;
}

const accentStyles: Record<string, string> = {
  primary: 'bg-primary-100 text-primary-700 dark:bg-primary-950 dark:text-primary-300',
  blue: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  green: 'bg-success-100 text-success-700 dark:bg-success-950 dark:text-success-300',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  violet: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  rose: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
};

export const StatCard = memo(function StatCard({
  label,
  value,
  icon,
  accent = 'primary',
}: StatCardProps) {
  return (
    <Card padding="sm" className="h-full">
      <div className="flex items-center gap-3">
        {icon && (
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              accentStyles[accent] ?? accentStyles.primary
            }`}
          >
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{label}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
        </div>
      </div>
    </Card>
  );
});
