resource "aws_db_instance" "aws_private" {
  name                    = "aws-private"
  publicly_accessible     = false
  archsync_approved       = true
  archsync_trust_boundary = "data"
}

resource "azurerm_mysql_flexible_server" "azure_private" {
  name                          = "azure-private"
  public_network_access_enabled = false
  archsync_approved             = true
  archsync_trust_boundary       = "data"
}

resource "google_sql_database_instance" "gcp_private" {
  name                    = "gcp-private"
  ipv4_enabled            = false
  archsync_approved       = true
  archsync_trust_boundary = "data"
}
