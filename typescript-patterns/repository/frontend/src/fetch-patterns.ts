const environmentGateway = process.env.GATEWAY_URL ?? "http://gateway:3000";
const aliasedGateway = environmentGateway;
const secureGateway = "https://gateway:3443";

async function customFetch(_url: string): Promise<void> {}

export async function exerciseFetchPatterns(): Promise<void> {
  await fetch("http://gateway:3000/orders");
  await fetch(`${environmentGateway}/orders`);
  await fetch(aliasedGateway + "/orders");
  await fetch((secureGateway));

  const documentationOnly = "http://payment-service:3002";
  await customFetch("http://payment-service:3002");
  await fetch("mailto:architecture@example.com");
  // fetch("http://payment-service:3002") is intentionally documentation only.
  void documentationOnly;
}

