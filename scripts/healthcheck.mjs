const apiUrl = process.env.API_HEALTH_URL ?? process.env.API_URL ?? 'http://localhost:4000/health';
const webUrl = process.env.WEB_HEALTH_URL ?? process.env.WEB_URL ?? 'http://localhost:3000';

const check = async (name, url) => {
  const response = await fetch(url, {
    method: 'GET',
    headers: { accept: 'application/json,text/html' },
  });

  if (!response.ok) {
    throw new Error(`${name} health failed (${response.status}) at ${url}`);
  }
};

const run = async () => {
  await check('api', apiUrl);
  await check('web', webUrl);
  console.log(`healthcheck ok api=${apiUrl} web=${webUrl}`);
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
