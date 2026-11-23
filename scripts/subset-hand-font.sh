#!/usr/bin/env bash
# 손글씨 폰트(나눔손글씨 힘내라는 말보단)를 첫 화면에 쓰는 글자만 남겨 작게 만들어요.
# 원본은 한글 전체가 들어 있어 3MB가 넘어서, 처음 들어올 때(캐시가 없을 때) 로딩 화면이 그걸 다 받을 때까지 한참 기다려야 했어요.
#
# 3D 바닥 글씨 · 말풍선 · 안내 문구 · 로딩 문구에 나오는 한글 + 영문 · 숫자 · 기호만 남겨 public/fonts/hand-subset.woff2로 저장해요.
# 이 글자들을 바꾸면 스크립트를 다시 돌려주세요. (빠진 글자는 원본 폰트 → 기본 글꼴 순으로 대신 그려져요)
#
# 필요한 것: python3 + fonttools, brotli  (pip install fonttools brotli)
set -euo pipefail

cd "$(dirname "$0")/.."

SRC_URL='https://hangeul.pstatic.net/hangeul_static/webfont/clova/NanumHimNaeRaNeunMarBoDan.woff'
OUT='public/fonts/hand-subset.woff2'
SOURCES=(index.html src/world/Labels.ts src/world/Character.ts src/world/Room.ts src/world/GameRoom.ts src/interaction/Pointer.ts)
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

curl -fsSL "$SRC_URL" -o "$TMP/source.woff"

# 화면에 나오는 한글 글자만 뽑아요 (주석은 빼고, TS는 따옴표 안 문자열 · HTML은 태그 밖 글자)
perl -CSD -0777 -ne '
  s{<!--.*?-->}{}gs; s{/\*.*?\*/}{}gs; s{^\s*//.*$}{}gm; s{\s//\s.*$}{}gm;
  if ($ARGV =~ /\.html$/) { s{<[^>]*>}{}g; $t .= $_ } else { $t .= $1 while /(\x27[^\x27\n]*\x27|`[^`]*`)/g }
  END { my %s; $s{$_}++ for $t =~ /\p{Hangul}/g; print sort keys %s }
' "${SOURCES[@]}" > "$TMP/text.txt"
echo "한글 $(wc -m < "$TMP/text.txt" | tr -d ' ')자"

mkdir -p "$(dirname "$OUT")"
pyftsubset "$TMP/source.woff" \
  --text-file="$TMP/text.txt" \
  --unicodes='U+0020-007E' \
  --flavor=woff2 \
  --layout-features='*' \
  --output-file="$OUT"

echo "$OUT ($(wc -c < "$OUT" | tr -d ' ') bytes)"
