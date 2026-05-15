import { spawn } from 'node:child_process';
import os from 'node:os';

/* global process */

const children = [];

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const start = (name, command, args, env = {}) => {
  const child = spawn(command, args, {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false
  });

  children.push(child);

  child.stdout.on('data', (data) => {
    process.stdout.write(`[${name}] ${data}`);
  });

  child.stderr.on('data', (data) => {
    process.stderr.write(`[${name}] ${data}`);
  });

  child.on('exit', (code) => {
    if (code && code !== 0) {
      console.error(`[${name}] exited with code ${code}`);
      shutdown(code);
    }
  });
};

const getLanAddresses = () => Object.values(os.networkInterfaces())
  .flat()
  .filter((address) => address && address.family === 'IPv4' && !address.internal)
  .map((address) => address.address);

const shutdown = (code = 0) => {
  children.forEach((child) => {
    if (!child.killed) {
      child.kill();
    }
  });
  process.exit(code);
};

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

start('rooms', 'node', ['room-server.js']);
start('vite', npmCommand, ['run', 'dev', '--', '--host', '0.0.0.0']);

setTimeout(() => {
  const addresses = getLanAddresses();
  if (addresses.length) {
    console.log(`LAN app URL: http://${addresses[0]}:5173/`);
  }
}, 1000);
