variable "project_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "region" {
  type = string
}

variable "tags" {
  type = list(string)
}

variable "site_domains" {
  type = map(object({
    domain = string
    site   = string
  }))
}
