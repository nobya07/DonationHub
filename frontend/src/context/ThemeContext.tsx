import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

export type ThemePreference = 'dark' | 'light' | 'system';

interface ThemeContextValue {
  preference: ThemePreference;
  resolvedTheme: 'dark' | 'light';
  setPreference: (preference: ThemePreference) => void;
}

const THEME_NAMES: ThemePreference[] = ['dark', 'light', 'system'];

const STORAGE_KEY = 'dh_theme';
const TRANSITION_FADE_MS = 300;

async function readPreference(): Promise<ThemePreference> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { value } = await Preferences.get({ key: STORAGE_KEY });
      if (value && (THEME_NAMES as string[]).includes(value)) {
        return value as ThemePreference;
      }
    } catch {
      // fall through to localStorage
    }
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && (THEME_NAMES as string[]).includes(stored)) {
      return stored as ThemePreference;
    }
  } catch {
    // storage unavailable; fall back to the system theme
  }
  return 'system';
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [ready, setReady] = useState(false);
  const [systemTheme, setSystemTheme] = useState<'dark' | 'light'>(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light',
  );

  useEffect(() => {
    let active = true;
    readPreference().then((stored) => {
      if (!active) return;
      setPreferenceState(stored);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? 'dark' : 'light');
    };
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  const resolvedTheme: 'dark' | 'light' =
    preference === 'system' ? systemTheme : preference;

  useEffect(() => {
    if (!ready) return;

    // Enable a smooth fade for the switch, then toggle the theme class.
    document.documentElement.classList.add('theme-transitioning');
    const isDark = resolvedTheme === 'dark';
    document.documentElement.classList.toggle('dark', isDark);

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', isDark ? '#121212' : '#f57c00');
    }

    const timer = window.setTimeout(() => {
      document.documentElement.classList.remove('theme-transitioning');
    }, TRANSITION_FADE_MS);

    return () => window.clearTimeout(timer);
  }, [resolvedTheme, ready]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    const persist = async () => {
      if (Capacitor.isNativePlatform()) {
        try {
          await Preferences.set({ key: STORAGE_KEY, value: next });
          return;
        } catch {
          // fall through to localStorage below
        }
      }
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // storage unavailable; the choice applies for this session only
      }
    };
    void persist();
  }, []);

  return (
    <ThemeContext.Provider value={{ preference, resolvedTheme, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}