import { execFile } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function localRequestAllowed(req) {
  const loopbacks = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
  if (!loopbacks.includes(req.socket.remoteAddress)) return false;
  const host = req.headers.host;
  if (!host || !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host))
    return false;
  if (req.headers.origin && req.headers.origin !== `http://${host}`)
    return false;
  return (
    !req.headers['sec-fetch-site'] ||
    ['same-origin', 'none'].includes(req.headers['sec-fetch-site'])
  );
}

export function trackingServicePlugin() {
  const token = randomBytes(32).toString('hex');
  let restarting = false;
  const script = fileURLToPath(
    new URL('./tracking-service.ps1', import.meta.url)
  );
  const runtime =
    process.env.KINETIQ_TRACKING_RUNTIME ||
    path.resolve(path.dirname(script), '../../work/slimevr-runtime');
  function execute(action) {
    return new Promise((resolve, reject) => {
      execFile(
        process.env.KINETIQ_POWERSHELL || 'pwsh.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-File',
          script,
          '-Action',
          action,
          '-RuntimePath',
          runtime,
          '-JavaPath',
          process.env.KINETIQ_JAVA || 'java',
        ],
        { windowsHide: true, timeout: 45000, maxBuffer: 65536 },
        (error, stdout) => {
          try {
            const result = JSON.parse(stdout.trim());
            if (error || !result.available)
              reject(new Error(result.error || 'Service control failed.'));
            else resolve(result);
          } catch {
            reject(
              new Error(
                error
                  ? 'Local service control failed. Check PowerShell 7, the runtime path, Java installation, and Windows permissions.'
                  : 'Invalid service response.'
              )
            );
          }
        }
      );
    });
  }
  return {
    name: 'kinetiq-local-tracking-service',
    configureServer(server) {
      server.middlewares.use('/api/tracking-service', async (req, res) => {
        const reply = (code, body) => {
          res.statusCode = code;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(body));
        };
        if (!localRequestAllowed(req))
          return reply(403, { error: 'Local dashboard access only.' });
        if (process.platform !== 'win32')
          return reply(503, {
            error:
              'Service control requires the local Windows development server.',
          });
        if (req.method === 'GET') {
          try {
            return reply(200, {
              ...(await execute('status')),
              token,
              restarting,
            });
          } catch (error) {
            return reply(503, { error: error.message });
          }
        }
        if (req.method !== 'POST')
          return reply(405, { error: 'Method not allowed.' });
        const supplied = req.headers['x-kinetiq-service-token'];
        if (
          req.headers.origin !== `http://${req.headers.host}` ||
          typeof supplied !== 'string' ||
          !/^[a-f0-9]{64}$/.test(supplied) ||
          !timingSafeEqual(Buffer.from(supplied), Buffer.from(token))
        )
          return reply(403, {
            error: 'Invalid local service token. Refresh the page.',
          });
        if (restarting)
          return reply(409, { error: 'A restart is already in progress.' });
        restarting = true;
        try {
          reply(200, await execute('restart'));
        } catch (error) {
          reply(503, { error: error.message });
        } finally {
          restarting = false;
        }
      });
    },
  };
}
