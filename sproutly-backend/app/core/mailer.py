"""Sending the email confirmation code (t08).

Plain SMTP with STARTTLS from Python's standard library: with Gmail, SMTP_HOST=smtp.gmail.com,
SMTP_PORT=587, SMTP_USERNAME and MAIL_FROM the support address, SMTP_PASSWORD a Google App
Password (needs 2-Step Verification on that account). Port 465 uses TLS from the start instead.
"""
import logging
import smtplib
import ssl
from email.message import EmailMessage
from html import escape

from app.core.config import settings

logger = logging.getLogger(__name__)

# The public privacy page (staff portal on Cloudflare Pages, /privacy).
PRIVACY_URL = settings.admin_portal_url.rstrip("/") + "/privacy"


class MailNotSent(Exception):
    """The email could not be sent; the caller tells the person to try again later."""


def _message(to: str, code: str) -> EmailMessage:
    """Plain text plus a simple HTML version. The code is in the subject so it can be read from
    the phone's notification. No action links on purpose (a code email should never ask for a
    click); only the privacy policy in the footer."""
    minutes = settings.email_code_minutes
    sender = settings.mail_from or settings.smtp_username
    msg = EmailMessage()
    msg["Subject"] = f"{code} is your Sproutly code"
    msg["From"] = f"Sproutly <{sender}>"
    msg["To"] = to
    msg.set_content(
        "Sproutly\n\n"
        f"Your code is {code}\n\n"
        f"Type it in the Sproutly app to confirm your email address. It works for {minutes} minutes.\n\n"
        "Never share this code or forward this email. Sproutly staff will never ask you for it.\n\n"
        f"If you did not request this code, please ignore this email and contact {sender}.\n\n"
        "Thank you for choosing Sproutly.\n\n"
        f"Privacy policy: {PRIVACY_URL}\n"
    )
    msg.add_alternative(f"""\
<!doctype html>
<html><body style="margin:0;padding:0;background:#F3F6F4;font-family:Arial,Helvetica,sans-serif;color:#1F2A24;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F6F4;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#FFFFFF;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#1B3D2F;padding:20px 28px;color:#FFFFFF;font-size:22px;font-weight:bold;">Sproutly</td></tr>
        <tr><td style="padding:28px;">
          <p style="margin:0 0 12px;font-size:17px;font-weight:bold;">Confirm your email</p>
          <p style="margin:0 0 20px;font-size:15px;line-height:22px;">Type this code in the Sproutly app:</p>
          <p style="margin:0 0 20px;padding:16px 0;background:#EEF4F0;border-radius:8px;text-align:center;
                    font-size:34px;font-weight:bold;letter-spacing:8px;color:#1B3D2F;">{code}</p>
          <p style="margin:0 0 16px;font-size:14px;line-height:21px;color:#4A5A50;">
            It works for {minutes} minutes. Never share this code or forward this email:
            Sproutly staff will never ask you for it.</p>
          <p style="margin:0 0 16px;font-size:13px;line-height:20px;color:#6B7A70;">
            If you did not request this code, please ignore this email and contact {escape(sender)}.</p>
          <p style="margin:0;font-size:15px;line-height:22px;">Thank you for choosing Sproutly.</p>
        </td></tr>
        <tr><td style="padding:14px 28px;border-top:1px solid #E3EAE5;font-size:12px;color:#6B7A70;">
          <a href="{PRIVACY_URL}" style="color:#6B7A70;">Privacy policy</a></td></tr>
      </table>
    </td></tr>
  </table>
</body></html>
""", subtype="html")
    return msg


def send_email_code(to: str, code: str) -> None:
    if not settings.smtp_host:
        if settings.app_env == "production":
            logger.error("SMTP_HOST is not set: email codes cannot be sent")
            raise MailNotSent()
        # On a laptop without mail settings the code goes to the backend window instead.
        logger.warning("Email not configured; code for %s is %s", to, code)
        print(f"[email] code for {to}: {code}", flush=True)
        return
    _send(_message(to, code))


def send_staff_link(to: str, name: str, link: str, purpose: str, hours: int) -> bool:
    """Email a staff set-up link. The code that goes with it is NOT in the email: the admin gives
    it by phone or in person. Returns False when the email could not be sent (the portal then
    shows the link to the admin instead); never raises."""
    if not settings.smtp_host:
        return False
    sender = settings.mail_from or settings.smtp_username
    what = "set up your Sproutly staff account" if purpose == "invite" else "choose a new Sproutly password"
    msg = EmailMessage()
    msg["Subject"] = "Your Sproutly staff link"
    msg["From"] = f"Sproutly <{sender}>"
    msg["To"] = to
    msg.set_content(
        f"Hello {name},\n\n"
        f"Use this link to {what}:\n{link}\n\n"
        f"It works once, for {hours} hours, and only with the 6-digit code your administrator gives you "
        "by phone or in person. The code is never sent by email.\n\n"
        f"If you were not expecting this, do not open the link and tell your administrator ({sender}).\n\n"
        f"Privacy policy: {PRIVACY_URL}\n"
    )
    try:
        _send(msg)
        return True
    except MailNotSent:
        return False


def _send(msg: EmailMessage) -> None:
    context = ssl.create_default_context()
    try:
        if settings.smtp_port == 465:
            with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, context=context, timeout=15) as smtp:
                if settings.smtp_username:
                    smtp.login(settings.smtp_username, settings.smtp_password)
                smtp.send_message(msg)
        else:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
                smtp.starttls(context=context)
                if settings.smtp_username:
                    smtp.login(settings.smtp_username, settings.smtp_password)
                smtp.send_message(msg)
    except (smtplib.SMTPException, OSError) as exc:
        # The reason is logged for the developer; the person only hears "try again later".
        logger.error("Email not sent: %s", type(exc).__name__)
        raise MailNotSent() from exc
