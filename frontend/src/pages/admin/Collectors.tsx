import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import * as adminService from '../../services/admin';
import type { AdminCollector } from '../../types';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/Modal';
import { Badge } from '../../components/Badge';
import { PageLoader } from '../../components/PageLoader';

const collectorSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  password: z.string().optional(),
  collectorName: z.string().min(1, 'Collector name is required'),
  role: z.enum(['Admin', 'Collector']),
  active: z.boolean(),
});

const createCollectorSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters'),
  password: z.string().min(4, 'Password must be at least 4 characters'),
  collectorName: z.string().min(1, 'Collector name is required'),
  role: z.enum(['Admin', 'Collector']),
  active: z.boolean(),
});

type CollectorForm = z.infer<typeof collectorSchema>;

const ROLE_OPTIONS = [
  { value: 'Collector', label: 'Collector' },
  { value: 'Admin', label: 'Admin' },
];

interface ModalState {
  type: 'create' | 'edit' | 'reset';
  collector?: AdminCollector;
}

export function Collectors() {
  const [collectors, setCollectors] = useState<AdminCollector[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [busy, setBusy] = useState(false);

  const loadCollectors = async () => {
    try {
      setCollectors(await adminService.getCollectors());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load collectors');
    }
  };

  useEffect(() => {
    loadCollectors();
  }, []);

  const refresh = async () => {
    setError(null);
    await loadCollectors();
  };

  const toggleActive = async (collector: AdminCollector) => {
    setError(null);
    setBusy(true);
    try {
      await adminService.updateCollector(collector.collectorId, {
        active: !collector.active,
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update collector');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (collector: AdminCollector) => {
    if (!window.confirm(`Delete collector "${collector.collectorName}"? This cannot be undone.`)) {
      return;
    }

    setError(null);
    setBusy(true);
    try {
      await adminService.deleteCollector(collector.collectorId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete collector');
    } finally {
      setBusy(false);
    }
  };

  if (!collectors) {
    return <PageLoader />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Collectors</h2>
          <p className="mt-1 text-sm text-gray-500">
            Manage collector accounts and permissions.
          </p>
        </div>
        <Button onClick={() => setModal({ type: 'create' })}>
          Add Collector
        </Button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      <Card padding="md">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2 font-medium">Collector ID</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Username</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {collectors.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                    No collectors found.
                  </td>
                </tr>
              )}
              {collectors.map((collector) => (
                <tr key={collector.collectorId} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{collector.collectorId}</td>
                  <td className="px-3 py-2.5 font-medium text-gray-900">{collector.collectorName}</td>
                  <td className="px-3 py-2.5 text-gray-600">{collector.username}</td>
                  <td className="px-3 py-2.5">
                    <Badge tone={collector.role === 'Admin' ? 'blue' : 'gray'}>
                      {collector.role}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge tone={collector.active ? 'green' : 'red'}>
                      {collector.active ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => toggleActive(collector)}
                      >
                        {collector.active ? 'Deactivate' : 'Activate'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setModal({ type: 'edit', collector })}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setModal({ type: 'reset', collector })}
                      >
                        Reset Password
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:bg-red-50 hover:text-red-700"
                        disabled={busy}
                        onClick={() => handleDelete(collector)}
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {modal?.type === 'create' && (
        <CollectorModal
          mode="create"
          onClose={() => setModal(null)}
          onSaved={async () => {
            await refresh();
            setModal(null);
          }}
        />
      )}

      {modal?.type === 'edit' && modal.collector && (
        <CollectorModal
          mode="edit"
          collector={modal.collector}
          onClose={() => setModal(null)}
          onSaved={async () => {
            await refresh();
            setModal(null);
          }}
        />
      )}

      {modal?.type === 'reset' && modal.collector && (
        <ResetPasswordModal
          collector={modal.collector}
          onClose={() => setModal(null)}
          onSaved={async () => {
            await refresh();
            setModal(null);
          }}
        />
      )}
    </div>
  );
}

interface CollectorModalProps {
  mode: 'create' | 'edit';
  collector?: AdminCollector;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

function CollectorModal({ mode, collector, onClose, onSaved }: CollectorModalProps) {
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CollectorForm>({
    resolver: zodResolver(mode === 'create' ? createCollectorSchema : collectorSchema),
    defaultValues: {
      username: collector?.username ?? '',
      password: '',
      collectorName: collector?.collectorName ?? '',
      role: collector?.role ?? 'Collector',
      active: collector?.active ?? true,
    },
  });

  const onSubmit = async (data: CollectorForm) => {
    setSubmitError(null);
    try {
      if (mode === 'create') {
        if (!data.password) return;
        await adminService.createCollector({ ...data, password: data.password });
      } else if (collector) {
        await adminService.updateCollector(collector.collectorId, {
          username: data.username,
          collectorName: data.collectorName,
          role: data.role,
          active: data.active,
        });
      }
      await onSaved();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save collector');
    }
  };

  return (
    <Modal title={mode === 'create' ? 'Add Collector' : 'Edit Collector'} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        {submitError && (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
            {submitError}
          </div>
        )}

        <Input
          label="Collector Name"
          placeholder="Enter full name"
          error={errors.collectorName?.message}
          {...register('collectorName')}
        />

        <Input
          label="Username"
          placeholder="Enter username"
          autoComplete="off"
          error={errors.username?.message}
          {...register('username')}
        />

        {mode === 'create' && (
          <Input
            label="Password"
            type="password"
            placeholder="Enter password"
            autoComplete="new-password"
            error={errors.password?.message}
            {...register('password')}
          />
        )}

        <Select
          label="Role"
          options={ROLE_OPTIONS}
          error={errors.role?.message}
          {...register('role')}
        />

        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            {...register('active')}
          />
          Active
        </label>

        <div className="flex gap-3 pt-2">
          <Button type="submit" loading={isSubmitting} className="flex-1">
            {mode === 'create' ? 'Add Collector' : 'Save Changes'}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  );
}

interface ResetPasswordModalProps {
  collector: AdminCollector;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

function ResetPasswordModal({ collector, onClose, onSaved }: ResetPasswordModalProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setSubmitError(null);

    if (password.length < 4) {
      setSubmitError('Password must be at least 4 characters');
      return;
    }

    if (password !== confirmPassword) {
      setSubmitError('Passwords do not match');
      return;
    }

    setBusy(true);
    try {
      await adminService.resetCollectorPassword(collector.collectorId, password);
      await onSaved();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to reset password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Reset Password — ${collector.collectorName}`} onClose={onClose}>
      <div className="space-y-4">
        {submitError && (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
            {submitError}
          </div>
        )}

        <Input
          label="New Password"
          type="password"
          placeholder="Enter new password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <Input
          label="Confirm Password"
          type="password"
          placeholder="Re-enter new password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />

        <div className="flex gap-3 pt-2">
          <Button loading={busy} className="flex-1" onClick={submit}>
            Reset Password
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
