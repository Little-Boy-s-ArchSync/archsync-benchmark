resource "aws_mq_broker" "orders" {
  name                    = "orders-events"
  publicly_accessible     = false
  archsync_approved       = false
  archsync_trust_boundary = "integration"
}
