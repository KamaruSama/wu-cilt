export type CookieJar = Record<string, string>;

export function parseCookieHeader(header: string): CookieJar {
  const jar: CookieJar = {};
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator <= 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name && value) jar[name] = value;
  }
  return jar;
}

export function mergeSetCookies(jar: CookieJar, setCookies: string[]): CookieJar {
  for (const setCookie of setCookies) {
    const firstPart = setCookie.split(';', 1)[0];
    const separator = firstPart.indexOf('=');
    if (separator <= 0) continue;

    const name = firstPart.slice(0, separator).trim();
    const value = firstPart.slice(separator + 1);
    const removesCookie = /(?:^|;)\s*max-age=0(?:;|$)/i.test(setCookie) || value === 'deleted';
    if (!name) continue;
    if (removesCookie) delete jar[name];
    else jar[name] = value;
  }
  return jar;
}

export function cookieHeader(jar: CookieJar): string {
  return Object.entries(jar).map(([name, value]) => `${name}=${value}`).join('; ');
}
