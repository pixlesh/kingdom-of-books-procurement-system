import { createApp } from './app.js';
import { config, warnOnMissingKeys } from './config/env.js';

warnOnMissingKeys();

const app = createApp();

app.listen(config.port, () => {
  console.log(`Kingdom of Books API server running on http://localhost:${config.port}`);
  console.log(`Accepting requests from: ${config.clientOrigin}`);
});
