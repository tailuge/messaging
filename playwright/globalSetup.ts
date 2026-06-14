import http from 'http';

async function checkPort(host: string, port: number, timeoutMs = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://${host}:${port}/`, { timeout: timeoutMs }, (res) => {
      res.resume(); // consume response data to free up memory
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function globalSetup() {
  const available = await checkPort('localhost', 8080);
  if (!available) {
    console.error(
      '\n' +
      '╔══════════════════════════════════════════════════════════╗\n' +
      '║  PRECHECK FAILED: localhost:8080 is not reachable!      ║\n' +
      '║                                                        ║\n' +
      '║  The game server on port 8080 must be running.         ║\n' +
      '║  Start it with:  cd ../billiards; yarn serve           ║\n' +
      '╚══════════════════════════════════════════════════════════╝\n',
    );
    process.exit(1);
  }
  console.log('[globalSetup] localhost:8080 is reachable ✓');
}

export default globalSetup;
