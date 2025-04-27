// server/brevoMailer.js
require('dotenv').config();                // טען את ה־.env
const SibApiV3Sdk = require('sib-api-v3-sdk');

// התחברות ל־Brevo עם המפתח
const defaultClient = SibApiV3Sdk.ApiClient.instance;
defaultClient.authentications['api-key'].apiKey = process.env.BREVO_API_KEY;

// צור מופע של ה־Transactional API
const tranEmailApi = new SibApiV3Sdk.TransactionalEmailsApi();

/**
 * שולח מייל התראה
 * @param {string} to          כתובת המייל של המקבל
 * @param {string} subject     נושא המייל
 * @param {string} htmlContent תוכן HTML
 */
async function sendAlertEmail(to, subject, htmlContent) {
  const mail = {
    sender:    { name: 'ShelfMate Alerts', email: 'tomwas2000@gmail.com' },
    to:        [{ email: to }],
    subject,
    htmlContent
  };
  return tranEmailApi.sendTransacEmail(mail);
}

module.exports = { sendAlertEmail };


