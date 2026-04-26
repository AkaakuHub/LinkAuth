resource "aws_dynamodb_table" "users" {
  name         = "${var.project_name}-users"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"
  table_class  = "STANDARD"

  deletion_protection_enabled = true

  on_demand_throughput {
    max_read_request_units  = var.dynamodb_max_read_request_units
    max_write_request_units = var.dynamodb_max_write_request_units
  }

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }
}
