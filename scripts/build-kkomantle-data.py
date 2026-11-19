#!/usr/bin/env python3
"""
꼬맨틀(단어 유사도 게임) 데이터 만들기.

fastText 한국어 단어 벡터(cc.ko.300, 위키 + 웹 문서로 학습, CC BY-SA 3.0)에서
자주 쓰는 일반 명사만 골라 작게 줄여 public/kkomantle/ 에 저장해요. 게임은 이 파일만 받아서 브라우저에서 계산해요.

- words.txt   : 단어 목록 (한 줄에 하나, 자주 쓰는 순서)
- vectors.bin : 단어마다 DIM개 int8 (단위 벡터를 127배), words.txt와 같은 순서
- meta.json   : { count, dim, answers: 정답 후보(src/ui/kkomantle/answers.ts) 단어 번호들 }

필요한 것: python3 + numpy, kiwipiepy (pip install numpy kiwipiepy)
처음 실행하면 벡터 원본(약 1.2GB)을 scripts/.cache/ 에 받아요. 한 번 받으면 다시 받지 않아요.
"""
import gzip
import json
import os
import re
import sys
import urllib.request

import numpy as np
from kiwipiepy import Kiwi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'scripts', '.cache')
OUT = os.path.join(ROOT, 'public', 'kkomantle')
SRC_URL = 'https://dl.fbaipublicfiles.com/fasttext/vectors-crawl/cc.ko.300.vec.gz'
SRC = os.path.join(CACHE, 'cc.ko.300.vec.gz')

#: 원본에서 앞쪽(자주 나오는 순서) 몇 줄까지 볼지
SCAN_LINES = 400_000
#: 게임에 넣을 단어 수
WORD_COUNT = 20_000
#: 벡터 차원 (PCA로 300 → DIM)
DIM = 160

HANGUL = re.compile(r'^[가-힣]{1,5}$')
#: 정답 후보 (게임 코드의 일상 낱말 목록). 형태소 분석기가 명사로 못 알아봐도 꼭 넣어요 (예: 바다, 별, 선생님)
ANSWERS_TS = os.path.join(ROOT, 'src', 'ui', 'kkomantle', 'answers.ts')


def download():
    if os.path.exists(SRC):
        return
    os.makedirs(CACHE, exist_ok=True)
    print(f'벡터 원본 받는 중... {SRC_URL}')
    tmp = SRC + '.part'

    def progress(blocks, block_size, total):
        done = blocks * block_size
        if total > 0 and blocks % 2000 == 0:
            print(f'  {done / total * 100:5.1f}%  ({done // 1_000_000}MB / {total // 1_000_000}MB)', flush=True)

    urllib.request.urlretrieve(SRC_URL, tmp, progress)
    os.replace(tmp, SRC)


def main():
    download()
    kiwi = Kiwi()
    with open(ANSWERS_TS, encoding='utf-8') as f:
        must = set(re.findall(r'[가-힣]+', f.read().split('`')[1]))
    words, vecs = [], []
    seen = set()
    with gzip.open(SRC, 'rt', encoding='utf-8', errors='ignore') as f:
        next(f)  # 첫 줄은 "단어수 차원"
        for i, line in enumerate(f):
            if i >= SCAN_LINES:
                break
            word, _, rest = line.rstrip('\n').partition(' ')
            if word in seen or not HANGUL.match(word):
                continue
            if word not in must:
                # 다 찼으면 정답 후보만 더 찾아요
                if len(words) >= WORD_COUNT:
                    continue
                # 형태소 하나짜리 일반 명사(NNG)만: '학교에서' 같은 조사 붙은 말 · 동사 · 고유명사는 빼요
                tokens = kiwi.tokenize(word)
                if len(tokens) != 1 or tokens[0].tag != 'NNG' or tokens[0].form != word:
                    continue
            seen.add(word)
            words.append(word)
            vecs.append(np.asarray(rest.split(), dtype=np.float32))
            if len(words) % 2000 == 0:
                print(f'  명사 {len(words)}개 (원본 {i}줄째)', flush=True)

    m = np.stack(vecs)
    m /= np.linalg.norm(m, axis=1, keepdims=True)
    # PCA로 차원을 줄여요 (평균을 빼고 주성분 DIM개)
    centered = m - m.mean(axis=0)
    _, s, vt = np.linalg.svd(centered, full_matrices=False)
    kept = (s[:DIM] ** 2).sum() / (s ** 2).sum()
    reduced = centered @ vt[:DIM].T
    reduced /= np.linalg.norm(reduced, axis=1, keepdims=True)
    q = np.clip(np.round(reduced * 127), -127, 127).astype(np.int8)

    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, 'words.txt'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(words))
    q.tofile(os.path.join(OUT, 'vectors.bin'))
    answers = sorted(words.index(w) for w in must if w in seen)
    with open(os.path.join(OUT, 'meta.json'), 'w', encoding='utf-8') as f:
        json.dump({'count': len(words), 'dim': DIM, 'answers': answers, 'source': 'fastText cc.ko.300 (CC BY-SA 3.0)'}, f)

    # 확인용: 몇 단어의 가까운 단어
    qf = q.astype(np.float32)
    for probe in ['사과', '학교', '고양이', '바다', '음악']:
        if probe in seen:
            idx = words.index(probe)
            near = np.argsort(-(qf @ qf[idx]))[1:8]
            print(f'  {probe}: ' + ', '.join(words[j] for j in near))
    missing = sorted(must - seen)
    if missing:
        print(f'  단어 책에 없는 정답 후보 {len(missing)}개: ' + ' '.join(missing))
    print(f'단어 {len(words)}개 · {DIM}차원 (분산 {kept * 100:.1f}% 유지) · vectors.bin {q.nbytes // 1024}KB')


if __name__ == '__main__':
    sys.exit(main())
