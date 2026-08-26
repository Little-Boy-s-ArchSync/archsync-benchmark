resource "google_pubsub_topic" "events" {
  name                    = "new-events"
  archsync_approved       = true
  archsync_trust_boundary = "integration"
}
