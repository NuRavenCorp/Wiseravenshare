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

variable "site_profiles" {
  type = map(object({
    key         = string
    displayName = string
    theme       = string
  }))
}
