const UnknownTenantPage = (): JSX.Element => {
  return (
    <section>
      <h2 className="text-xl font-semibold text-rose-700">Unknown Tenant</h2>
      <p className="mt-2 text-sm text-slate-600">
        This subdomain is not mapped to an active tenant.
      </p>
    </section>
  );
};

export default UnknownTenantPage;
