#!/usr/bin/env python3
"""
SBI証券の保有証券CSVから watchlist.json を更新するスクリプト。

SBI PCサイト: 口座管理 → 口座(円建) → 保有証券 → CSVダウンロード
ファイル名: SaveFile.csv (Shift-JIS / CP932)

使い方:
  python3 import-sbi-csv.py ~/Downloads/SaveFile.csv
  python3 import-sbi-csv.py --dry-run ~/Downloads/SaveFile.csv
"""

import argparse
import csv
import json
import sys
import re
import io
from datetime import date
from pathlib import Path

WATCHLIST_PATH = Path.home() / ".openclaw" / "workspace" / "memory" / "watchlist.json"

STOCK_HEADERS = {"銘柄コード", "銘柄名称", "保有株数", "取得単価"}
FUND_HEADERS = {"ファンド名", "保有口数", "取得単価"}


def detect_encoding(filepath: Path) -> str:
	with open(filepath, "rb") as f:
		head = f.read(4)
	if head[:3] == b"\xef\xbb\xbf":
		return "utf-8-sig"
	try:
		with open(filepath, encoding="utf-8") as f:
			f.read(2048)
		return "utf-8"
	except UnicodeDecodeError:
		return "cp932"


def parse_number(val: str) -> float:
	cleaned = re.sub(r"[,\s円株口＋+]", "", val)
	return float(cleaned)


def load_watchlist() -> dict:
	with open(WATCHLIST_PATH, encoding="utf-8") as f:
		return json.load(f)


def save_watchlist(data: dict) -> None:
	with open(WATCHLIST_PATH, "w", encoding="utf-8") as f:
		json.dump(data, f, ensure_ascii=False, indent="\t")
		f.write("\n")


def parse_sbi_csv(filepath: Path) -> tuple[list[dict], list[dict]]:
	"""セクション分割型のSBI CSVをパースし、(株式, 投資信託) を返す。"""
	encoding = detect_encoding(filepath)
	with open(filepath, encoding=encoding) as f:
		lines = f.readlines()

	stocks = []
	funds = []
	i = 0
	while i < len(lines):
		line = lines[i].strip()
		if not line:
			i += 1
			continue

		row = list(csv.reader(io.StringIO(line)))[0]
		headers_set = {h.strip() for h in row}

		if STOCK_HEADERS.issubset(headers_set):
			headers = [h.strip() for h in row]
			col = {h: idx for idx, h in enumerate(headers)}
			i += 1
			while i < len(lines):
				dline = lines[i].strip()
				if not dline:
					i += 1
					break
				drow = list(csv.reader(io.StringIO(dline)))[0]
				ticker_raw = drow[col["銘柄コード"]].strip()
				if not re.match(r"^\d{4}$", ticker_raw):
					i += 1
					continue
				try:
					stocks.append({
						"ticker": f"{ticker_raw}.T",
						"name": drow[col["銘柄名称"]].strip(),
						"shares": int(parse_number(drow[col["保有株数"]])),
						"cost": round(parse_number(drow[col["取得単価"]])),
						"price": round(parse_number(drow[col["現在値"]])) if "現在値" in col else None,
					})
				except (ValueError, IndexError):
					pass
				i += 1
			continue

		if FUND_HEADERS.issubset(headers_set):
			headers = [h.strip() for h in row]
			col = {h: idx for idx, h in enumerate(headers)}
			i += 1
			while i < len(lines):
				dline = lines[i].strip()
				if not dline:
					i += 1
					break
				drow = list(csv.reader(io.StringIO(dline)))[0]
				name = drow[col["ファンド名"]].strip()
				if not name:
					i += 1
					continue
				units_str = drow[col["保有口数"]].strip()
				try:
					funds.append({
						"name": name,
						"units": int(parse_number(units_str)),
						"cost": round(parse_number(drow[col["取得単価"]])),
						"nav": round(parse_number(drow[col["基準価額"]])) if "基準価額" in col else None,
					})
				except (ValueError, IndexError):
					pass
				i += 1
			continue

		i += 1

	return stocks, funds


def normalize_fund_name(name: str) -> str:
	"""全角→半角変換してファンド名を比較可能にする。"""
	return name.translate(str.maketrans(
		"ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ０１２３４５６７８９　",
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 "
	)).strip()


def update_watchlist(stocks: list[dict], funds: list[dict], dry_run: bool = False) -> None:
	wl = load_watchlist()
	changes = []

	existing_jp = {s["ticker"]: s for s in wl.get("stocks_jp", [])}
	for item in stocks:
		ticker = item["ticker"]
		if ticker in existing_jp:
			old = existing_jp[ticker]
			updated = False
			if item["shares"] != old.get("shares"):
				changes.append(f"  株式 {old.get('name', ticker)}: 数量 {old.get('shares')} → {item['shares']}")
				if not dry_run:
					old["shares"] = item["shares"]
				updated = True
			if item["cost"] != old.get("cost"):
				changes.append(f"  株式 {old.get('name', ticker)}: 取得単価 {old.get('cost')} → {item['cost']}")
				if not dry_run:
					old["cost"] = item["cost"]
				updated = True
			if not updated:
				changes.append(f"  株式 {old.get('name', ticker)}: 変更なし")
		else:
			changes.append(f"  ★ 新規株式: {item['name']} ({ticker}) {item['shares']}株 @{item['cost']}")
			if not dry_run:
				wl["stocks_jp"].append({
					"ticker": ticker,
					"name": item["name"],
					"shares": item["shares"],
					"cost": item["cost"],
					"alertDown": -3,
					"alertUp": 3,
				})

	sold = set(existing_jp.keys()) - {s["ticker"] for s in stocks}
	for ticker in sold:
		name = existing_jp[ticker].get("name", ticker)
		changes.append(f"  ⚠ CSVに未記載（売却済み？）: {name} ({ticker})")

	existing_funds = {normalize_fund_name(f["name"]): f for f in wl.get("funds_jp", [])}
	for item in funds:
		norm = normalize_fund_name(item["name"])
		matched_key = None
		for key in existing_funds:
			if norm in key or key in norm:
				matched_key = key
				break

		if matched_key:
			old = existing_funds[matched_key]
			updated = False
			if item["units"] != old.get("units"):
				changes.append(f"  投信 {old['name']}: 口数 {old.get('units')} → {item['units']}")
				if not dry_run:
					old["units"] = item["units"]
				updated = True
			if item["cost"] != old.get("cost"):
				changes.append(f"  投信 {old['name']}: 取得単価 {old.get('cost')} → {item['cost']}")
				if not dry_run:
					old["cost"] = item["cost"]
				updated = True
			if not updated:
				changes.append(f"  投信 {old['name']}: 変更なし")
		else:
			changes.append(f"  ★ 新規投信: {item['name']} {item['units']}口 @{item['cost']}")
			if not dry_run:
				wl.setdefault("funds_jp", []).append({
					"name": item["name"],
					"units": item["units"],
					"cost": item["cost"],
				})

	if changes:
		print("変更内容:" if not dry_run else "変更プレビュー (--dry-run):")
		for c in changes:
			print(c)
	else:
		print("変更なし")

	has_real_changes = any("→" in c or "★" in c for c in changes)
	if not dry_run and has_real_changes:
		wl["updatedAt"] = str(date.today())
		save_watchlist(wl)
		print(f"\n✅ watchlist.json を更新しました")
	elif dry_run:
		print(f"\n（dry-run モード: 実際の変更は行われていません）")


def main():
	parser = argparse.ArgumentParser(description="SBI証券CSVから watchlist.json を更新")
	parser.add_argument("csv_file", type=Path, help="SBI証券からダウンロードしたCSVファイル")
	parser.add_argument("--dry-run", action="store_true", help="変更を適用せずプレビューのみ")
	args = parser.parse_args()

	if not args.csv_file.exists():
		print(f"エラー: ファイルが見つかりません: {args.csv_file}", file=sys.stderr)
		sys.exit(1)
	if not WATCHLIST_PATH.exists():
		print(f"エラー: watchlist.json が見つかりません: {WATCHLIST_PATH}", file=sys.stderr)
		sys.exit(1)

	print(f"CSVファイル: {args.csv_file}")
	enc = detect_encoding(args.csv_file)
	print(f"エンコーディング: {enc}")

	stocks, funds = parse_sbi_csv(args.csv_file)
	print(f"検出: 株式 {len(stocks)}銘柄 / 投資信託 {len(funds)}ファンド\n")

	if not stocks and not funds:
		print("銘柄が見つかりませんでした", file=sys.stderr)
		sys.exit(1)

	update_watchlist(stocks, funds, dry_run=args.dry_run)


if __name__ == "__main__":
	main()
