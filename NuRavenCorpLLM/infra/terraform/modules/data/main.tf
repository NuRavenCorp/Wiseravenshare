locals {
  postgres_name = "${var.project_name}-${var.environment}-pg"
  redis_name    = "${var.project_name}-${var.environment}-redis"
  spaces_prefix = "${var.project_name}/${var.environment}"
}

resource "digitalocean_database_cluster" "postgres" {
  name       = local.postgres_name
  engine     = "pg"
  version    = "17"
  size       = "db-s-2vcpu-4gb"
  region     = var.region
  node_count = 1
}

resource "digitalocean_database_firewall" "postgres" {
  cluster_id = digitalocean_database_cluster.postgres.id

  rule {
    type  = "k8s"
    value = var.project_name
  }
}

resource "digitalocean_database_db" "app" {
  cluster_id = digitalocean_database_cluster.postgres.id
  name       = "app"
}

resource "digitalocean_database_user" "app" {
  cluster_id = digitalocean_database_cluster.postgres.id
  name       = "appuser"
}

resource "digitalocean_database_cluster" "redis" {
  name       = local.redis_name
  engine     = "redis"
  version    = "7"
  size       = "db-s-1vcpu-2gb"
  region     = var.region
  node_count = 1
}

resource "digitalocean_database_firewall" "redis" {
  cluster_id = digitalocean_database_cluster.redis.id

  rule {
    type  = "k8s"
    value = var.project_name
  }
}

resource "digitalocean_spaces_bucket" "sites" {
  name   = "${var.project_name}-${var.environment}-sites"
  region = var.spaces_region
}

resource "digitalocean_spaces_bucket" "exports" {
  name   = "${var.project_name}-${var.environment}-exports"
  region = var.spaces_region
}
