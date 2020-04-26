import consul from "consul";
import { readFileSync } from "fs";
import yaml from "js-yaml";

export interface MqttConfig {
  uri?: string;
  prefix?: string;
  subscriptions?: string[];
}

export interface HttpConfig {
  port?: number | null;
}

export interface ConfigVars<ServiceConfig> {
  configPath?: string;
  service?: ServiceConfig;
  mqtt?: MqttConfig;
  http?: HttpConfig;
}

export interface Config<ServiceConfig> {
  service: ServiceConfig;
  mqtt: Required<MqttConfig>;
  http: Required<HttpConfig>;
}

async function getConsulConfig<ServiceConfig>(prefix?: string) {
  if (!prefix) return undefined;

  const consulClient = consul({ promisify: true });
  const keys: string[] = await consulClient.kv.keys(
    process.env.CONSUL_KV_PREFIX
  );
  const values = (await Promise.all(
    keys.map((key) => consulClient.kv.get(key))
  )) as string[];

  return keys.reduce((obj, key, i) => {
    const fieldName = key.replace(prefix, "") as "mqtt" | "http" | "service";
    const value = JSON.parse(values[i]);
    obj[fieldName] = value;
    return obj;
  }, {} as ConfigVars<ServiceConfig>);
}

export async function getConfig<ServiceConfig>(
  configVars?: ConfigVars<ServiceConfig>
): Promise<Config<ServiceConfig>> {
  const path = process.env.CONFIG_PATH || configVars?.configPath;

  const fileConfig: ConfigVars<ServiceConfig> = path
    ? yaml.safeLoad(readFileSync(path, "utf8"))
    : undefined;

  const consulConfigKeys = await getConsulConfig<ServiceConfig>(
    process.env.CONSUL_KV_PREFIX
  );

  const mergedConfig = Object.assign(
    {},
    fileConfig,
    consulConfigKeys,
    configVars
  );

  const mqttUri = process.env.MQTT_URI || mergedConfig.mqtt?.uri;
  if (!mqttUri) {
    throw new Error("MQTT URI Required.");
  }

  const mqttPrefix = process.env.MQTT_PREFIX || mergedConfig.mqtt?.prefix || "";

  const httpPort: number | null =
    (process.env.HTTP_PORT && parseInt(process.env.HTTP_PORT)) ||
    mergedConfig.http?.port ||
    null;

  const mqtt: Required<MqttConfig> = {
    subscriptions: [],
    ...mergedConfig.mqtt,
    uri: mqttUri,
    prefix: mqttPrefix,
  };
  const http: Required<HttpConfig> = {
    ...mergedConfig.http,
    port: httpPort,
  };
  const service: ServiceConfig = mergedConfig.service || ({} as ServiceConfig);

  return {
    mqtt,
    http,
    service,
  };
}
