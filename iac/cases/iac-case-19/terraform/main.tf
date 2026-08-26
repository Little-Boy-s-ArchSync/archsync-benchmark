resource "aws_elasticache_cluster" "cache" {
  name                    = "approved-cache"
  publicly_accessible     = false
  archsync_approved       = true
  archsync_trust_boundary = "data"
}

resource "azurerm_servicebus_namespace" "events" {
  name                          = "approved-events"
  public_network_access_enabled = false
  archsync_approved             = true
  archsync_trust_boundary       = "integration"
}
