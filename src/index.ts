import { readFileSync } from "fs";
import { EventEmitter } from "events";
import { parse } from "url";
import { createServer } from "http";
import mqtt from "mqtt";
import yaml from "js-yaml";

export interface MqttConfig {
  uri?: string;
  prefix?: string;
  subscriptions?: string[];
}

export interface HttpConfig {
  port?: number;
}

export interface Config<ServiceConfig> {
  configPath?: string;
  service?: ServiceConfig;
  mqtt?: MqttConfig;
  http?: HttpConfig;
}

export type QoS = 0 | 1 | 2;

export interface PublishOptions {
  /**
   * the QoS
   */
  qos: QoS;
  /**
   * the retain flag
   */
  retain?: boolean;
}

export type ServiceEvent = "message";

export interface Service<ServiceConfig> {
  /** The service config loaded from file, or passed into create. */
  readonly config: ServiceConfig;
  /** MQTT topic prefix in use for publishing. */
  readonly prefix: string;
  /** Subscribe to events on this topic. */
  subscribe(key: string): void;
  send(key: string, data: any, options?: PublishOptions): void;
  sendRoot(key: string, data: any, options?: PublishOptions): void;
  end(): void;
  on(event: ServiceEvent, listener: (topic: string, data: any) => void): void;
  removeListener(
    event: ServiceEvent,
    listener: (topic: string, data: any) => void
  ): void;
  removeAllListeners(event: ServiceEvent): void;
}

export interface Options {
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
  let mqttConnected = false;

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

  const topic = (key: string) =>
    key.startsWith("~") ? key.replace("~", prefix) : key;

  const service: Service<ServiceConfig> = {
    config: serviceConfig,
    prefix: prefix,

    send(key, data, options: PublishOptions) {
      client.publish(topic(key), JSON.stringify(data), options);
    },

    sendRoot(key, data, options: PublishOptions) {
      client.publish(topic(key), JSON.stringify(data), options);
    },

    subscribe(key) {
      client.subscribe(topic(key));
    },

    end() {
      client.end();
    },

    on(event, listener) {
      e.on(event, listener);
    },

    removeListener(event, listener) {
      e.removeListener(event, listener);
    },

    removeAllListeners(event) {
      e.removeAllListeners(event);
    }
  };

  function startHttpServer(port: number) {
    console.log("Starting HTTP server on port " + port);
    const server = createServer((req, res) => {
      const sendResponse = (
        data: string,
        statusCode: number,
        headers?: Record<string, string>
      ) => {
        res.writeHead(statusCode, headers);
        res.end(data);
      };

      if (req.method === "GET" && req.url) {
        const parts = parse(req.url);
        if (parts.pathname === "/status") {
          if (mqttConnected) {
            sendResponse("OK", 200, {
              "Content-Type": "text/plain"
            });
          } else {
            sendResponse("Not OK", 500, {
              "Content-Type": "text/plain"
            });
          }
          return;
        }
      }
      sendResponse("Not found", 404, { "Content-Type": "text/plain" });
    });
    server.listen(port, () => {
      console.log("Server now listening on port " + port);
    });
    server.on("error", err => {
      console.error("HTTP server error " + err);
    });
  }

  client.on("connect", () => {
    logger.info("MQTT connected");
    subscriptions.forEach(s => client.subscribe(s));
    mqttConnected = true;
  });

  client.on("reconnect", () => {
    logger.info("MQTT reconnecting");
  });

  client.on("close", () => {
    mqttConnected = false;
    logger.info("MQTT disconnected");
  });

  client.on("offline", () => {
    mqttConnected = false;
    logger.info("MQTT offline");
  });

  client.on("end", () => {
    mqttConnected = false;
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
      e.emit("message", topic.replace(prefix, "~"), data);
      return;
    }

    e.emit("message", topic, data);
  });

  const httpConfig = mergedConfig.http || {};
  const port = process.env.HTTP_PORT || httpConfig.port;
  if (port) {
    startHttpServer(parseInt(String(port)));
  }

  return service;
}
