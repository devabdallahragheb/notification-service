const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');

const snsClient = new SNSClient({ region: process.env.AWS_REGION || 'us-east-1' });
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

const DYNAMODB_TABLE = process.env.DYNAMODB_TABLE;

function replaceMessageVariables(message, params) {
  let result = message;
  for (const [key, value] of Object.entries(params || {})) {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
    result = result.replace(regex, value);
  }
  return result;
}

async function sendSMS(phoneNumber, message) {
  const params = {
    Message: message,
    PhoneNumber: phoneNumber,
    MessageAttributes: {
      'AWS.SNS.SMS.SMSType': {
        DataType: 'String',
        StringValue: 'Transactional'
      }
    }
  };

  const command = new PublishCommand(params);
  return await snsClient.send(command);
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

async function processSmsMessage(message) {
  const notificationId = uuidv4();
  const timestamp = Date.now();
  
  try {
    const { phone, message: messageTemplate, params } = message;

    if (!phone || !messageTemplate) {
      throw new Error('Missing required fields: phone or message');
    }

    const formattedPhone = phone.startsWith('+') ? phone : `+${phone}`;

    console.log(`Processing SMS for ${formattedPhone}`);

    const smsMessage = replaceMessageVariables(messageTemplate, params);

    const result = await sendSMS(formattedPhone, smsMessage);

    console.log(`SMS sent successfully to ${formattedPhone}, MessageId: ${result.MessageId}`);

    return {
      notificationId,
      type: 'sms',
      recipient: formattedPhone,
      status: 'sent',
      timestamp,
      message: smsMessage,
      messageId: result.MessageId,
      params
    };
  } catch (error) {
    console.error(`Error processing SMS:`, error);
    
    return {
      notificationId,
      type: 'sms',
      recipient: message.phone || 'unknown',
      status: 'failed',
      timestamp,
      errorMessage: error.message,
      message: message.message,
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
      const notification = await processSmsMessage(message);
      notifications.push(notification);
    } catch (error) {
      console.error('Error processing record:', error);
      const notificationId = uuidv4();
      notifications.push({
        notificationId,
        type: 'sms',
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
      message: 'SMS processing completed',
      processed: notifications.length,
      successful: notifications.filter(n => n.status === 'sent').length,
      failed: notifications.filter(n => n.status === 'failed').length
    })
  };
};
