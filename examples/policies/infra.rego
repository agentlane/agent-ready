# Infrastructure change gate
#
# Infrastructure tickets (terraform, k8s, helm, cloud resources) must:
#   1. Be labeled risk:high
#   2. Mention a rollback plan in the body
#
# Use with:
#
#   rules:
#     enforce-infra-gate:
#       type: opa
#       mode: remote
#       server: http://localhost:8181
#       query: data.infra.decision
#       input_includes: [ticket, signals]
#       severity: error

package infra

import rego.v1

infra_keywords := [
  "terraform", "tofu", "helm", "kubernetes", "k8s", "docker",
  "ansible", "pulumi", "cloudformation", "cdk", "aws", "gcp", "azure",
  "iam", "vpc", "subnet", "security group", "firewall", "load balancer",
  "database migration", "schema migration",
]

rollback_keywords := [
  "rollback", "roll back", "revert", "undo", "recovery plan",
  "disaster recovery", "blue/green", "canary", "feature flag",
]

ticket_text := lower(concat(" ", [input.ticket.title, input.ticket.body]))

mentions_infra if {
  some kw in infra_keywords
  contains(ticket_text, kw)
}

is_high_risk if {
  some label in input.ticket.labels
  lower(label) == "risk:high"
}

has_rollback_plan if {
  some kw in rollback_keywords
  contains(ticket_text, kw)
}

default allow := false

allow if { not mentions_infra }

allow if {
  mentions_infra
  is_high_risk
  has_rollback_plan
}

reason := "No infrastructure keywords detected" if { allow; not mentions_infra }
reason := "Infrastructure ticket meets all requirements" if { allow; mentions_infra }

reason := "Infrastructure ticket missing risk:high label" if {
  not allow; mentions_infra; not is_high_risk
}

reason := "Infrastructure ticket missing rollback/recovery plan" if {
  not allow; mentions_infra; is_high_risk; not has_rollback_plan
}

hint := "Add 'risk:high', and describe a rollback or recovery plan in the ticket body" if { not allow }

decision := {"allow": allow, "reason": reason, "hint": hint} if { not allow }
decision := {"allow": allow, "reason": reason} if { allow }
