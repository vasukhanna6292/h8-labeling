import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger(__name__)


def send_email(to: str, subject: str, body_html: str) -> bool:
    """
    Send an email via SMTP. Returns True on success, False if SMTP is not
    configured or sending fails. Failures are logged but never raise.
    """
    from app.config import settings

    if not settings.SMTP_HOST or not settings.SMTP_USER:
        logger.info("SMTP not configured — skipping email to %s", to)
        return False

    sender = settings.SMTP_FROM or settings.SMTP_USER

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = to
    msg.attach(MIMEText(body_html, "html"))

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            server.ehlo()
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(sender, [to], msg.as_string())
        logger.info("Email sent to %s: %s", to, subject)
        return True
    except Exception as e:
        logger.error("Failed to send email to %s: %s", to, e)
        return False


def send_task_assignment_email(annotator_name: str, annotator_email: str, batch_name: str, task_count: int):
    from app.config import settings

    subject = f"H8 Labeling — {task_count} new task(s) assigned in "{batch_name}""
    body = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="color:#22c55e;margin-bottom:4px">H8 Labeling</h2>
      <p style="color:#6b7280;margin-top:0">OBB Annotation Platform</p>
      <hr style="border-color:#374151;margin:20px 0"/>
      <p>Hi <strong>{annotator_name}</strong>,</p>
      <p>You have been assigned <strong>{task_count} new image(s)</strong> to annotate in batch <strong>"{batch_name}"</strong>.</p>
      <p style="margin:24px 0">
        <a href="{settings.APP_URL}/queue"
           style="background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">
          Open My Queue →
        </a>
      </p>
      <p style="color:#6b7280;font-size:13px">Log in with your registered email and password.</p>
    </div>
    """
    send_email(annotator_email, subject, body)