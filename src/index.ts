import { Logger, getLogger } from "./logging";
import { Config, getConfig, ConfigVars } from "./config";
import { startHttpServer } from "./http";
import { Service, createService } from "./service";
export { Service as MqttService } from "./service";

export interface Options {
  logger?: Logger;
}

/**
 * Create the microservice
 */
export async function create<ServiceConfig>(
  config?: ConfigVars<ServiceConfig>,
  options?: Options
): Promise<Service<ServiceConfig>> {
  const logger = getLogger(options);
  const mergedConfig = await getConfig(config);

  const service = createService<ServiceConfig>(
    mergedConfig.mqtt,
    mergedConfig.service,
    logger
  );

  if (mergedConfig.http.port) {
    startHttpServer(parseInt(String(mergedConfig.http.port)), service);
  }

  return service;
}
