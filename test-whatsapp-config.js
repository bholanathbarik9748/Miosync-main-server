#!/usr/bin/env node

/**
 * WhatsApp Configuration Tester
 * 
 * This script tests your WhatsApp Business API configuration
 * Run: node test-whatsapp-config.js
 */

require('dotenv').config();
const axios = require('axios');

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  bold: '\x1b[1m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

function logTitle(message) {
  log(`\n${'='.repeat(60)}`, 'bold');
  log(message, 'bold');
  log('='.repeat(60), 'bold');
}

async function testConfiguration() {
  logTitle('WhatsApp Configuration Tester');

  // Step 1: Check environment variables
  logTitle('Step 1: Checking Environment Variables');
  
  const requiredVars = {
    WA_TOKEN: process.env.WA_TOKEN,
    WA_PHONE_NUMBER_ID: process.env.WA_PHONE_NUMBER_ID,
  };

  const optionalVars = {
    WA_API_BASE: process.env.WA_API_BASE || 'https://graph.facebook.com',
    WA_API_VERSION: process.env.WA_API_VERSION || 'v22.0',
    WA_WEBHOOK_VERIFY_TOKEN: process.env.WA_WEBHOOK_VERIFY_TOKEN,
  };

  let envCheckPassed = true;

  for (const [key, value] of Object.entries(requiredVars)) {
    if (!value) {
      logError(`${key} is not set in .env file`);
      envCheckPassed = false;
    } else {
      logSuccess(`${key} is set`);
      if (key === 'WA_TOKEN') {
        logInfo(`   Token length: ${value.length} characters`);
        logInfo(`   Token preview: ${value.substring(0, 20)}...${value.substring(value.length - 5)}`);
      }
    }
  }

  for (const [key, value] of Object.entries(optionalVars)) {
    if (value) {
      logSuccess(`${key} = ${value}`);
    } else {
      logWarning(`${key} is not set (using default)`);
    }
  }

  if (!envCheckPassed) {
    logError('\nConfiguration check failed! Please set required environment variables.');
    process.exit(1);
  }

  // Step 2: Test API connectivity
  logTitle('Step 2: Testing API Connectivity');

  const baseUrl = optionalVars.WA_API_BASE;
  const version = optionalVars.WA_API_VERSION;
  const phoneNumberId = requiredVars.WA_PHONE_NUMBER_ID;
  const token = requiredVars.WA_TOKEN;

  try {
    logInfo('Sending request to WhatsApp API...');
    const url = `${baseUrl}/${version}/${phoneNumberId}`;
    const response = await axios.get(url, {
      params: {
        fields: 'display_phone_number,verified_name,quality_rating,messaging_limit_tier',
      },
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    logSuccess('API connection successful!');
    logInfo('\nPhone Number Details:');
    console.log(JSON.stringify(response.data, null, 2));

    // Check quality rating
    if (response.data.quality_rating) {
      const rating = response.data.quality_rating;
      if (rating === 'GREEN') {
        logSuccess(`Quality Rating: ${rating} (Excellent)`);
      } else if (rating === 'YELLOW') {
        logWarning(`Quality Rating: ${rating} (Warning - improve message quality)`);
      } else if (rating === 'RED') {
        logError(`Quality Rating: ${rating} (Critical - messaging may be limited)`);
      }
    }

    // Check messaging tier
    if (response.data.messaging_limit_tier) {
      const tier = response.data.messaging_limit_tier;
      const limits = {
        TIER_50: '50 messages/day',
        TIER_250: '250 messages/day',
        TIER_1K: '1,000 messages/day',
        TIER_10K: '10,000 messages/day',
        TIER_100K: '100,000 messages/day',
        TIER_UNLIMITED: 'Unlimited messages/day',
      };
      logInfo(`Messaging Limit: ${limits[tier] || tier}`);
    }

  } catch (error) {
    logError('API connection failed!');
    
    if (error.response) {
      const errorData = error.response.data;
      logError(`Status: ${error.response.status}`);
      logError(`Error: ${JSON.stringify(errorData, null, 2)}`);

      if (errorData.error?.code === 190) {
        logError('\n🚨 ACCESS TOKEN EXPIRED OR INVALID!');
        logInfo('\nTo fix this:');
        logInfo('1. Go to https://business.facebook.com/settings/system-users');
        logInfo('2. Generate a new System User Token');
        logInfo('3. Grant permissions: whatsapp_business_messaging, whatsapp_business_management');
        logInfo('4. Update WA_TOKEN in your .env file');
        logInfo('5. Restart your server');
      } else if (errorData.error?.code === 100) {
        logError('\n🚨 INVALID PHONE NUMBER ID!');
        logInfo('\nTo fix this:');
        logInfo('1. Go to https://developers.facebook.com/apps');
        logInfo('2. Select your app → WhatsApp → API Setup');
        logInfo('3. Copy the Phone Number ID');
        logInfo('4. Update WA_PHONE_NUMBER_ID in your .env file');
      }
    } else {
      logError(`Network error: ${error.message}`);
    }
    
    process.exit(1);
  }

  // Step 3: List available templates
  logTitle('Step 3: Fetching Available Templates');

  try {
    logInfo('Fetching message templates...');
    
    // Try to get WABA ID from phone number endpoint
    let wabaId = null;
    try {
      const phoneResponse = await axios.get(`${baseUrl}/${version}/${phoneNumberId}`, {
        params: { fields: 'whatsapp_business_account' },
        headers: { Authorization: `Bearer ${token}` },
      });
      wabaId = phoneResponse.data.whatsapp_business_account?.id;
    } catch (err) {
      logWarning('Could not automatically detect WABA ID');
    }

    if (!wabaId) {
      logWarning('WhatsApp Business Account ID not found automatically');
      logInfo('Please manually add WA_BUSINESS_ACCOUNT_ID to your .env file to list templates');
      logInfo('Find it at: https://business.facebook.com/wa/manage/home/');
    } else {
      const templatesUrl = `${baseUrl}/${version}/${wabaId}/message_templates`;
      const templatesResponse = await axios.get(templatesUrl, {
        params: { limit: 100 },
        headers: { Authorization: `Bearer ${token}` },
      });

      const templates = templatesResponse.data.data;
      logSuccess(`Found ${templates.length} message template(s)`);

      if (templates.length > 0) {
        logInfo('\nAvailable Templates:');
        templates.forEach((template, index) => {
          console.log(`\n${index + 1}. Name: ${colors.bold}${template.name}${colors.reset}`);
          console.log(`   Status: ${template.status === 'APPROVED' ? '✅' : '⏳'} ${template.status}`);
          console.log(`   Language: ${template.language}`);
          console.log(`   Category: ${template.category}`);
          
          // Check for commonly used templates
          if (template.name === 'guest_invite_id_request') {
            if (template.status === 'APPROVED') {
              logSuccess('   ⭐ This is your guest_invite_id_request template - APPROVED!');
            } else {
              logWarning(`   ⭐ This is your guest_invite_id_request template - ${template.status}`);
            }
          }
          if (template.name === 'booking_confirmation') {
            if (template.status === 'APPROVED') {
              logSuccess('   ⭐ This is your booking_confirmation template - APPROVED!');
            } else {
              logWarning(`   ⭐ This is your booking_confirmation template - ${template.status}`);
            }
          }
        });

        // Check if required templates exist
        const requiredTemplates = ['guest_invite_id_request', 'booking_confirmation'];
        const missingTemplates = requiredTemplates.filter(
          name => !templates.some(t => t.name === name && t.status === 'APPROVED')
        );

        if (missingTemplates.length > 0) {
          logWarning(`\n⚠️  Missing or unapproved templates: ${missingTemplates.join(', ')}`);
          logInfo('Your code uses these templates. Please create/approve them in WhatsApp Manager.');
        } else {
          logSuccess('\n✅ All required templates are approved!');
        }
      }
    }

  } catch (error) {
    if (error.response?.status === 403) {
      logWarning('Insufficient permissions to list templates');
      logInfo('This is optional. Your token needs `whatsapp_business_management` permission.');
    } else {
      logWarning(`Could not fetch templates: ${error.message}`);
    }
  }

  // Step 4: Database connection (optional)
  logTitle('Step 4: Summary');

  logSuccess('✅ Environment variables are configured');
  logSuccess('✅ WhatsApp API is accessible');
  logSuccess('✅ Access token is valid');
  
  logInfo('\n📝 Next Steps:');
  logInfo('1. Ensure all required templates are approved in WhatsApp Manager');
  logInfo('2. Test sending a message using your API endpoint');
  logInfo('3. Monitor logs/error.log for any issues');
  logInfo('4. Check WHATSAPP_TROUBLESHOOTING.md for detailed solutions');

  log('\n' + '='.repeat(60), 'bold');
  logSuccess('Configuration test completed!');
  log('='.repeat(60) + '\n', 'bold');
}

// Run the test
testConfiguration().catch((error) => {
  logError(`Unexpected error: ${error.message}`);
  console.error(error);
  process.exit(1);
});

