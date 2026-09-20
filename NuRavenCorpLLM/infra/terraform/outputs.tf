output "deployment_summary" {
  value = {
    project_name = var.project_name
    environment  = var.environment
    region       = var.region
    sites        = var.site_domains
    core         = module.core
    data         = module.data
    app          = module.app
    edge         = module.edge
  }
}
