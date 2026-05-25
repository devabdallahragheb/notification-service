#!/bin/bash

set -e

echo "🚀 Notification Service Deployment Script"
echo "=========================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
STACK_NAME="notification-service"
REGION="us-east-1"
ENVIRONMENT="dev"

echo -e "${YELLOW}Step 1: Validating AWS CLI configuration...${NC}"
if ! aws sts get-caller-identity > /dev/null 2>&1; then
    echo -e "${RED}❌ AWS CLI not configured. Please run 'aws configure'${NC}"
    exit 1
fi
echo -e "${GREEN}✅ AWS CLI configured${NC}"
echo ""

echo -e "${YELLOW}Step 2: Checking SAM CLI installation...${NC}"
if ! command -v sam &> /dev/null; then
    echo -e "${RED}❌ SAM CLI not found. Please install it first.${NC}"
    echo "   Install: brew install aws-sam-cli"
    exit 1
fi
echo -e "${GREEN}✅ SAM CLI found: $(sam --version)${NC}"
echo ""

echo -e "${YELLOW}Step 3: Building SAM application...${NC}"
sam build
echo -e "${GREEN}✅ Build completed${NC}"
echo ""

echo -e "${YELLOW}Step 4: Deploying to AWS...${NC}"
sam deploy \
    --stack-name $STACK_NAME \
    --region $REGION \
    --parameter-overrides Environment=$ENVIRONMENT \
    --capabilities CAPABILITY_IAM \
    --no-confirm-changeset \
    --no-fail-on-empty-changeset

echo -e "${GREEN}✅ Deployment completed${NC}"
echo ""

echo -e "${YELLOW}Step 5: Getting stack outputs...${NC}"
BUCKET_NAME=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $REGION \
    --query 'Stacks[0].Outputs[?OutputKey==`TemplatesBucketName`].OutputValue' \
    --output text)

TOPIC_ARN=$(aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $REGION \
    --query 'Stacks[0].Outputs[?OutputKey==`NotificationTopicArn`].OutputValue' \
    --output text)

echo -e "${GREEN}✅ Stack outputs retrieved${NC}"
echo ""

echo -e "${YELLOW}Step 6: Uploading email templates to S3...${NC}"
if [ -d "templates" ]; then
    for template in templates/*.html; do
        filename=$(basename "$template")
        echo "   Uploading $filename..."
        aws s3 cp "$template" "s3://$BUCKET_NAME/$filename" --region $REGION
    done
    echo -e "${GREEN}✅ Templates uploaded${NC}"
else
    echo -e "${YELLOW}⚠️  No templates directory found${NC}"
fi
echo ""

echo -e "${GREEN}=========================================="
echo "🎉 Deployment Complete!"
echo "==========================================${NC}"
echo ""
echo "📋 Important Information:"
echo "   - SNS Topic ARN: $TOPIC_ARN"
echo "   - Templates Bucket: $BUCKET_NAME"
echo "   - Region: $REGION"
echo "   - Environment: $ENVIRONMENT"
echo ""
echo -e "${YELLOW}⚠️  Next Steps:${NC}"
echo "   1. Verify your sender email in SES:"
echo "      aws ses verify-email-identity --email-address your-email@example.com --region $REGION"
echo ""
echo "   2. Update the FROM_EMAIL environment variable:"
echo "      aws lambda update-function-configuration \\"
echo "        --function-name $ENVIRONMENT-email-worker \\"
echo "        --environment \"Variables={DYNAMODB_TABLE=$ENVIRONMENT-notifications,TEMPLATES_BUCKET=$BUCKET_NAME,SES_REGION=$REGION,FROM_EMAIL=your-email@example.com,ENVIRONMENT=$ENVIRONMENT}\" \\"
echo "        --region $REGION"
echo ""
echo "   3. Test sending a notification:"
echo "      aws sns publish \\"
echo "        --topic-arn $TOPIC_ARN \\"
echo "        --message '{\"to\":\"test@example.com\",\"templateName\":\"welcome-email\",\"subject\":\"Test\",\"params\":{\"userName\":\"Test\",\"verificationLink\":\"https://example.com\"}}' \\"
echo "        --message-attributes '{\"type\":{\"DataType\":\"String\",\"StringValue\":\"email\"}}' \\"
echo "        --region $REGION"
echo ""
