import mqttLib from "mqtt";
import { MqttConfig } from "./config";
import { Logger } from "./logging";

export interface Mqtt {
  connected: boolean;
  client: mqttLib.MqttClient;
}

export function startMqtt(config: Required<MqttConfig>, logger: Logger): Mqtt {
  logger.info("Connecting to " + config.uri);
  const client = mqttLib.connect(config.uri);

  const mqtt = {
    connected: false,
    client,
  };

  client.on("connect", () => {
    logger.info("MQTT connected");
    mqtt.connected = true;
  });

  client.on("reconnect", () => {
    logger.info("MQTT reconnecting");
  });

  client.on("close", () => {
    mqtt.connected = false;
    logger.info("MQTT disconnected");
  });

  client.on("offline", () => {
    mqtt.connected = false;
    logger.info("MQTT offline");
  });

  client.on("end", () => {
    mqtt.connected = false;
    logger.info("MQTT end");
  });

  client.on("error", (err) => {
    logger.error("MQTT error", err);
    process.exit(1);
  });

  return mqtt;
}
