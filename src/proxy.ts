import { NextResponse, type NextRequest } from 'next/server';
import { getConfig } from '@/server/config';
import { loginReturnPath, RETURN_PATH_HEADER } from '@/shared/return-path';

export function proxy(request: NextRequest) {
  const forwarded = new Headers(request.headers);
  const { pathname, search } = request.nextUrl;
  forwarded.set(RETURN_PATH_HEADER, loginReturnPath(pathname + search));
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const dev = process.env.NODE_ENV === 'development';
  const remoteImages = getConfig().ALLOW_REMOTE_IMAGES ? ' https: http:' : '';
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${remoteImages}`,
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    'frame-src https://www.youtube-nocookie.com',
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join('; ');
  forwarded.set('x-nonce', nonce);
  forwarded.set('Content-Security-Policy', policy);
  const response = NextResponse.next({ request: { headers: forwarded } });
  response.headers.set('Content-Security-Policy', policy);
  return response;
}

export const config = {
  matcher: [
    '/',
    '/setup',
    '/welcome',
    '/login',
    '/reset-password',
    '/connect/extension',
    '/library',
    '/ask',
    '/graph',
    '/settings',
    '/connections',
    '/highlights',
    '/read/:id',
    '/media/:id',
  ],
};
