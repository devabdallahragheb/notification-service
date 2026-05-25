# AWS Notification Service

A high-performance, serverless notification service built with AWS SAM, supporting Email and SMS notifications with dynamic template rendering.

## 📋 Architecture

```
Applications
    ↓
SNS Topic (with message filtering)
    ↓
├─→ Email SQS Queue → Email Lambda → Amazon SES → DynamoDB
│                           ↓
│                       Email DLQ
│
└─→ SMS SQS Queue → SMS Lambda → Amazon SNS SMS → DynamoDB
                         ↓
                     SMS DLQ
```

## 🚀 Features

- **Serverless Architecture**: Fully serverless using Lambda, SNS, SQS
- **Auto-scaling**: Handles high throughput with batch processing
- **Fault Tolerant**: Dead Letter Queues for failed messages
- **Template Management**: S3-based email templates with variable substitution
- **Audit Trail**: All notifications logged in DynamoDB
- **CloudWatch Monitoring**: Built-in alarms for DLQ messages
- **Cost Effective**: Pay-per-use pricing model

## 📦 Prerequisites

- AWS Account with appropriate permissions
- AWS CLI configured
- AWS SAM CLI installed
- Node.js 18.x or later
- Verified SES email address (for sending emails)

### Install AWS SAM CLI

```bash
# macOS
brew install aws-sam-cli

# Verify installation
sam --version
```

## 🛠️ Installation & Deployment

### 1. Clone or Navigate to Project

```bash
cd notification-app
```

### 2. Configure SES (Required for Email)

Before deploying, you need to verify your sender email in Amazon SES:

```bash
# Verify your sender email address
aws ses verify-email-identity --email-address noreply@example.com --region us-east-1

# Check verification status
aws ses get-identity-verification-attributes \
  --identities noreply@example.com \
  --region us-east-1
```

**Important**: Check your email and click the verification link sent by AWS.

### 3. Build the Application

```bash
sam build
```

This will:
- Install Node.js dependencies for both Lambda functions
- Package the Lambda functions
- Prepare the CloudFormation template

### 4. Deploy to AWS

```bash
sam deploy --guided
```

Follow the prompts:
- **Stack Name**: `notification-service` (or your preference)
- **AWS Region**: `us-east-1`
- **Parameter Environment**: `dev`
- **Confirm changes before deploy**: `Y`
- **Allow SAM CLI IAM role creation**: `Y`
- **Disable rollback**: `N`
- **Save arguments to configuration file**: `Y`

For subsequent deployments, simply run:

```bash
sam deploy
```

### 5. Upload Email Templates to S3

After deployment, upload the email templates:

```bash
# Get the bucket name from CloudFormation outputs
BUCKET_NAME=$(aws cloudformation describe-stacks \
  --stack-name notification-service \
  --query 'Stacks[0].Outputs[?OutputKey==`TemplatesBucketName`].OutputValue' \
  --output text)

# Upload templates
aws s3 cp templates/welcome-email.html s3://$BUCKET_NAME/welcome-email.html
aws s3 cp templates/password-reset.html s3://$BUCKET_NAME/password-reset.html
aws s3 cp templates/otp-verification.html s3://$BUCKET_NAME/otp-verification.html
aws s3 cp templates/order-confirmation.html s3://$BUCKET_NAME/order-confirmation.html

echo "Templates uploaded to: $BUCKET_NAME"
```

### 6. Update FROM_EMAIL Environment Variable

Update the Lambda function with your verified email:

```bash
# Update Email Worker Lambda
aws lambda update-function-configuration \
  --function-name dev-email-worker \
  --environment "Variables={DYNAMODB_TABLE=dev-notifications,TEMPLATES_BUCKET=$BUCKET_NAME,SES_REGION=us-east-1,FROM_EMAIL=noreply@example.com,ENVIRONMENT=dev}" \
  --region us-east-1
```

## 📤 Usage

### Get SNS Topic ARN

```bash
TOPIC_ARN=$(aws cloudformation describe-stacks \
  --stack-name notification-service \
  --query 'Stacks[0].Outputs[?OutputKey==`NotificationTopicArn`].OutputValue' \
  --output text)

echo "SNS Topic ARN: $TOPIC_ARN"
```

### Send Email Notification

```bash
aws sns publish \
  --topic-arn $TOPIC_ARN \
  --message '{
    "to": "user@example.com",
    "templateName": "welcome-email",
    "subject": "Welcome to Our Platform!",
    "params": {
      "userName": "John Doe",
      "verificationLink": "https://example.com/verify?token=abc123"
    }
  }' \
  --message-attributes '{"type":{"DataType":"String","StringValue":"email"}}' \
  --region us-east-1
```

### Send SMS Notification

```bash
aws sns publish \
  --topic-arn $TOPIC_ARN \
  --message '{
    "phone": "+1234567890",
    "message": "Your OTP code is {{code}}. Valid for {{minutes}} minutes.",
    "params": {
      "code": "123456",
      "minutes": "5"
    }
  }' \
  --message-attributes '{"type":{"DataType":"String","StringValue":"sms"}}' \
  --region us-east-1
```

## 📧 Email Templates

Templates use `{{variableName}}` syntax for variable substitution.

### Available Templates

1. **welcome-email.html**
   - Variables: `userName`, `verificationLink`
   
2. **password-reset.html**
   - Variables: `userName`, `resetLink`, `expiryMinutes`
   
3. **otp-verification.html**
   - Variables: `userName`, `otpCode`, `expiryMinutes`
   
4. **order-confirmation.html**
   - Variables: `userName`, `orderNumber`, `orderDate`, `estimatedDelivery`, `shippingAddress`, `totalAmount`, `trackingLink`

### Adding New Templates

1. Create HTML file with `{{variables}}`
2. Upload to S3:
   ```bash
   aws s3 cp templates/your-template.html s3://$BUCKET_NAME/your-template.html
   ```

## 🔍 Monitoring

### View CloudWatch Logs

```bash
# Email Worker Logs
sam logs -n EmailWorkerFunction --stack-name notification-service --tail

# SMS Worker Logs
sam logs -n SmsWorkerFunction --stack-name notification-service --tail
```

### Check DynamoDB Records

```bash
aws dynamodb scan \
  --table-name dev-notifications \
  --region us-east-1 \
  --max-items 10
```

### Monitor Dead Letter Queues

```bash
# Check Email DLQ
aws sqs get-queue-attributes \
  --queue-url $(aws sqs get-queue-url --queue-name dev-email-notification-dlq --output text) \
  --attribute-names ApproximateNumberOfMessages

# Check SMS DLQ
aws sqs get-queue-attributes \
  --queue-url $(aws sqs get-queue-url --queue-name dev-sms-notification-dlq --output text) \
  --attribute-names ApproximateNumberOfMessages
```

## 🧪 Testing

### Test Email Locally

```bash
# Create test event
cat > test-email-event.json << EOF
{
  "Records": [
    {
      "body": "{\"to\":\"test@example.com\",\"templateName\":\"welcome-email\",\"subject\":\"Welcome!\",\"params\":{\"userName\":\"Test User\",\"verificationLink\":\"https://example.com/verify\"}}"
    }
  ]
}
EOF

# Invoke locally
sam local invoke EmailWorkerFunction -e test-email-event.json
```

### Test SMS Locally

```bash
# Create test event
cat > test-sms-event.json << EOF
{
  "Records": [
    {
      "body": "{\"phone\":\"+1234567890\",\"message\":\"Your code is {{code}}\",\"params\":{\"code\":\"123456\"}}"
    }
  ]
}
EOF

# Invoke locally
sam local invoke SmsWorkerFunction -e test-sms-event.json
```

## 📊 API Integration Examples

### Node.js / JavaScript

```javascript
const AWS = require('aws-sdk');
const sns = new AWS.SNS({ region: 'us-east-1' });

// Send Email
async function sendEmail(to, templateName, subject, params) {
  const message = {
    to,
    templateName,
    subject,
    params
  };

  await sns.publish({
    TopicArn: 'YOUR_TOPIC_ARN',
    Message: JSON.stringify(message),
    MessageAttributes: {
      type: {
        DataType: 'String',
        StringValue: 'email'
      }
    }
  }).promise();
}

// Send SMS
async function sendSMS(phone, message, params) {
  const smsMessage = {
    phone,
    message,
    params
  };

  await sns.publish({
    TopicArn: 'YOUR_TOPIC_ARN',
    Message: JSON.stringify(smsMessage),
    MessageAttributes: {
      type: {
        DataType: 'String',
        StringValue: 'sms'
      }
    }
  }).promise();
}
```

### Python / Boto3

```python
import boto3
import json

sns = boto3.client('sns', region_name='us-east-1')
TOPIC_ARN = 'YOUR_TOPIC_ARN'

# Send Email
def send_email(to, template_name, subject, params):
    message = {
        'to': to,
        'templateName': template_name,
        'subject': subject,
        'params': params
    }
    
    sns.publish(
        TopicArn=TOPIC_ARN,
        Message=json.dumps(message),
        MessageAttributes={
            'type': {
                'DataType': 'String',
                'StringValue': 'email'
            }
        }
    )

# Send SMS
def send_sms(phone, message, params):
    sms_message = {
        'phone': phone,
        'message': message,
        'params': params
    }
    
    sns.publish(
        TopicArn=TOPIC_ARN,
        Message=json.dumps(sms_message),
        MessageAttributes={
            'type': {
                'DataType': 'String',
                'StringValue': 'sms'
            }
        }
    )
```

## 🗑️ Cleanup

To delete all resources:

```bash
# Delete stack
sam delete --stack-name notification-service

# Delete S3 bucket (must be empty first)
aws s3 rm s3://$BUCKET_NAME --recursive
aws s3 rb s3://$BUCKET_NAME
```

## 🔒 Security Best Practices

1. **SES Sandbox**: By default, SES is in sandbox mode. Request production access for unlimited sending.
2. **IAM Roles**: Lambda functions have least-privilege IAM roles
3. **Encryption**: Enable S3 bucket encryption for templates if needed
4. **VPC**: Consider deploying Lambdas in VPC for enhanced security
5. **Secrets**: Store sensitive data in AWS Secrets Manager

## 💰 Cost Optimization

- **Lambda**: First 1M requests/month free
- **SQS**: First 1M requests/month free
- **SNS**: First 1M requests/month free
- **DynamoDB**: On-demand pricing (pay per request)
- **SES**: $0.10 per 1,000 emails
- **SMS**: Varies by country (~$0.006 per message in US)

## 🐛 Troubleshooting

### Emails Not Sending
- Verify SES email in AWS Console
- Check CloudWatch logs for errors
- Ensure FROM_EMAIL is verified
- Check SES sending limits

### SMS Not Sending
- Verify phone number format includes country code (+1...)
- Check SNS SMS spending limits
- Enable detailed logging in SNS

### Templates Not Found
- Verify templates uploaded to correct S3 bucket
- Check Lambda has S3 read permissions
- Ensure template name matches exactly (case-sensitive)

## 📝 License

MIT License

## 👤 Author

Designed and developed for high-performance notification services.
