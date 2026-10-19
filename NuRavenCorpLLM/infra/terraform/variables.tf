variable "digitalocean_token" {
  description = "DigitalOcean API token."
  type        = string
  sensitive   = true
}

variable "project_name" {
  description = "Logical platform name."
  type        = string
  default     = "nuravencorpllm"
}

variable "environment" {
  description = "Deployment environment name."
  type        = string
  default     = "stage"
}

variable "region" {
  description = "DigitalOcean region slug."
  type        = string
  default     = "nyc3"
}

variable "site_domains" {
  description = "Primary domains for each branded site."
  type = map(object({
    domain = string
    site   = string
  }))
  default = {
    wiseravenshare = {
      domain = "wiseravenshare-wiseravenshare.com"
      site   = "wiseravenshare"
    }
    voteralliance = {
      domain = "voteralliance-voterallianceus.com"
      site   = "voteralliance"
    }
    wiseravenstream = {
      domain = "wiseravenstream-wiseravenstream.com"
      site   = "wiseravenstream"
    }
  }
}
