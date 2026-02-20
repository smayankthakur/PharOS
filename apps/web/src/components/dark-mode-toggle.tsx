'use client';

export const DarkModeToggle = (): JSX.Element => {
  return (
    <button
      type="button"
      className="rounded border border-slate-400 px-3 py-1 text-sm"
      aria-label="Toggle dark mode"
    >
      Dark Mode
    </button>
  );
};

