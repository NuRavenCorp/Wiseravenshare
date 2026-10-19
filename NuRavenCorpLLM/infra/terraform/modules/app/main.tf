locals {
  api_service_name    = "${var.project_name}-${var.environment}-api"
  web_service_name    = "${var.project_name}-${var.environment}-web"
  worker_service_name  = "${var.project_name}-${var.environment}-worker"
  site_keys           = keys(var.site_profiles)
}

resource "kubernetes_namespace" "platform" {
  metadata {
    name = var.project_name
    labels = {
      app = var.project_name
    }
  }
}

resource "kubernetes_config_map" "site_profiles" {
  metadata {
    name      = "site-profiles"
    namespace = kubernetes_namespace.platform.metadata[0].name
  }

  data = {
    for key, profile in var.site_profiles : key => jsonencode(profile)
  }
}
