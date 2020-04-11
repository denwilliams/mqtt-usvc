///@ts-check
const mqttusvc = require("./");
const assert = require("assert");

const service = mqttusvc.create({
  mqtt: {
    uri: "mqtt://localhost",
    prefix: "ticker/",
    subscriptions: ["ticker/#"]
  },
  service: {
    interval: 1000
  }
});

assert(service.config.interval, 1000);

// will send ticker/tick every second to MQTT
setInterval(() => {
  service.send("tick", { ts: new Date() });
}, service.config.interval);

// will output ticker/tick back from MQTT
service.on("message", (topic, data) => console.log(topic, data));
