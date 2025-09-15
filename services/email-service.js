/**
 * Email Service
 * =============
 *
 * Handles transactional emails for billing and subscription events.
 * Provides templates for welcome, payment confirmations, failures, etc.
 */

import winston from 'winston';
import CONFIG from '../config/app-config.js';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'email-service' },
  transports: [
    new winston.transports.File({ filename: 'logs/email.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

export class EmailService {
  constructor() {
    this.fromEmail = CONFIG.email?.fromEmail || 'noreply@scottgpt.com';
    this.emailProvider = CONFIG.email?.provider || 'console'; // console, sendgrid, ses, etc.
  }

  /**
   * Send subscription welcome email
   */
  async sendSubscriptionWelcome(email, data) {
    const subject = 'Welcome to ScottGPT Premium! 🎉';
    const content = this.generateWelcomeEmail(data);

    return this.sendEmail(email, subject, content, 'subscription_welcome');
  }

  /**
   * Send payment confirmation email
   */
  async sendPaymentConfirmation(email, data) {
    const subject = 'Payment Confirmation - ScottGPT';
    const content = this.generatePaymentConfirmationEmail(data);

    return this.sendEmail(email, subject, content, 'payment_confirmation');
  }

  /**
   * Send payment failed email
   */
  async sendPaymentFailed(email, data) {
    const subject = 'Payment Failed - Action Required';
    const content = this.generatePaymentFailedEmail(data);

    return this.sendEmail(email, subject, content, 'payment_failed');
  }

  /**
   * Send subscription canceled email
   */
  async sendSubscriptionCanceled(email, data) {
    const subject = 'Subscription Canceled - ScottGPT';
    const content = this.generateCancellationEmail(data);

    return this.sendEmail(email, subject, content, 'subscription_canceled');
  }

  /**
   * Send purchase confirmation email
   */
  async sendPurchaseConfirmation(data) {
    const subject = 'Purchase Confirmation - Resume Credits Added';
    const content = this.generatePurchaseConfirmationEmail(data);

    return this.sendEmail(data.userEmail, subject, content, 'purchase_confirmation');
  }

  /**
   * Send one-time payment failure email
   */
  async sendPaymentFailure(data) {
    const subject = 'Payment Failed - ScottGPT';
    const content = this.generatePaymentFailureEmail(data);

    return this.sendEmail(data.userEmail, subject, content, 'payment_failure');
  }

  /**
   * Generic email sending method
   */
  async sendEmail(email, subject, content, template) {
    try {
      logger.info('Sending email', {
        to: email,
        subject,
        template,
        provider: this.emailProvider
      });

      switch (this.emailProvider) {
        case 'console':
          // Development mode - log to console
          console.log('\n📧 EMAIL NOTIFICATION');
          console.log(`To: ${email}`);
          console.log(`Subject: ${subject}`);
          console.log(`Template: ${template}`);
          console.log('Content:');
          console.log(content);
          console.log('─────────────────────────────────\n');
          break;

        case 'sendgrid':
          // Implement SendGrid integration
          await this.sendWithSendGrid(email, subject, content);
          break;

        case 'ses':
          // Implement AWS SES integration
          await this.sendWithSES(email, subject, content);
          break;

        default:
          logger.warn('Unknown email provider, using console fallback', {
            provider: this.emailProvider
          });
          console.log(`📧 ${subject} → ${email}`);
      }

      logger.info('Email sent successfully', {
        to: email,
        template
      });

      return { success: true };

    } catch (error) {
      logger.error('Failed to send email', {
        to: email,
        subject,
        template,
        error: error.message
      });

      return { success: false, error: error.message };
    }
  }

  /**
   * Generate welcome email content
   */
  generateWelcomeEmail(data) {
    return `
Welcome to ScottGPT Premium!

Thank you for upgrading to Premium! Here's what you now have access to:

✅ ${data.resumeLimit} resume generations per month
✅ Priority support
✅ Advanced resume templates
✅ ATS optimization features

Your subscription will renew ${data.billingPeriod === 'monthly' ? 'monthly' : 'annually'}.

Get started by visiting your dashboard:
${CONFIG.app.baseUrl}/dashboard

Need help? Reply to this email or visit our support center.

Best regards,
The ScottGPT Team
    `.trim();
  }

  /**
   * Generate payment confirmation email content
   */
  generatePaymentConfirmationEmail(data) {
    const amount = (data.amount / 100).toFixed(2);
    const currency = data.currency.toUpperCase();

    return `
Payment Confirmation

Your payment has been processed successfully.

Amount: ${currency} $${amount}
Date: ${new Date().toLocaleDateString()}

${data.invoiceUrl ? `View Invoice: ${data.invoiceUrl}` : ''}

Your ScottGPT Premium subscription is now active.

Questions? Contact our support team.

Best regards,
The ScottGPT Team
    `.trim();
  }

  /**
   * Generate payment failed email content
   */
  generatePaymentFailedEmail(data) {
    const amount = (data.amount / 100).toFixed(2);
    const currency = data.currency.toUpperCase();

    return `
Payment Failed - Action Required

We were unable to process your payment for ScottGPT Premium.

Amount: ${currency} $${amount}
Attempt: ${data.attemptCount}

What happens next:
- Your subscription remains active temporarily
- We'll retry payment automatically
${data.nextPaymentAttempt ? `- Next attempt: ${new Date(data.nextPaymentAttempt * 1000).toLocaleDateString()}` : ''}

To update your payment method:
1. Visit ${CONFIG.app.baseUrl}/billing
2. Update your payment information
3. Contact support if you need assistance

Best regards,
The ScottGPT Team
    `.trim();
  }

  /**
   * Generate cancellation email content
   */
  generateCancellationEmail(data) {
    return `
Subscription Canceled

Your ScottGPT Premium subscription has been canceled.

Effective Date: ${data.effectiveDate.toLocaleDateString()}

What this means:
- You'll continue to have Premium access until the end of your billing period
- After that, you'll be moved to the Free plan (3 resumes per month)
- All your data and account remain safe

Changed your mind? You can reactivate anytime:
${CONFIG.app.baseUrl}/billing

We're sorry to see you go! If you have feedback, please reply to this email.

Best regards,
The ScottGPT Team
    `.trim();
  }

  /**
   * Generate purchase confirmation email content
   */
  generatePurchaseConfirmationEmail(data) {
    return `
Purchase Confirmation - Resume Credits Added

Hi ${data.userName},

Your purchase has been completed successfully!

Credits Added: ${data.creditCount} resume generation${data.creditCount > 1 ? 's' : ''}
Amount: ${data.currency} $${data.amount.toFixed(2)}
New Total Credits: ${data.newCreditTotal}

These credits have been added to your account and never expire.

Start creating resumes:
${CONFIG.app.baseUrl}/dashboard

Thank you for your purchase!

Best regards,
The ScottGPT Team
    `.trim();
  }

  /**
   * Generate payment failure email content for one-time purchases
   */
  generatePaymentFailureEmail(data) {
    return `
Payment Failed - ScottGPT

Hi ${data.userName},

We were unable to process your payment for resume credits.

Purchase Details:
- Credits: ${data.creditCount} resume generation${data.creditCount > 1 ? 's' : ''}
- Amount: ${data.currency} $${data.amount.toFixed(2)}
- Reason: ${data.failureReason}

What you can do:
1. Check your payment method details
2. Ensure sufficient funds are available
3. Try again with a different payment method
4. Contact your bank if the issue persists

Try again:
${CONFIG.app.baseUrl}/billing

Need help? Reply to this email or contact our support team.

Best regards,
The ScottGPT Team
    `.trim();
  }

  /**
   * Send email via SendGrid (placeholder implementation)
   */
  async sendWithSendGrid(email, subject, content) {
    // Implement SendGrid API integration
    logger.info('SendGrid email sending not implemented', { email, subject });
    throw new Error('SendGrid integration not implemented');
  }

  /**
   * Send email via AWS SES (placeholder implementation)
   */
  async sendWithSES(email, subject, content) {
    // Implement AWS SES integration
    logger.info('SES email sending not implemented', { email, subject });
    throw new Error('SES integration not implemented');
  }
}

export default EmailService;