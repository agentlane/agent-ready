#!/bin/sh
set -e

input_value() {
  # Docker actions may expose hyphenated input names literally
  # (for example INPUT_COMMENT-ON-ISSUE), so read via printenv.
  printenv "INPUT_$1" 2>/dev/null || true
}

ISSUE_NUMBER="$(input_value ISSUE_NUMBER)"
if [ -z "$ISSUE_NUMBER" ]; then ISSUE_NUMBER="$(input_value ISSUE-NUMBER)"; fi
if [ -z "$ISSUE_NUMBER" ] && [ -n "${GITHUB_EVENT_PATH:-}" ]; then
  ISSUE_NUMBER="$(jq -r '.issue.number // empty' "$GITHUB_EVENT_PATH")"
fi

RULES="$(input_value RULES)"
COMMENT="$(input_value COMMENT_ON_ISSUE)"
if [ -z "$COMMENT" ]; then COMMENT="$(input_value COMMENT-ON-ISSUE)"; fi
COMMENT="${COMMENT:-true}"

FAIL="$(input_value FAIL_ON_NOT_READY)"
if [ -z "$FAIL" ]; then FAIL="$(input_value FAIL-ON-NOT-READY)"; fi
FAIL="${FAIL:-true}"

SET_LABEL="$(input_value SET_LABEL)"
if [ -z "$SET_LABEL" ]; then SET_LABEL="$(input_value SET-LABEL)"; fi
SET_LABEL="${SET_LABEL:-true}"

TOKEN="$(input_value GITHUB_TOKEN)"
if [ -z "$TOKEN" ]; then TOKEN="$(input_value GITHUB-TOKEN)"; fi
TOKEN="${TOKEN:-${GITHUB_TOKEN:-}}"

if [ -z "$ISSUE_NUMBER" ]; then
  echo "agent-ready: no issue number provided and no triggering issue found"
  exit 2
fi

REPO="${GITHUB_REPOSITORY:?}"
API="https://api.github.com/repos/${REPO}/issues/${ISSUE_NUMBER}"

# Fetch issue — capture body and HTTP status in one call
if [ -n "$TOKEN" ]; then
  ISSUE_RESP=$(curl -sSL -w "\n%{http_code}" \
    -H "Authorization: token ${TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    "$API")
else
  ISSUE_RESP=$(curl -sSL -w "\n%{http_code}" \
    -H "Accept: application/vnd.github+json" \
    "$API")
fi
HTTP_CODE=$(printf "%s" "$ISSUE_RESP" | tail -n1)
ISSUE_JSON=$(printf "%s" "$ISSUE_RESP" | sed '$d')

if [ "$HTTP_CODE" != "200" ]; then
  MSG=$(echo "$ISSUE_JSON" | jq -r '.message // "unknown error"')
  echo "agent-ready: GitHub API returned HTTP $HTTP_CODE: $MSG"
  exit 2
fi

# Normalize into agent-ready Ticket shape
TICKET_FILE=$(mktemp)
trap 'rm -f "$TICKET_FILE"' EXIT
echo "$ISSUE_JSON" | jq '{id: ("#" + (.number|tostring)), title: .title, body: (.body // ""), labels: ([.labels[].name]), url: .html_url}' > "$TICKET_FILE"

# Pick rule pack
RULES_FLAG=""
if [ -n "$RULES" ] && [ -f "$GITHUB_WORKSPACE/$RULES" ]; then
  RULES_FLAG="--rules $GITHUB_WORKSPACE/$RULES"
fi

# Run lint once — --format all emits a JSON envelope with both json + markdown fields.
# This avoids running rules (especially links-resolve) twice.
ALL_OUT=$(node /app/dist/cli.js check "$TICKET_FILE" --format all $RULES_FLAG || true)

JSON_OUT=$(printf "%s" "$ALL_OUT" | jq -c '.json')
MD_OUT=$(printf "%s" "$ALL_OUT" | jq -r '.markdown')

READY=$(printf "%s" "$ALL_OUT" | jq -r '.json.ready')
FAILED=$(printf "%s" "$ALL_OUT" | jq -r '.json.summary.failed')
WARNINGS=$(printf "%s" "$ALL_OUT" | jq -r '.json.summary.warnings')

# Emit outputs
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  {
    echo "ready=$READY"
    echo "failed-count=$FAILED"
    echo "warnings-count=$WARNINGS"
  } >> "$GITHUB_OUTPUT"
fi

# Step summary
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "$MD_OUT"
  } >> "$GITHUB_STEP_SUMMARY"
fi

# Comment on issue
if [ "$COMMENT" = "true" ]; then
  if [ -z "$TOKEN" ]; then
    echo "agent-ready: cannot comment without github-token or GITHUB_TOKEN"
    exit 2
  fi
  COMMENT_BODY=$(printf "%s" "$MD_OUT" | jq -Rs '.')
  curl -sSL -X POST \
    -H "Authorization: token ${TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/${REPO}/issues/${ISSUE_NUMBER}/comments" \
    -d "{\"body\": $COMMENT_BODY}" > /dev/null
fi

# Set / remove agent-ready label
if [ "$SET_LABEL" = "true" ]; then
  if [ -z "$TOKEN" ]; then
    echo "agent-ready: cannot set label without github-token or GITHUB_TOKEN (skipping)"
  else
    ISSUE_LABELS_API="https://api.github.com/repos/${REPO}/issues/${ISSUE_NUMBER}/labels"
    REPO_LABELS_API="https://api.github.com/repos/${REPO}/labels"
    if [ "$READY" = "true" ]; then
      # Only create repo label if it doesn't already exist (avoids unnecessary API noise)
      LABEL_HTTP=$(curl -sSL -o /dev/null -w "%{http_code}" \
        -H "Authorization: token ${TOKEN}" \
        -H "Accept: application/vnd.github+json" \
        "$REPO_LABELS_API/agent-ready")
      if [ "$LABEL_HTTP" = "404" ]; then
        curl -sSL -X POST \
          -H "Authorization: token ${TOKEN}" \
          -H "Accept: application/vnd.github+json" \
          "$REPO_LABELS_API" \
          -d '{"name":"agent-ready","color":"0E8A16","description":"Ticket passed all agent-ready checks"}' \
          > /dev/null
      fi
      # Add label to issue
      curl -sSL -X POST \
        -H "Authorization: token ${TOKEN}" \
        -H "Accept: application/vnd.github+json" \
        "$ISSUE_LABELS_API" \
        -d '{"labels":["agent-ready"]}' > /dev/null
    else
      # Remove label from issue (ignore 404 — label may not be present)
      curl -sSL -X DELETE \
        -H "Authorization: token ${TOKEN}" \
        -H "Accept: application/vnd.github+json" \
        "$ISSUE_LABELS_API/agent-ready" \
        > /dev/null 2>&1 || true
    fi
  fi
fi

if [ "$READY" != "true" ] && [ "$FAIL" = "true" ]; then
  exit 1
fi
exit 0
