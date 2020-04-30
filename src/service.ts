import { MqttConfig } from "./config";
import { startMqtt } from "./mqtt";
import { Logger } from "./logging";
import { EventEmitter } from "events";
import { messagesReceivedCounter, messagesSentCounter } from "./metrics";

export type QoS = 0 | 1 | 2;
export type ServiceEvent = "message";

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

export interface Service<ServiceConfig> {
  /** The service config loaded from file, or passed into create. */
  readonly config: ServiceConfig;
  /** MQTT topic prefix in use for publishing. */
  readonly prefix: string;
  /** True if mqtt is connected */
  readonly mqttConnected: boolean;
  /** Subscribe to events on this topic. */
  subscribe(key: string): void;
  send(key: string, data: any, options?: PublishOptions): void;
  end(): void;
  on(event: ServiceEvent, listener: (topic: string, data: any) => void): void;
  removeListener(
    event: ServiceEvent,
    listener: (topic: string, data: any) => void
  ): void;
  removeAllListeners(event: ServiceEvent): void;
}

export function createService<ServiceConfig>(
  mqttConfig: Required<MqttConfig>,
  serviceConfig: ServiceConfig,
  logger: Logger
): Service<ServiceConfig> {
  const { prefix, subscriptions } = mqttConfig;
  const e = new EventEmitter();

  const topic = (key: string) =>
    key.startsWith("~") ? key.replace("~", prefix) : key;

  const mqtt = startMqtt(mqttConfig, logger);

  const service: Service<ServiceConfig> = {
    config: serviceConfig,
    prefix: prefix,

    get mqttConnected(): boolean {
      return mqtt.connected;
    },

    send(key, data, options: PublishOptions) {
      mqtt.client.publish(topic(key), JSON.stringify(data), options);
      messagesSentCounter.inc();
    },

    subscribe(key) {
      mqtt.client.subscribe(topic(key));
    },

    end() {
      mqtt.client.end();
    },

    on(event, listener) {
      e.on(event, listener);
    },

    removeListener(event, listener) {
      e.removeListener(event, listener);
    },

    removeAllListeners(event) {
      e.removeAllListeners(event);
    },
  };

  subscriptions.forEach((s) => service.subscribe(s));

  mqtt.client.on("message", (topic, message) => {
    messagesReceivedCounter.inc();

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

  return service;
}
