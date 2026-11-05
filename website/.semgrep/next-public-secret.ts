// Test cases for next-public-secret.yml (run with: semgrep --test .semgrep)

// ruleid: nasj-next-public-secret
const key = process.env.NEXT_PUBLIC_STRIPE_API_KEY;
// ruleid: nasj-next-public-secret
const db = process.env.NEXT_PUBLIC_DATABASE_URL;

// ok: nasj-next-public-secret
const appUrl = process.env.NEXT_PUBLIC_APP_URL;
// ok: nasj-next-public-secret
const secret = process.env.BETTER_AUTH_SECRET;

export { appUrl, db, key, secret };
