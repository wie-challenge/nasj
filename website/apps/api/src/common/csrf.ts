import { SignJWT, jwtVerify } from 'jose';
export async function csrfToken(secret: string, sessionId: string) {
  return new SignJWT({ sid: sessionId, purpose: 'csrf' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(secret));
}
export async function verifyCsrf(secret: string, token: string, sessionId: string) {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ['HS256'],
    });
    return payload.sid === sessionId && payload.purpose === 'csrf';
  } catch {
    return false;
  }
}
