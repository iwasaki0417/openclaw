#!/usr/bin/env python3
"""OpenClaw メール送信スクリプト

使い方:
	python3 send-email.py --subject "件名" --body "本文"
	python3 send-email.py --subject "件名" --html "<h1>HTML本文</h1>"
	python3 send-email.py --subject "件名" --body-file /path/to/report.md
	python3 send-email.py --subject "件名" --html-file /path/to/report.html
"""

import argparse
import json
import smtplib
import ssl
import sys
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

CONFIG_PATH = Path.home() / ".openclaw" / "workspace" / "memory" / "email-config.json"


def load_config() -> dict:
	if not CONFIG_PATH.exists():
		print(f"ERROR: 設定ファイルがありません: {CONFIG_PATH}", file=sys.stderr)
		sys.exit(1)
	with open(CONFIG_PATH) as f:
		return json.load(f)


def send_email(subject: str, body_text: str = "", body_html: str = ""):
	config = load_config()
	smtp_host = config["smtp"]["host"]
	smtp_port = config["smtp"]["port"]
	smtp_user = config["smtp"]["user"]
	smtp_pass = config["smtp"]["password"]
	from_addr = config.get("from", smtp_user)
	to_addrs = config["to"]
	if isinstance(to_addrs, str):
		to_addrs = [to_addrs]

	msg = MIMEMultipart("alternative")
	msg["Subject"] = subject
	msg["From"] = from_addr
	msg["To"] = ", ".join(to_addrs)

	if body_text:
		msg.attach(MIMEText(body_text, "plain", "utf-8"))
	if body_html:
		msg.attach(MIMEText(body_html, "html", "utf-8"))
	elif body_text and not body_html:
		html = body_text.replace("\n", "<br>\n")
		html = f"""<html><body style="font-family: -apple-system, sans-serif; line-height: 1.6; color: #333;">{html}</body></html>"""
		msg.attach(MIMEText(html, "html", "utf-8"))

	context = ssl.create_default_context()
	use_ssl = smtp_port == 465

	try:
		if use_ssl:
			with smtplib.SMTP_SSL(smtp_host, smtp_port, context=context) as server:
				server.login(smtp_user, smtp_pass)
				server.sendmail(from_addr, to_addrs, msg.as_string())
		else:
			with smtplib.SMTP(smtp_host, smtp_port) as server:
				server.ehlo()
				server.starttls(context=context)
				server.ehlo()
				server.login(smtp_user, smtp_pass)
				server.sendmail(from_addr, to_addrs, msg.as_string())
		print(f"OK: メール送信完了 → {', '.join(to_addrs)}")
	except smtplib.SMTPAuthenticationError as e:
		print(f"ERROR: SMTP認証エラー: {e}", file=sys.stderr)
		sys.exit(1)
	except Exception as e:
		print(f"ERROR: 送信失敗: {e}", file=sys.stderr)
		sys.exit(1)


def main():
	parser = argparse.ArgumentParser(description="OpenClaw メール送信")
	parser.add_argument("--subject", required=True, help="メール件名")
	parser.add_argument("--body", help="プレーンテキスト本文")
	parser.add_argument("--html", help="HTML本文")
	parser.add_argument("--body-file", help="プレーンテキスト本文ファイル")
	parser.add_argument("--html-file", help="HTML本文ファイル")
	args = parser.parse_args()

	body_text = args.body or ""
	body_html = args.html or ""

	if args.body_file:
		body_text = Path(args.body_file).read_text(encoding="utf-8")
	if args.html_file:
		body_html = Path(args.html_file).read_text(encoding="utf-8")

	if not body_text and not body_html:
		print("ERROR: --body, --html, --body-file, --html-file のいずれかが必要です", file=sys.stderr)
		sys.exit(1)

	send_email(args.subject, body_text, body_html)


if __name__ == "__main__":
	main()
