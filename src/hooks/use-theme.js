import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'monitoring_theme';

function getSystemPreference() {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getInitialTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // localStorage blocked (private window, etc.) — fall through to system preference.
  }
  return getSystemPreference();
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

// Shared across every mount of useTheme() in this tab, so LoginPage and
// DashboardPage (which are never mounted at the same time, but could be
// toggled between within one session) always agree on the current theme.
let currentTheme = null;
const listeners = new Set();

export function useTheme() {
  const [theme, setThemeState] = useState(() => {
    if (currentTheme === null) {
      currentTheme = getInitialTheme();
      applyTheme(currentTheme);
    }
    return currentTheme;
  });

  useEffect(() => {
    listeners.add(setThemeState);
    return () => listeners.delete(setThemeState);
  }, []);

  const setTheme = useCallback((next) => {
    currentTheme = next;
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore — theme still applies for this session, just won't persist.
    }
    listeners.forEach((listener) => listener(next));
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(currentTheme === 'dark' ? 'light' : 'dark');
  }, [setTheme]);

  return { theme, setTheme, toggleTheme };
}
