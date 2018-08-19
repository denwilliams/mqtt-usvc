const { readFileSync } = require('fs');
const { EventEmitter } = require('events');
const mqtt = require('mqtt');
const yaml = require('js-yaml');

exports.create = (config = {}) => {
  const path = process.env.CONFIG_PATH || config.configPath;
  const fileConfig = path ? yaml.safeLoad(readFileSync(path, 'utf8')) : {};

  const mergedConfig = Object.assign(fileConfig, config);
  const mqttConfig = mergedConfig.mqtt || {};
  const serviceConfig = mergedConfig.service || {};

  const e = new EventEmitter();

  const uri = process.env.MQTT_URI || mqttConfig.uri;
  const prefix = process.env.MQTT_PREFIX || mqttConfig.prefix || '';
  const subscriptions = mqttConfig.subscriptions || [];

  console.log('Connecting to ' + uri);
  const client  = mqtt.connect(uri);

  client.on('connect', () => {
    console.log('MQTT connected');
    (subscriptions).forEach(s => client.subscribe(s));
  });

  client.on('reconnect', () => {
    console.log('MQTT reconnecting');
  });

  client.on('close', () => {
    console.log('MQTT disconnected');
  });

  client.on('offline', () => {
    console.log('MQTT offline');
  });

  client.on('end', () => {
    console.log('MQTT end');
  });

  client.on('error', () => {
    console.error('MQTT error', err);
    process.exit(1);
  });

  client.on('message', (topic, message) => {
    // message is Buffer
    const str = message.toString();
    let data;
    try {
      data = JSON.parse(str);
    } catch(err) {
      // naive error handling
      data = str;
    }

    if (topic.startsWith(prefix)) {
      e.emit('message', topic.replace(prefix, ''), data);
      return;
    }

    e.emit('message', topic, data);
  });

  e.send = (key, data, { retain } = {}) => {
    client.publish(prefix + key, JSON.stringify(data), { retain });
  };
  e.subscribe = (key) => {
    client.subscribe(prefix + key);
  };

  e.end = () => client.end();

  e.config = serviceConfig;
  e.prefix = prefix;

  return e;
};
