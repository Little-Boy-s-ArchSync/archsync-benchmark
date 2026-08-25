resource "aws_db_instance" "dynamic" {
  name                    = "dynamic-db"
  publicly_accessible     = var.database_public
  archsync_approved       = true
  archsync_trust_boundary = "data"
}
