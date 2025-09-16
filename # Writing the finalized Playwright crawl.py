# Writing the finalized Playwright crawler so the user can download & run it
code = r'''# -*- coding: utf-8 -*-
"""
KIPRIS (인명정보 ▸ 최종권리자)에서 고객번호로 검색 후
결과 목록에서 '출원번호'만 수집하여 콘솔 및 CSV로 저장하는 스크립트.

사용법:
    1) Python 3.9+
    2) pip install playwright pandas
    3) playwright install
    4) python find_number.py --customer 120230740981
       (또는 실행 후 프롬프트에 고객번호 입력)

옵션:
    --headful     : 브라우저를 눈으로 보면서 실행
    --max-pages N : 최대 N페이지까지 수집 (기본 100)
    --timeout MS  : 각 단계 대기 타임아웃(ms), 기본 15000
    --csv PATH    : CSV 저장 경로 (기본 kipris_appnos.csv)
"""
import asyncio
import re
import csv
import sys
import argparse
from pathlib import Path
from typing import List, Set, Optional

from playwright.async_api import async_playwright, Page, TimeoutError as PWTimeoutError

KIPRIS_HOME = "https://www.kipris.or.kr/khome/main.do"
APPNO_CSV_DEFAULT = Path("kipris_appnos.csv")

# 출원번호 정규식 (국내형 예시: 13자리, 예: 1020160042595, 2020170000961)
APPNO_RE = re.compile(r"\\b(1|2)\\d{12}\\b")

# -------- 공통 유틸 --------

async def safe_click(locator, name: str = "", timeout: int = 1500) -> bool:
    try:
        await locator.first.click(timeout=timeout)
        return True
    except Exception as e:
        # print(f"[dbg] click fail {name}: {e}")
        return False

async def safe_fill(locator, value: str, name: str = "", timeout: int = 1500) -> bool:
    try:
        await locator.first.fill(value, timeout=timeout)
        return True
    except Exception as e:
        # print(f"[dbg] fill fail {name}: {e}")
        return False

# -------- 핵심 단계 --------

async def goto_patent_tab(page: Page, timeout: int):
    # 메인 진입
    await page.goto(KIPRIS_HOME, wait_until="domcontentloaded", timeout=timeout)
    # 쿠키/알림 등 닫기 (있을 경우)
    for sel in ['button:has-text("닫기")', 'button.close', 'button[aria-label="Close"]']:
        try:
            if await page.locator(sel).count():
                await page.locator(sel).first.click(timeout=500)
        except:
            pass

    # 상단/메인에서 '지식재산정보 검색' 또는 '특허·실용신안'으로 진입
    opened = False
    for cand in [
        page.get_by_role("link", name=re.compile("지식재산정보 검색")),
        page.get_by_role("link", name=re.compile("특허·실용신안")),
        page.get_by_text(re.compile("지식재산정보 검색|특허·실용신안")),
    ]:
        if await cand.count():
            opened = await safe_click(cand, "search-link", timeout=2000)
            if opened:
                break

    # 네트워크 안정화 대기
    await page.wait_for_load_state("networkidle")

async def select_person_final_rightholder(page: Page, timeout: int):
    """
    검색영역에서 '인명정보' → '최종권리자' 체크박스를 활성화한다.
    사이트 구조가 바뀌어도 id/name/data-field 기반으로 최대한 견고하게 찾는다.
    """
    # 1) '인명정보'로 전환 (버튼/탭/텍스트 등 다양한 UI 고려)
    switched = False
    for cand in [
        page.get_by_role("button", name=re.compile("인명정보")),
        page.get_by_role("tab", name=re.compile("인명정보")),
        page.get_by_text(re.compile("^\\s*인명정보\\s*$")),
        page.get_by_text(re.compile("인명정보")),
    ]:
        if await cand.count():
            if await safe_click(cand, "person-info", timeout=2000):
                switched = True
                break
    # switched가 False여도 일부 레이아웃은 이미 인명정보 영역일 수 있음

    # 2) '최종권리자' 체크박스 토글
    #   오류 로그에서 확인된 실제 DOM:
    #   <input id="mdown0419" name="mdown04" type="checkbox" data-check="mdown04"/>
    #   동일 라벨 텍스트가 많아 get_by_label은 피하고 id/name로 직타
    cb = page.locator('input#mdown0419[name="mdown04"][type="checkbox"]')
    if await cb.count():
        if not await cb.first.is_checked():
            await cb.first.check()
    else:
        # label[for]로 시도
        lbl = page.locator('label[for="mdown0419"]')
        if await lbl.count():
            await lbl.first.click()
        else:
            # 마지막 폴백: '최종권리자' 텍스트 인근 체크박스 추정 클릭
            try:
                near = page.get_by_text("최종권리자", exact=True)
                # 텍스트 앞쪽 가장 가까운 체크박스
                await near.locator('xpath=preceding::input[@type="checkbox"][1]').first.click()
            except:
                pass

    await page.wait_for_load_state("networkidle")

async def fill_rightholder_number_and_search(page: Page, number: str, timeout: int):
    """
    '최종권리자(TRH)' 입력칸에 고객번호를 넣고 검색 실행
    """
    # 대표 입력창 패턴: <input id="sd01_g04_text_07" data-field="TRH" ...>
    trh = page.locator('input[data-field="TRH"]')
    if not await trh.count():
        # 변형 레이아웃: placeholder에 고객번호 예시가 포함됨
        trh = page.get_by_placeholder(re.compile(r"고객번호|특허고객번호|\\d{11,12}"))
    if not await trh.count():
        # 텍스트 입력 전체 중 'TRH' 근방
        trh = page.locator('input[type="text"]')

    # 입력 시도
    filled = await safe_fill(trh, number, "trh-input", timeout=timeout)
    if not filled:
        raise RuntimeError("최종권리자(TRH) 입력칸을 찾지 못했습니다. 셀렉터 확인 필요")

    # (선택) 조건 셀렉트: <select id="sd01_g04_cond_07" data-operator="TRH">
    # 필요시 EQ(일치) 등으로 설정 가능
    # cond = page.locator('select#sd01_g04_cond_07[data-operator="TRH"]')
    # if await cond.count():
    #     await cond.select_option("EQ")

    # 검색 버튼 클릭
    clicked = False
    for btn in [
        page.get_by_role("button", name=re.compile("검색|조회", re.I)),
        page.get_by_text(re.compile("검색하기|검색", re.I)),
        page.locator("button[type='submit']"),
    ]:
        if await btn.count():
            clicked = await safe_click(btn, "search-btn", timeout=timeout)
            if clicked:
                break
    if not clicked:
        # 엔터로 서브밋
        await trh.first.press("Enter")

    # 결과 로딩 대기
    try:
        await page.wait_for_load_state("networkidle", timeout=timeout)
    except PWTimeoutError:
        pass

async def extract_appnos_on_page(page: Page) -> List[str]:
    """
    현재 페이지에서 출원번호만 수집 (표/카드/본문 텍스트 전부 탐색)
    """
    texts = []
    for sel in [
        "table", "div.result", "div.list", "div#resultArea",
        "main", "section", "article"
    ]:
        try:
            nodes = page.locator(sel)
            if await nodes.count():
                # 큰 컨테이너는 텍스트가 매우 길 수 있어 일부만
                inner = await nodes.first.inner_text()
                texts.append(inner)
        except:
            pass
    # 안전망: body 전체
    try:
        texts.append(await page.inner_text("body"))
    except:
        pass

    found: Set[str] = set()
    for t in texts:
        for m in APPNO_RE.finditer(t):
            found.add(m.group(0))

    return sorted(found)

async def go_next_page_if_any(page: Page, timeout: int) -> bool:
    """
    페이지네이션 이동. '다음', '>' 또는 다음 숫자 버튼 클릭.
    """
    # 1) 다음/Next
    for cand in [
        page.get_by_role("link", name=re.compile("다음|Next|＞|>")),
        page.get_by_role("button", name=re.compile("다음|Next|＞|>")),
        page.get_by_text(re.compile(r"다음|Next|▶|›"))
    ]:
        if await cand.count():
            if await safe_click(cand, "next", timeout=timeout):
                try:
                    await page.wait_for_load_state("networkidle", timeout=timeout)
                except PWTimeoutError:
                    pass
                return True

    # 2) 숫자 페이지 (aria-current 있는 다음 a)
    try:
        # aria-current="page"인 요소 다음 a를 찾아 클릭
        current = page.locator('[aria-current="page"]')
        if await current.count():
            next_a = current.locator('xpath=following::a[1]')
            if await next_a.count():
                if await safe_click(next_a, "next-number", timeout=timeout):
                    try:
                        await page.wait_for_load_state("networkidle", timeout=timeout)
                    except PWTimeoutError:
                        pass
                    return True
    except:
        pass

    return False

# -------- 메인 --------

async def main():
    parser = argparse.ArgumentParser(description="KIPRIS 인명정보▸최종권리자 고객번호로 출원번호 수집기")
    parser.add_argument("--customer", "-c", help="권리자 고객번호(보통 12자리)", type=str, default="")
    parser.add_argument("--csv", help="CSV 저장 경로", type=str, default=str(APPNO_CSV_DEFAULT))
    parser.add_argument("--headful", action="store_true", help="브라우저 창 표시(디버그용)")
    parser.add_argument("--max-pages", type=int, default=100, help="최대 탐색 페이지 수")
    parser.add_argument("--timeout", type=int, default=15000, help="단계별 타임아웃(ms)")
    args = parser.parse_args()

    customer = args.customer.strip()
    if not customer:
        customer = input("권리자 고객번호를 입력하세요(예: 120230740981): ").strip()
    if not customer:
        print("고객번호가 필요합니다.")
        sys.exit(1)

    # 간단한 자리수 보정(11자리일 경우 12자리로 0 패딩)
    if len(customer) < 12 and customer.isdigit():
        customer = customer.zfill(12)

    out_csv = Path(args.csv)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=not args.headful)
        page = await browser.new_page()

        try:
            await goto_patent_tab(page, timeout=args.timeout)
            await select_person_final_rightholder(page, timeout=args.timeout)
            await fill_rightholder_number_and_search(page, customer, timeout=args.timeout)

            all_appnos: Set[str] = set()
            for _ in range(max(1, args.max_pages)):
                appnos = await extract_appnos_on_page(page)
                for a in appnos:
                    all_appnos.add(a)

                has_next = await go_next_page_if_any(page, timeout=args.timeout)
                if not has_next:
                    break

        finally:
            await browser.close()

    appno_list = sorted(all_appnos)

    # 콘솔 출력
    print(f"[완료] 출원번호 {len(appno_list)}건")
    for a in appno_list:
        print(a)

    # CSV 저장
    with out_csv.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["applicationNumber"])
        for a in appno_list:
            w.writerow([a])

    print(f"[저장] {out_csv.resolve()}")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("중단됨")
'''
with open('/mnt/data/find_number.py', 'w', encoding='utf-8') as f:
    f.write(code)
print("Saved to /mnt/data/find_number.py")
