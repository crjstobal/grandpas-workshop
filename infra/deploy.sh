#!/usr/bin/env bash
# Deploys Grandpa's Workshop to the server created by infra/core.yaml (launch that stack once, as an
# admin). Needs no IAM permissions:
#   1. builds the web app,
#   2. packs the server source, shared/, the built web app and the pre-rendered voices into a release,
#   3. uploads it to the releases bucket and tells the instance (SSM Run Command) to install it.
# Usage: AWS_PROFILE=sso-poweruser infra/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."
REGION="${AWS_REGION:-eu-west-1}"
STACK=grandpas-workshop
out() { aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
BUCKET=$(out Bucket); INSTANCE=$(out InstanceId); URL=$(out Url)
BUILD=infra/.build
rm -rf "$BUILD" && mkdir -p "$BUILD"

echo "1/3 Building the web app"
npm run build -w web >/dev/null

echo "2/3 Packing the release"
git rev-parse --short HEAD > "$BUILD/RELEASE"
tar -czf "$BUILD/release.tgz" --exclude node_modules --exclude '.DS_Store' \
  package.json package-lock.json shared server/package.json server/tsconfig.json server/src \
  web/package.json web/dist web/public/voice -C "$BUILD" RELEASE
ls -lh "$BUILD/release.tgz" | awk '{print "   " $5}'
aws s3 cp --region "$REGION" --quiet "$BUILD/release.tgz" "s3://$BUCKET/release.tgz"

echo "3/3 Installing on the server"
CMD=$(aws ssm send-command --region "$REGION" --instance-ids "$INSTANCE" --document-name AWS-RunShellScript \
  --comment "Grandpa's Workshop $(cat "$BUILD/RELEASE")" --parameters 'commands=["/opt/gw/update.sh"]' \
  --query Command.CommandId --output text)
for _ in $(seq 1 90); do
  STATUS=$(aws ssm get-command-invocation --region "$REGION" --command-id "$CMD" --instance-id "$INSTANCE" --query Status --output text 2>/dev/null || echo Pending)
  case "$STATUS" in Success) break ;; Failed|Cancelled|TimedOut)
    aws ssm get-command-invocation --region "$REGION" --command-id "$CMD" --instance-id "$INSTANCE" --query StandardErrorContent --output text
    exit 1 ;; esac
  sleep 4
done
for _ in $(seq 1 30); do curl -fsS "$URL/api/health" >/dev/null 2>&1 && break; sleep 2; done
curl -fsS "$URL/api/health" && echo
echo "Done: $URL/tv"
