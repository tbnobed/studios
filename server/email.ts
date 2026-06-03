import sgMail from "@sendgrid/mail";

// SendGrid email integration. Configured via plain environment variables so it
// works in any deployment (including self-hosted Docker):
//   SENDGRID_API_KEY    - SendGrid API key
//   SENDGRID_FROM_EMAIL - verified sender address
const apiKey = process.env.SENDGRID_API_KEY;
const fromEmail = process.env.SENDGRID_FROM_EMAIL;

if (apiKey) {
  sgMail.setApiKey(apiKey);
}

// True only when both the API key and a sender address are present.
export function isEmailConfigured(): boolean {
  return Boolean(apiKey && fromEmail);
}

interface InviteEmailParams {
  to: string;
  username: string;
  inviteUrl: string;
  inviterName?: string;
}

// Sends the account-invitation email. Throws (does not silently no-op) when
// email is not configured, so callers can surface an explicit status.
export async function sendInviteEmail(params: InviteEmailParams): Promise<void> {
  if (!isEmailConfigured()) {
    throw new Error(
      "Email is not configured. Set SENDGRID_API_KEY and SENDGRID_FROM_EMAIL."
    );
  }

  const { to, username, inviteUrl, inviterName } = params;
  const invitedBy = inviterName ? `${inviterName} has invited you` : "You've been invited";
  const subject = "You've been invited to OBTV Studio Manager";

  const text = [
    `${invitedBy} to OBTV Studio Manager.`,
    "",
    `Your username is: ${username}`,
    "",
    "Set your password and activate your account using the link below:",
    inviteUrl,
    "",
    "This link expires in 7 days.",
  ].join("\n");

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 520px; margin: 0 auto; color: #1a1a1a;">
      <h2 style="margin-bottom: 8px;">OBTV Studio Manager</h2>
      <p>${invitedBy} to OBTV Studio Manager.</p>
      <p>Your username is <strong>${username}</strong>.</p>
      <p>Click the button below to set your password and activate your account.</p>
      <p style="margin: 24px 0;">
        <a href="${inviteUrl}"
           style="background: #2563eb; color: #ffffff; padding: 12px 20px; border-radius: 6px; text-decoration: none; display: inline-block;">
          Set your password
        </a>
      </p>
      <p style="font-size: 13px; color: #555;">Or paste this link into your browser:</p>
      <p style="font-size: 13px; word-break: break-all;"><a href="${inviteUrl}">${inviteUrl}</a></p>
      <p style="font-size: 13px; color: #888; margin-top: 24px;">This link expires in 7 days.</p>
    </div>
  `;

  await sgMail.send({
    to,
    from: fromEmail!,
    subject,
    text,
    html,
  });
}
