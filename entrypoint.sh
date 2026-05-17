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

# Fetch issue
if [ -n "$TOKEN" ]; then
  ISSUE_JSON=$(curl -sSL -H "Authorization: token ${TOKEN}" -H "Accept: application/vnd.github+json" "$API")
else
  ISSUE_JSON=$(curl -sSL -H "Accept: application/vnd.github+json" "$API")
fi

# Normalize into agent-ready Ticket shape
TICKET_FILE=$(mktemp)
echo "$ISSUE_JSON" | jq '{id: ("#" + (.number|tostring)), title: .title, body: (.body // ""), labels: ([.labels[].name]), url: .html_url}' > "$TICKET_FILE"

# Pick rule pack
RULES_FLAG=""
if [ -n "$RULES" ] && [ -f "$GITHUB_WORKSPACE/$RULES" ]; then
  RULES_FLAG="--rules $GITHUB_WORKSPACE/$RULES"
fi

# Run lint, capture both markdown + json
MD_OUT=$(node /app/dist/cli.js check "$TICKET_FILE" --format markdown $RULES_FLAG || true)
JSON_OUT=$(node /app/dist/cli.js check "$TICKET_FILE" --format json $RULES_FLAG || true)

READY=$(echo "$JSON_OUT" | jq -r '.ready')
FAILED=$(echo "$JSON_OUT" | jq -r '.summary.failed')
WARNINGS=$(echo "$JSON_OUT" | jq -r '.summary.warnings')

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
      # Ensure the label exists in the repo (create if absent, ignore 422 if already there)
      curl -sSL -X POST \
        -H "Authorization: token ${TOKEN}" \
        -H "Accept: application/vnd.github+json" \
        "$REPO_LABELS_API" \
        -d '{"name":"agent-ready","color":"0E8A16","description":"Ticket passed all agent-ready checks"}' \
        > /dev/null 2>&1 || true
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
