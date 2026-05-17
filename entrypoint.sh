#!/bin/sh
set -e

# Inputs are passed by GitHub Actions as INPUT_<NAME-UPPERCASED>
ISSUE_NUMBER="${INPUT_ISSUE_NUMBER:-${GITHUB_EVENT_PATH:+$(jq -r '.issue.number // empty' "$GITHUB_EVENT_PATH")}}"
RULES="${INPUT_RULES:-}"
COMMENT="${INPUT_COMMENT_ON_ISSUE:-true}"
FAIL="${INPUT_FAIL_ON_NOT_READY:-true}"

if [ -z "$ISSUE_NUMBER" ]; then
  echo "agent-ready: no issue number provided and no triggering issue found"
  exit 2
fi

REPO="${GITHUB_REPOSITORY:?}"
API="https://api.github.com/repos/${REPO}/issues/${ISSUE_NUMBER}"

# Fetch issue
ISSUE_JSON=$(curl -sSL -H "Authorization: token ${GITHUB_TOKEN}" -H "Accept: application/vnd.github+json" "$API")

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
{
  echo "ready=$READY"
  echo "failed-count=$FAILED"
  echo "warnings-count=$WARNINGS"
} >> "$GITHUB_OUTPUT"

# Step summary
{
  echo "$MD_OUT"
} >> "$GITHUB_STEP_SUMMARY"

# Comment on issue
if [ "$COMMENT" = "true" ]; then
  COMMENT_BODY=$(jq -Rs '.' <<< "$MD_OUT")
  curl -sSL -X POST \
    -H "Authorization: token ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/${REPO}/issues/${ISSUE_NUMBER}/comments" \
    -d "{\"body\": $COMMENT_BODY}" > /dev/null
fi

if [ "$READY" != "true" ] && [ "$FAIL" = "true" ]; then
  exit 1
fi
exit 0
