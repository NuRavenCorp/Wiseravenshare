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

variable "kubernetes_version" {
  type    = string
  default = "1.31.1-do.4"
}

variable "app_node_size" {
  type    = string
  default = "s-2vcpu-4gb"
}

variable "worker_node_size" {
  type    = string
  default = "s-1vcpu-2gb"
}
