export function httpPort() {
  return process.env.PORT;
}

export function mediaProcessEnvironment() {
  const { PATH, LANG, SSL_CERT_FILE, SSL_CERT_DIR } = process.env;
  return { NODE_ENV: 'production' as const, PATH, LANG, SSL_CERT_FILE, SSL_CERT_DIR };
}
