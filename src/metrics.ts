import { Counter } from "prom-client";

export const messagesSentCounter = new Counter({
  name: "usvc_messages_sent_total",
  labelNames: [],
  help: "Total number of messages sent by this service",
});

export const messagesReceivedCounter = new Counter({
  name: "usvc_messages_received_total",
  labelNames: [],
  help: "Total number of messages sent by this service",
});
