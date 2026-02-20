export type AuthenticatedUser = {
  userId: string;
  tenantId: string;
  email: string;
  name: string;
};

export type JwtClaims = {
  sub: string;
  tenantId: string;
  email: string;
  name: string;
};
