import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { getMyDonations } from '../../services/donations';
import type { DonationRecord } from '../../types';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { StatCard } from '../../components/StatCard';
import { PageLoader } from '../../components/PageLoader';
import { formatCurrency, isToday } from '../../utils/format';

export function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [donations, setDonations] = useState<DonationRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyDonations()
      .then(setDonations)
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load donations');
        setDonations([]);
      });
  }, []);

  const todayTotal = useMemo(
    () =>
      (donations ?? [])
        .filter((d) => isToday(d.timestamp))
        .reduce((sum, d) => sum + d.amount, 0),
    [donations],
  );

  const totalDonations = useMemo(
    () => (donations ?? []).length,
    [donations],
  );

  const totalCollected = useMemo(
    () => (donations ?? []).reduce((sum, d) => sum + d.amount, 0),
    [donations],
  );

  if (!donations) {
    return <PageLoader />;
  }

  return (
    <div className="space-y-6">
      <Card padding="lg">
        <div className="space-y-6 text-center">
          <div className="space-y-2">
            <p className="text-sm font-medium text-primary-600">Welcome,</p>
            <h2 className="text-2xl font-semibold text-gray-900">
              {user?.collectorName}
            </h2>
            <p className="text-gray-500">
              Ready to collect today's donations.
            </p>
          </div>

          <Button
            size="lg"
            onClick={() => navigate('/donation')}
            className="min-w-[200px]"
          >
            Record Donation
          </Button>
        </div>
      </Card>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Today's Collections"
          value={formatCurrency(todayTotal)}
          accent="primary"
        />
        <StatCard
          label="Total Donations"
          value={String(totalDonations)}
          accent="blue"
        />
        <StatCard
          label="Total Collected"
          value={formatCurrency(totalCollected)}
          accent="green"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card padding="sm" className="card-shadow-hover cursor-pointer" onClick={() => navigate('/donation')}>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 text-primary-600">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-gray-900">Record a Donation</p>
              <p className="text-xs text-gray-500">Generate a new receipt</p>
            </div>
          </div>
        </Card>

        <Card padding="sm" className="card-shadow-hover cursor-pointer" onClick={() => navigate('/my-donations')}>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-gray-900">My Donations</p>
              <p className="text-xs text-gray-500">View your collected donations</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
