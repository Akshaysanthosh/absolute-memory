import { createTransport } from 'nodemailer';

export function smtpPasswordResetSender(smtpUrl: string, from: string) {
  const transport = createTransport(smtpUrl);
  return async (email: string, url: string) => {
    await transport.sendMail({
      from,
      to: email,
      subject: 'Reset your Absolute Memory password',
      text: `Open this link to reset your password. It expires in 30 minutes.\n\n${url}\n`,
    });
  };
}
