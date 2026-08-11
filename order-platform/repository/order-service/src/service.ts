const paymentServiceUrl = process.env.PAYMENT_SERVICE_URL ?? "http://payment-service:3002";

export async function createOrder(order: unknown): Promise<void> {
  await saveOrder(order);
  await fetch(`${paymentServiceUrl}/payments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(order),
  });
}

async function saveOrder(_order: unknown): Promise<void> {
  // Represents Order Service -> PostgreSQL.
}

