import type { ReactNode } from 'react';
import { Card } from './ui/Card';

interface StatCardProps {
  label: string;
  value: string;
  icon?: ReactNode;
  accent?: string;
}

const accentStyles: Record<string, string> = {
  primary: 'bg-primary-100 text-primary-600',
  blue: 'bg-blue-100 text-blue-600',
  green: 'bg-green-100 text-green-600',
  amber: 'bg-amber-100 text-amber-600',
  violet: 'bg-violet-100 text-violet-600',
  rose: 'bg-rose-100 text-rose-600',
};

export function StatCard({
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
          <p className="truncate text-sm font-medium text-gray-900">{label}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
      </div>
    </Card>
  );
}
