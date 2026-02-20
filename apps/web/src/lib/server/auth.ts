import { cookies } from 'next/headers';

export const authHeaderFromCookie = async (): Promise<Record<string, string>> => {
  const token = (await cookies()).get('pharos_token')?.value;

  if (!token) {
    return {};
  }

  return {
    authorization: `Bearer ${token}`,
  };
};
