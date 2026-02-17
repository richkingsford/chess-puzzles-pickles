const { spawnSync } = require('child_process');

const token = process.env.NETLIFY_AUTH_TOKEN;
const siteId = process.env.NETLIFY_SITE_ID;

if (!token || !siteId) {
  console.error('Missing required environment variables: NETLIFY_AUTH_TOKEN and NETLIFY_SITE_ID');
  process.exit(1);
}

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
};

run('npm', ['--prefix', 'game', 'run', 'build']);
run('npx', ['netlify', 'deploy', '--prod', '--dir', 'game/dist', '--site', siteId, '--auth', token]);
