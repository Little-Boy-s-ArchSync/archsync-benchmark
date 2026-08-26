resource "azurerm_redis_cache" "orders" {
  name                          = "orders-cache"
  public_network_access_enabled = false
  archsync_approved             = false
  archsync_trust_boundary       = "data"
}
