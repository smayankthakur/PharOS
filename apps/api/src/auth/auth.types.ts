export type AuthenticatedUser = {
  userId: string;
  tenantId: string | null;
  email: string;
  name: string;
};

export type JwtClaims = {
  sub: string;
  tenantId: string | null;
  email: string;
  name: string;
};
