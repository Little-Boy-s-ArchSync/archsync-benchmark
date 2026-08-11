export async function capturePayment(payment: unknown): Promise<void> {
  await savePayment(payment);
}

async function savePayment(_payment: unknown): Promise<void> {
  // Represents Payment Service -> PostgreSQL.
}

