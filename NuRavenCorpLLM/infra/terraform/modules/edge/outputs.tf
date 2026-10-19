output "load_balancer_name" {
  value = local.load_balancer_name
}

output "load_balancer_id" {
  value = digitalocean_loadbalancer.this.id
}

output "domains" {
  value = local.domains
}
