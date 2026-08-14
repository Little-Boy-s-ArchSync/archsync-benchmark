import { connect as connectAmqp } from "amqplib";
import * as amqp from "amqplib";

const eventsUrl = process.env.ORDER_EVENTS_URL ?? "amqp://order-events:5672";
const logger = { publish: (_message: string) => undefined };
const localQueue = { sendToQueue: (_name: string, _value: Buffer) => undefined };
const documentation = "channel.publish('orders', 'created')";

export async function exerciseAmqpPublishPatterns(): Promise<void> {
  const connection = await connectAmqp(eventsUrl);
  const channel = await connection.createChannel();
  const namespaceConnection = await amqp.connect("amqps://order-events:5671");
  const namespaceChannel = await namespaceConnection.createChannel();

  channel.publish("orders", "created", Buffer.from("{}"));
  channel.sendToQueue("orders", Buffer.from("{}"));
  namespaceChannel.publish("orders", "paid", Buffer.from("{}"));
  namespaceChannel.sendToQueue("orders", Buffer.from("{}"));

  logger.publish("not an AMQP channel");
  localQueue.sendToQueue("orders", Buffer.from("{}"));
  await connection.close();
  void documentation;
}

