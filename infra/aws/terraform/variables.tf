variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "ap-south-1"
}

variable "environment" {
  description = "Deployment environment name"
  type        = string
  default     = "aircoin-prod"
}

variable "rpc_url" {
  description = "EVM RPC URL (Polygon Amoy)"
  type        = string
  default     = "https://rpc-amoy.polygon.technology"
}
