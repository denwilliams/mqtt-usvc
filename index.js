const { readFileSync } = require('fs');
const { EventEmitter } = require('events');
const mqtt = require('mqtt');

exports.create = (config = {}) => {
  const path = config.configPath || process.env.CONFIG_PATH;
  const fileConfig = path ? yaml.safeLoad(readFileSync(path, 'utf8')) : {};

  const mergedConfig = Object.assign(fileConfig, config);
  const mqttConfig = mergedConfig.mqtt || {};
  const serviceConfig = mergedConfig.service || {};

  const e = new EventEmitter();

  const uri = mqttConfig.uri || process.env.MQTT_URI;
  const prefix = mqttConfig.prefix || process.env.MQTT_PREFIX || '';
  const subscriptions = mqttConfig.subscriptions || [];

  console.log('Connecting to ' + uri);
  const client  = mqtt.connect(uri);

  client.on('connect', function () {
    console.log('MQTT connected');
    (subscriptions).forEach(s => client.subscribe(s));
  });

  client.on('message', function (topic, message) {
    // message is Buffer
    const str = message.toString();
    let data;
    try {
      data = JSON.parse(str);
    } catch(err) {
      // naive error handling
      data = str;
    }

    e.emit('message', topic, data);
  });

  e.send = (key, data) => {
    client.publish(prefix + key, JSON.stringify(data));
  };

  e.end = () => client.end();

  e.config = serviceConfig;

  return e;
};
