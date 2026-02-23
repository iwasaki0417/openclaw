#!/usr/bin/env python3
"""OpenClaw メール送信スクリプト

使い方:
	python3 send-email.py --subject "件名" --body "本文"
	python3 send-email.py --subject "件名" --html-file /tmp/report.html
	python3 send-email.py --subject "件名" --html-file /tmp/report.html \
		--image nvda-chart:/tmp/charts/nvda.png \
		--image portfolio-pie:/tmp/charts/portfolio.png

HTML側で <img src="cid:nvda-chart"> のように参照する。
"""

import argparse
import json
import mimetypes
import smtplib
import ssl
import sys
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email import encoders
from pathlib import Path

CONFIG_PATH = Path.home() / ".openclaw" / "workspace" / "memory" / "email-config.json"


def load_config() -> dict:
	if not CONFIG_PATH.exists():
		print(f"ERROR: 設定ファイルがありません: {CONFIG_PATH}", file=sys.stderr)
		sys.exit(1)
	with open(CONFIG_PATH) as f:
		return json.load(f)


def parse_image_arg(value: str) -> tuple[str, Path]:
	"""'cid:path' 形式をパースして (content_id, file_path) を返す"""
	if ":" not in value:
		print(f"ERROR: --image は 'cid名:ファイルパス' 形式で指定: {value}", file=sys.stderr)
		sys.exit(1)
	cid, path_str = value.split(":", 1)
	p = Path(path_str)
	if not p.exists():
		print(f"ERROR: 画像ファイルが見つかりません: {p}", file=sys.stderr)
		sys.exit(1)
	return cid.strip(), p


def build_image_part(cid: str, filepath: Path) -> MIMEBase:
	"""CIDインライン埋め込み用のMIMEパートを作成"""
	mime_type, _ = mimetypes.guess_type(str(filepath))
	if not mime_type or not mime_type.startswith("image/"):
		mime_type = "image/png"
	maintype, subtype = mime_type.split("/", 1)

	with open(filepath, "rb") as f:
		img_data = f.read()

	img_part = MIMEBase(maintype, subtype)
	img_part.set_payload(img_data)
	encoders.encode_base64(img_part)
	img_part.add_header("Content-ID", f"<{cid}>")
	img_part.add_header("Content-Disposition", "inline", filename=filepath.name)
	return img_part


def send_email(
	subject: str,
	body_text: str = "",
	body_html: str = "",
	images: list[tuple[str, Path]] | None = None,
):
	config = load_config()
	smtp_host = config["smtp"]["host"]
	smtp_port = config["smtp"]["port"]
	smtp_user = config["smtp"]["user"]
	smtp_pass = config["smtp"]["password"]
	from_addr = config.get("from", smtp_user)
	to_addrs = config["to"]
	if isinstance(to_addrs, str):
		to_addrs = [to_addrs]

	if images:
		msg = MIMEMultipart("related")
		alt_part = MIMEMultipart("alternative")
		if body_text:
			alt_part.attach(MIMEText(body_text, "plain", "utf-8"))
		if body_html:
			alt_part.attach(MIMEText(body_html, "html", "utf-8"))
		msg.attach(alt_part)
		for cid, filepath in images:
			msg.attach(build_image_part(cid, filepath))
	else:
		msg = MIMEMultipart("alternative")
		if body_text:
			msg.attach(MIMEText(body_text, "plain", "utf-8"))
		if body_html:
			msg.attach(MIMEText(body_html, "html", "utf-8"))
		elif body_text and not body_html:
			html = body_text.replace("\n", "<br>\n")
			html = f'<html><body style="font-family:-apple-system,sans-serif;line-height:1.6;color:#333;">{html}</body></html>'
			msg.attach(MIMEText(html, "html", "utf-8"))

	msg["Subject"] = subject
	msg["From"] = from_addr
	msg["To"] = ", ".join(to_addrs)

	context = ssl.create_default_context()
	use_ssl = smtp_port == 465

	try:
		if use_ssl:
			with smtplib.SMTP_SSL(smtp_host, smtp_port, context=context) as srv:
				srv.login(smtp_user, smtp_pass)
				srv.sendmail(from_addr, to_addrs, msg.as_string())
		else:
			with smtplib.SMTP(smtp_host, smtp_port) as srv:
				srv.ehlo()
				srv.starttls(context=context)
				srv.ehlo()
				srv.login(smtp_user, smtp_pass)
				srv.sendmail(from_addr, to_addrs, msg.as_string())

		img_info = f" (画像{len(images)}枚)" if images else ""
		print(f"OK: メール送信完了{img_info} → {', '.join(to_addrs)}")
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
	parser.add_argument("--html", help="HTML本文（文字列）")
	parser.add_argument("--body-file", help="プレーンテキスト本文ファイル")
	parser.add_argument("--html-file", help="HTML本文ファイル")
	parser.add_argument(
		"--image", action="append", default=[],
		help="CIDインライン画像 (形式: cid名:ファイルパス) 複数指定可",
	)
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

	images = [parse_image_arg(v) for v in args.image] if args.image else None
	send_email(args.subject, body_text, body_html, images)


if __name__ == "__main__":
	main()
