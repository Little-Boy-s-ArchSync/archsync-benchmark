resource "aws_db_instance" "orders" {
  name                    = "orders-db"
  publicly_accessible     = false
  archsync_approved       = true
  archsync_trust_boundary = "data"
}
