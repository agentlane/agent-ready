# Payment / financial data routing gate
#
# Tickets that touch payment processing, billing, or financial data must be
# risk:high AND have a t-shirt size >= M (no open-ended payment work).
#
# Use with:
#
#   rules:
#     enforce-payment-risk:
#       type: opa
#       mode: remote
#       server: http://localhost:8181
#       query: data.payment.decision
#       input_includes: [ticket, signals]
#       severity: error

package payment

import rego.v1

payment_keywords := [
  "payment", "billing", "invoice", "stripe", "braintree", "paypal",
  "credit card", "debit card", "bank transfer", "ach", "wire transfer",
  "subscription", "checkout", "priceplan", "revenue",
]

large_sizes := {"L", "XL", "l", "xl"}

ticket_text := lower(concat(" ", [input.ticket.title, input.ticket.body]))

mentions_payment if {
  some kw in payment_keywords
  contains(ticket_text, kw)
}

is_high_risk if {
  some label in input.ticket.labels
  lower(label) == "risk:high"
}

has_size_label if {
  some label in input.ticket.labels
  startswith(lower(label), "size:")
  suffix := substring(lower(label), 5, -1)
  large_sizes[suffix]
}

default allow := false

allow if { not mentions_payment }

allow if {
  mentions_payment
  is_high_risk
  has_size_label
}

reason := "No payment keywords detected" if { allow; not mentions_payment }
reason := "Payment ticket meets risk and sizing requirements" if { allow; mentions_payment }

reason := "Payment ticket missing risk:high label" if {
  not allow
  mentions_payment
  not is_high_risk
}

reason := "Payment ticket missing size:L or size:XL label" if {
  not allow
  mentions_payment
  is_high_risk
  not has_size_label
}

hint := "Add 'risk:high' and a 'size:L' or 'size:XL' label to payment-related tickets" if { not allow }

decision := {"allow": allow, "reason": reason, "hint": hint} if { not allow }
decision := {"allow": allow, "reason": reason} if { allow }
