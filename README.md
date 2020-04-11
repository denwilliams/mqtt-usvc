# mqtt-usvc

Module to make writing Node.js MQTT microservices dead simple and quick.

See `example.js` for reference.

Can be configured from YAML, environment variables, or code.

## Configuration

## Usage

```js
const mqttusvc = require("mqtt-usvc");

// Typically you will want to just provide a path to config file via command
// line args or via environment variables.
// Doing this way is easy, just use:
const service = mqttusvc.create();

// Alternatively you can provide all the configuration in code:
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
```
