'use client';

import { useEffect } from 'react';

const resolveApiBase = (): string => {
  const configured = process.env.NEXT_PUBLIC_API_URL;
  return configured && configured.length > 0 ? configured : 'http://localhost:4000';
};

const ApiHealthCheck = (): null => {
  useEffect(() => {
    const controller = new AbortController();
    const apiBase = resolveApiBase().replace(/\/$/, '');

    const probe = async (): Promise<void> => {
      try {
        const response = await fetch(`${apiBase}/health`, {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
        });

        if (!response.ok) {
          console.error(
            `[PharOS] API health probe failed: ${response.status} ${response.statusText} (${apiBase}/health)`,
          );
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        console.error(`[PharOS] API health probe unreachable at ${apiBase}/health`, error);
      }
    };

    void probe();
    return () => controller.abort();
  }, []);

  return null;
};

export default ApiHealthCheck;
