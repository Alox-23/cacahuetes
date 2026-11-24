const configured = {
  google: () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  apple: () => Boolean(process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID &&
    process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY)
};

/** Configured sign-in providers, in a stable order. */
export const providers = () => ['google', 'apple'].filter((name) => configured[name]());
