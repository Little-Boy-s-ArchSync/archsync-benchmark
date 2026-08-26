resource "aws_db_instance" "ambiguous" {
  name                    = "ambiguous-db"
  publicly_accessible     = false
  archsync_approved       = true
  archsync_trust_boundary = "data"
}
