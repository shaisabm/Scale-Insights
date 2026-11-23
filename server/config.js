function need(env, name) {
  if (!env[name]) throw new Error(`Missing environment variable ${name}`);
  return env[name];
}

/**
 * Amazon Ads settings. `profileId` is the real profile (read-only for agents); the test login
 * and its test-account profile are the only place writes may go outside production.
 */
export function adsConfig(env = process.env) {
  return {
    host: env.AMAZON_ADS_API_HOST || "https://advertising-api.amazon.com",
    clientId: need(env, "AMAZON_ADS_CLIENT_ID"),
    clientSecret: need(env, "AMAZON_ADS_CLIENT_SECRET"),
    refreshToken: need(env, "AMAZON_ADS_REFRESH_TOKEN"),
    profileId: need(env, "AMAZON_ADS_PROFILE_ID"),
    timeZone: env.AMAZON_ADS_TIME_ZONE || "America/Los_Angeles",
    testRefreshToken: env.AMAZON_ADS_TEST_REFRESH_TOKEN || "",
    testProfileId: env.AMAZON_ADS_TEST_PROFILE_ID || "",
    production: env.VERCEL_ENV === "production",
  };
}
