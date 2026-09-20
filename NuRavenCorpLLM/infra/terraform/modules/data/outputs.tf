output "postgres_name" {
  value = local.postgres_name
}

output "postgres_cluster_id" {
  value = digitalocean_database_cluster.postgres.id
}

output "redis_name" {
  value = local.redis_name
}

output "redis_cluster_id" {
  value = digitalocean_database_cluster.redis.id
}

output "spaces_prefix" {
  value = local.spaces_prefix
}

output "sites_bucket_name" {
  value = digitalocean_spaces_bucket.sites.name
}

output "exports_bucket_name" {
  value = digitalocean_spaces_bucket.exports.name
}
