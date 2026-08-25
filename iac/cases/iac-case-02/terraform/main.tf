resource "aws_elasticache_replication_group" "orders" {
  name                    = "orders-cache"
  publicly_accessible     = false
  archsync_approved       = true
  archsync_trust_boundary = "data"
}
