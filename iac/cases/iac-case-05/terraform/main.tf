resource "aws_db_instance" "orders" {
  name                    = "aws-orders-db"
  publicly_accessible     = true
  archsync_approved       = true
  archsync_trust_boundary = "data"
}
