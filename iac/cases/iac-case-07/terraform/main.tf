resource "google_sql_database_instance" "orders" {
  name                    = "gcp-orders-db"
  ipv4_enabled            = true
  archsync_approved       = true
  archsync_trust_boundary = "data"
}
