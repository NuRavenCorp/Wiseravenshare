locals {
  tags = [var.project_name, var.environment, "nu-raven"]

  site_profiles = {
    wiseravenshare = {
      key         = "wiseravenshare"
      displayName = "WiseRavenShare"
      theme       = "share"
    }
    voteralliance = {
      key         = "voteralliance"
      displayName = "VoterAlliance"
      theme       = "civic"
    }
    wiseravenstream = {
      key         = "wiseravenstream"
      displayName = "WiseRavenStream"
      theme       = "stream"
    }
  }
}

module "core" {
  source       = "./modules/core"
  project_name = var.project_name
  environment  = var.environment
  region       = var.region
  tags         = local.tags
}

module "data" {
  source       = "./modules/data"
  project_name = var.project_name
  environment  = var.environment
  region       = var.region
  tags         = local.tags
  site_domains = var.site_domains
}

module "app" {
  source        = "./modules/app"
  project_name  = var.project_name
  environment   = var.environment
  region        = var.region
  tags          = local.tags
  site_profiles = local.site_profiles
}

module "edge" {
  source       = "./modules/edge"
  project_name = var.project_name
  environment  = var.environment
  region       = var.region
  tags         = local.tags
  site_domains = var.site_domains
}
