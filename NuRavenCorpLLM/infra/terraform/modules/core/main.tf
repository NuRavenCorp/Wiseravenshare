locals {
  vpc_name        = "${var.project_name}-${var.environment}-vpc"
  cluster_name    = "${var.project_name}-${var.environment}-doks"
  app_pool_name   = "${var.project_name}-${var.environment}-apps"
  worker_pool_name = "${var.project_name}-${var.environment}-workers"
}

resource "digitalocean_vpc" "this" {
  name        = local.vpc_name
  region      = var.region
  description = "Shared VPC for ${var.project_name} ${var.environment}"
}

resource "digitalocean_kubernetes_cluster" "this" {
  name    = local.cluster_name
  region  = var.region
  version = var.kubernetes_version
  vpc_uuid = digitalocean_vpc.this.id

  node_pool {
    name       = local.app_pool_name
    size       = var.app_node_size
    node_count = 2
    tags       = var.tags
  }
}

resource "digitalocean_kubernetes_node_pool" "workers" {
  cluster_id = digitalocean_kubernetes_cluster.this.id
  name       = local.worker_pool_name
  size       = var.worker_node_size
  node_count = 1
  tags       = var.tags
}
