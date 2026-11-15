import { createApp } from "./app";
import { config } from "./config";

const app = createApp();

app.listen(config.port, () => {
  console.log(`Duty Time Advice backend listening on http://localhost:${config.port} (${config.env})`);
});
