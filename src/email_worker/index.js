const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');

const sesClient = new SESClient({ region: process.env.SES_REGION || 'us-east-1' });
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const TEMPLATES_BUCKET = process.env.TEMPLATES_BUCKET;
const DYNAMODB_TABLE = process.env.DYNAMODB_TABLE;
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@example.com';

async function getTemplate(templateName) {
  try {
    const command = new GetObjectCommand({
      Bucket: TEMPLATES_BUCKET,
      Key: `${templateName}.html`
    });
    
    const response = await s3Client.send(command);
    const templateContent = await streamToString(response.Body);
    return templateContent;
  } catch (error) {
    console.error(`Error fetching template ${templateName}:`, error);
    throw new Error(`Template ${templateName} not found`);
  }
}

async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

function replaceTemplateVariables(template, params) {
  let result = template;
  for (const [key, value] of Object.entries(params || {})) {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
    result = result.replace(regex, value);
  }
  return result;
}

async function sendEmail(to, subject, htmlBody, textBody) {
  const params = {
    Source: FROM_EMAIL,
    Destination: {
      ToAddresses: Array.isArray(to) ? to : [to]
    },
    Message: {
      Subject: {
        Data: subject,
        Charset: 'UTF-8'
      },
      Body: {
        Html: {
          Data: htmlBody,
          Charset: 'UTF-8'
        },
        Text: {
          Data: textBody || htmlBody.replace(/<[^>]*>/g, ''),
          Charset: 'UTF-8'
        }
      }
    }
  };

  const command = new SendEmailCommand(params);
  return await sesClient.send(command);
}

async function saveNotificationBatch(notifications) {
  const putRequests = notifications.map(notification => ({
    PutRequest: {
      Item: notification
    }
  }));

  const batchSize = 25;
  for (let i = 0; i < putRequests.length; i += batchSize) {
    const batch = putRequests.slice(i, i + batchSize);
    const command = new BatchWriteCommand({
      RequestItems: {
        [DYNAMODB_TABLE]: batch
      }
    });
    await docClient.send(command);
  }
}

async function processEmailMessage(message) {
  const notificationId = uuidv4();
  const timestamp = Date.now();
  
  try {
    const { to, templateName, subject, params } = message;

    if (!to || !templateName || !subject) {
      throw new Error('Missing required fields: to, templateName, or subject');
    }

    console.log(`Processing email for ${to} with template ${templateName}`);

    const template = await getTemplate(templateName);
    const htmlBody = replaceTemplateVariables(template, params);

    await sendEmail(to, subject, htmlBody);

    console.log(`Email sent successfully to ${to}`);

    return {
      notificationId,
      type: 'email',
      recipient: to,
      templateUsed: templateName,
      status: 'sent',
      timestamp,
      subject,
      params
    };
  } catch (error) {
    console.error(`Error processing email:`, error);
    
    return {
      notificationId,
      type: 'email',
      recipient: message.to || 'unknown',
      templateUsed: message.templateName || 'unknown',
      status: 'failed',
      timestamp,
      errorMessage: error.message,
      params: message.params
    };
  }
}

exports.handler = async (event) => {
  console.log('Received event:', JSON.stringify(event, null, 2));

  const notifications = [];

  for (const record of event.Records) {
    try {
      const message = JSON.parse(record.body);
      const notification = await processEmailMessage(message);
      notifications.push(notification);
    } catch (error) {
      console.error('Error processing record:', error);
      const notificationId = uuidv4();
      notifications.push({
        notificationId,
        type: 'email',
        recipient: 'unknown',
        status: 'failed',
        timestamp: Date.now(),
        errorMessage: error.message,
        rawMessage: record.body
      });
    }
  }

  if (notifications.length > 0) {
    await saveNotificationBatch(notifications);
    console.log(`Saved ${notifications.length} notifications to DynamoDB`);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Email processing completed',
      processed: notifications.length,
      successful: notifications.filter(n => n.status === 'sent').length,
      failed: notifications.filter(n => n.status === 'failed').length
    })
  };
};
