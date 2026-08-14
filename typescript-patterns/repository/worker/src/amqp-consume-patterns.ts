import { connect as connectAmqp } from "amqplib";
import * as amqp from "amqplib";

const eventsUrl = process.env.ORDER_EVENTS_URL ?? "amqp://order-events:5672";
const subscriber = { consume: async (_name: string) => undefined };
const documentation = "channel.consume('orders')";

export async function exerciseAmqpConsumePatterns(): Promise<void> {
  const connection = await connectAmqp(eventsUrl);
  const channel = await connection.createChannel();
  const namespaceConnection = await amqp.connect("amqps://order-events:5671");
  const namespaceChannel = await namespaceConnection.createChannel();

  await channel.consume("orders", () => undefined);
  await channel.consume("payments", () => undefined);
  await namespaceChannel.consume("orders", () => undefined);
  await namespaceChannel.consume("payments", () => undefined);

  await subscriber.consume("orders");
  channel.ack({} as never);
  // channel.consume("ignored", () => undefined);
  void documentation;
}
