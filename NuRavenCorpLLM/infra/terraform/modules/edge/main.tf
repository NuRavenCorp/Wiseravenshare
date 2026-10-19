locals {
  load_balancer_name = "${var.project_name}-${var.environment}-lb"
  domains            = { for key, value in var.site_domains : key => value.domain }
}

resource "digitalocean_loadbalancer" "this" {
  name   = local.load_balancer_name
  region = var.region

  forwarding_rule {
    entry_port      = 80
    entry_protocol  = "http"
    target_port     = 80
    target_protocol = "http"
  }

  healthcheck {
    protocol               = "http"
    port                   = 80
    path                   = "/"
    check_interval_seconds = 10
    response_timeout_seconds = 5
    unhealthy_threshold    = 3
    healthy_threshold      = 3
  }
}

resource "digitalocean_domain" "sites" {
  for_each = var.site_domains
  name     = each.value.domain
}
