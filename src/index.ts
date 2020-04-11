import { readFileSync } from "fs";
import { EventEmitter } from "events";
import mqtt, { IClientPublishOptions } from "mqtt";
import yaml from "js-yaml";

interface MqttConfig {
  uri?: string;
  prefix?: string;
  subscriptions?: string[];
}

interface Config<ServiceConfig> {
  configPath?: string;
  service?: ServiceConfig;
  mqtt?: MqttConfig;
}

type QoS = 0 | 1 | 2;

interface PublishOptions {
  /**
   * the QoS
   */
  qos: QoS;
  /**
   * the retain flag
   */
  retain?: boolean;
}

interface Service<ServiceConfig> {
  /** The service config loaded from file, or passed into create. */
  readonly config: ServiceConfig;
  /** MQTT topic prefix in use for publishing. */
  readonly prefix: string;
  /** Subscribe to events on this topic. */
  subscribe(key: string): void;
  send(key: string, data: any, options?: PublishOptions): void;
  sendRoot(key: string, data: any, options?: PublishOptions): void;
  end(): void;
}

interface Options {
  logger?: {
    info(message?: any, ...optionalParams: any[]): void;
    warn(message?: any, ...optionalParams: any[]): void;
    error(message?: any, ...optionalParams: any[]): void;
  };
}

/**
 * Create the microservice
 */
export function create<ServiceConfig>(
  config = {} as Config<ServiceConfig>,
  options = {} as Options
): Service<ServiceConfig> {
  const { logger = console } = options;

  const path = process.env.CONFIG_PATH || config.configPath;

  const fileConfig: Config<ServiceConfig> = path
    ? yaml.safeLoad(readFileSync(path, "utf8"))
    : {};
  const mergedConfig = Object.assign(fileConfig, config);

  const mqttConfig = mergedConfig.mqtt || {};
  const serviceConfig = mergedConfig.service || ({} as ServiceConfig);

  const e = new EventEmitter();

  const uri = process.env.MQTT_URI || mqttConfig.uri;
  if (!uri) {
    throw new Error("MQTT URI Required.");
  }

  const prefix = process.env.MQTT_PREFIX || mqttConfig.prefix || "";
  const subscriptions = mqttConfig.subscriptions || [];

  logger.info("Connecting to " + uri);
  const client = mqtt.connect(uri);

  const service: Service<ServiceConfig> = {
    config: serviceConfig,
    prefix: prefix,

    send(key: string, data: any, options: PublishOptions) {
      client.publish(prefix + key, JSON.stringify(data), options);
    },

    sendRoot(key: string, data: any, options: PublishOptions) {
      client.publish(key, JSON.stringify(data), options);
    },

    subscribe(key: string) {
      client.subscribe(prefix + key);
    },

    end() {
      client.end();
    }
  };

  client.on("connect", () => {
    logger.info("MQTT connected");
    subscriptions.forEach(s => client.subscribe(s));
  });

  client.on("reconnect", () => {
    logger.info("MQTT reconnecting");
  });

  client.on("close", () => {
    logger.info("MQTT disconnected");
  });

  client.on("offline", () => {
    logger.info("MQTT offline");
  });

  client.on("end", () => {
    logger.info("MQTT end");
  });

  client.on("error", err => {
    logger.error("MQTT error", err);
    process.exit(1);
  });

  client.on("message", (topic, message) => {
    // message is Buffer
    const str = message.toString();
    let data;
    try {
      data = JSON.parse(str);
    } catch (err) {
      // naive error handling
      data = str;
    }

    if (topic.startsWith(prefix)) {
      e.emit("message", topic.replace(prefix, ""), data);
      return;
    }

    e.emit("message", topic, data);
  });

  return service;
}
