import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEmailSender, emailStatus } from '../email.js';

const gmail = { EMAIL_PROVIDER: 'gmail', GMAIL_USER: 'kalhudson500@gmail.com', GMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop' };

test('Gmail setup reports missing fields without disclosing the app password', () => {
  assert.deepEqual(emailStatus({ EMAIL_PROVIDER: 'gmail', GMAIL_USER: gmail.GMAIL_USER }).missing, ['GMAIL_APP_PASSWORD']);
  assert.equal(emailStatus(gmail).configured, true);
  assert.ok(!JSON.stringify(emailStatus(gmail)).includes(gmail.GMAIL_APP_PASSWORD));
  assert.throws(() => createEmailSender({ env: { EMAIL_PROVIDER: 'gmail' } }), /Email setup incomplete/);
});

test('Gmail authenticates using TLS and sends as the connected account', async () => {
  let options, message, verified = false;
  const sender = createEmailSender({ env: { ...gmail, RECRUITING_FROM_EMAIL: 'wrong@example.com' }, createTransport(config) {
    options = config;
    return { async verify() { verified = true; }, async sendMail(data) { message = data; return { accepted: [data.to] }; } };
  } });
  await sender.verify();
  await sender.send({ to: 'coach@example.edu', subject: 'Film', text: 'Test film', key: 'hudson-1-2' });
  assert.equal(verified, true);
  assert.equal(options.host, 'smtp.gmail.com');
  assert.equal(options.secure, true);
  assert.equal(options.auth.pass, 'abcdefghijklmnop');
  assert.equal(message.from.address, gmail.GMAIL_USER);
  assert.equal(message.to, 'coach@example.edu');
  assert.equal(message.messageId, '<hudson-1-2@hudson-recruiting-command-center.onrender.com>');
});

test('failed Gmail authentication never sends and does not reveal credentials', async () => {
  let sent = 0;
  const sender = createEmailSender({ env: gmail, createTransport: () => ({
    async verify() { throw Error('AUTH ' + gmail.GMAIL_APP_PASSWORD); },
    async sendMail() { sent++; }
  }) });
  await assert.rejects(sender.verify(), error => error.message.includes('No campaign emails were sent') && !error.message.includes(gmail.GMAIL_APP_PASSWORD));
  assert.equal(sent, 0);
});

test('SMTP recipient rejection is not counted as sent', async () => {
  const sender = createEmailSender({ env: gmail, createTransport: () => ({ async sendMail() { return { accepted: [] }; } }) });
  await assert.rejects(sender.send({ to: 'coach@example.edu', key: 'hudson-1-2' }), /did not confirm acceptance/);
});

test('existing Resend setup retains its idempotency key and payload', async () => {
  let request;
  const env = { RESEND_API_KEY: 'fixture-secret', RECRUITING_FROM_EMAIL: 'recruiting@example.com' };
  const sender = createEmailSender({ env, fetchImpl: async (url, options) => { request = { url, ...options }; return { ok: true }; } });
  await sender.send({ to: 'coach@example.edu', subject: 'Film', text: 'Highlights', key: 'hudson-1-2' });
  assert.equal(request.headers['Idempotency-Key'], 'hudson-1-2');
  assert.deepEqual(JSON.parse(request.body), { from: env.RECRUITING_FROM_EMAIL, to: ['coach@example.edu'], subject: 'Film', text: 'Highlights' });
});
