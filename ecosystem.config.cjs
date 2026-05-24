module.exports = {
    apps: [
      {
        name: 'ritual-agent',
        script: 'node',
        args: '--experimental-strip-types ./agent.ts',
        env: {
          NODE_ENV: 'development'
        }
      }
    ]
  };