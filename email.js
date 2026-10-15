import nodemailer from 'nodemailer';

export function emailStatus(env = process.env) {
  const provider = env.EMAIL_PROVIDER || (env.RESEND_API_KEY ? 'resend' : 'gmail');
  if (provider === 'gmail') {
    const from = (env.GMAIL_USER || '').trim().toLowerCase();
    const missing = [];
    if (!/^[^\s@]+@gmail\.com$/.test(from)) missing.push('GMAIL_USER');
    if (!/^[a-z]{16}$/i.test((env.GMAIL_APP_PASSWORD || '').replace(/\s/g, ''))) missing.push('GMAIL_APP_PASSWORD');
    return { provider, from, configured: !missing.length, missing };
  }
  if (provider === 'resend') {
    const missing = ['RESEND_API_KEY', 'RECRUITING_FROM_EMAIL'].filter(k => !env[k]);
    return { provider, from: env.RECRUITING_FROM_EMAIL || '', configured: !missing.length, missing };
  }
  return { provider: 'unknown', from: '', configured: false, missing: ['EMAIL_PROVIDER (gmail or resend)'] };
}

export function createEmailSender({ env = process.env, createTransport = nodemailer.createTransport, fetchImpl = fetch } = {}) {
  const status = emailStatus(env);
  if (!status.configured) throw Error('Email setup incomplete: configure ' + status.missing.join(', ') + ' in Render Environment.');
  if (status.provider === 'gmail') {
    const transport = createTransport({
      host: 'smtp.gmail.com', port: 465, secure: true,
      auth: { user: status.from, pass: env.GMAIL_APP_PASSWORD.replace(/\s/g, '') },
      connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
      tls: { minVersion: 'TLSv1.2' }
    });
    return {
      async verify() {
        try { await transport.verify(); }
        catch { throw Error('Gmail connection failed. Check the Google app password and account settings in Render. No campaign emails were sent.'); }
      },
      async send({ to, subject, text, key }) {
        try {
          const result = await transport.sendMail({
            from: { name: 'Kalel Hudson', address: status.from }, to, subject, text,
            messageId: `<${key}@hudson-recruiting-command-center.onrender.com>`
          });
          if (!result.accepted?.some(address => String(address).toLowerCase() === to.toLowerCase())) throw Error('Recipient rejected');
        } catch { throw Error('Gmail did not confirm acceptance. Check Sent mail before retrying to avoid duplicates.'); }
      }
    };
  }
  return {
    async verify() {},
    async send({ to, subject, text, key }) {
      const response = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST', signal: AbortSignal.timeout(30000),
        headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: JSON.stringify({ from: status.from, to: [to], subject, text })
      });
      if (!response.ok) throw Error('Email provider returned HTTP ' + response.status);
    }
  };
}
