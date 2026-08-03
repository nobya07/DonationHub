import { forwardRef, type SelectHTMLAttributes } from 'react';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  options: SelectOption[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, id, options, placeholder, className = '', ...props }, ref) => {
    const selectId = id ?? label.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="space-y-1.5">
        <label
          htmlFor={selectId}
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          {label}
        </label>
        <select
          ref={ref}
          id={selectId}
          className={`block w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-gray-900 transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-0 dark:bg-surface-raised dark:text-gray-100 ${
            error
              ? 'border-red-300 focus:border-red-400 focus:ring-red-200 dark:border-red-700 dark:focus:ring-red-800'
              : 'border-gray-300 focus:border-primary-400 focus:ring-primary-200 dark:border-gray-600 dark:focus:border-primary-500 dark:focus:ring-primary-900'
          } ${className}`}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? `${selectId}-error` : undefined}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && (
          <p id={`${selectId}-error`} className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  },
);

Select.displayName = 'Select';
