#!/usr/bin/env bash
# 손글씨 폰트(나눔손글씨 힘내라는 말보단)를 화면에 쓰는 글자만 남겨 작게 만들어요.
# 원본은 한글 전체가 들어 있어 3MB가 넘어서, 처음 들어올 때(캐시가 없을 때) 로딩 화면이 그걸 다 받을 때까지 한참 기다려야 했어요.
#
# 첫 화면과 게임 창까지 src 전체 문구에 나오는 한글 + 영문 · 숫자 · 기호만 남겨 public/fonts/hand-subset.woff2로 저장해요.
# 이 글자들을 바꾸면 스크립트를 다시 돌려주세요. (빠진 글자는 원본 폰트 → 기본 글꼴 순으로 대신 그려져요)
#
# 필요한 것: python3 + fonttools, brotli  (pip install fonttools brotli)
set -euo pipefail

cd "$(dirname "$0")/.."

SRC_URL='https://hangeul.pstatic.net/hangeul_static/webfont/clova/NanumHimNaeRaNeunMarBoDan.woff'
OUT='public/fonts/hand-subset.woff2'
SOURCES=(index.html $(find src -name '*.ts'))
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

curl -fsSL "$SRC_URL" -o "$TMP/source.woff"

# 화면에 나오는 한글 글자만 뽑아요 (주석은 빼요. 게임 창 문구는 따옴표 종류가 섞여 있어서 TS는 주석 밖 글자를 전부 모아요)
perl -CSD -0777 -ne '
  s{<!--.*?-->}{}gs; s{/\*.*?\*/}{}gs; s{^\s*//.*$}{}gm; s{\s//\s.*$}{}gm;
  s{<[^>]*>}{}g if $ARGV =~ /\.html$/;
  $t .= $_;
  END { my %s; $s{$_}++ for $t =~ /\p{Hangul}/g; print sort keys %s }
' "${SOURCES[@]}" > "$TMP/text.txt"
echo "한글 $(wc -m < "$TMP/text.txt" | tr -d ' ')자"

mkdir -p "$(dirname "$OUT")"
python3 -m fontTools.subset "$TMP/source.woff" \
  --text-file="$TMP/text.txt" \
  --unicodes='U+0020-007E' \
  --flavor=woff2 \
  --layout-features='*' \
  --output-file="$OUT"

echo "$OUT ($(wc -c < "$OUT" | tr -d ' ') bytes)"
