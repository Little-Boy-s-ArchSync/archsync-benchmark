resource "azurerm_postgresql_flexible_server" "orders" {
  name                          = "azure-orders-db"
  public_network_access_enabled = true
  archsync_approved             = true
  archsync_trust_boundary       = "data"
}
