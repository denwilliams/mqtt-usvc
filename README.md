# mqtt-usvc

**Breaking change: now requires prom-client v14 (previously v12). Old version will not work due to changing API.**

**Breaking change: create() is now async in v3, and there is now a peer dependency on prom-client.**

Opinionated module to make writing Node.js MQTT microservices dead simple and quick.

See `example.js` for reference.

Can be configured from YAML, environment variables, Consul KV store, or code.

Exposes Prometheus metrics over HTTP (/metrics) for scraping into a Prometheus server.

**Breaking: prefix is now not automatic in v2 - must use `~` character.**

## Configuration

You can pass in configuration in code if you have your own way of managing configuration.

To use a configuration file just create a YAML file with the keys:

```yml
mqtt:
  uri: "mqtt://localhost",
  prefix: "ticker/",
  subscriptions:
    - "~/set/#"
http:
  port: 8080
service:
  # service config schema is open, just put what you need here
  interval: 1000
```

Then launch your service with environment variables:

```
CONFIG_PATH=/path/to/config.yml node my_service.js
```

### Using Only Environment Variables

```
MQTT_URI=mqtt://localhost MQTT_PREFIX="ticker" HTTP_PORT=8080 node my_service.js
```

### MQTT Username/Password

Just put it in the MQTT URI:

```
mqtt://username:password@localhost
```

### Using Environment Variables for Configuration

You can also use environment variables for configuration instead of a config file.
The following environment variables are supported:

- `MQTT_URI` - MQTT URI (e.g. `mqtt://localhost`)
- `MQTT_PREFIX` - MQTT prefix (e.g. `ticker`)
- `MQTT_SUBSCRIPTIONS` - Comma separated list of subscriptions (e.g. `~/set/#,~/reset` where `~` is replaced with the prefix)
- `HTTP_PORT` - HTTP port for metrics (e.g. `8080`)
- `SERVICE_CONFIG` - Service config as JSON (e.g. `{"interval": 1000}`)

### Using Consul KV for Configuration

Configuration can optionally be fetched from Consul's KV store.

With all config in single field as JSON:

```
CONSUL_KV_KEY=ticker_config node my_service.js
```

This will parse the value of `ticker_config` as JSON and use that.

...alternatively...

```
CONSUL_KV_PREFIX=ticker/ node my_service.js
```

It will then fetch all keys from Consul's KV under this prefix and construct an object.

Note: because all KV values are strings it attempts to figure out whether values are numbers, bools, etc when parsing.

```
ticker/mqtt/uri
ticker/mqtt/prefix
ticker/mqtt/subscriptions
ticker/http/port
ticker/service
```

etc

If Consul isn't on the localhost, or the usual ports you can specify a different host using `CONSUL_HOST` and/or `CONSUL_PORT`.

## Usage

```js
const mqttusvc = require("mqtt-usvc");
const assert = require("assert");

async function main() {
  // Typically you will want to just provide a path to config file via command
  // line args or via environment variables.
  // Doing this way is easy, just use:
  const service = await mqttusvc.create();

  // Alternatively you can provide all the configuration in code:
  const service = mqttusvc.create({
    // The MQTT config can also be passed in via environment variables too
    mqtt: {
      // MQTT URI can contain username/password
      uri: "mqtt://localhost",
      // Default prefix for inbound and outbound topics.
      // The ~ character will be replaced with this string.
      // See below for examples
      prefix: "ticker",
      // Subscribe to topics (note: prefix not applied to subscriptions as
      // you may want to subscribe to services elsewhere)
      subscriptions: ["~/#"],
    },
    // The service config
    service: {
      interval: 1000,
    },
  });

  // The service configuration is returned under .config
  // (useful when config is loaded from a file)
  assert.strictEqual(service.config.interval, 1000);

  // (will send ticker/tick every second to MQTT)
  setInterval(() => {
    // Call .send() to publish an event.
    // NOTE this gets published as ticker/tick
    // If you don't want to publish under ticker use sendRoot()
    // ... or use "" as the prefix to always publish without a prefix
    service.send("~/tick", { ts: new Date() });
  }, service.config.interval);

  // will output ticker/tick back from MQTT
  // Handle your subscriptions using .on("message")
  // `topic` prefix is converted back to ~
  service.on("message", (topic, data) => console.log(topic, data));
}

main();
```

## Metrics
