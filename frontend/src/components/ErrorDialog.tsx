import { Modal } from './Modal';
import { Button } from './ui/Button';

interface ErrorDialogProps {
  open: boolean;
  title?: string;
  message: string;
  onClose: () => void;
}

export function ErrorDialog({
  open,
  title = 'Something went wrong',
  message,
  onClose,
}: ErrorDialogProps) {
  if (!open) return null;

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900">
            <svg
              className="h-5 w-5 text-red-600 dark:text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
          </div>
          <p className="pt-1.5 text-sm text-gray-600 dark:text-gray-300">{message}</p>
        </div>
        <Button className="w-full" onClick={onClose}>
          OK
        </Button>
      </div>
    </Modal>
  );
}
