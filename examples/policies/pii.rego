# PII restricted-scope gate
#
# Tickets that mention personal data / PII handling must be classified risk:high.
# Use with:
#
#   rules:
#     enforce-pii-risk:
#       type: opa
#       mode: remote              # or: embedded, policy: examples/policies/pii.rego
#       server: http://localhost:8181
#       query: data.pii.decision
#       input_includes: [ticket, signals]
#       severity: error
#
# OPA REST: POST /v1/data/pii/decision
#   Input:  { "ticket": { "id", "title", "body", "labels" }, "signals": { ... } }
#   Output: { "allow": bool, "reason": str, "hint": str }

package pii

import rego.v1

# Keywords that signal PII handling in the ticket body or title
pii_keywords := [
  "pii", "personal data", "personal information", "gdpr", "ccpa",
  "social security", "ssn", "date of birth", "dob", "passport",
  "credit card", "bank account", "health record", "phi", "hipaa",
]

ticket_text := lower(concat(" ", [input.ticket.title, input.ticket.body]))

mentions_pii if {
  some kw in pii_keywords
  contains(ticket_text, kw)
}

is_high_risk if {
  some label in input.ticket.labels
  lower(label) == "risk:high"
}

# A PII ticket is allowed only when it has risk:high
default allow := false

allow if {
  not mentions_pii
}

allow if {
  mentions_pii
  is_high_risk
}

reason := msg if {
  allow
  not mentions_pii
  msg := "No PII keywords detected"
}

reason := msg if {
  allow
  mentions_pii
  msg := "PII ticket correctly classified risk:high"
}

reason := msg if {
  not allow
  msg := "Ticket mentions PII/personal data but is not labeled risk:high"
}

hint := "Add the label 'risk:high' and a data-handling section to the ticket body" if { not allow }

decision := {"allow": allow, "reason": reason, "hint": hint} if { not allow }
decision := {"allow": allow, "reason": reason} if { allow }
