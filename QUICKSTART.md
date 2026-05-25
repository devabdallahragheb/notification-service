# 🚀 Quick Start Guide

Get your notification service up and running in 5 minutes!

## Prerequisites Checklist

- [ ] AWS Account
- [ ] AWS CLI installed and configured (`aws configure`)
- [ ] AWS SAM CLI installed (`brew install aws-sam-cli`)
- [ ] Node.js 18+ installed

## Fast Deployment (3 Steps)

### 1️⃣ Deploy Everything

```bash
chmod +x deploy.sh
./deploy.sh
```

This will:
- Build Lambda functions
- Deploy infrastructure
- Upload email templates
- Display all necessary information

### 2️⃣ Verify SES Email

```bash
# Replace with your actual email
aws ses verify-email-identity \
  --email-address noreply@yourdomain.com \
  --region us-east-1

# Check your email inbox and click the verification link!
```

### 3️⃣ Update FROM_EMAIL

```bash
# Get your bucket name first
BUCKET_NAME=$(aws cloudformation describe-stacks \
  --stack-name notification-service \
  --query 'Stacks[0].Outputs[?OutputKey==`TemplatesBucketName`].OutputValue' \
  --output text)

# Update Lambda with your verified email
aws lambda update-function-configuration \
  --function-name dev-email-worker \
  --environment "Variables={DYNAMODB_TABLE=dev-notifications,TEMPLATES_BUCKET=$BUCKET_NAME,SES_REGION=us-east-1,FROM_EMAIL=noreply@yourdomain.com,ENVIRONMENT=dev}" \
  --region us-east-1
```

## ✅ Test It!

### Send Test Email

```bash
# Get Topic ARN
TOPIC_ARN=$(aws cloudformation describe-stacks \
  --stack-name notification-service \
  --query 'Stacks[0].Outputs[?OutputKey==`NotificationTopicArn`].OutputValue' \
  --output text)

# Send test email (replace with your email)
aws sns publish \
  --topic-arn $TOPIC_ARN \
  --message '{
    "to": "your-email@example.com",
    "templateName": "welcome-email",
    "subject": "Welcome Test!",
    "params": {
      "userName": "Test User",
      "verificationLink": "https://example.com/verify"
    }
  }' \
  --message-attributes '{"type":{"DataType":"String","StringValue":"email"}}' \
  --region us-east-1
```

### Send Test SMS

```bash
# Send test SMS (replace with your phone number)
aws sns publish \
  --topic-arn $TOPIC_ARN \
  --message '{
    "phone": "+1234567890",
    "message": "Your verification code is {{code}}",
    "params": {
      "code": "123456"
    }
  }' \
  --message-attributes '{"type":{"DataType":"String","StringValue":"sms"}}' \
  --region us-east-1
```

## 📱 Use in Your Application

### Get Topic ARN

```bash
aws cloudformation describe-stacks \
  --stack-name notification-service \
  --query 'Stacks[0].Outputs[?OutputKey==`NotificationTopicArn`].OutputValue' \
  --output text
```

### Node.js Example

```javascript
const AWS = require('aws-sdk');
const sns = new AWS.SNS({ region: 'us-east-1' });

const TOPIC_ARN = 'arn:aws:sns:us-east-1:xxxx:dev-notification-topic';

// Send Email
await sns.publish({
  TopicArn: TOPIC_ARN,
  Message: JSON.stringify({
    to: 'user@example.com',
    templateName: 'welcome-email',
    subject: 'Welcome!',
    params: {
      userName: 'John',
      verificationLink: 'https://example.com/verify'
    }
  }),
  MessageAttributes: {
    type: { DataType: 'String', StringValue: 'email' }
  }
}).promise();

// Send SMS
await sns.publish({
  TopicArn: TOPIC_ARN,
  Message: JSON.stringify({
    phone: '+1234567890',
    message: 'Code: {{code}}',
    params: { code: '123456' }
  }),
  MessageAttributes: {
    type: { DataType: 'String', StringValue: 'sms' }
  }
}).promise();
```

## 🔍 Monitor

### View Logs

```bash
# Email worker logs
sam logs -n EmailWorkerFunction --stack-name notification-service --tail

# SMS worker logs
sam logs -n SmsWorkerFunction --stack-name notification-service --tail
```

### Check Database

```bash
aws dynamodb scan --table-name dev-notifications --max-items 5
```

## ❌ Troubleshooting

| Issue | Solution |
|-------|----------|
| Email not sending | Verify SES email and check CloudWatch logs |
| SMS not sending | Check phone format (+1...) and SNS limits |
| Template not found | Verify template uploaded to S3 bucket |

## 🗑️ Delete Everything

```bash
sam delete --stack-name notification-service
```

---

**Need help?** Check the full [README.md](README.md) for detailed documentation.
