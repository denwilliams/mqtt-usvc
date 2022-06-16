import consul from "consul";
import { readFile } from "fs";
import { promisify } from "util";
import yaml from "js-yaml";

const readFileAsync = promisify(readFile);

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

function parseString(str: string) {
  if (str === "true") return true;
  if (str === "false") return false;
  if (str === "null") return null;
  if (str === "undefined") return undefined;
  const num = Number(str);
  if (!isNaN(num)) return num;
  if (str[0] === "{") return JSON.parse(str);
  return str;
}

async function getConsulConfigNested<ServiceConfig>(prefix?: string) {
  if (!prefix) return undefined;

  const opts: consul.ConsulOptions = { promisify: true };

  if (process.env.CONSUL_HOST) {
    opts.host = process.env.CONSUL_HOST;
  }
  if (process.env.CONSUL_PORT) {
    opts.port = process.env.CONSUL_PORT;
  }

  console.info(
    "Fetching config from Consul host=%s port=%s prefix=%s",
    opts.host || "default",
    opts.port || "default",
    prefix
  );

  const consulClient = consul(opts);
  const keys: string[] = await consulClient.kv.keys(prefix);
  const values = (await Promise.all(
    keys.map((key) => consulClient.kv.get(key))
  )) as any[];

  return values.reduce((obj, value, i) => {
    const { Key, Value } = value;
    const fullPath: string = Key.replace(prefix, "");
    const path = fullPath.split("/").filter((s) => s !== "");
    if (!path.length) return obj;
    const basePath = path.splice(0, path.length - 1);
    const [fieldName] = path;

    const base = basePath.reduce((x, k) => {
      if (!x[k]) {
        x[k] = {};
      }
      return x[k];
    }, obj);
    if (Value === null) {
      base[fieldName] = {};
    } else {
      base[fieldName] = parseString(Value);
    }
    return obj;
  }, {} as any);
}

async function getConsulConfigJson<ServiceConfig>(
  key?: string
): Promise<ConfigVars<ServiceConfig> | undefined> {
  if (!key) return undefined;

  const opts: consul.ConsulOptions = { promisify: true };

  if (process.env.CONSUL_HOST) {
    opts.host = process.env.CONSUL_HOST;
  }
  if (process.env.CONSUL_PORT) {
    opts.port = process.env.CONSUL_PORT;
  }

  console.info(
    "Fetching config from Consul host=%s port=%s key=%s",
    opts.host || "default",
    opts.port || "default",
    key
  );

  const consulClient = consul(opts);
  const result: any = await consulClient.kv.get(key);
  return JSON.parse(result.Value);
}

export async function getConfig<ServiceConfig>(
  configVars?: ConfigVars<ServiceConfig>
): Promise<Config<ServiceConfig>> {
  const path = process.env.CONFIG_PATH || configVars?.configPath;

  const fileConfig: ConfigVars<ServiceConfig> | undefined = path
    ? (yaml.load(await readFileAsync(path, "utf8")) as any)
    : undefined;

  const consulConfigNested = await getConsulConfigNested<ServiceConfig>(
    process.env.CONSUL_KV_PREFIX
  );

  const consulConfigJson = await getConsulConfigJson<ServiceConfig>(
    process.env.CONSUL_KV_KEY
  );

  const mergedConfig = Object.assign(
    {},
    fileConfig,
    consulConfigNested,
    consulConfigJson,
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
