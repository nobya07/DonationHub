import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { useAuth } from '../../hooks/useAuth';
import { useTheme, type ThemePreference } from '../../context/ThemeContext';
import { useToast } from '../../components/Toast';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';

const APP_VERSION = '1.1.0';

const THEME_OPTIONS: { value: ThemePreference; label: string; hint: string }[] = [
  { value: 'light', label: 'Light Mode', hint: 'Always use the light theme' },
  { value: 'dark', label: 'Dark Mode', hint: 'Always use the dark theme' },
  { value: 'system', label: 'System Theme', hint: 'Follow your device setting' },
];

export function Settings() {
  const { user, logout } = useAuth();
  const { preference, setPreference } = useTheme();
  const showToast = useToast();
  const navigate = useNavigate();

  const [version, setVersion] = useState(APP_VERSION);
  const isOnline = useNetworkStatus();
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  useEffect(() => {
    let active = true;
    if (Capacitor.isNativePlatform()) {
      CapApp.getInfo()
        .then((info) => {
          if (active && info.version) setVersion(info.version);
        })
        .catch(() => {
          // fall back to the bundled version
        });
    }
    return () => {
      active = false;
    };
  }, []);

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    try {
      let installed = APP_VERSION;
      if (Capacitor.isNativePlatform()) {
        const info = await CapApp.getInfo();
        if (info.version) installed = info.version;
      }
      if (installed === APP_VERSION) {
        showToast(`You're on the latest version (${APP_VERSION})`);
      } else {
        showToast(`Version ${APP_VERSION} is available (installed: ${installed})`);
      }
    } catch {
      showToast(`You're on the latest version (${APP_VERSION})`);
    } finally {
      setCheckingUpdate(false);
    }
  };

  const settingRow = (
    label: string,
    value: string,
    onClick?: () => void,
  ) => (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-3 rounded-xl bg-gray-50 px-4 py-3 text-left transition-colors ${
        onClick ? 'cursor-pointer hover:bg-gray-100' : 'cursor-default'
      }`}
    >
      <span className="text-sm text-gray-500">{label}</span>
      <span className="flex items-center gap-2 text-sm font-medium text-gray-900">
        {value}
        {onClick && (
          <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        )}
      </span>
    </button>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Settings</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Appearance, preferences and app information.
        </p>
      </div>

      <Card padding="md">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Appearance
        </h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {THEME_OPTIONS.map((option) => {
            const active = preference === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setPreference(option.value)}
                className={`rounded-xl border-2 px-4 py-3 text-left transition-colors ${
                  active
                    ? 'border-primary-600 bg-primary-50 dark:bg-primary-950'
                    : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-gray-600'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className={`text-sm font-semibold ${active ? 'text-primary-700 dark:text-primary-300' : 'text-gray-900 dark:text-white'}`}>
                    {option.label}
                  </p>
                  {active && (
                    <svg className="h-4 w-4 text-primary-600 dark:text-primary-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{option.hint}</p>
              </button>
            );
          })}
        </div>
      </Card>

      <Card padding="md">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Preferences
        </h3>
        <div className="space-y-2">
          {settingRow(
            'Printer Settings',
            'Bluetooth receipt printer',
            () => navigate('/printer-settings'),
          )}
          {settingRow(
            'WhatsApp Settings',
            isOnline ? '🟢 Available' : '🔴 Unavailable',
          )}
        </div>
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          WhatsApp receipts are sent automatically to the donor's number after
          each donation when the device is online.
        </p>
      </Card>

      <Card padding="md">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          About
        </h3>
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-600 text-white">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              DonationHub
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Donation collection &amp; receipt management for collectors.
            </p>
          </div>
        </div>
        <div className="space-y-2">
          {settingRow('Version', `v${version}`)}
          {settingRow(
            'App Update',
            checkingUpdate ? 'Checking…' : 'Check for the latest version',
            () => void handleCheckUpdate(),
          )}
        </div>
        <details className="mt-4 rounded-xl bg-gray-50 px-4 py-3 dark:bg-gray-800">
          <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300">
            Release Notes
          </summary>
          <div className="mt-3 space-y-3 text-sm text-gray-500 dark:text-gray-400">
            <div>
              <p className="font-semibold text-gray-900 dark:text-white">Version 1.1.0</p>
              <ul className="mt-1 list-inside list-disc space-y-1">
                <li>Offline mode — save donations without internet and auto-sync</li>
                <li>Improved collector dashboard with live stats</li>
                <li>New Settings page with Dark Mode and System Theme</li>
                <li>Search, sort and export (CSV/PDF) in My Donations</li>
                <li>New printed receipt layout with remarks</li>
                <li>WhatsApp receipts auto-retry once on failure</li>
                <li>Production icons, splash screen, portrait lock and screenshot protection</li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-gray-900 dark:text-white">Version 1.0.0</p>
              <ul className="mt-1 list-inside list-disc space-y-1">
                <li>Initial release with donations, receipts and Bluetooth printing</li>
              </ul>
            </div>
          </div>
        </details>
      </Card>

      <Button
        variant="secondary"
        size="lg"
        className="w-full border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
        onClick={() => void logout()}
      >
        Logout
      </Button>
      <p className="pb-2 text-center text-xs text-gray-400 dark:text-gray-500">
        Signed in as {user?.collectorName} (@{user?.username})
      </p>
    </div>
  );
}
