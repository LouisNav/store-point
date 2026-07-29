module.exports = {
  apps: [
    {
      name: 'store-point-web',
      script: 'node_modules/.bin/next',
      args: 'start',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
      },
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      restart_delay: 2000,
    },
    {
      name: 'store-point-sync',
      script: 'node_modules/.bin/tsx',
      args: 'scripts/sync-worker.ts',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        SYNC_RUNNER: 'pm2',
      },
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      restart_delay: 5000,
    },
  ],
};
