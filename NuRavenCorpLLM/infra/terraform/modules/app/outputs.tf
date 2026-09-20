output "api_service_name" {
  value = local.api_service_name
}

output "web_service_name" {
  value = local.web_service_name
}

output "worker_service_name" {
  value = local.worker_service_name
}

output "site_keys" {
  value = local.site_keys
}

output "namespace" {
  value = kubernetes_namespace.platform.metadata[0].name
}
