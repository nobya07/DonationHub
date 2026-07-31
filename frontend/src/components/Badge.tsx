interface BadgeProps {
  children: React.ReactNode;
  tone?: 'green' | 'red' | 'blue' | 'gray';
}

const toneStyles = {
  green: 'bg-green-50 text-green-700 ring-green-600/20',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
  blue: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  gray: 'bg-gray-50 text-gray-600 ring-gray-500/20',
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
