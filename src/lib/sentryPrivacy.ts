/**
 * What Sentry may collect. Sentry 11's defaults include cookies, headers,
 * request/response bodies and stack-frame variables, which here could mean
 * session cookies and passwords from failed logins. Everything personal is
 * off: reports carry the error, stack trace and surrounding code only.
 */
export const SENTRY_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false, // search terms
  databaseQueryData: false,
  stackFrameVariables: false,
  frameContextLines: 5,
} as const;
