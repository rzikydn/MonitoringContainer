import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../hooks/use-theme';

export default function ThemeToggle({ className = '', style }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`theme-toggle-btn ${className}`}
      style={style}
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
      <span>{isDark ? 'Light mode' : 'Dark mode'}</span>
    </button>
  );
}
