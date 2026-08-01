interface BadgeProps {
  children: React.ReactNode;
  tone?: 'green' | 'red' | 'blue' | 'gray';
}

const toneStyles = {
  green: 'bg-green-50 text-green-700 ring-green-600/20 dark:bg-green-950 dark:text-green-300 dark:ring-green-500/30',
  red: 'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-950 dark:text-red-300 dark:ring-red-500/30',
  blue: 'bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-950 dark:text-blue-300 dark:ring-blue-500/30',
  gray: 'bg-gray-50 text-gray-600 ring-gray-500/20 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-500/30',
};

export function Badge({ children, tone = 'gray' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
        toneStyles[tone]
      }`}
    >
      {children}
    </span>
  );
}
