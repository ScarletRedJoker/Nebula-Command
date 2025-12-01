// Simple theme handling utility
export type Theme = 'light' | 'dark' | 'system';
const storageKey = 'discord-ticket-theme';

// Get theme
export function getTheme(): Theme {
  if (typeof localStorage !== 'undefined') {
    return (localStorage.getItem(storageKey) as Theme || 'system');
  }
  return 'system';
}

// Set theme
export function setTheme(theme: Theme): void {
  const root = window.document.documentElement;
  
  localStorage.setItem(storageKey, theme);
  
  // Remove current theme classes
  root.classList.remove('light', 'dark');
  
  // If system preference, check it
  if (theme === 'system') {
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches 
      ? 'dark' 
      : 'light';
    root.classList.add(systemTheme);
  } else {
    root.classList.add(theme);
  }
}

// Initialize theme on load
export function initializeTheme(): void {
  setTheme(getTheme());
  
  // Watch for system preference changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getTheme() === 'system') {
      setTheme('system');
    }
  });
}