import { documentEventHandler } from "@sanity/functions";
import { createClient } from "@sanity/client";
import { readTriggerScanConfig, runScan, writeReport } from "./index2.js";
const handler = documentEventHandler(async ({ context }) => {
  const client = createClient({
    ...context.clientOptions,
    apiVersion: "2024-01-01",
    useCdn: false
  });
  const scanConfig = await readTriggerScanConfig(client);
  const result = await runScan(client, scanConfig, "function");
  await writeReport(client, result);
});
export {
  handler
};
//# sourceMappingURL=index.js.map
